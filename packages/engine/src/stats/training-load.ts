import { acwr, acwrBand } from './acwr.js';
import { hasEnoughSamples } from './averages.js';
import { eachDay } from './dates.js';
import { createLoadScanner, type LoadScanner, type LoggedLoad } from './load-scanner.js';
import { sessionLoad } from './load.js';
import type {
  DailyLoadPoint,
  DailyLog,
  DateRange,
  LoadMethod,
  TrainingLoadSeries,
} from './types.js';

export function trainingLoad(
  logs: readonly DailyLog[],
  range: DateRange,
  method: LoadMethod = 'rolling',
): TrainingLoadSeries {
  const byDate = new Map<string, DailyLog>();
  for (const log of logs) byDate.set(log.date, log);

  const logged: LoggedLoad[] = [];
  for (const log of byDate.values()) {
    const load = sessionLoad(log);
    if (load !== null && log.date <= range.to) logged.push({ date: log.date, load });
  }
  const scanner = createLoadScanner(logged);

  return {
    unit: 'AU (session exertion × minutes)',
    method,
    days: eachDay(range.from, range.to).map((date) =>
      dayPoint(date, byDate.get(date), scanner, method),
    ),
  };
}

function dayPoint(
  date: string,
  log: DailyLog | undefined,
  scanner: LoadScanner,
  method: LoadMethod,
): DailyLoadPoint {
  const load = log === undefined ? null : sessionLoad(log);
  const windows = scanner.windowsAt(date);
  const enough = hasEnoughSamples(windows.shortCount, windows.longCount);
  const { short, long } =
    method === 'ewma'
      ? scanner.ewmaAt(date)
      : {
          short: windows.shortCount === 0 ? null : windows.shortSum / windows.shortCount,
          long: windows.longCount === 0 ? null : windows.longSum / windows.longCount,
        };
  const ratio = enough ? acwr(short, long) : null;
  return {
    date,
    logged: log !== undefined && load !== null,
    rest: log?.rest === true,
    load,
    short: short === null ? null : round1(short),
    long: long === null ? null : round1(long),
    acwr: ratio === null ? null : round2(ratio),
    band: acwrBand(ratio, enough),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
