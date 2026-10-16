import { describe, expect, it } from 'vitest';

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
    expect(eachDay('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
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
