import { describe, expect, it } from 'vitest';

import { FRAME_US, REACH, landmarksFor, type BodyPose } from '@climbing-coach/test-fixtures';

import { fallMoveIndex, segmentMoves, stationaryPeriods } from './segment.js';
import type { PoseSample } from '../pose/types.js';

function pose(frame: number, body: BodyPose): PoseSample {
  return {
    tUs: frame * FRAME_US,
    landmarks: landmarksFor(body).map((point) => ({
      x: point[0] ?? 0,
      y: point[1] ?? 0,
      z: 0,
      visibility: point[3] ?? 1,
    })),
  };
}

describe('moves', () => {
  it('recovers one hand move inside the climb range', () => {
    const from: BodyPose = { ...REACH, wristY: 0.02 };
    const to: BodyPose = { ...REACH, wristY: 0.02 };
    const samples: PoseSample[] = [];
    for (let frame = 0; frame < 10; frame += 1) samples.push(pose(frame, from));
    for (let frame = 10; frame < 16; frame += 1) {
      const t = (frame - 9) / 7;
      samples.push(pose(frame, { ...REACH, wristY: 0.02 + t * 0.2 }));
    }
    for (let frame = 16; frame < 28; frame += 1) samples.push(pose(frame, { ...to, wristY: 0.22 }));
    const range = { startUs: 0, endUs: 28 * FRAME_US };
    const moves = segmentMoves(samples, range);
    // Both synthetic wrists leave the hold after frame 9 and settle on frame 16.
    expect(moves.map(({ limb, startUs, endUs }) => [limb, startUs, endUs])).toEqual([
      ['leftWrist', 9 * FRAME_US, 16 * FRAME_US],
      ['rightWrist', 9 * FRAME_US, 16 * FRAME_US],
    ]);
    expect(fallMoveIndex(moves, 12 * FRAME_US)).toBe(0);
    expect(fallMoveIndex(moves, 4 * FRAME_US)).toBeNull();
    const outside = segmentMoves(samples, { startUs: 0, endUs: 5 * FRAME_US });
    expect(outside).toHaveLength(0);
  });

  it('starts a hold on the frame the limb arrives and splits it at missing positions', () => {
    const samples: PoseSample[] = [];
    for (let frame = 0; frame < 20; frame += 1) samples.push(pose(frame, REACH));
    for (const frame of [8, 9]) {
      const sample = samples[frame];
      if (!sample) continue;
      samples[frame] = {
        ...sample,
        landmarks: sample.landmarks.map((point, index) =>
          index === 15 ? { ...point, x: Number.NaN, y: Number.NaN } : point,
        ),
      };
    }
    const periods = stationaryPeriods(samples, 'leftWrist', { startUs: 0, endUs: 20 * FRAME_US });
    expect(periods.map(({ startUs, endUs }) => [startUs / FRAME_US, endUs / FRAME_US])).toEqual([
      [0, 7],
      [10, 19],
    ]);
    periods.forEach((period) => expect(Number.isFinite(period.x)).toBe(true));
  });
});
