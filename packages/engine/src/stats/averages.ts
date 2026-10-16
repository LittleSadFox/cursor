import { createLoadScanner, LONG_DAYS, SHORT_DAYS, type LoggedLoad } from './load-scanner.js';
import { isLoggedLoad } from './load.js';

const SHORT_MIN_LOGGED = 4;
const LONG_MIN_LOGGED = 14;

export type LoadByDate = ReadonlyMap<string, number | null>;

export function loggedLoads(loads: LoadByDate): LoggedLoad[] {
  const out: LoggedLoad[] = [];
  for (const [date, load] of loads) {
    if (isLoggedLoad(load)) out.push({ date, load });
  }
  return out;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/** Rolling 7- and 28-day averages of logged loads only (BUILD_PLAN §4.3). */
export function rollingAverages(
  loads: LoadByDate,
  date: string,
): { short: number | null; long: number | null; shortCount: number; longCount: number } {
  const w = createLoadScanner(loggedLoads(loads)).windowsAt(date);
  return {
    short: w.shortCount === 0 ? null : w.shortSum / w.shortCount,
    long: w.longCount === 0 ? null : w.longSum / w.longCount,
    shortCount: w.shortCount,
    longCount: w.longCount,
  };
}

/**
 * The ACWR sample floor for both methods: fewer than 4 logged days in the 7-day window or
 * fewer than 14 in the 28-day window means `insufficient_data` (BUILD_PLAN §4.3).
 */
export function hasEnoughSamples(shortCount: number, longCount: number): boolean {
  return shortCount >= SHORT_MIN_LOGGED && longCount >= LONG_MIN_LOGGED;
}

/**
 * Time-aware EWMA with 7- and 28-day time constants.
 * Irregular logged days use α = 1 − exp(−Δt / τ).
 */
export function ewmaLoad(
  loads: LoadByDate,
  date: string,
  tauShort = SHORT_DAYS,
  tauLong = LONG_DAYS,
): { short: number | null; long: number | null; loggedCount: number } {
  const logged = loggedLoads(loads);
  const state = createLoadScanner(logged, tauShort, tauLong).ewmaAt(date);
  return { ...state, loggedCount: logged.filter((entry) => entry.date <= date).length };
}
