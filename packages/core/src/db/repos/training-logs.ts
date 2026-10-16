import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';

import {
  ProblemError,
  type GradeBreakdown,
  type TrainingLog,
  type TrainingLogInput,
} from '@climbing-coach/api';
import { sessionLoad, type DailyLog } from '@climbing-coach/engine';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { trainingLogFocus, trainingLogGrades, trainingLogs } from '../schema.js';
import { inTransaction } from '../tx.js';
import { nextVersion } from '../version.js';
import { assertFocusTagsExist } from './focus-tags.js';
import type { TrashEntry } from './trash-entry.js';

const FIRST_DATE = '0000-01-01';
const LAST_DATE = '9999-12-31';

type LogRow = typeof trainingLogs.$inferSelect;
type Children = { grades: GradeBreakdown[]; secondaryFocusIds: string[] };

/** Grades and secondary focus for every day in [from, to], two queries total. */
function childrenInRange(db: AppDatabase, from: string, to: string): Map<string, Children> {
  const byDate = new Map<string, Children>();
  const slot = (date: string): Children => {
    let children = byDate.get(date);
    if (!children) {
      children = { grades: [], secondaryFocusIds: [] };
      byDate.set(date, children);
    }
    return children;
  };
  const gradeRows = db
    .select()
    .from(trainingLogGrades)
    .where(and(gte(trainingLogGrades.date, from), lte(trainingLogGrades.date, to)))
    .all();
  for (const row of gradeRows) {
    slot(row.date).grades.push({
      discipline: row.discipline as GradeBreakdown['discipline'],
      grade: row.grade,
      attempted: row.attempted,
      sent: row.sent,
    });
  }
  const focusRows = db
    .select()
    .from(trainingLogFocus)
    .where(and(gte(trainingLogFocus.date, from), lte(trainingLogFocus.date, to)))
    .all();
  for (const row of focusRows) slot(row.date).secondaryFocusIds.push(row.focusId);
  return byDate;
}

export function toDailyLog(log: TrainingLog): DailyLog {
  return {
    date: log.date,
    sessionExertion: log.sessionExertion,
    durationMin: log.durationMin,
    sessionType: log.sessionType,
    primaryFocusId: log.primaryFocusId,
    secondaryFocusIds: log.secondaryFocusIds,
    boulderCount: log.boulderCount,
    routeCount: log.routeCount,
    grades: log.grades,
    rest: log.sessionType === 'rest',
  };
}

function toLog(row: LogRow, children: Children | undefined): TrainingLog {
  const log: TrainingLog = {
    date: row.date,
    tzOffsetMin: row.tzOffsetMin,
    sessionExertion: row.sessionExertion,
    exertionSource: row.exertionSource as TrainingLog['exertionSource'],
    boulderCount: row.boulderCount,
    routeCount: row.routeCount,
    durationMin: row.durationMin,
    sessionType: row.sessionType as TrainingLog['sessionType'],
    primaryFocusId: row.primaryFocusId,
    secondaryFocusIds: children?.secondaryFocusIds ?? [],
    grades: children?.grades ?? [],
    body: parseJson(row.bodyJson, null),
    notes: row.notes,
    load: null,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return { ...log, load: sessionLoad(toDailyLog(log)) };
}

export function getTrainingLog(db: AppDatabase, date: string): TrainingLog | null {
  const row = db
    .select()
    .from(trainingLogs)
    .where(and(eq(trainingLogs.date, date), isNull(trainingLogs.deletedAt)))
    .get();
  return row ? toLog(row, childrenInRange(db, date, date).get(date)) : null;
}

/** Live entries in [from, to], oldest first. */
export function listTrainingLogs(
  db: AppDatabase,
  from = FIRST_DATE,
  to = LAST_DATE,
): TrainingLog[] {
  const rows = db
    .select()
    .from(trainingLogs)
    .where(
      and(isNull(trainingLogs.deletedAt), gte(trainingLogs.date, from), lte(trainingLogs.date, to)),
    )
    .orderBy(trainingLogs.date)
    .all();
  if (rows.length === 0) return [];
  const children = childrenInRange(db, from, to);
  return rows.map((row) => toLog(row, children.get(row.date)));
}

function assertExpectedVersion(
  existing: LogRow | undefined,
  expected: number | undefined,
  date: string,
): void {
  if (expected === undefined) return;
  const live = existing && existing.deletedAt === null ? existing : undefined;
  if (!live || live.version !== expected) {
    throw new ProblemError(
      'VERSION_CONFLICT',
      `training log ${date} is at version ${live?.version ?? 'none'}, expected ${expected}`,
    );
  }
}

function replaceChildren(db: AppDatabase, date: string, input: TrainingLogInput): void {
  db.delete(trainingLogFocus).where(eq(trainingLogFocus.date, date)).run();
  db.delete(trainingLogGrades).where(eq(trainingLogGrades.date, date)).run();
  for (const focusId of new Set(input.secondaryFocusIds)) {
    db.insert(trainingLogFocus).values({ date, focusId }).run();
  }
  for (const grade of input.grades) {
    db.insert(trainingLogGrades)
      .values({
        date,
        discipline: grade.discipline,
        grade: grade.grade,
        attempted: grade.attempted,
        sent: grade.sent,
      })
      .run();
  }
}

/** Creates or replaces the day; the row and its grades/focus commit together. */
export function upsertTrainingLog(
  db: AppDatabase,
  clock: Clock,
  date: string,
  input: TrainingLogInput,
): TrainingLog {
  return inTransaction(db, (tx) => {
    const existing = tx.select().from(trainingLogs).where(eq(trainingLogs.date, date)).get();
    assertExpectedVersion(existing, input.expectedVersion, date);
    assertFocusTagsExist(tx, [
      ...(input.primaryFocusId ? [input.primaryFocusId] : []),
      ...input.secondaryFocusIds,
    ]);
    const live = existing && existing.deletedAt === null ? existing : undefined;
    const now = clock.nowIso();
    const fields = {
      tzOffsetMin: input.tzOffsetMin,
      sessionExertion: input.sessionExertion,
      exertionSource: input.exertionSource,
      boulderCount: input.boulderCount,
      routeCount: input.routeCount,
      durationMin: input.durationMin ?? null,
      sessionType: input.sessionType,
      primaryFocusId: input.primaryFocusId ?? null,
      bodyJson: input.body === undefined || input.body === null ? null : stringifyJson(input.body),
      notes: input.notes,
      version: live ? nextVersion(live.version) : 1,
      updatedAt: now,
      deletedAt: null,
    };
    tx.insert(trainingLogs)
      .values({ date, createdAt: live?.createdAt ?? now, ...fields })
      .onConflictDoUpdate({
        target: trainingLogs.date,
        set: { createdAt: live?.createdAt ?? now, ...fields },
      })
      .run();
    replaceChildren(tx, date, input);
    const saved = getTrainingLog(tx, date);
    if (!saved) throw new ProblemError('NOT_FOUND', `training log ${date} missing after upsert`);
    return saved;
  });
}

export function deleteTrainingLog(db: AppDatabase, clock: Clock, date: string): void {
  const now = clock.nowIso();
  const result = db
    .update(trainingLogs)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(trainingLogs.date, date), isNull(trainingLogs.deletedAt)))
    .returning({ date: trainingLogs.date })
    .all();
  if (result.length === 0) throw new ProblemError('NOT_FOUND', `training log ${date} not found`);
}

export function restoreTrainingLog(db: AppDatabase, clock: Clock, date: string): void {
  const result = db
    .update(trainingLogs)
    .set({ deletedAt: null, updatedAt: clock.nowIso() })
    .where(and(eq(trainingLogs.date, date), isNotNull(trainingLogs.deletedAt)))
    .returning({ date: trainingLogs.date })
    .all();
  if (result.length === 0)
    throw new ProblemError('NOT_FOUND', `training log ${date} is not in the trash`);
}

export function purgeTrainingLog(db: AppDatabase, date: string): void {
  inTransaction(db, (tx) => {
    const result = tx
      .delete(trainingLogs)
      .where(and(eq(trainingLogs.date, date), isNotNull(trainingLogs.deletedAt)))
      .returning({ date: trainingLogs.date })
      .all();
    if (result.length === 0)
      throw new ProblemError('NOT_FOUND', `training log ${date} is not in the trash`);
    tx.delete(trainingLogFocus).where(eq(trainingLogFocus.date, date)).run();
    tx.delete(trainingLogGrades).where(eq(trainingLogGrades.date, date)).run();
  });
}

export function listDeletedTrainingLogs(db: AppDatabase): TrashEntry[] {
  return db
    .select()
    .from(trainingLogs)
    .where(isNotNull(trainingLogs.deletedAt))
    .all()
    .flatMap((row) =>
      row.deletedAt === null
        ? []
        : [{ id: row.date, title: `Training log ${row.date}`, deletedAt: row.deletedAt }],
    );
}
