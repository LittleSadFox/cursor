import type { AcwrBand } from './types.js';

/**
 * Acute:chronic workload ratio bands (BUILD_PLAN §4.3).
 * Team-sport heuristics — shown as guidance, not medical advice.
 */
export function acwr(short: number | null, long: number | null): number | null {
  if (short === null || long === null || long === 0) return null;
  return short / long;
}

export function acwrBand(ratio: number | null, enoughData: boolean): AcwrBand {
  if (!enoughData || ratio === null) return 'insufficient_data';
  if (ratio < 0.8) return 'detraining';
  if (ratio < 1.3) return 'steady';
  if (ratio <= 1.5) return 'caution';
  return 'ramping_fast';
}
