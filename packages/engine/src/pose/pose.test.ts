import { describe, expect, it } from 'vitest';

import { LANDMARK_COUNT } from '@climbing-coach/schema';
import { REACH, STAND, landmarksFor, stillBystander } from '@climbing-coach/test-fixtures';

import { createMulberry32 } from '../eval/rng.js';
import { STARTING_PARAMS } from '../params.js';
import { fillGaps } from './gaps.js';
import { lowPassAlpha, oneEuroFilter, smoothStep } from './one-euro.js';
import { normalize } from './normalize.js';
import { preprocess } from './preprocess.js';
import { selectClimberTrack } from './select-track.js';
import type { PoseSample, XyzV } from './types.js';

function sample(tUs: number, landmarks: number[][], visibility?: number): PoseSample {
  return {
    tUs,
    landmarks: landmarks.map((point) => ({
      x: point[0] ?? 0,
      y: point[1] ?? 0,
      z: point[2] ?? 0,
      visibility: visibility ?? point[3] ?? 0,
    })),
  };
}

/** Independent 1€ reference (Casiez CHI 2012), written out from the paper rather than the module. */
function referenceOneEuro(times: readonly number[], values: readonly number[]): number[] {
  const minCutoff = 1;
  const beta = 0;
  const dCutoff = 1;
  const out: number[] = [];
  let xHat = values[0] ?? 0;
  let dxHat = 0;
  let prevX = xHat;
  let prevT = times[0] ?? 0;
  out.push(xHat);
  for (let i = 1; i < values.length; i += 1) {
    const x = values[i] ?? 0;
    const t = times[i] ?? prevT;
    const dt = (t - prevT) / 1_000_000;
    const alpha = (cutoff: number): number => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    };
    const dx = dt > 0 ? (x - prevX) / dt : 0;
    dxHat = smoothStep(alpha(dCutoff), dx, dxHat);
    xHat = smoothStep(alpha(minCutoff + beta * Math.abs(dxHat)), x, xHat);
    out.push(xHat);
    prevX = x;
    prevT = t;
  }
  return out;
}

describe('pose preprocess', () => {
  it('matches the 1€ reference and leaves a constant signal unchanged', () => {
    const times = [0, 66_667, 133_334, 200_000, 266_667];
    const values = [0, 1, 0, 1, 0];
    const filtered = oneEuroFilter(times, values, { minCutoffHz: 1, beta: 0, dCutoffHz: 1 });
    const reference = referenceOneEuro(times, values);
    filtered.forEach((value, index) => {
      expect(value).toBeCloseTo(reference[index] ?? 0, 9);
    });
    expect(oneEuroFilter(times, [2, 2, 2, 2, 2], STARTING_PARAMS.pose.oneEuro)).toEqual([
      2, 2, 2, 2, 2,
    ]);
    expect(lowPassAlpha(1, 1 / 15)).toBeGreaterThan(0);
    expect(lowPassAlpha(1, 1 / 15)).toBeLessThan(1);
  });

  it('fills a short visibility gap and leaves a long one', () => {
    const base = landmarksFor(STAND);
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => sample(index * 66_667, base));
    const hide = (index: number): void => {
      const frame = frames[index];
      if (!frame) return;
      frame.landmarks = frame.landmarks.map((point) => ({ ...point, visibility: 0 }));
    };
    hide(2);
    hide(3);
    for (let index = 5; index <= 9; index += 1) hide(index);
    const filled = fillGaps(frames, { minVisibility: 0.5, maxGapFrames: 3 });
    expect(filled[2]?.landmarks[0]?.visibility).toBeGreaterThan(0.5);
    expect(filled[7]?.landmarks[0]?.visibility).toBe(0);
  });

  it('is invariant to translation and scale', () => {
    const rng = createMulberry32(7);
    const base = landmarksFor(REACH);
    for (let trial = 0; trial < 20; trial += 1) {
      const tx = rng() * 2 - 0.5;
      const ty = rng() * 2 - 0.5;
      const scale = 0.4 + rng();
      const transformed = base.map((point) => [
        (point[0] ?? 0) * scale + tx,
        (point[1] ?? 0) * scale + ty,
        (point[2] ?? 0) * scale,
        point[3] ?? 1,
      ]);
      const a = normalize(sample(0, base));
      const b = normalize(sample(0, transformed));
      for (let i = 0; i < LANDMARK_COUNT; i += 1) {
        const left: XyzV | undefined = a.landmarks[i];
        const right: XyzV | undefined = b.landmarks[i];
        expect(left?.x).toBeCloseTo(right?.x ?? 0, 6);
        expect(left?.y).toBeCloseTo(right?.y ?? 0, 6);
      }
    }
  });

  it('picks the track moving on the wall', () => {
    const climber = [0, 1, 2, 3].map((index) => {
      const pose = {
        ...REACH,
        hipY: REACH.hipY - index * 0.02,
        ankleY: REACH.ankleY - index * 0.02,
      };
      return sample(index * 66_667, landmarksFor(pose));
    });
    const bystander = stillBystander(
      climber.map((frame) => ({
        tUs: frame.tUs,
        landmarks: frame.landmarks.map((point) => [point.x, point.y, point.z, point.visibility]),
      })),
      0.4,
    ).map((frame) => sample(frame.tUs, frame.landmarks));
    expect(
      selectClimberTrack([
        { trackId: 'bystander', samples: bystander },
        { trackId: 'climber', samples: climber },
      ]),
    ).toBe('climber');
  });

  it('preprocess returns a display-space track and a hip-centered track', () => {
    const frames = [0, 1, 2].map((index) => sample(index * 66_667, landmarksFor(STAND)));
    const result = preprocess(frames, {
      ...STARTING_PARAMS.pose,
      oneEuro: { minCutoffHz: 10, beta: 0, dCutoffHz: 1 },
    });
    expect(result.image).toHaveLength(3);
    const leftHip = result.normalized[0]?.landmarks[23];
    const rightHip = result.normalized[0]?.landmarks[24];
    expect(((leftHip?.x ?? 0) + (rightHip?.x ?? 0)) / 2).toBeCloseTo(0, 4);
    expect(((leftHip?.y ?? 0) + (rightHip?.y ?? 0)) / 2).toBeCloseTo(0, 4);
  });
});
