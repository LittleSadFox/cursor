import { describe, expect, it } from 'vitest';

import { decodeSimcc, simccToInputPixels } from './simcc.js';

describe('decodeSimcc', () => {
  it('finds the argmax bins and averages axis scores', () => {
    const keypointCount = 2;
    const widthBins = 4;
    const heightBins = 3;
    const simccX = new Float32Array([
      0.1, 0.9, 0.2, 0.0, // kp0 → bin 1
      0.0, 0.0, 0.0, 1.0, // kp1 → bin 3
    ]);
    const simccY = new Float32Array([
      0.5, 0.1, 0.2, // kp0 → bin 0
      0.1, 0.8, 0.2, // kp1 → bin 1
    ]);
    const decoded = decodeSimcc(simccX, simccY, keypointCount, widthBins, heightBins);
    expect([...decoded.xs]).toEqual([1, 3]);
    expect([...decoded.ys]).toEqual([0, 1]);
    expect(decoded.scores[0]).toBeCloseTo(0.5 * (0.9 + 0.5));
    expect(decoded.scores[1]).toBeCloseTo(0.5 * (1.0 + 0.8));
  });

  it('scales bin indices by the SimCC split ratio', () => {
    const scaled = simccToInputPixels(new Float32Array([4, 10]), new Float32Array([6, 2]), 2);
    expect([...scaled.xs]).toEqual([2, 5]);
    expect([...scaled.ys]).toEqual([3, 1]);
  });
});
