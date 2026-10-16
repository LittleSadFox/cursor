import { and, desc, eq, isNotNull, isNull, like } from 'drizzle-orm';

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
import { gyms } from '../schema.js';
import { assertVersion, nextVersion } from '../version.js';

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

export function listGyms(db: AppDatabase, query: Partial<GymListQuery> = {}): Page<Gym> {
  const limit = query.limit ?? 50;
  const rows = db
    .select()
    .from(gyms)
    .where(
      query.q
        ? and(isNull(gyms.deletedAt), like(gyms.name, `%${query.q}%`))
        : isNull(gyms.deletedAt),
    )
    .orderBy(desc(gyms.createdAt))
    .limit(limit + 1)
    .all();
  const slice = rows.slice(0, limit);
  return {
    items: slice.map(toGym),
    nextCursor: rows.length > limit ? slice[slice.length - 1]?.id ?? null : null,
  };
}

export function getGym(db: AppDatabase, id: string): Gym {
  const row = db.select().from(gyms).where(and(eq(gyms.id, id), isNull(gyms.deletedAt))).get();
  if (!row) throw new ProblemError('NOT_FOUND', `gym ${id} not found`);
  return toGym(row);
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
  const current = getGym(db, id);
  assertVersion(current.version, patch.expectedVersion, 'gym');
  const next = {
    name: patch.name ?? current.name,
    notes: patch.notes ?? current.notes,
    version: nextVersion(current.version),
    updatedAt: clock.nowIso(),
  };
  db.update(gyms).set(next).where(eq(gyms.id, id)).run();
  return { ...current, ...next };
}

export function deleteGym(db: AppDatabase, clock: Clock, id: string): void {
  getGym(db, id);
  db.update(gyms).set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() }).where(eq(gyms.id, id)).run();
}

export function restoreGym(db: AppDatabase, clock: Clock, id: string): void {
  const row = db.select().from(gyms).where(eq(gyms.id, id)).get();
  if (!row) throw new ProblemError('NOT_FOUND', `gym ${id} not found`);
  db.update(gyms).set({ deletedAt: null, updatedAt: clock.nowIso() }).where(eq(gyms.id, id)).run();
}

export function purgeGym(db: AppDatabase, id: string): void {
  db.delete(gyms).where(eq(gyms.id, id)).run();
}

export function listDeletedGyms(db: AppDatabase): { id: string; title: string; deletedAt: string }[] {
  return db
    .select()
    .from(gyms)
    .where(isNotNull(gyms.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.name, deletedAt: row.deletedAt }],
    );
}
