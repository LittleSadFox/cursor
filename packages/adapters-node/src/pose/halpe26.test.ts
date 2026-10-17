import { describe, expect, it } from 'vitest';

import { BLAZEPOSE_LANDMARKS, LANDMARK_STRIDE } from '@climbing-coach/schema';

import { HALPE26_COUNT, mapHalpe26ToBlaze } from './halpe26.js';

describe('mapHalpe26ToBlaze', () => {
  it('maps feet and heels into the BlazePose layout and leaves hands NaN', () => {
    const xs = new Float32Array(HALPE26_COUNT);
    const ys = new Float32Array(HALPE26_COUNT);
    const scores = new Float32Array(HALPE26_COUNT);
    xs[0] = 10;
    ys[0] = 20;
    scores[0] = 0.9; // nose
    xs[20] = 30;
    ys[20] = 40;
    scores[20] = 0.8; // left big toe → leftFootIndex
    xs[24] = 31;
    ys[24] = 45;
    scores[24] = 0.7; // left heel

    const blaze = mapHalpe26ToBlaze(xs, ys, scores);
    const nose = BLAZEPOSE_LANDMARKS.indexOf('nose') * LANDMARK_STRIDE;
    const toe = BLAZEPOSE_LANDMARKS.indexOf('leftFootIndex') * LANDMARK_STRIDE;
    const heel = BLAZEPOSE_LANDMARKS.indexOf('leftHeel') * LANDMARK_STRIDE;
    const pinky = BLAZEPOSE_LANDMARKS.indexOf('leftPinky') * LANDMARK_STRIDE;

    expect(blaze[nose]).toBe(10);
    expect(blaze[nose + 1]).toBe(20);
    expect(blaze[nose + 3]).toBeCloseTo(0.9);
    expect(blaze[toe]).toBe(30);
    expect(blaze[heel + 1]).toBe(45);
    expect(Number.isNaN(blaze[pinky]!)).toBe(true);
  });
});
