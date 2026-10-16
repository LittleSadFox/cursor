import { describe, expect, it } from 'vitest';

import { readComparisonBin, writeComparisonBin } from './comparison-bin.js';

describe('comparison bin', () => {
  it('round-trips warp times and divergence rows, including NaN', () => {
    const bin = {
      warpUs: Int32Array.from([0, 0, 66_667, 0, 133_333, 66_667]),
      divergence: Float32Array.from([0, 1.5, Number.NaN, -2, 0.25, 3]),
      channels: 2,
    };
    const decoded = readComparisonBin(writeComparisonBin(bin));
    expect(decoded.channels).toBe(2);
    expect(Array.from(decoded.warpUs)).toEqual(Array.from(bin.warpUs));
    expect(Array.from(decoded.divergence)).toEqual(Array.from(bin.divergence));
  });

  it('decodes from an offset view and an empty result', () => {
    const bytes = writeComparisonBin({
      warpUs: new Int32Array(0),
      divergence: new Float32Array(0),
      channels: 11,
    });
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    const decoded = readComparisonBin(padded.subarray(3));
    expect(decoded.warpUs).toHaveLength(0);
    expect(decoded.channels).toBe(11);
  });

  it('rejects mismatched shapes, bad magic, and truncation', () => {
    expect(() =>
      writeComparisonBin({
        warpUs: Int32Array.from([0, 0]),
        divergence: new Float32Array(3),
        channels: 2,
      }),
    ).toThrow(/divergence length/);
    expect(() =>
      writeComparisonBin({
        warpUs: Int32Array.from([0]),
        divergence: new Float32Array(0),
        channels: 1,
      }),
    ).toThrow(/even/);
    const bytes = writeComparisonBin({
      warpUs: Int32Array.from([1, 2]),
      divergence: Float32Array.from([1]),
      channels: 1,
    });
    expect(() => readComparisonBin(bytes.subarray(0, bytes.length - 1))).toThrow(/expected/);
    const bad = bytes.slice();
    bad[0] = 0;
    expect(() => readComparisonBin(bad)).toThrow(/not a comparison bin/);
  });
});
