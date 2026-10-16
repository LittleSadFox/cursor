import { describe, expect, it } from 'vitest';

import {
  buildTimeline,
  clampRate,
  durationOf,
  positionForA,
  positionForStep,
  positionsAt,
  realTimePositions,
  resumePosition,
  stepAt,
  stepForA,
  stepPositions,
  syncedPositions,
} from './timeline.js';

const S = 1_000_000;

/** A climbs 0→2 s then rests 0.5 s; B climbs 0→2 s but rests 2 s at 1 s (a collapsed rest). */
function warp(): Int32Array {
  const pairs: [number, number][] = [
    [0, 0],
    [1 * S, 1 * S],
    [1 * S, 3 * S],
    [2 * S, 4 * S],
    [2.5 * S, 4.5 * S],
  ];
  return Int32Array.from(pairs.flat());
}

describe('buildTimeline', () => {
  it('lasts as long as the side that moves more in each step', () => {
    const timeline = buildTimeline(warp());
    expect(Array.from(timeline.u)).toEqual([0, S, 3 * S, 4 * S, 4.5 * S]);
    expect(timeline.durationUs).toBe(4.5 * S);
  });

  it('is empty for an empty warp', () => {
    const timeline = buildTimeline(new Int32Array());
    expect(timeline.durationUs).toBe(0);
    expect(stepAt(timeline, 0)).toBe(-1);
    expect(syncedPositions(timeline, 0)).toEqual({ tA: 0, tB: 0, rateA: 0, rateB: 0, step: -1 });
  });
});

describe('syncedPositions', () => {
  const timeline = buildTimeline(warp());

  it('plays both sides at 1× while they move together', () => {
    expect(syncedPositions(timeline, 0.5 * S)).toEqual({
      tA: 0.5 * S,
      tB: 0.5 * S,
      rateA: 1,
      rateB: 1,
      step: 0,
    });
  });

  it('holds A while B plays through its longer rest', () => {
    const positions = syncedPositions(timeline, 2 * S);
    expect(positions.step).toBe(1);
    expect(positions.tA).toBe(1 * S);
    expect(positions.tB).toBe(2 * S);
    expect(positions.rateA).toBe(0);
    expect(positions.rateB).toBe(1);
  });

  it('holds on the last frame at the end', () => {
    const positions = syncedPositions(timeline, 10 * S);
    expect(positions).toMatchObject({ tA: 2.5 * S, tB: 4.5 * S, rateA: 0, rateB: 0, step: 4 });
  });
});

describe('clampRate', () => {
  it('holds below the minimum rate and caps fast rates', () => {
    expect(clampRate(0.1)).toBe(0);
    expect(clampRate(0.5)).toBe(0.5);
    expect(clampRate(9)).toBe(4);
    expect(clampRate(Number.NaN)).toBe(0);
  });
});

describe('real-time mode', () => {
  const climbs = { a: { startUs: 0, endUs: 2.5 * S }, b: { startUs: 0, endUs: 4.5 * S } };

  it('plays both from their starts and holds the shorter climb at its end', () => {
    expect(realTimePositions(climbs.a, climbs.b, 3 * S)).toEqual({
      tA: 2.5 * S,
      tB: 3 * S,
      rateA: 0,
      rateB: 1,
      step: -1,
    });
  });

  it('reports the warp step nearest A and the longer climb as duration', () => {
    const timeline = buildTimeline(warp());
    expect(positionsAt(timeline, 'realtime', climbs, 1.9 * S).step).toBe(3);
    expect(durationOf(timeline, 'realtime', climbs)).toBe(4.5 * S);
    expect(durationOf(timeline, 'synced', climbs)).toBe(4.5 * S);
  });
});

describe('mode switches and seeking', () => {
  const timeline = buildTimeline(warp());
  const climbA = { startUs: 0, endUs: 2.5 * S };

  it('resumes at the first step showing A at that time', () => {
    expect(stepForA(timeline, 1 * S)).toBe(1);
    expect(positionForA(timeline, 2.1 * S)).toBe(4 * S);
  });

  it('seeks to a warp step in either mode', () => {
    expect(positionForStep(timeline, 2, 'synced', climbA)).toBe(3 * S);
    expect(positionForStep(timeline, 3, 'realtime', climbA)).toBe(2 * S);
    expect(stepPositions(timeline, 'realtime', climbA)).toEqual([0, S, S, 2 * S, 2.5 * S]);
  });

  it('finds the nearest A step by binary search, preferring the first of equal steps', () => {
    expect(stepForA(timeline, -5 * S)).toBe(0);
    expect(stepForA(timeline, 1.4 * S)).toBe(1);
    expect(stepForA(timeline, 1.5 * S)).toBe(1);
    expect(stepForA(timeline, 1.6 * S)).toBe(3);
    expect(stepForA(timeline, 9 * S)).toBe(4);
    expect(stepForA(buildTimeline(new Int32Array()), 0)).toBe(-1);
    const nearestByScan = (tA: number) => {
      let best = -1;
      timeline.a.forEach((value, index) => {
        if (best < 0 || Math.abs(value - tA) < Math.abs((timeline.a[best] ?? 0) - tA)) best = index;
      });
      return best;
    };
    for (let tA = -S; tA <= 3 * S; tA += S / 8) {
      expect(stepForA(timeline, tA)).toBe(nearestByScan(tA));
    }
  });

  it('keeps A on the same frame across a mode switch at warp steps', () => {
    const climbs = { a: { startUs: 0, endUs: 2.5 * S }, b: { startUs: 0, endUs: 4.5 * S } };
    for (const position of [0, S, 2 * S, 3 * S, 4 * S, 4.5 * S]) {
      const { tA } = positionsAt(timeline, 'synced', climbs, position);
      const realtime = resumePosition(timeline, 'realtime', climbA, tA);
      expect(positionsAt(timeline, 'realtime', climbs, realtime).tA).toBe(tA);
      const back = resumePosition(timeline, 'synced', climbA, tA);
      expect(positionsAt(timeline, 'synced', climbs, back).tA).toBe(tA);
    }
  });
});
