import { describe, expect, it } from 'vitest';

import {
  ENERGY_BAND,
  chartPoints,
  energyScale,
  flagSpans,
  thresholdY,
} from './activity-geometry.js';

describe('activity geometry', () => {
  it('scales energy so the threshold sits at mid-band when nothing is louder', () => {
    expect(energyScale([0.004], 0.01)).toBe(0.02);
    expect(thresholdY(0.01, 0.02, ENERGY_BAND)).toBeCloseTo(
      ENERGY_BAND.top + ENERGY_BAND.height / 2,
    );
  });

  it('draws a signed series through the middle of its band at zero', () => {
    const points = chartPoints([{ tUs: 0, value: 0 }], 1_000, 1, { top: 0, height: 100 }, true);
    expect(points).toBe('0.00,50.00');
  });

  it('joins on-wall samples into spans', () => {
    expect(
      flagSpans(
        [
          { tUs: 0, on: false },
          { tUs: 10, on: true },
          { tUs: 20, on: true },
          { tUs: 30, on: false },
        ],
        40,
      ),
    ).toEqual([{ startUs: 10, endUs: 30 }]);
  });
});
