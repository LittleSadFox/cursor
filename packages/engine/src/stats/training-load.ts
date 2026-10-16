import { acwr, acwrBand } from './acwr.js';
import {
  ewmaLoad,
  hasEnoughEwmaSamples,
  hasEnoughRollingSamples,
  rollingAverages,
} from './averages.js';
import { eachDay } from './dates.js';
import { sessionLoad } from './load.js';
import type { DailyLog, DateRange, LoadMethod, TrainingLoadSeries } from './types.js';

export function trainingLoad(
  logs: readonly DailyLog[],
  range: DateRange,
  method: LoadMethod = 'rolling',
): TrainingLoadSeries {
  const byDate = new Map<string, DailyLog>();
  for (const log of logs) byDate.set(log.date, log);

  const loadByDate = new Map<string, number | null>();
  for (const log of logs) loadByDate.set(log.date, sessionLoad(log));

  const days = eachDay(range.from, range.to).map((date) => {
    const log = byDate.get(date);
    const load = log === undefined ? null : sessionLoad(log);
    const { short, long, enough } = averagesFor(loadByDate, date, method);
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
  });

  return {
    unit: 'AU (session exertion × minutes)',
    method,
    days,
  };
}

function averagesFor(
  loadByDate: Map<string, number | null>,
  date: string,
  method: LoadMethod,
): { short: number | null; long: number | null; enough: boolean } {
  if (method === 'ewma') {
    const ewma = ewmaLoad(loadByDate, date);
    return { short: ewma.short, long: ewma.long, enough: hasEnoughEwmaSamples(ewma.loggedCount) };
  }
  const rolling = rollingAverages(loadByDate, date);
  return {
    short: rolling.short,
    long: rolling.long,
    enough: hasEnoughRollingSamples(rolling.shortCount, rolling.longCount),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
