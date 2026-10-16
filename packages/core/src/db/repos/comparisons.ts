import { and, eq, isNull } from 'drizzle-orm';

import {
  ProblemError,
  type ComparisonOptions,
  type ComparisonSide,
  type ComparisonStatus,
  type ComparisonSummary,
  type MoveComparison,
  type MoveMatch,
} from '@climbing-coach/api';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { comparisons } from '../schema.js';

export type ComparisonKey = {
  attemptAId: string;
  attemptBId: string;
  poseModel: string;
  engineVersion: string;
  optionsHash: string;
};

export type ComparisonResultJson = {
  steps: number;
  channels: string[];
  moveMatches: MoveMatch[];
  perMove: MoveComparison[];
  summary: ComparisonSummary;
};

export type ComparisonRecord = ComparisonKey & {
  id: string;
  status: ComparisonStatus;
  jobId: string | null;
  error: string | null;
  options: ComparisonOptions;
  sides: { a: ComparisonSide; b: ComparisonSide };
  resultPath: string | null;
  result: ComparisonResultJson | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ComparisonUpdate = Partial<
  Pick<ComparisonRecord, 'status' | 'jobId' | 'error' | 'resultPath' | 'result'>
>;

function toRecord(row: typeof comparisons.$inferSelect): ComparisonRecord {
  return {
    id: row.id,
    attemptAId: row.attemptAId,
    attemptBId: row.attemptBId,
    poseModel: row.poseModel,
    engineVersion: row.engineVersion,
    optionsHash: row.optionsHash,
    status: row.status as ComparisonStatus,
    jobId: row.jobId,
    error: row.error,
    options: parseJson<ComparisonOptions>(row.optionsJson, {
      collapseRests: true,
      spatialMode: 'body',
    }),
    sides: parseJson(row.sidesJson, {} as ComparisonRecord['sides']),
    resultPath: row.resultPath,
    result:
      row.resultPath === null
        ? null
        : parseJson<ComparisonResultJson | null>(row.summaryJson, null),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findComparisonByKey(db: AppDatabase, key: ComparisonKey): ComparisonRecord | null {
  const row = db
    .select()
    .from(comparisons)
    .where(
      and(
        eq(comparisons.attemptAId, key.attemptAId),
        eq(comparisons.attemptBId, key.attemptBId),
        eq(comparisons.poseModel, key.poseModel),
        eq(comparisons.engineVersion, key.engineVersion),
        eq(comparisons.optionsHash, key.optionsHash),
        isNull(comparisons.deletedAt),
      ),
    )
    .get();
  return row ? toRecord(row) : null;
}

export function getComparisonRecord(db: AppDatabase, id: string): ComparisonRecord {
  const row = db
    .select()
    .from(comparisons)
    .where(and(eq(comparisons.id, id), isNull(comparisons.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `comparison ${id} not found`);
  return toRecord(row);
}

export function insertComparison(
  db: AppDatabase,
  clock: Clock,
  record: ComparisonKey & Pick<ComparisonRecord, 'id' | 'options' | 'sides' | 'jobId'>,
): ComparisonRecord {
  const now = clock.nowIso();
  db.insert(comparisons)
    .values({
      id: record.id,
      attemptAId: record.attemptAId,
      attemptBId: record.attemptBId,
      poseModel: record.poseModel,
      engineVersion: record.engineVersion,
      optionsHash: record.optionsHash,
      status: 'pending',
      jobId: record.jobId,
      optionsJson: stringifyJson(record.options),
      sidesJson: stringifyJson(record.sides),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getComparisonRecord(db, record.id);
}

/** Retires a cached row whose inputs changed, freeing its cache key for a fresh comparison. */
export function supersedeComparison(db: AppDatabase, clock: Clock, id: string): void {
  db.update(comparisons)
    .set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() })
    .where(and(eq(comparisons.id, id), isNull(comparisons.deletedAt)))
    .run();
}

export function updateComparison(
  db: AppDatabase,
  clock: Clock,
  id: string,
  update: ComparisonUpdate,
): ComparisonRecord {
  const current = getComparisonRecord(db, id);
  db.update(comparisons)
    .set({
      ...(update.status === undefined ? {} : { status: update.status }),
      ...(update.jobId === undefined ? {} : { jobId: update.jobId }),
      ...(update.error === undefined ? {} : { error: update.error }),
      ...(update.resultPath === undefined ? {} : { resultPath: update.resultPath }),
      ...(update.result === undefined ? {} : { summaryJson: stringifyJson(update.result) }),
      version: current.version + 1,
      updatedAt: clock.nowIso(),
    })
    .where(eq(comparisons.id, id))
    .run();
  return getComparisonRecord(db, id);
}
