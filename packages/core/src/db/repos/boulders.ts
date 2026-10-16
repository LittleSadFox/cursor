import { and, desc, eq, gte, isNotNull, isNull, lt, lte } from 'drizzle-orm';

import {
  ProblemError,
  type Boulder,
  type BoulderInput,
  type BoulderListQuery,
  type BoulderPatch,
  type Page,
} from '@climbing-coach/api';
import { gradeIndexFor, type GradeSystem } from '@climbing-coach/engine';

import type { IdGen } from '../../ids/ulid.js';
import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { containsText, isIdCursor, pageLimit, readCursor, toPage } from '../paging.js';
import { boulders } from '../schema.js';
import { inTransaction } from '../tx.js';
import { assertVersion, nextVersion } from '../version.js';
import { assertGymExists, reviveGym } from './gyms.js';
import type { TrashEntry } from './trash-entry.js';

function toBoulder(row: typeof boulders.$inferSelect): Boulder {
  return {
    id: row.id,
    gymId: row.gymId,
    name: row.name,
    grade: row.grade,
    difficultyIndex: row.difficultyIndex,
    color: row.color,
    setOn: row.setOn,
    retiredOn: row.retiredOn,
    wallPhotoPath: row.wallPhotoPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    stats: { attempts: 0, sends: 0, bestProximity: null, lastAttemptAt: null },
  };
}

/** V and Font share one index, so a grade in either system parses whatever the preference. */
function boulderIndex(grade: string, gradeSystem: GradeSystem): number {
  const index = gradeIndexFor(grade, 'boulder', gradeSystem);
  if (index === null) throw new ProblemError('VALIDATION_FAILED', `unknown boulder grade ${grade}`);
  return index;
}

export function listBoulders(
  db: AppDatabase,
  query: Partial<BoulderListQuery> = {},
  gradeSystem: GradeSystem = 'v',
): Page<Boulder> {
  const limit = pageLimit(query.limit);
  const after = readCursor(query.cursor, isIdCursor);
  const filters = [isNull(boulders.deletedAt)];
  if (query.gymId) filters.push(eq(boulders.gymId, query.gymId));
  if (query.q) filters.push(containsText(boulders.name, query.q));
  if (query.active === true) filters.push(isNull(boulders.retiredOn));
  if (query.active === false) filters.push(isNotNull(boulders.retiredOn));
  if (query.gradeMin)
    filters.push(gte(boulders.difficultyIndex, boulderIndex(query.gradeMin, gradeSystem)));
  if (query.gradeMax)
    filters.push(lte(boulders.difficultyIndex, boulderIndex(query.gradeMax, gradeSystem)));
  if (after) filters.push(lt(boulders.id, after.id));
  const rows = db
    .select()
    .from(boulders)
    .where(and(...filters))
    .orderBy(desc(boulders.id))
    .limit(limit + 1)
    .all();
  return toPage(rows, limit, toBoulder, (row) => ({ id: row.id }));
}

export function getBoulder(db: AppDatabase, id: string): Boulder {
  const row = db
    .select()
    .from(boulders)
    .where(and(eq(boulders.id, id), isNull(boulders.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `boulder ${id} not found`);
  return toBoulder(row);
}

export function createBoulder(
  db: AppDatabase,
  clock: Clock,
  ids: IdGen,
  input: BoulderInput,
  gradeSystem: GradeSystem,
): Boulder {
  return inTransaction(db, (tx) => {
    assertGymExists(tx, input.gymId);
    const now = clock.nowIso();
    const row = {
      id: ids.ulid(),
      gymId: input.gymId,
      name: input.name ?? `${input.color} ${input.grade}`,
      grade: input.grade,
      difficultyIndex: boulderIndex(input.grade, gradeSystem),
      color: input.color,
      setOn: input.setOn ?? null,
      retiredOn: null,
      wallPhotoPath: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    tx.insert(boulders).values(row).run();
    return toBoulder(row);
  });
}

export function updateBoulder(
  db: AppDatabase,
  clock: Clock,
  id: string,
  patch: BoulderPatch,
  gradeSystem: GradeSystem,
): Boulder {
  return inTransaction(db, (tx) => {
    const current = getBoulder(tx, id);
    assertVersion(current.version, patch.expectedVersion, 'boulder');
    const regraded = patch.grade !== undefined && patch.grade !== current.grade;
    const next = {
      name: patch.name ?? current.name,
      grade: patch.grade ?? current.grade,
      color: patch.color ?? current.color,
      setOn: patch.setOn === undefined ? current.setOn : patch.setOn,
      retiredOn: patch.retiredOn === undefined ? current.retiredOn : patch.retiredOn,
      difficultyIndex: regraded
        ? boulderIndex(patch.grade ?? current.grade, gradeSystem)
        : current.difficultyIndex,
      version: nextVersion(current.version),
      updatedAt: clock.nowIso(),
    };
    tx.update(boulders).set(next).where(eq(boulders.id, id)).run();
    return { ...current, ...next };
  });
}

export function deleteBoulder(db: AppDatabase, clock: Clock, id: string): void {
  inTransaction(db, (tx) => {
    getBoulder(tx, id);
    const now = clock.nowIso();
    tx.update(boulders).set({ deletedAt: now, updatedAt: now }).where(eq(boulders.id, id)).run();
  });
}

/** A boulder whose gym is also in the trash brings the gym back with it. */
export function restoreBoulder(db: AppDatabase, clock: Clock, id: string): void {
  inTransaction(db, (tx) => {
    const row = tx
      .select()
      .from(boulders)
      .where(and(eq(boulders.id, id), isNotNull(boulders.deletedAt)))
      .get();
    if (!row) throw new ProblemError('NOT_FOUND', `boulder ${id} is not in the trash`);
    reviveGym(tx, clock, row.gymId);
    tx.update(boulders)
      .set({ deletedAt: null, updatedAt: clock.nowIso() })
      .where(eq(boulders.id, id))
      .run();
  });
}

export function purgeBoulder(db: AppDatabase, id: string): void {
  const result = db
    .delete(boulders)
    .where(and(eq(boulders.id, id), isNotNull(boulders.deletedAt)))
    .returning({ id: boulders.id })
    .all();
  if (result.length === 0) throw new ProblemError('NOT_FOUND', `boulder ${id} is not in the trash`);
}

export function listDeletedBoulders(db: AppDatabase): TrashEntry[] {
  return db
    .select({ id: boulders.id, name: boulders.name, deletedAt: boulders.deletedAt })
    .from(boulders)
    .where(isNotNull(boulders.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.name, deletedAt: row.deletedAt }],
    );
}
