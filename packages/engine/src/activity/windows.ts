import { clamp } from '../math.js';

export type ActivityWindow = { startUs: number; endUs: number };

export type ActiveWindowParams = {
  energyThreshold: number;
  maxGapUs: number;
  padUs: number;
  fullRecordingFraction: number;
};

type Sample = { tUs: number; energy: number };

/**
 * Active windows: energy at/above threshold, gaps shorter than `maxGapUs` merged,
 * then padded. If the unpadded active time exceeds `fullRecordingFraction`, one
 * window covers the whole recording.
 */
export function activeWindows(
  samples: readonly Sample[],
  durationUs: number,
  params: ActiveWindowParams,
): ActivityWindow[] {
  if (durationUs <= 0) return [];
  const active = samples.filter((sample) => sample.energy >= params.energyThreshold);
  if (active.length === 0) return [];
  const runs = mergeRuns(active, params.maxGapUs);
  const coverage = runs.reduce((sum, run) => sum + (run.endUs - run.startUs), 0);
  if (coverage / durationUs > params.fullRecordingFraction) {
    return [{ startUs: 0, endUs: durationUs }];
  }
  const padded = runs.map((run) => ({
    startUs: clamp(run.startUs - params.padUs, 0, durationUs),
    endUs: clamp(run.endUs + params.padUs, 0, durationUs),
  }));
  return mergeRuns(
    padded.map((window) => ({ tUs: window.startUs, endUs: window.endUs })),
    0,
  ).map((run) => ({
    startUs: run.startUs,
    endUs: run.endUs,
  }));
}

type Run = { startUs: number; endUs: number };

function mergeRuns(samples: readonly { tUs: number; endUs?: number }[], maxGapUs: number): Run[] {
  const runs: Run[] = [];
  for (const sample of samples) {
    const startUs = sample.tUs;
    const endUs = sample.endUs ?? sample.tUs;
    const previous = runs[runs.length - 1];
    if (!previous || startUs - previous.endUs >= maxGapUs) {
      runs.push({ startUs, endUs });
      continue;
    }
    previous.endUs = Math.max(previous.endUs, endUs);
  }
  return runs;
}
