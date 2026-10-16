import { and, desc, eq, isNotNull, isNull, like } from 'drizzle-orm';

import {
  ProblemError,
  type Boulder,
  type BoulderInput,
  type BoulderListQuery,
  type BoulderPatch,
  type Page,
} from '@climbing-coach/api';
import { toDifficultyIndex, type GradeSystem } from '@climbing-coach/engine';

import type { IdGen } from '../../ids/ulid.js';
import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { boulders } from '../schema.js';
import { assertVersion, nextVersion } from '../version.js';

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

function indexOf(grade: string, system: GradeSystem): number {
  const index = toDifficultyIndex(grade, system);
  if (index === null) {
    throw new ProblemError('VALIDATION_FAILED', `unknown grade ${grade} for system ${system}`);
  }
  return index;
}

export function listBoulders(
  db: AppDatabase,
  query: Partial<BoulderListQuery> = {},
): Page<Boulder> {
  const limit = query.limit ?? 50;
  const filters = [isNull(boulders.deletedAt)];
  if (query.gymId) filters.push(eq(boulders.gymId, query.gymId));
  if (query.q) filters.push(like(boulders.name, `%${query.q}%`));
  if (query.active === true) filters.push(isNull(boulders.retiredOn));
  const rows = db
    .select()
    .from(boulders)
    .where(and(...filters))
    .orderBy(desc(boulders.createdAt))
    .limit(limit + 1)
    .all();
  const slice = rows.slice(0, limit);
  return {
    items: slice.map(toBoulder),
    nextCursor: rows.length > limit ? slice[slice.length - 1]?.id ?? null : null,
  };
}

export function getBoulder(db: AppDatabase, id: string): Boulder {
  const row = db.select().from(boulders).where(and(eq(boulders.id, id), isNull(boulders.deletedAt))).get();
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
  const now = clock.nowIso();
  const color = input.color;
  const name = input.name ?? `${color} ${input.grade}`;
  const row = {
    id: ids.ulid(),
    gymId: input.gymId,
    name,
    grade: input.grade,
    difficultyIndex: indexOf(input.grade, gradeSystem),
    color,
    setOn: input.setOn ?? null,
    retiredOn: null,
    wallPhotoPath: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.insert(boulders).values(row).run();
  return toBoulder(row);
}

export function updateBoulder(
  db: AppDatabase,
  clock: Clock,
  id: string,
  patch: BoulderPatch,
  gradeSystem: GradeSystem,
): Boulder {
  const current = getBoulder(db, id);
  assertVersion(current.version, patch.expectedVersion, 'boulder');
  const grade = patch.grade ?? current.grade;
  const next = {
    name: patch.name ?? current.name,
    grade,
    color: patch.color ?? current.color,
    setOn: patch.setOn === undefined ? current.setOn : patch.setOn,
    retiredOn: patch.retiredOn === undefined ? current.retiredOn : patch.retiredOn,
    difficultyIndex: indexOf(grade, gradeSystem),
    version: nextVersion(current.version),
    updatedAt: clock.nowIso(),
  };
  db.update(boulders).set(next).where(eq(boulders.id, id)).run();
  return { ...current, ...next };
}

export function deleteBoulder(db: AppDatabase, clock: Clock, id: string): void {
  getBoulder(db, id);
  db.update(boulders)
    .set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() })
    .where(eq(boulders.id, id))
    .run();
}

export function restoreBoulder(db: AppDatabase, clock: Clock, id: string): void {
  const row = db.select().from(boulders).where(eq(boulders.id, id)).get();
  if (!row) throw new ProblemError('NOT_FOUND', `boulder ${id} not found`);
  db.update(boulders).set({ deletedAt: null, updatedAt: clock.nowIso() }).where(eq(boulders.id, id)).run();
}

export function purgeBoulder(db: AppDatabase, id: string): void {
  db.delete(boulders).where(eq(boulders.id, id)).run();
}

export function listDeletedBoulders(
  db: AppDatabase,
): { id: string; title: string; deletedAt: string }[] {
  return db
    .select()
    .from(boulders)
    .where(isNotNull(boulders.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.name, deletedAt: row.deletedAt }],
    );
}
