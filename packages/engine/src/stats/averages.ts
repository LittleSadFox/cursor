import { addDays, daysBetween } from './dates.js';
import { isLoggedLoad } from './load.js';

const SHORT_DAYS = 7;
const LONG_DAYS = 28;
const SHORT_MIN_LOGGED = 4;
const LONG_MIN_LOGGED = 14;

export type LoadByDate = ReadonlyMap<string, number | null>;

function loggedLoadsInWindow(
  loads: LoadByDate,
  endDate: string,
  windowDays: number,
): number[] {
  const start = addDays(endDate, -(windowDays - 1));
  const values: number[] = [];
  for (const [date, load] of loads) {
    if (date < start || date > endDate) continue;
    if (isLoggedLoad(load)) values.push(load);
  }
  return values;
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
  const shortValues = loggedLoadsInWindow(loads, date, SHORT_DAYS);
  const longValues = loggedLoadsInWindow(loads, date, LONG_DAYS);
  return {
    short: mean(shortValues),
    long: mean(longValues),
    shortCount: shortValues.length,
    longCount: longValues.length,
  };
}

export function hasEnoughRollingSamples(shortCount: number, longCount: number): boolean {
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
  const entries = [...loads.entries()]
    .filter(([day, load]) => day <= date && isLoggedLoad(load))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) as [string, number][];

  if (entries.length === 0) {
    return { short: null, long: null, loggedCount: 0 };
  }

  const first = entries[0];
  if (first === undefined) return { short: null, long: null, loggedCount: 0 };
  let short = first[1];
  let long = first[1];
  let prevDate = first[0];

  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined) continue;
    const [day, value] = entry;
    const delta = Math.max(1, daysBetween(prevDate, day));
    const alphaShort = 1 - Math.exp(-delta / tauShort);
    const alphaLong = 1 - Math.exp(-delta / tauLong);
    short = alphaShort * value + (1 - alphaShort) * short;
    long = alphaLong * value + (1 - alphaLong) * long;
    prevDate = day;
  }

  return { short, long, loggedCount: entries.length };
}

export function hasEnoughEwmaSamples(loggedCount: number): boolean {
  return loggedCount >= LONG_MIN_LOGGED;
}
