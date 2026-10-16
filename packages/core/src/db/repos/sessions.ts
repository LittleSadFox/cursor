import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

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
import { sessions } from '../schema.js';
import { assertVersion, nextVersion } from '../version.js';

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

export function listSessions(db: AppDatabase, query: Partial<SessionListQuery> = {}): Page<Session> {
  const limit = query.limit ?? 50;
  const filters = [isNull(sessions.deletedAt)];
  if (query.gymId) filters.push(eq(sessions.gymId, query.gymId));
  const rows = db
    .select()
    .from(sessions)
    .where(and(...filters))
    .orderBy(desc(sessions.date))
    .limit(limit + 1)
    .all()
    .filter((row) => {
      if (query.from && row.date < query.from) return false;
      if (query.to && row.date > query.to) return false;
      return true;
    });
  const slice = rows.slice(0, limit);
  return {
    items: slice.map(toSession),
    nextCursor: rows.length > limit ? slice[slice.length - 1]?.id ?? null : null,
  };
}

export function getSession(db: AppDatabase, id: string): Session {
  const row = db.select().from(sessions).where(and(eq(sessions.id, id), isNull(sessions.deletedAt))).get();
  if (!row) throw new ProblemError('NOT_FOUND', `session ${id} not found`);
  return toSession(row);
}

export function createSession(db: AppDatabase, clock: Clock, ids: IdGen, input: SessionInput): Session {
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
  db.insert(sessions).values(row).run();
  return toSession(row);
}

export function updateSession(db: AppDatabase, clock: Clock, id: string, patch: SessionPatch): Session {
  const current = getSession(db, id);
  assertVersion(current.version, patch.expectedVersion, 'session');
  const next = {
    gymId: patch.gymId === undefined ? current.gymId : patch.gymId,
    date: patch.date ?? current.date,
    tzOffsetMin: patch.tzOffsetMin ?? current.tzOffsetMin,
    startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
    endedAt: patch.endedAt === undefined ? current.endedAt : patch.endedAt,
    version: nextVersion(current.version),
    updatedAt: clock.nowIso(),
  };
  db.update(sessions).set(next).where(eq(sessions.id, id)).run();
  return { ...current, ...next };
}

export function deleteSession(db: AppDatabase, clock: Clock, id: string): void {
  getSession(db, id);
  db.update(sessions)
    .set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() })
    .where(eq(sessions.id, id))
    .run();
}

export function restoreSession(db: AppDatabase, clock: Clock, id: string): void {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new ProblemError('NOT_FOUND', `session ${id} not found`);
  db.update(sessions).set({ deletedAt: null, updatedAt: clock.nowIso() }).where(eq(sessions.id, id)).run();
}

export function purgeSession(db: AppDatabase, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function listDeletedSessions(
  db: AppDatabase,
): { id: string; title: string; deletedAt: string }[] {
  return db
    .select()
    .from(sessions)
    .where(isNotNull(sessions.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null ? [] : [{ id: row.id, title: row.date, deletedAt: row.deletedAt }],
    );
}
