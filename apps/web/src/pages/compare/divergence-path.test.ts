import { describe, expect, it } from 'vitest';

import {
  MIN_SCORE_CEILING,
  chartCeiling,
  divergencePath,
  positionAtX,
  xOfPosition,
} from './divergence-path.js';

const BOX = { width: 100, height: 30 };

describe('divergencePath', () => {
  it('plots scores against timeline position, clipped at the ceiling', () => {
    expect(divergencePath(Float32Array.from([0, 0.75, 3]), [0, 50, 100], 100, BOX, 1.5)).toBe(
      'M0 30 L50 15 L100 0',
    );
  });

  it('scales to the largest score so small differences stay visible', () => {
    const scores = Float32Array.from([0, 0.05, 0.1]);
    expect(chartCeiling(scores)).toBeCloseTo(0.25);
    expect(chartCeiling(Float32Array.from([0.5, Number.NaN, 2]))).toBeCloseTo(2.2);
    expect(chartCeiling(new Float32Array(3))).toBe(MIN_SCORE_CEILING);
    expect(divergencePath(scores, [0, 50, 100], 100, BOX)).toBe('M0 30 L50 24 L100 18');
  });

  it('keeps the line inside the padding', () => {
    const path = divergencePath(Float32Array.from([0, 1]), [0, 100], 100, { ...BOX, pad: 3 }, 1);
    expect(path).toBe('M0 27 L100 3');
  });

  it('breaks the line over steps without a score', () => {
    expect(divergencePath(Float32Array.from([0, Number.NaN, 0]), [0, 50, 100], 100, BOX)).toBe(
      'M0 30 M100 30',
    );
  });

  it('is empty for an empty timeline', () => {
    expect(divergencePath(Float32Array.from([1]), [0], 0, BOX)).toBe('');
  });
});

describe('chart positions', () => {
  it('maps clicks to positions and back, clamped to the chart', () => {
    expect(positionAtX(25, 100, 2_000_000)).toBe(500_000);
    expect(positionAtX(-5, 100, 2_000_000)).toBe(0);
    expect(positionAtX(150, 100, 2_000_000)).toBe(2_000_000);
    expect(xOfPosition(500_000, 2_000_000, 100)).toBe(25);
  });
});
