import { describe, expect, it } from 'vitest';

import { wilsonInterval } from './wilson.js';

describe('wilsonInterval', () => {
  it('centers near the empirical rate for large n', () => {
    const ci = wilsonInterval(90, 100);
    expect(ci.estimate).toBeCloseTo(0.9, 5);
    expect(ci.low).toBeLessThan(0.9);
    expect(ci.high).toBeGreaterThan(0.9);
    expect(ci.low).toBeGreaterThan(0.8);
  });

  it('handles zero trials', () => {
    expect(wilsonInterval(0, 0)).toEqual({
      estimate: 0,
      low: 0,
      high: 0,
      n: 0,
      successes: 0,
    });
  });
});
