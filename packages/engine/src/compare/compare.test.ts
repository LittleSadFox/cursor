import { describe, expect, it } from 'vitest';

import { PoseBuilder, REACH, STAND, type RawSample } from '@climbing-coach/test-fixtures';

import { align } from '../align/align.js';
import { alignFrames } from '../align/frames.js';
import { LANDMARK_INDEX } from '../pose/access.js';
import type { PoseSample, XyzV } from '../pose/types.js';
import { segmentMoves } from '../moves/segment.js';
import { CHANNEL_COUNT, COMPARE_JOINTS, DIVERGENCE_CHANNELS } from './channels.js';
import { comparePostures } from './compare.js';
import { describeDifference } from './describe.js';
import {
  divergenceScore,
  highlightedJoints,
  jointAngleDeltas,
  nearestIndex,
  postureRow,
  warpIndices,
} from './divergence.js';
import { centerOfMass, hipToHands, jointAnglesDeg } from './posture.js';
import { comSupportOffset, contactsAt, convexHull, polygonDistance } from './support.js';
import { topDifferences, type MoveSummary } from './summary.js';

const RIGHT_KNEE = COMPARE_JOINTS.indexOf('rightKnee');

function toSample(raw: RawSample): PoseSample {
  const landmarks = raw.landmarks.map((point) => ({
    x: point[0] ?? 0,
    y: point[1] ?? 0,
    z: 0,
    visibility: point[3] ?? 1,
  }));
  // Bend both knees outward so their angles sit well away from 180°.
  for (const name of ['leftKnee', 'rightKnee'] as const) {
    const index = LANDMARK_INDEX[name];
    const knee = landmarks[index] as XyzV;
    landmarks[index] = { ...knee, x: knee.x + (name === 'rightKnee' ? 0.07 : -0.07) };
  }
  return { tUs: raw.tUs, landmarks };
}

/** Stand, step onto the wall, rest `restSeconds`, then reach higher and hold. */
function climb(restSeconds: number): PoseSample[] {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 1);
  builder.hold(REACH, restSeconds);
  builder.ramp(REACH, { ...REACH, wristY: -0.15, leftWristY: 0.02 }, 0.6);
  builder.hold({ ...REACH, wristY: -0.15, leftWristY: 0.02 }, 1);
  return builder.samples.map(toSample);
}

function rotateAbout(point: XyzV, pivot: XyzV, radians: number): XyzV {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { ...point, x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** Close the right knee by `degrees`: rotate the shank toward the thigh. */
function closeRightKnee(sample: PoseSample, degrees: number): PoseSample {
  const landmarks = [...sample.landmarks];
  const hip = landmarks[LANDMARK_INDEX.rightHip] as XyzV;
  const knee = landmarks[LANDMARK_INDEX.rightKnee] as XyzV;
  const ankle = landmarks[LANDMARK_INDEX.rightAnkle] as XyzV;
  const thigh = { x: hip.x - knee.x, y: hip.y - knee.y };
  const shank = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const towardThigh = Math.sign(shank.x * thigh.y - shank.y * thigh.x);
  landmarks[LANDMARK_INDEX.rightAnkle] = rotateAbout(
    ankle,
    knee,
    towardThigh * ((degrees * Math.PI) / 180),
  );
  return { ...sample, landmarks };
}

function compareTracks(a: PoseSample[], b: PoseSample[]) {
  const range = (samples: PoseSample[]) => ({
    startUs: samples[0]?.tUs ?? 0,
    endUs: (samples[samples.length - 1]?.tUs ?? 0) + 1,
  });
  const alignment = align(alignFrames(a), alignFrames(b));
  return comparePostures(
    { samples: a, moves: segmentMoves(a, range(a)) },
    { samples: b, moves: segmentMoves(b, range(b)) },
    alignment,
  );
}

describe('posture metrics', () => {
  it('measures a right-angle elbow as 90°', () => {
    const builder = new PoseBuilder();
    builder.hold(STAND, 0);
    const base = toSample(builder.samples[0] as RawSample);
    const landmarks = [...base.landmarks];
    landmarks[LANDMARK_INDEX.leftShoulder] = { x: 0, y: 0, z: 0, visibility: 1 };
    landmarks[LANDMARK_INDEX.leftElbow] = { x: 0, y: 1, z: 0, visibility: 1 };
    landmarks[LANDMARK_INDEX.leftWrist] = { x: 1, y: 1, z: 0, visibility: 1 };
    const angles = jointAnglesDeg({ tUs: 0, landmarks });
    expect(angles[COMPARE_JOINTS.indexOf('leftElbow')]).toBeCloseTo(90, 9);
  });

  it('propagates a missing landmark as NaN instead of a fake angle', () => {
    const [sample] = climb(1);
    const landmarks = [...(sample as PoseSample).landmarks];
    landmarks[LANDMARK_INDEX.rightAnkle] = { x: Number.NaN, y: Number.NaN, z: 0, visibility: 0 };
    const angles = jointAnglesDeg({ tUs: 0, landmarks });
    expect(Number.isNaN(angles[RIGHT_KNEE])).toBe(true);
    expect(Number.isFinite(angles[COMPARE_JOINTS.indexOf('leftKnee')])).toBe(true);
  });

  it('puts the center of mass on the axis of a left-right symmetric pose', () => {
    const builder = new PoseBuilder();
    builder.hold(REACH, 0);
    const raw = builder.samples[0] as RawSample;
    const symmetric: PoseSample = {
      tUs: 0,
      landmarks: raw.landmarks.map((p) => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: 0, visibility: 1 })),
    };
    expect(centerOfMass(symmetric).x).toBeCloseTo(REACH.x, 9);
    expect(hipToHands(symmetric)).toBeGreaterThan(0);
  });
});

describe('support polygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0.5, y: 0.5 },
  ];

  it('drops interior points from the hull', () => {
    expect(convexHull(square)).toHaveLength(4);
    expect(
      convexHull([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
      ]),
    ).toHaveLength(1);
  });

  it('is zero inside and the edge distance outside', () => {
    const hull = convexHull(square);
    expect(polygonDistance({ x: 0.5, y: 0.5 }, hull)).toBe(0);
    expect(polygonDistance({ x: 2, y: 0.5 }, hull)).toBeCloseTo(1, 12);
    expect(polygonDistance({ x: 2, y: 2 }, hull)).toBeCloseTo(Math.SQRT2, 12);
    expect(
      polygonDistance(
        { x: 0.5, y: 1 },
        convexHull([
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]),
      ),
    ).toBe(1);
    expect(Number.isNaN(polygonDistance({ x: 0, y: 0 }, []))).toBe(true);
  });

  it('places the center of mass inside the four-limb polygon on the wall', () => {
    const [sample] = climb(1).slice(-1);
    const offset = comSupportOffset(sample as PoseSample);
    expect(offset.outside).toBe(0);
    expect(Number.isFinite(offset.dx)).toBe(true);
    expect(Number.isNaN(comSupportOffset(sample as PoseSample, []).dx)).toBe(true);
  });

  it('reads contacts from stationary periods', () => {
    const periods = [
      { limb: 'leftWrist' as const, startUs: 0, endUs: 100, x: 0, y: 0 },
      { limb: 'rightAnkle' as const, startUs: 50, endUs: 200, x: 0, y: 0 },
    ];
    expect(contactsAt(75, periods)).toEqual(['leftWrist', 'rightAnkle']);
    expect(contactsAt(150, periods)).toEqual(['rightAnkle']);
  });
});

describe('divergence', () => {
  it('finds the nearest timestamp and maps a warp path to frame indices', () => {
    const tUs = Float64Array.from([0, 100, 200, 300]);
    expect(nearestIndex(tUs, -5)).toBe(0);
    expect(nearestIndex(tUs, 149)).toBe(1);
    expect(nearestIndex(tUs, 151)).toBe(2);
    expect(nearestIndex(tUs, 999)).toBe(3);
    expect(nearestIndex(new Float64Array(0), 1)).toBe(-1);
    const warp = warpIndices(
      [
        { tUsA: 0, tUsB: 0 },
        { tUsA: 200, tUsB: 100 },
      ],
      tUs,
      tUs,
    );
    expect(Array.from(warp)).toEqual([0, 0, 2, 1]);
  });

  it('recovers an injected knee angle on a single frame', () => {
    const sample = climb(1)[20] as PoseSample;
    const deltas = jointAngleDeltas(sample, closeRightKnee(sample, 12));
    expect(deltas[RIGHT_KNEE]).toBeCloseTo(12, 6);
    deltas.forEach((delta, index) => {
      if (index !== RIGHT_KNEE) expect(delta).toBeCloseTo(0, 9);
    });
  });

  it('scores finite channels only and highlights large joint deltas', () => {
    const row = new Float32Array(CHANNEL_COUNT);
    row[RIGHT_KNEE] = 30;
    row[CHANNEL_COUNT - 1] = Number.NaN;
    expect(divergenceScore(row)).toBeCloseTo(1 / (CHANNEL_COUNT - 1), 6);
    expect(highlightedJoints(row, 0)).toEqual(['rightKnee']);
    expect(Number.isNaN(divergenceScore(new Float32Array(CHANNEL_COUNT).fill(Number.NaN)))).toBe(
      true,
    );
    expect(postureRow(climb(1)[0] as PoseSample)).toHaveLength(CHANNEL_COUNT);
  });
});

describe('comparePostures', () => {
  it('gives zero divergence for identical attempts', () => {
    const a = climb(1);
    const result = compareTracks(a, a);
    expect(result.warp.length / 2).toBeGreaterThan(0);
    expect(Array.from(result.deltas).every((value) => value === 0)).toBe(true);
    expect(Array.from(result.score).every((value) => value === 0)).toBe(true);
    expect(result.summary.meanDivergence).toBe(0);
    expect(result.summary.topDifferences).toEqual([]);
    expect(result.moveMatches.every((match) => match.b === match.a)).toBe(true);
  });

  it('recovers an injected knee offset within 1° across a longer rest', () => {
    const a = climb(1);
    const b = climb(3).map((sample) => closeRightKnee(sample, 15));
    const result = compareTracks(a, b);
    const steps = result.score.length;
    let kneeSum = 0;
    let otherMax = 0;
    for (let step = 0; step < steps; step += 1) {
      kneeSum += result.deltas[step * CHANNEL_COUNT + RIGHT_KNEE] ?? 0;
      for (let joint = 0; joint < COMPARE_JOINTS.length; joint += 1) {
        if (joint === RIGHT_KNEE) continue;
        otherMax = Math.max(otherMax, Math.abs(result.deltas[step * CHANNEL_COUNT + joint] ?? 0));
      }
    }
    expect(Math.abs(kneeSum / steps - 15)).toBeLessThan(1);
    expect(otherMax).toBeLessThan(1);
    const top = result.summary.topDifferences[0];
    expect(top?.joint).toBe('rightKnee');
    expect(top?.text).toMatch(/^Right knee 15° straighter through move \d+$/);
  });
});

describe('summaries and text', () => {
  const move = (moveIndexA: number, deltas: Partial<Record<string, number>>): MoveSummary => ({
    moveIndexA,
    steps: 10,
    meanScore: 0.3,
    meanDeltas: DIVERGENCE_CHANNELS.map((channel) => deltas[channel] ?? 0),
  });

  it('ranks differences by scaled size and drops small ones', () => {
    const top = topDifferences([
      move(0, { rightHip: 15, leftElbow: 5 }),
      move(2, { hipToHands: 0.4 }),
      move(3, { comSupport: -0.1 }),
    ]);
    expect(top.map((d) => [d.moveIndexA, d.joint])).toEqual([
      [2, 'hipToHands'],
      [0, 'rightHip'],
    ]);
    expect(top[1]?.text).toBe('Right hip 15° more open through move 1');
  });

  it('phrases each metric as an observation', () => {
    expect(
      describeDifference({
        moveIndexA: 4,
        joint: 'hipToHands',
        metric: 'torsoLengths',
        meanDelta: 0.2,
      }),
    ).toBe('Hips 0.2 torso lengths further from the hands through move 5');
    expect(
      describeDifference({
        moveIndexA: 0,
        joint: 'comSupport',
        metric: 'torsoLengths',
        meanDelta: -0.35,
      }),
    ).toBe('Center of mass 0.35 torso lengths further left over the support through move 1');
    expect(
      describeDifference({
        moveIndexA: 1,
        joint: 'leftElbow',
        metric: 'angleDeg',
        meanDelta: -22.4,
      }),
    ).toBe('Left elbow 22° more bent through move 2');
    expect(
      describeDifference({
        moveIndexA: 1,
        joint: 'leftShoulder',
        metric: 'angleDeg',
        meanDelta: -11,
      }),
    ).toBe('Left shoulder 11° more closed through move 2');
  });
});
