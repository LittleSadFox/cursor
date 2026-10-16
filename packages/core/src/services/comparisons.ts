import {
  AlignmentFeedbackSchema,
  ComparisonExportInputSchema,
  ComparisonInputSchema,
  ProblemError,
  type Accepted,
  type AlignmentFeedback,
  type CoachApi,
  type Comparison,
} from '@climbing-coach/api';
import { ENGINE_VERSION } from '@climbing-coach/engine';
import { readComparisonBin, type ComparisonBin } from '@climbing-coach/schema';

import { RESULT_CHANNELS } from '../comparisons/compute.js';
import { assertSupportedOptions, comparisonKey } from '../comparisons/options.js';
import { resolveSide, sharedPoseModel } from '../comparisons/sides.js';
import {
  findComparisonByKey,
  getComparisonRecord,
  insertComparison,
  updateComparison,
  type ComparisonRecord,
} from '../db/repos/comparisons.js';
import { insertLabel } from '../db/repos/labels.js';
import type { IdGen } from '../ids/ulid.js';
import type { JobRunner } from '../jobs/runner.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';
import { parseInput } from './validate.js';

export type ComparisonServiceDeps = {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  runner: Pick<JobRunner, 'enqueue' | 'get'>;
  blobs?: BlobStore | undefined;
  ffmpegAvailable: boolean;
};

const EMPTY_SUMMARY = { meanDivergence: null, topDifferences: [] };

/** A pending row whose job failed or was cancelled reads as failed. */
export function withJobStatus(
  record: ComparisonRecord,
  runner: Pick<JobRunner, 'get'>,
): ComparisonRecord {
  if (record.status !== 'pending' || record.jobId === null) return record;
  let job;
  try {
    job = runner.get(record.jobId);
  } catch {
    return { ...record, status: 'failed', error: 'comparison job is missing' };
  }
  if (job.status === 'failed') return { ...record, status: 'failed', error: job.error };
  if (job.status === 'cancelled') return { ...record, status: 'failed', error: 'cancelled' };
  return record;
}

export function toComparison(record: ComparisonRecord): Comparison {
  const base = `/api/v1/comparisons/${record.id}`;
  return {
    id: record.id,
    status: record.status,
    error: record.error,
    jobId: record.status === 'pending' ? record.jobId : null,
    attemptAId: record.attemptAId,
    attemptBId: record.attemptBId,
    a: record.sides.a,
    b: record.sides.b,
    poseModel: record.poseModel,
    engineVersion: record.engineVersion,
    options: record.options,
    channels: record.result?.channels ?? [...RESULT_CHANNELS],
    steps: record.result?.steps ?? 0,
    moveMatches: record.result?.moveMatches ?? [],
    perMove: record.result?.perMove ?? [],
    summary: record.result?.summary ?? EMPTY_SUMMARY,
    warpUrl: `${base}/warp`,
    divergenceUrl: `${base}/divergence`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Alignment feedback label (BUILD_PLAN §7.5): the pair joins the alignment regression set. */
export function feedbackLabel(record: ComparisonRecord, feedback: AlignmentFeedback) {
  const match = record.result?.moveMatches.find((item) => item.a === feedback.moveIndexA);
  return {
    kind: 'alignment_feedback' as const,
    subjectId: record.id,
    predicted: { moveIndexB: match?.b ?? null, cost: match?.cost ?? null },
    final: {
      verdict: feedback.verdict,
      note: feedback.note ?? '',
      moveIndexA: feedback.moveIndexA,
      attemptAId: record.attemptAId,
      attemptBId: record.attemptBId,
      poseTrackAId: record.sides.a.poseTrackId,
      poseTrackBId: record.sides.b.poseTrackId,
      poseModel: record.poseModel,
      engineVersion: record.engineVersion,
      optionsHash: record.optionsHash,
    },
    sourceVersion: ENGINE_VERSION,
  };
}

export function createComparisonService(deps: ComparisonServiceDeps): CoachApi['comparisons'] {
  const { db, clock } = deps;

  function view(id: string): ComparisonRecord {
    return withJobStatus(getComparisonRecord(db, id), deps.runner);
  }

  function readyRecord(id: string): ComparisonRecord & { resultPath: string } {
    const record = view(id);
    if (record.status !== 'ready' || record.resultPath === null) {
      throw new ProblemError('VALIDATION_FAILED', `comparison ${id} is ${record.status}`);
    }
    return { ...record, resultPath: record.resultPath };
  }

  async function readBin(id: string): Promise<ComparisonBin> {
    const record = readyRecord(id);
    if (!deps.blobs) throw new ProblemError('NOT_FOUND', 'library is not configured');
    return readComparisonBin(await deps.blobs.read(record.resultPath));
  }

  function requeue(record: ComparisonRecord): ComparisonRecord {
    const job = deps.runner.enqueue('compare', { comparisonId: record.id });
    return updateComparison(db, clock, record.id, {
      status: 'pending',
      jobId: job.id,
      error: null,
    });
  }

  return {
    async create(raw) {
      const input = parseInput(ComparisonInputSchema, raw);
      assertSupportedOptions(input.options);
      const a = resolveSide(db, input.attemptAId);
      const b = resolveSide(db, input.attemptBId);
      const key = comparisonKey(
        a.side.attemptId,
        b.side.attemptId,
        sharedPoseModel(a, b),
        input.options,
      );
      const cached = findComparisonByKey(db, key);
      if (cached) {
        const current = withJobStatus(cached, deps.runner);
        return toComparison(current.status === 'failed' ? requeue(current) : current);
      }
      const id = deps.ids.ulid();
      const job = deps.runner.enqueue('compare', { comparisonId: id });
      return toComparison(
        insertComparison(db, clock, {
          ...key,
          id,
          jobId: job.id,
          options: input.options,
          sides: { a: a.side, b: b.side },
        }),
      );
    },
    get: async (id) => toComparison(view(id)),
    warp: async (id) => (await readBin(id)).warpUs,
    divergence: async (id) => (await readBin(id)).divergence,
    async feedback(id, raw) {
      const feedback = parseInput(AlignmentFeedbackSchema, raw);
      const record = readyRecord(id);
      if (!record.result?.perMove.some((move) => move.moveIndexA === feedback.moveIndexA)) {
        throw new ProblemError(
          'VALIDATION_FAILED',
          `attempt A has no move ${feedback.moveIndexA} in comparison ${id}`,
        );
      }
      insertLabel(db, clock, { id: deps.ids.ulid(), ...feedbackLabel(record, feedback) });
    },
    async export(id, raw): Promise<Accepted> {
      parseInput(ComparisonExportInputSchema, raw);
      readyRecord(id);
      if (!deps.ffmpegAvailable) {
        throw new ProblemError(
          'FFMPEG_UNAVAILABLE',
          'comparison video export needs the bundled LGPL ffmpeg (ADR-002)',
        );
      }
      throw new ProblemError('NOT_IMPLEMENTED', 'comparison export lands with P3.6');
    },
  };
}
