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
  return unionWindows(padded);
}

/** Active sample times grouped into runs; a gap of `maxGapUs` or more starts a new run. */
function mergeRuns(samples: readonly Sample[], maxGapUs: number): ActivityWindow[] {
  const runs: ActivityWindow[] = [];
  for (const sample of samples) {
    const previous = runs[runs.length - 1];
    if (!previous || sample.tUs - previous.endUs >= maxGapUs) {
      runs.push({ startUs: sample.tUs, endUs: sample.tUs });
      continue;
    }
    previous.endUs = Math.max(previous.endUs, sample.tUs);
  }
  return runs;
}

/** Union of start-sorted windows. Overlapping and touching windows merge. */
function unionWindows(windows: readonly ActivityWindow[]): ActivityWindow[] {
  const out: ActivityWindow[] = [];
  for (const window of windows) {
    const previous = out[out.length - 1];
    if (previous && window.startUs <= previous.endUs) {
      previous.endUs = Math.max(previous.endUs, window.endUs);
    } else {
      out.push({ ...window });
    }
  }
  return out;
}
