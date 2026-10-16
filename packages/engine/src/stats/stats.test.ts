import { describe, expect, it } from 'vitest';

import { createMulberry32 } from '../eval/rng.js';

import { acwr, acwrBand } from './acwr.js';
import { ewmaLoad, rollingAverages } from './averages.js';
import { addDays, eachDay, isoWeek } from './dates.js';
import { sessionLoad } from './load.js';
import { prefillTrainingLog } from './prefill.js';
import { trainingLoad } from './training-load.js';
import { exertionVolume, focusDistribution, gradePyramid, weeklySummary } from './charts.js';
import type { DailyLog } from './types.js';

function log(partial: Partial<DailyLog> & { date: string }): DailyLog {
  return {
    sessionExertion: 7,
    durationMin: 110,
    sessionType: 'climbing',
    primaryFocusId: 'strength',
    secondaryFocusIds: ['technique'],
    boulderCount: 8,
    routeCount: 0,
    grades: [{ discipline: 'boulder', grade: 'V5', attempted: 3, sent: 1 }],
    rest: false,
    ...partial,
  };
}

describe('dates', () => {
  it('adds days across a DST boundary using UTC noon', () => {
    // 2026-03-08 is the US spring-forward Sunday; UTC noon stays on the civil date.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(eachDay('2026-03-07', '2026-03-09')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });

  it('labels ISO weeks', () => {
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2026-10-15')).toMatch(/^2026-W\d{2}$/);
  });
});

describe('sessionLoad', () => {
  it('multiplies exertion by minutes', () => {
    expect(sessionLoad(log({ date: '2026-10-15' }))).toBe(770);
  });

  it('counts explicit rest as 0 and missing duration as null', () => {
    expect(sessionLoad(log({ date: '2026-10-16', rest: true }))).toBe(0);
    expect(sessionLoad(log({ date: '2026-10-17', durationMin: null }))).toBeNull();
  });
});

describe('prefillTrainingLog', () => {
  it('blends max and mean of rated exertions', () => {
    const prefill = prefillTrainingLog('2026-10-15', [
      {
        date: '2026-10-15',
        exertion: 9,
        boulderId: 'a',
        boulderGrade: 'V5',
        discipline: 'boulder',
        outcome: 'fall',
      },
      {
        date: '2026-10-15',
        exertion: 5,
        boulderId: 'a',
        boulderGrade: 'V5',
        discipline: 'boulder',
        outcome: 'top',
      },
      {
        date: '2026-10-15',
        exertion: null,
        boulderId: 'b',
        boulderGrade: 'V3',
        discipline: 'boulder',
        outcome: 'fall',
      },
    ]);
    // round(0.5 * 9 + 0.5 * 7) = round(8)
    expect(prefill.sessionExertion).toBe(8);
    expect(prefill.basis).toEqual({ attempts: 2, mean: 7, max: 9 });
    expect(prefill.boulderCount).toBe(2);
    expect(prefill.grades).toEqual([
      { discipline: 'boulder', grade: 'V3', attempted: 1, sent: 0 },
      { discipline: 'boulder', grade: 'V5', attempted: 2, sent: 1 },
    ]);
  });
});

describe('rolling ACWR', () => {
  it('matches a hand-computed 7/28 window', () => {
    const loads = new Map<string, number | null>();
    for (let i = 0; i < 28; i += 1) {
      loads.set(addDays('2026-09-18', i), 100);
    }
    const { short, long, shortCount, longCount } = rollingAverages(loads, '2026-10-15');
    expect(shortCount).toBe(7);
    expect(longCount).toBe(28);
    expect(short).toBe(100);
    expect(long).toBe(100);
    expect(acwr(short, long)).toBe(1);
    expect(acwrBand(1, true)).toBe('steady');
  });

  it('excludes missing days and null-load entries', () => {
    const loads = new Map<string, number | null>([
      ['2026-10-10', 700],
      ['2026-10-11', null],
      ['2026-10-12', 0],
      ['2026-10-15', 770],
    ]);
    const { shortCount, short } = rollingAverages(loads, '2026-10-15');
    expect(shortCount).toBe(3);
    expect(short).toBeCloseTo((700 + 0 + 770) / 3, 5);
  });

  it('returns insufficient_data below the sample floor', () => {
    const series = trainingLoad(
      [log({ date: '2026-10-15' })],
      { from: '2026-10-15', to: '2026-10-15' },
      'rolling',
    );
    const day = series.days[0];
    expect(day?.band).toBe('insufficient_data');
    expect(day?.acwr).toBeNull();
  });
});

describe('EWMA', () => {
  it('equals the value when every logged day is the same', () => {
    const loads = new Map<string, number | null>();
    for (let i = 0; i < 20; i += 1) {
      loads.set(addDays('2026-09-26', i), 200);
    }
    const { short, long } = ewmaLoad(loads, '2026-10-15');
    expect(short).toBeCloseTo(200, 6);
    expect(long).toBeCloseTo(200, 6);
  });
});

describe('charts', () => {
  it('builds exertion-volume points and a grade pyramid', () => {
    const logs = [
      log({ date: '2026-10-13', sessionExertion: 6, boulderCount: 4 }),
      log({ date: '2026-10-15', sessionExertion: 8, boulderCount: 10 }),
    ];
    expect(exertionVolume(logs, { from: '2026-10-13', to: '2026-10-15' })).toEqual([
      { date: '2026-10-13', exertion: 6, volume: 4 },
      { date: '2026-10-15', exertion: 8, volume: 10 },
    ]);
    expect(gradePyramid(logs, { from: '2026-10-13', to: '2026-10-15' }, 'boulder')).toEqual([
      { discipline: 'boulder', grade: 'V5', attempted: 6, sent: 2 },
    ]);
  });

  it('stacks focus tags per week', () => {
    const buckets = focusDistribution(
      [log({ date: '2026-10-15' })],
      { from: '2026-10-13', to: '2026-10-16' },
      'week',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.counts).toEqual({ strength: 1, technique: 1 });
  });

  it('summarises a week', () => {
    const week = isoWeek('2026-10-15');
    const summary = weeklySummary(
      [
        log({ date: '2026-10-13', rest: true, sessionExertion: 0, durationMin: 0 }),
        log({ date: '2026-10-15' }),
      ],
      week,
    );
    expect(summary.week).toBe(week);
    expect(summary.sessions).toBe(1);
    expect(summary.totalLoad).toBe(770);
    expect(summary.hardestSend).toBe('V5');
    expect(summary.daysSinceRest).toBe(2);
  });
});

function dailyLogs(start: string, days: number, load: (i: number) => number | null): DailyLog[] {
  const out: DailyLog[] = [];
  for (let i = 0; i < days; i += 1) {
    const value = load(i);
    if (value === null) continue;
    out.push(log({ date: addDays(start, i), sessionExertion: 1, durationMin: value }));
  }
  return out;
}

function naiveRolling(logs: readonly DailyLog[], date: string) {
  const window = (days: number) =>
    logs
      .filter((entry) => entry.date <= date && entry.date >= addDays(date, -(days - 1)))
      .map(sessionLoad)
      .filter((value): value is number => value !== null);
  const short = window(7);
  const long = window(28);
  const avg = (values: number[]) =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  return { short: avg(short), long: avg(long), shortCount: short.length, longCount: long.length };
}

describe('trainingLoad series', () => {
  it('matches a per-day recomputation on irregular logs', () => {
    const rng = createMulberry32(11);
    const logs = dailyLogs('2026-01-01', 200, () => (rng() < 0.4 ? null : Math.round(rng() * 600)));
    const range = { from: '2026-02-15', to: '2026-07-19' };
    const series = trainingLoad(logs, range, 'rolling');
    for (const day of series.days) {
      const naive = naiveRolling(logs, day.date);
      expect(day.short).toBe(naive.short === null ? null : Math.round(naive.short * 10) / 10);
      expect(day.long).toBe(naive.long === null ? null : Math.round(naive.long * 10) / 10);
      const enough = naive.shortCount >= 4 && naive.longCount >= 14;
      expect(day.band === 'insufficient_data').toBe(!enough || naive.long === 0);
    }
    const ewma = trainingLoad(logs, range, 'ewma');
    for (const day of ewma.days) {
      const reference = ewmaLoad(
        new Map(logs.map((entry) => [entry.date, sessionLoad(entry)])),
        day.date,
      );
      expect(day.short).toBe(
        reference.short === null ? null : Math.round(reference.short * 10) / 10,
      );
    }
  });

  it('applies the 7/28-day sample floor to EWMA, so a long break is insufficient_data', () => {
    const logs = dailyLogs('2026-01-01', 60, () => 300);
    const series = trainingLoad(logs, { from: '2026-02-20', to: '2026-06-01' }, 'ewma');
    expect(series.days[0]?.band).toBe('steady');
    // Three months after the last entry the stale EWMA must not still report a ratio.
    const last = series.days.at(-1);
    expect(last?.acwr).toBeNull();
    expect(last?.band).toBe('insufficient_data');
  });

  it('handles a ten-year range over years of logs quickly', () => {
    const logs = dailyLogs('2017-01-01', 3650, (i) => (i % 3 === 0 ? null : 200 + (i % 7) * 10));
    const started = Date.now();
    const series = trainingLoad(logs, { from: '2017-01-01', to: '2026-12-31' }, 'ewma');
    expect(series.days.length).toBeGreaterThan(3650);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('grade ordering', () => {
  it('sorts the pyramid by difficulty, not by string', () => {
    const logs = [
      log({
        date: '2026-10-15',
        grades: [
          { discipline: 'boulder', grade: 'V10', attempted: 1, sent: 0 },
          { discipline: 'boulder', grade: 'V2', attempted: 2, sent: 2 },
          { discipline: 'boulder', grade: 'VB', attempted: 1, sent: 1 },
          { discipline: 'boulder', grade: '6A+', attempted: 1, sent: 1 },
        ],
      }),
    ];
    const pyramid = gradePyramid(logs, { from: '2026-10-15', to: '2026-10-15' }, 'boulder');
    expect(pyramid.map((row) => row.grade)).toEqual(['VB', 'V2', '6A+', 'V10']);
  });

  it('finds the hardest send in another boulder system and in route grades', () => {
    const week = isoWeek('2026-10-15');
    const boulder = weeklySummary(
      [
        log({
          date: '2026-10-15',
          grades: [
            { discipline: 'boulder', grade: 'V9', attempted: 1, sent: 1 },
            { discipline: 'boulder', grade: 'V10', attempted: 1, sent: 1 },
          ],
        }),
      ],
      week,
      'font',
    );
    expect(boulder.hardestSend).toBe('V10');
    const route = weeklySummary(
      [
        log({
          date: '2026-10-15',
          grades: [
            { discipline: 'route', grade: '7a', attempted: 1, sent: 1 },
            { discipline: 'route', grade: '6c+', attempted: 1, sent: 1 },
          ],
        }),
      ],
      week,
    );
    expect(route.hardestSend).toBe('7a');
  });
});

describe('ACWR bands', () => {
  it('classifies the published thresholds', () => {
    expect(acwrBand(0.79, true)).toBe('detraining');
    expect(acwrBand(0.8, true)).toBe('steady');
    expect(acwrBand(1.29, true)).toBe('steady');
    expect(acwrBand(1.3, true)).toBe('caution');
    expect(acwrBand(1.5, true)).toBe('caution');
    expect(acwrBand(1.51, true)).toBe('ramping_fast');
  });
});
