import { CHANNEL_COUNT } from '@climbing-coach/engine';
import { MAX_WARP_US } from '@climbing-coach/schema';
import { describe, expect, it } from 'vitest';

import { resultBin } from './compute.js';

function side(...times: number[]) {
  return { samples: times.map((tUs) => ({ tUs, landmarks: [] })) };
}

function oneStep(indexA: number, indexB: number) {
  return {
    warp: Int32Array.of(indexA, indexB),
    deltas: new Float32Array(CHANNEL_COUNT),
    score: Float32Array.of(0.5),
  };
}

describe('resultBin', () => {
  it('maps warp indices to clip times and appends the score column', () => {
    const bin = resultBin(side(0, 66_667), side(10, 20), oneStep(1, 0));
    expect(Array.from(bin.warpUs)).toEqual([66_667, 10]);
    expect(bin.channels).toBe(CHANNEL_COUNT + 1);
    expect(bin.divergence[CHANNEL_COUNT]).toBe(0.5);
  });

  it('refuses clip times the Int32 warp column cannot hold', () => {
    expect(() => resultBin(side(MAX_WARP_US + 1), side(0), oneStep(0, 0))).toThrow(/warp time/);
    expect(() => resultBin(side(0), side(0), oneStep(0, 3))).toThrow(/warp time NaN/);
  });
});
