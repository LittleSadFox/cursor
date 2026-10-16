import { and, desc, eq, gte, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';

import {
  ProblemError,
  type Page,
  type Session,
  type SessionInput,
  type SessionListQuery,
  type SessionPatch,
} from '@climbing-coach/api';

import type { IdGen } from '../../ids/ulid.js';
import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { pageLimit, readCursor, toPage } from '../paging.js';
import { sessions } from '../schema.js';
import { inTransaction } from '../tx.js';
import { assertVersion, nextVersion } from '../version.js';
import { assertGymExists } from './gyms.js';
import type { TrashEntry } from './trash-entry.js';

type SessionCursor = { date: string; id: string };

function isSessionCursor(value: unknown): value is SessionCursor {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Partial<SessionCursor>;
  return typeof rec.date === 'string' && typeof rec.id === 'string';
}

function toSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    gymId: row.gymId,
    date: row.date,
    tzOffsetMin: row.tzOffsetMin,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** Most recent day first; `(date, id)` is the keyset. */
export function listSessions(
  db: AppDatabase,
  query: Partial<SessionListQuery> = {},
): Page<Session> {
  const limit = pageLimit(query.limit);
  const after = readCursor(query.cursor, isSessionCursor);
  const filters = [isNull(sessions.deletedAt)];
  if (query.gymId) filters.push(eq(sessions.gymId, query.gymId));
  if (query.from) filters.push(gte(sessions.date, query.from));
  if (query.to) filters.push(lte(sessions.date, query.to));
  if (after) {
    const older = or(
      lt(sessions.date, after.date),
      and(eq(sessions.date, after.date), lt(sessions.id, after.id)),
    );
    if (older) filters.push(older);
  }
  const rows = db
    .select()
    .from(sessions)
    .where(and(...filters))
    .orderBy(desc(sessions.date), desc(sessions.id))
    .limit(limit + 1)
    .all();
  return toPage(rows, limit, toSession, (row) => ({ date: row.date, id: row.id }));
}

export function getSession(db: AppDatabase, id: string): Session {
  const row = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `session ${id} not found`);
  return toSession(row);
}

export function createSession(
  db: AppDatabase,
  clock: Clock,
  ids: IdGen,
  input: SessionInput,
): Session {
  return inTransaction(db, (tx) => {
    if (input.gymId) assertGymExists(tx, input.gymId);
    const now = clock.nowIso();
    const row = {
      id: ids.ulid(),
      gymId: input.gymId ?? null,
      date: input.date,
      tzOffsetMin: input.tzOffsetMin,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    tx.insert(sessions).values(row).run();
    return toSession(row);
  });
}

export function updateSession(
  db: AppDatabase,
  clock: Clock,
  id: string,
  patch: SessionPatch,
): Session {
  return inTransaction(db, (tx) => {
    const current = getSession(tx, id);
    assertVersion(current.version, patch.expectedVersion, 'session');
    if (patch.gymId && patch.gymId !== current.gymId) assertGymExists(tx, patch.gymId);
    const next = {
      gymId: patch.gymId === undefined ? current.gymId : patch.gymId,
      date: patch.date ?? current.date,
      tzOffsetMin: patch.tzOffsetMin ?? current.tzOffsetMin,
      startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
      endedAt: patch.endedAt === undefined ? current.endedAt : patch.endedAt,
      version: nextVersion(current.version),
      updatedAt: clock.nowIso(),
    };
    tx.update(sessions).set(next).where(eq(sessions.id, id)).run();
    return { ...current, ...next };
  });
}

export function deleteSession(db: AppDatabase, clock: Clock, id: string): void {
  inTransaction(db, (tx) => {
    getSession(tx, id);
    const now = clock.nowIso();
    tx.update(sessions).set({ deletedAt: now, updatedAt: now }).where(eq(sessions.id, id)).run();
  });
}

export function restoreSession(db: AppDatabase, clock: Clock, id: string): void {
  const result = db
    .update(sessions)
    .set({ deletedAt: null, updatedAt: clock.nowIso() })
    .where(and(eq(sessions.id, id), isNotNull(sessions.deletedAt)))
    .returning({ id: sessions.id })
    .all();
  if (result.length === 0) throw new ProblemError('NOT_FOUND', `session ${id} is not in the trash`);
}

export function purgeSession(db: AppDatabase, id: string): void {
  const result = db
    .delete(sessions)
    .where(and(eq(sessions.id, id), isNotNull(sessions.deletedAt)))
    .returning({ id: sessions.id })
    .all();
  if (result.length === 0) throw new ProblemError('NOT_FOUND', `session ${id} is not in the trash`);
}

export function listDeletedSessions(db: AppDatabase): TrashEntry[] {
  return db
    .select()
    .from(sessions)
    .where(isNotNull(sessions.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.date, deletedAt: row.deletedAt }],
    );
}
