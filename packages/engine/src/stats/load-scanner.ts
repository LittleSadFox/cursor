import { addDays, daysBetween } from './dates.js';

export const SHORT_DAYS = 7;
export const LONG_DAYS = 28;

export type LoggedLoad = { date: string; load: number };

export type WindowStats = {
  shortSum: number;
  shortCount: number;
  longSum: number;
  longCount: number;
};

export type EwmaState = { short: number | null; long: number | null };

export type LoadScanner = {
  /** Rolling window sums and counts ending on `date` (inclusive). */
  windowsAt(date: string): WindowStats;
  /** EWMA as of the last logged day on or before `date`. */
  ewmaAt(date: string): EwmaState;
};

/**
 * Walks logged loads once for a sequence of non-decreasing query dates, so a series over
 * D days with N logged entries costs O(D + N) instead of O(D × N).
 */
export function createLoadScanner(
  logged: readonly LoggedLoad[],
  tauShort = SHORT_DAYS,
  tauLong = LONG_DAYS,
): LoadScanner {
  const entries = [...logged].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const prefix = new Float64Array(entries.length + 1);
  entries.forEach((entry, i) => {
    prefix[i + 1] = (prefix[i] ?? 0) + entry.load;
  });

  let end = 0;
  let shortStart = 0;
  let longStart = 0;
  let lastQuery: string | null = null;

  let ewmaIndex = 0;
  let ewma: EwmaState = { short: null, long: null };
  let prevDate: string | null = null;

  function assertMonotonic(date: string): void {
    if (lastQuery !== null && date < lastQuery) {
      throw new RangeError(`load scanner dates must not decrease (${date} after ${lastQuery})`);
    }
    lastQuery = date;
  }

  function advanceTo(date: string): void {
    while (end < entries.length && (entries[end]?.date ?? '') <= date) end += 1;
  }

  function firstOnOrAfter(start: number, date: string): number {
    let i = start;
    while (i < end && (entries[i]?.date ?? '') < date) i += 1;
    return i;
  }

  function sum(from: number, to: number): number {
    return (prefix[to] ?? 0) - (prefix[from] ?? 0);
  }

  return {
    windowsAt(date) {
      assertMonotonic(date);
      advanceTo(date);
      shortStart = firstOnOrAfter(shortStart, addDays(date, -(SHORT_DAYS - 1)));
      longStart = firstOnOrAfter(longStart, addDays(date, -(LONG_DAYS - 1)));
      return {
        shortSum: sum(shortStart, end),
        shortCount: end - shortStart,
        longSum: sum(longStart, end),
        longCount: end - longStart,
      };
    },
    ewmaAt(date) {
      assertMonotonic(date);
      advanceTo(date);
      for (; ewmaIndex < end; ewmaIndex += 1) {
        const entry = entries[ewmaIndex];
        if (entry === undefined) continue;
        ewma = stepEwma(ewma, prevDate, entry, tauShort, tauLong);
        prevDate = entry.date;
      }
      return ewma;
    },
  };
}

/** Time-aware EWMA step: α = 1 − exp(−Δt / τ) for irregularly logged days. */
export function stepEwma(
  state: EwmaState,
  prevDate: string | null,
  entry: LoggedLoad,
  tauShort: number,
  tauLong: number,
): EwmaState {
  if (prevDate === null || state.short === null || state.long === null) {
    return { short: entry.load, long: entry.load };
  }
  const delta = Math.max(1, daysBetween(prevDate, entry.date));
  const alphaShort = 1 - Math.exp(-delta / tauShort);
  const alphaLong = 1 - Math.exp(-delta / tauLong);
  return {
    short: alphaShort * entry.load + (1 - alphaShort) * state.short,
    long: alphaLong * entry.load + (1 - alphaLong) * state.long,
  };
}
