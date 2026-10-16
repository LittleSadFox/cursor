import type { AlignResult, ComparisonResult } from '@climbing-coach/engine';
import { writeComparisonBin } from '@climbing-coach/schema';

import {
  alignSides,
  compareSides,
  loadSide,
  resultBin,
  resultJson,
  type LoadedSide,
} from '../comparisons/compute.js';
import { getPoseTrackRecord, listMoveSegments } from '../db/repos/attempts.js';
import { getComparisonRecord, updateComparison } from '../db/repos/comparisons.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { AppDatabase } from '../ports/sql.js';
import { jobScratch, type JobScratch } from './scratch.js';
import type { StepContext, StepHandler } from './types.js';

export type CompareWork = {
  sides?: [LoadedSide, LoadedSide];
  alignment?: AlignResult;
  result?: ComparisonResult;
};

export type CompareHandlerDeps = {
  db: AppDatabase;
  clock: Clock;
  events: EventBus;
  blobs?: BlobStore | undefined;
  /** Per-job intermediate results; defaults to one dropped when the job ends. */
  scratch?: JobScratch<CompareWork>;
};

export function comparisonPath(id: string): string {
  return `comparisons/${id}.bin`;
}

function comparisonIdOf(ctx: StepContext): string {
  const payload = ctx.job.payload as { comparisonId?: unknown } | null;
  if (typeof payload?.comparisonId !== 'string')
    throw new Error('compare job without comparisonId');
  return payload.comparisonId;
}

/**
 * `compare` pipeline steps (BUILD_PLAN §3.3): load-tracks → align → compare → write-result.
 * Intermediate results stay in memory per job; a step whose inputs were lost to a restart
 * recomputes them from the stored pose tracks.
 */
export function compareHandlers(deps: CompareHandlerDeps): Record<string, StepHandler> {
  const work = deps.scratch ?? jobScratch<CompareWork>(deps.events, 'compare', () => ({}));

  function blobs(): BlobStore {
    if (!deps.blobs) throw new Error('library storage is not configured');
    return deps.blobs;
  }

  async function loadOne(side: LoadedSide['side']): Promise<LoadedSide> {
    const track = getPoseTrackRecord(deps.db, side.poseTrackId);
    const bytes = await blobs().read(track.path);
    return loadSide(side, bytes, listMoveSegments(deps.db, side.attemptId));
  }

  async function sides(ctx: StepContext): Promise<[LoadedSide, LoadedSide]> {
    const state = stateOf(ctx);
    if (!state.sides) {
      const record = getComparisonRecord(deps.db, comparisonIdOf(ctx));
      state.sides = [await loadOne(record.sides.a), await loadOne(record.sides.b)];
    }
    return state.sides;
  }

  async function alignment(ctx: StepContext): Promise<AlignResult> {
    const state = stateOf(ctx);
    if (!state.alignment) {
      const [a, b] = await sides(ctx);
      state.alignment = alignSides(a, b, getComparisonRecord(deps.db, comparisonIdOf(ctx)).options);
    }
    return state.alignment;
  }

  async function compared(ctx: StepContext): Promise<ComparisonResult> {
    const state = stateOf(ctx);
    if (!state.result) {
      const [a, b] = await sides(ctx);
      state.result = compareSides(a, b, await alignment(ctx));
    }
    return state.result;
  }

  function stateOf(ctx: StepContext): CompareWork {
    ctx.signal.throwIfAborted();
    return work.of(ctx.job.id);
  }

  async function writeResult(ctx: StepContext): Promise<{ comparisonId: string; steps: number }> {
    const id = comparisonIdOf(ctx);
    const [a, b] = await sides(ctx);
    const result = await compared(ctx);
    const path = comparisonPath(id);
    await blobs().write(path, writeComparisonBin(resultBin(a, b, result)));
    ctx.signal.throwIfAborted();
    updateComparison(deps.db, deps.clock, id, {
      status: 'ready',
      error: null,
      resultPath: path,
      result: resultJson(a, result),
    });
    work.drop(ctx.job.id);
    deps.events.publish({ type: 'comparison.ready', comparisonId: id });
    return { comparisonId: id, steps: result.score.length };
  }

  /** Drops a job's scratch state when a step fails, so failed jobs do not pin pose tracks. */
  const guarded =
    (step: (ctx: StepContext) => Promise<unknown>): StepHandler =>
    async (ctx) => {
      try {
        return await step(ctx);
      } catch (error) {
        work.drop(ctx.job.id);
        throw error;
      }
    };

  return {
    'compare.load-tracks': guarded(async (ctx) => {
      const [a, b] = await sides(ctx);
      return { framesA: a.samples.length, framesB: b.samples.length };
    }),
    'compare.align': guarded(async (ctx) => ({ steps: (await alignment(ctx)).path.length })),
    'compare.compare': guarded(async (ctx) => ({
      meanDivergence: (await compared(ctx)).summary.meanDivergence,
    })),
    'compare.write-result': guarded(writeResult),
  };
}
