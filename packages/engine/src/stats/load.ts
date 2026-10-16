import type { DailyLog } from './types.js';

/**
 * Session-RPE load: exertion × minutes.
 * Explicit rest days are 0. Missing duration or exertion yields null and is
 * excluded from averages (BUILD_PLAN §4.3).
 */
export function sessionLoad(log: DailyLog): number | null {
  if (log.rest) return 0;
  if (log.sessionExertion === null || log.durationMin === null) return null;
  return log.sessionExertion * log.durationMin;
}

export function isLoggedLoad(load: number | null): load is number {
  return load !== null;
}
