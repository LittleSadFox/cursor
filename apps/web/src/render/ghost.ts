import type { PosePoint } from '../hooks/compare/pose.js';

import { pointOf, renderPose, type DrawCommand, type PoseStyle } from './skeleton.js';

type Vec = { x: number; y: number };

/** Maps B onto A: `p' = anchorA + (p − anchorB) × scale`. */
export type GhostTransform = { anchorA: Vec; anchorB: Vec; scale: number };

function midpoint(p: Vec | null, q: Vec | null): Vec | null {
  return p && q ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : null;
}

export function midHip(points: readonly PosePoint[]): Vec | null {
  return midpoint(pointOf(points, 'leftHip'), pointOf(points, 'rightHip'));
}

/** Mid-shoulder to mid-hip distance in the points' units, or null when not measurable. */
export function torsoLength(points: readonly PosePoint[]): number | null {
  const hip = midHip(points);
  const shoulder = midpoint(pointOf(points, 'leftShoulder'), pointOf(points, 'rightShoulder'));
  if (!hip || !shoulder) return null;
  const length = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  return length > 0 ? length : null;
}

/** Body-relative alignment (PLAN 2.7 ghost): match mid-hip and torso length. Pixel inputs. */
export function ghostTransform(
  a: readonly PosePoint[],
  b: readonly PosePoint[],
): GhostTransform | null {
  const anchorA = midHip(a);
  const anchorB = midHip(b);
  const torsoA = torsoLength(a);
  const torsoB = torsoLength(b);
  if (!anchorA || !anchorB || torsoA === null || torsoB === null) return null;
  return { anchorA, anchorB, scale: torsoA / torsoB };
}

export function applyGhostTransform(
  points: readonly PosePoint[],
  transform: GhostTransform,
): PosePoint[] {
  const { anchorA, anchorB, scale } = transform;
  return points.map((point) => ({
    ...point,
    x: anchorA.x + (point.x - anchorB.x) * scale,
    y: anchorA.y + (point.y - anchorB.y) * scale,
  }));
}

/** A solid, B as a translucent ghost aligned onto A; B is omitted when it cannot be aligned. */
export function renderGhost(
  a: readonly PosePoint[],
  b: readonly PosePoint[],
  styles: { a: PoseStyle; b: PoseStyle },
): DrawCommand[] {
  const transform = ghostTransform(a, b);
  const ghost = transform ? renderPose(applyGhostTransform(b, transform), styles.b) : [];
  return [...ghost, ...renderPose(a, styles.a)];
}
