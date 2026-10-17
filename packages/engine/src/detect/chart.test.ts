import { describe, expect, it } from 'vitest';

import { activityChart } from './chart.js';
import type { FrameSignal } from './types.js';

function frame(tUs: number, extra: Partial<FrameSignal> = {}): FrameSignal {
  return {
    tUs,
    inFrame: true,
    bothAnklesUp: false,
    hipVy: 0,
    hipStill: true,
    wristsAboveShoulders: false,
    crouched: false,
    wristsStationary: true,
    wristY: 0.4,
    lowerWristY: 0.5,
    hipX: 0.5,
    hipY: 0.5,
    exitEdge: 'none',
    ...extra,
  };
}

describe('activityChart', () => {
  it('keeps on-wall and hip speed, and rounds the timestamp', () => {
    const [point] = activityChart([frame(1_000.4, { bothAnklesUp: true, hipVy: 1.5 })]);
    expect(point).toEqual({ tUs: 1000, hipVy: 1.5, onWall: true });
  });

  it('strides a long series down to the point budget', () => {
    const frames = Array.from({ length: 20 }, (_, index) => frame(index * 1_000, { hipVy: index }));
    const chart = activityChart(frames, 4);
    expect(chart.map((point) => point.hipVy)).toEqual([0, 5, 10, 15]);
  });

  it('treats a non-finite hip speed as still', () => {
    expect(activityChart([frame(0, { hipVy: Number.POSITIVE_INFINITY })])[0]?.hipVy).toBe(0);
  });
});
