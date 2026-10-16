import { describe, expect, it } from 'vitest';

import { applyGhostTransform, ghostTransform, midHip, renderGhost, torsoLength } from './ghost.js';
import { pointsOf, STYLE } from './test-points.js';

const A = pointsOf({
  leftShoulder: [90, 50],
  rightShoulder: [110, 50],
  leftHip: [90, 100],
  rightHip: [110, 100],
  rightKnee: [110, 150],
});

/** Same posture as A, half the size and shifted. */
const B = pointsOf({
  leftShoulder: [15, 25],
  rightShoulder: [25, 25],
  leftHip: [15, 50],
  rightHip: [25, 50],
  rightKnee: [25, 75],
});

describe('ghostTransform', () => {
  it('matches mid-hip and torso length', () => {
    expect(midHip(A)).toEqual({ x: 100, y: 100 });
    expect(torsoLength(A)).toBe(50);
    const transform = ghostTransform(A, B);
    expect(transform).toEqual({ anchorA: { x: 100, y: 100 }, anchorB: { x: 20, y: 50 }, scale: 2 });
    if (!transform) return;
    const aligned = applyGhostTransform(B, transform);
    A.forEach((point, index) => {
      if (point.visibility === 0) return;
      expect(aligned[index]?.x).toBeCloseTo(point.x);
      expect(aligned[index]?.y).toBeCloseTo(point.y);
    });
  });

  it('cannot align a side without hips or shoulders', () => {
    expect(ghostTransform(A, pointsOf({ leftHip: [0, 0], rightHip: [1, 0] }))).toBeNull();
  });
});

describe('renderGhost', () => {
  const ghostStyle = { ...STYLE, color: '#0ff', alpha: 0.4 };

  it('draws the ghost under A', () => {
    const commands = renderGhost(A, B, { a: STYLE, b: ghostStyle });
    const first = commands[0];
    expect(first).toMatchObject({ color: '#0ff', alpha: 0.4 });
    expect(commands.at(-1)).toMatchObject({ color: '#fff', alpha: 1 });
    expect(commands.filter((c) => c.color === '#0ff')).toHaveLength(
      commands.filter((c) => c.color === '#fff').length,
    );
  });

  it('draws only A when B cannot be aligned', () => {
    const commands = renderGhost(A, pointsOf({}), { a: STYLE, b: ghostStyle });
    expect(commands.every((c) => c.color === '#fff')).toBe(true);
  });
});
