import { describe, expect, it } from 'vitest';

import { FRAME_US, REACH, landmarksFor, type BodyPose } from '@climbing-coach/test-fixtures';

import { fallMoveIndex, segmentMoves } from './segment.js';
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
    const hands = moves.filter((move) => move.limb === 'leftWrist' || move.limb === 'rightWrist');
    expect(hands.length).toBeGreaterThanOrEqual(2);
    expect(fallMoveIndex(moves, 12 * FRAME_US)).not.toBeNull();
    const outside = segmentMoves(samples, { startUs: 0, endUs: 5 * FRAME_US });
    expect(outside).toHaveLength(0);
  });
});
