import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';

import {
  ProblemError,
  type FocusTag,
  type GradeBreakdown,
  type TrainingLog,
  type TrainingLogInput,
} from '@climbing-coach/api';
import { sessionLoad, type DailyLog } from '@climbing-coach/engine';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { focusTags, trainingLogFocus, trainingLogGrades, trainingLogs } from '../schema.js';
import { assertVersion, nextVersion } from '../version.js';

const BUILTIN_FOCUS: { id: string; label: string }[] = [
  { id: 'capacity', label: 'Capacity' },
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'power-endurance', label: 'Power endurance' },
  { id: 'technique', label: 'Technique' },
  { id: 'projecting', label: 'Projecting' },
  { id: 'flexibility', label: 'Flexibility / mobility' },
  { id: 'rest', label: 'Rest / active recovery' },
];

export function seedFocusTags(db: AppDatabase, clock: Clock): void {
  const now = clock.nowIso();
  for (const tag of BUILTIN_FOCUS) {
    const existing = db.select().from(focusTags).where(eq(focusTags.id, tag.id)).get();
    if (existing) continue;
    db.insert(focusTags)
      .values({
        id: tag.id,
        label: tag.label,
        builtin: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }
}

export function listFocusTags(db: AppDatabase): FocusTag[] {
  return db
    .select()
    .from(focusTags)
    .where(isNull(focusTags.deletedAt))
    .all()
    .map((row) => ({ id: row.id, label: row.label, builtin: row.builtin === 1 }));
}

export function createFocusTag(db: AppDatabase, clock: Clock, label: string): FocusTag {
  const now = clock.nowIso();
  const id = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id) throw new ProblemError('VALIDATION_FAILED', 'focus tag label is empty');
  const existing = db.select().from(focusTags).where(eq(focusTags.id, id)).get();
  if (existing && existing.deletedAt === null) {
    throw new ProblemError('VALIDATION_FAILED', `focus tag ${id} already exists`);
  }
  db.insert(focusTags)
    .values({
      id,
      label: label.trim(),
      builtin: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: focusTags.id,
      set: { label: label.trim(), deletedAt: null, updatedAt: now },
    })
    .run();
  return { id, label: label.trim(), builtin: false };
}

function gradesFor(db: AppDatabase, date: string): GradeBreakdown[] {
  return db
    .select()
    .from(trainingLogGrades)
    .where(eq(trainingLogGrades.date, date))
    .all()
    .map((row) => ({
      discipline: row.discipline as GradeBreakdown['discipline'],
      grade: row.grade,
      attempted: row.attempted,
      sent: row.sent,
    }));
}

function secondaryFocus(db: AppDatabase, date: string): string[] {
  return db
    .select()
    .from(trainingLogFocus)
    .where(eq(trainingLogFocus.date, date))
    .all()
    .map((row) => row.focusId);
}

function toLog(db: AppDatabase, row: typeof trainingLogs.$inferSelect): TrainingLog {
  const grades = gradesFor(db, row.date);
  const secondaryFocusIds = secondaryFocus(db, row.date);
  const daily: DailyLog = {
    date: row.date,
    sessionExertion: row.sessionExertion,
    durationMin: row.durationMin,
    sessionType: row.sessionType,
    primaryFocusId: row.primaryFocusId,
    secondaryFocusIds,
    boulderCount: row.boulderCount,
    routeCount: row.routeCount,
    grades,
    rest: row.sessionType === 'rest',
  };
  return {
    date: row.date,
    tzOffsetMin: row.tzOffsetMin,
    sessionExertion: row.sessionExertion,
    exertionSource: row.exertionSource as TrainingLog['exertionSource'],
    boulderCount: row.boulderCount,
    routeCount: row.routeCount,
    durationMin: row.durationMin,
    sessionType: row.sessionType as TrainingLog['sessionType'],
    primaryFocusId: row.primaryFocusId,
    secondaryFocusIds,
    grades,
    body: parseJson(row.bodyJson, null),
    notes: row.notes,
    load: sessionLoad(daily),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getTrainingLog(db: AppDatabase, date: string): TrainingLog | null {
  const row = db
    .select()
    .from(trainingLogs)
    .where(and(eq(trainingLogs.date, date), isNull(trainingLogs.deletedAt)))
    .get();
  return row ? toLog(db, row) : null;
}

export function listTrainingLogs(db: AppDatabase, from: string, to: string): TrainingLog[] {
  return db
    .select()
    .from(trainingLogs)
    .where(and(isNull(trainingLogs.deletedAt), gte(trainingLogs.date, from), lte(trainingLogs.date, to)))
    .all()
    .map((row) => toLog(db, row));
}

export function listAllTrainingLogs(db: AppDatabase): TrainingLog[] {
  return db
    .select()
    .from(trainingLogs)
    .where(isNull(trainingLogs.deletedAt))
    .all()
    .map((row) => toLog(db, row));
}

export function upsertTrainingLog(
  db: AppDatabase,
  clock: Clock,
  date: string,
  input: TrainingLogInput,
): TrainingLog {
  const existing = db.select().from(trainingLogs).where(eq(trainingLogs.date, date)).get();
  if (existing && existing.deletedAt === null) {
    assertVersion(existing.version, undefined, 'training log');
  }
  const now = clock.nowIso();
  const version = existing && existing.deletedAt === null ? nextVersion(existing.version) : 1;
  const createdAt = existing && existing.deletedAt === null ? existing.createdAt : now;
  const values = {
    date,
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
    version,
    createdAt,
    updatedAt: now,
    deletedAt: null,
  };
  db.insert(trainingLogs)
    .values(values)
    .onConflictDoUpdate({
      target: trainingLogs.date,
      set: {
        tzOffsetMin: values.tzOffsetMin,
        sessionExertion: values.sessionExertion,
        exertionSource: values.exertionSource,
        boulderCount: values.boulderCount,
        routeCount: values.routeCount,
        durationMin: values.durationMin,
        sessionType: values.sessionType,
        primaryFocusId: values.primaryFocusId,
        bodyJson: values.bodyJson,
        notes: values.notes,
        version: values.version,
        updatedAt: values.updatedAt,
        deletedAt: null,
      },
    })
    .run();
  db.delete(trainingLogFocus).where(eq(trainingLogFocus.date, date)).run();
  db.delete(trainingLogGrades).where(eq(trainingLogGrades.date, date)).run();
  for (const focusId of input.secondaryFocusIds) {
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
  const saved = getTrainingLog(db, date);
  if (!saved) throw new ProblemError('NOT_FOUND', `training log ${date} missing after upsert`);
  return saved;
}

export function deleteTrainingLog(db: AppDatabase, clock: Clock, date: string): void {
  const current = getTrainingLog(db, date);
  if (!current) throw new ProblemError('NOT_FOUND', `training log ${date} not found`);
  db.update(trainingLogs)
    .set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() })
    .where(eq(trainingLogs.date, date))
    .run();
}

export function restoreTrainingLog(db: AppDatabase, clock: Clock, date: string): void {
  const row = db.select().from(trainingLogs).where(eq(trainingLogs.date, date)).get();
  if (!row) throw new ProblemError('NOT_FOUND', `training log ${date} not found`);
  db.update(trainingLogs)
    .set({ deletedAt: null, updatedAt: clock.nowIso() })
    .where(eq(trainingLogs.date, date))
    .run();
}

export function purgeTrainingLog(db: AppDatabase, date: string): void {
  db.delete(trainingLogFocus).where(eq(trainingLogFocus.date, date)).run();
  db.delete(trainingLogGrades).where(eq(trainingLogGrades.date, date)).run();
  db.delete(trainingLogs).where(eq(trainingLogs.date, date)).run();
}

export function listDeletedTrainingLogs(
  db: AppDatabase,
): { id: string; title: string; deletedAt: string }[] {
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
