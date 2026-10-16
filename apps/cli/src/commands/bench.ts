import {
  FEATURE_NAMES,
  align,
  alignFrames,
  comparePostures,
  detectAttempts,
  globalMotion,
  preprocess,
  type AlignFrame,
  type PoseSample,
} from '@climbing-coach/engine';
import { FRAME_US, standClimbFall, twoAttempts, wallPan } from '@climbing-coach/test-fixtures';

import { hasFlag } from '../args.js';
import { toPoseSamples } from '../io.js';

export type BenchResult = { name: string; ms: number; budgetMs: number | null };

/** Median wall time of `runs` calls after one warm-up call. */
function timeMs(fn: () => void, runs = 3): number {
  fn();
  const times = Array.from({ length: runs }, () => {
    const started = performance.now();
    fn();
    return performance.now() - started;
  }).sort((a, b) => a - b);
  return Math.round((times[Math.floor(runs / 2)] ?? 0) * 10) / 10;
}

/** Synthetic climbing sessions repeated back to back for `seconds` at the detection rate. */
export function syntheticTrack(seconds: number): PoseSample[] {
  const cycle = [...twoAttempts().samples, ...standClimbFall().samples];
  const frames = Math.round((seconds * 1_000_000) / FRAME_US);
  return toPoseSamples(
    Array.from({ length: frames }, (_, index) => ({
      tUs: index * FRAME_US,
      landmarks: cycle[index % cycle.length]?.landmarks ?? [],
    })),
  );
}

/** Feature rows for an attempt of `seconds` at `fps`; `pace` < 1 is a slower climber. */
export function syntheticFeatures(seconds: number, fps: number, pace: number): AlignFrame[] {
  const width = FEATURE_NAMES.length;
  return Array.from({ length: Math.round(seconds * fps) }, (_, index) => {
    const phase = (index / fps) * pace;
    return {
      tUs: Math.round((index * 1_000_000) / fps),
      values: Array.from({ length: width }, (_, col) =>
        Math.sin(phase * (0.7 + col / width) + col),
      ),
      speed: 1,
    };
  });
}

function compareTracks(a: readonly PoseSample[], b: readonly PoseSample[]): void {
  comparePostures(
    { samples: a, moves: [] },
    { samples: b, moves: [] },
    align(alignFrames(a), alignFrames(b)),
  );
}

export function runBench(): BenchResult[] {
  const track = syntheticTrack(600);
  const climbA = syntheticTrack(60);
  const climbB = syntheticTrack(66).slice(30);
  const a = syntheticFeatures(60, 30, 1);
  const b = syntheticFeatures(60, 30, 0.9);
  const [previous, next] = wallPan(2, 500_000, 3, 1);
  return [
    {
      name: 'preprocess + detectAttempts, 10-min track @15 fps',
      ms: timeMs(() => detectAttempts(preprocess(track).image)),
      budgetMs: 1000,
    },
    {
      name: 'align two 60 s attempts @30 fps',
      ms: timeMs(() => align(a, b)),
      budgetMs: 300,
    },
    {
      name: 'alignFrames + align + comparePostures, two 60 s tracks @15 fps',
      ms: timeMs(() => compareTracks(climbA, climbB)),
      budgetMs: null,
    },
    {
      name: 'globalMotion, one 160x90 frame pair',
      ms: timeMs(() => {
        if (previous && next) globalMotion(previous.pixels, next.pixels, 160, 90);
      }),
      budgetMs: null,
    },
  ];
}

export function benchCommand(args: readonly string[]): void {
  const results = runBench();
  const withinBudget = results.every((r) => r.budgetMs === null || r.ms <= r.budgetMs);
  console.log(JSON.stringify({ results, withinBudget }));
  if (hasFlag(args, 'check') && !withinBudget) process.exitCode = 1;
}
