import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';

import {
  ProblemError,
  type Gym,
  type GymInput,
  type GymListQuery,
  type GymPatch,
  type Page,
} from '@climbing-coach/api';

import type { Clock } from '../../ports/clock.js';
import type { IdGen } from '../../ids/ulid.js';
import type { AppDatabase } from '../../ports/sql.js';
import { containsText, isIdCursor, pageLimit, readCursor, toPage } from '../paging.js';
import { boulders, gyms, sessions } from '../schema.js';
import { inTransaction } from '../tx.js';
import { assertVersion, nextVersion } from '../version.js';
import type { TrashEntry } from './trash-entry.js';

function toGym(row: typeof gyms.$inferSelect): Gym {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** Newest first. ULIDs sort by creation time, so the id alone is a stable keyset cursor. */
export function listGyms(db: AppDatabase, query: Partial<GymListQuery> = {}): Page<Gym> {
  const limit = pageLimit(query.limit);
  const after = readCursor(query.cursor, isIdCursor);
  const filters = [isNull(gyms.deletedAt)];
  if (query.q) filters.push(containsText(gyms.name, query.q));
  if (after) filters.push(lt(gyms.id, after.id));
  const rows = db
    .select()
    .from(gyms)
    .where(and(...filters))
    .orderBy(desc(gyms.id))
    .limit(limit + 1)
    .all();
  return toPage(rows, limit, toGym, (row) => ({ id: row.id }));
}

export function getGym(db: AppDatabase, id: string): Gym {
  const row = db
    .select()
    .from(gyms)
    .where(and(eq(gyms.id, id), isNull(gyms.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `gym ${id} not found`);
  return toGym(row);
}

/** Boulders and sessions may only point at a live gym. */
export function assertGymExists(db: AppDatabase, id: string): void {
  const row = db
    .select({ id: gyms.id })
    .from(gyms)
    .where(and(eq(gyms.id, id), isNull(gyms.deletedAt)))
    .get();
  if (!row) throw new ProblemError('VALIDATION_FAILED', `gym ${id} does not exist`);
}

export function createGym(db: AppDatabase, clock: Clock, ids: IdGen, input: GymInput): Gym {
  const now = clock.nowIso();
  const row = {
    id: ids.ulid(),
    name: input.name,
    notes: input.notes,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.insert(gyms).values(row).run();
  return toGym(row);
}

export function updateGym(db: AppDatabase, clock: Clock, id: string, patch: GymPatch): Gym {
  return inTransaction(db, (tx) => {
    const current = getGym(tx, id);
    assertVersion(current.version, patch.expectedVersion, 'gym');
    const next = {
      name: patch.name ?? current.name,
      notes: patch.notes ?? current.notes,
      version: nextVersion(current.version),
      updatedAt: clock.nowIso(),
    };
    tx.update(gyms).set(next).where(eq(gyms.id, id)).run();
    return { ...current, ...next };
  });
}

/** Moves the gym and its live boulders to the trash with one shared `deletedAt`. */
export function deleteGym(db: AppDatabase, clock: Clock, id: string): void {
  inTransaction(db, (tx) => {
    getGym(tx, id);
    const now = clock.nowIso();
    tx.update(gyms).set({ deletedAt: now, updatedAt: now }).where(eq(gyms.id, id)).run();
    tx.update(boulders)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(boulders.gymId, id), isNull(boulders.deletedAt)))
      .run();
  });
}

/** Restores the gym and the boulders that were trashed together with it. */
export function restoreGym(db: AppDatabase, clock: Clock, id: string): void {
  inTransaction(db, (tx) => {
    const row = tx
      .select()
      .from(gyms)
      .where(and(eq(gyms.id, id), isNotNull(gyms.deletedAt)))
      .get();
    if (!row || row.deletedAt === null)
      throw new ProblemError('NOT_FOUND', `gym ${id} is not in the trash`);
    const now = clock.nowIso();
    tx.update(boulders)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(boulders.gymId, id), eq(boulders.deletedAt, row.deletedAt)))
      .run();
    tx.update(gyms).set({ deletedAt: null, updatedAt: now }).where(eq(gyms.id, id)).run();
  });
}

/** Restores just the gym row (a boulder restored on its own needs a live gym). */
export function reviveGym(db: AppDatabase, clock: Clock, id: string): void {
  db.update(gyms)
    .set({ deletedAt: null, updatedAt: clock.nowIso() })
    .where(and(eq(gyms.id, id), isNotNull(gyms.deletedAt)))
    .run();
}

/** Hard delete from the trash. Its boulders go too; sessions keep their history without a gym. */
export function purgeGym(db: AppDatabase, id: string): void {
  inTransaction(db, (tx) => {
    const row = tx
      .select({ id: gyms.id })
      .from(gyms)
      .where(and(eq(gyms.id, id), isNotNull(gyms.deletedAt)))
      .get();
    if (!row) throw new ProblemError('NOT_FOUND', `gym ${id} is not in the trash`);
    tx.delete(boulders).where(eq(boulders.gymId, id)).run();
    tx.update(sessions).set({ gymId: null }).where(eq(sessions.gymId, id)).run();
    tx.delete(gyms).where(eq(gyms.id, id)).run();
  });
}

export function listDeletedGyms(db: AppDatabase): TrashEntry[] {
  return db
    .select()
    .from(gyms)
    .where(isNotNull(gyms.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.name, deletedAt: row.deletedAt }],
    );
}
