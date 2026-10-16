import type { XyzV } from '../pose/types.js';

/** Interior angle at `pivot`, in radians, from the 2D vectors to `a` and `c`. */
export function jointAngle(a: XyzV, pivot: XyzV, c: XyzV): number {
  const v1x = a.x - pivot.x;
  const v1y = a.y - pivot.y;
  const v2x = c.x - pivot.x;
  const v2y = c.y - pivot.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-8 || n2 < 1e-8) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return Math.acos(cos);
}

/** Angle of mid-shoulder relative to mid-hip, from upright. 0 = vertical. y grows downward. */
export function trunkInclination(hip: XyzV, shoulder: XyzV): number {
  const vx = shoulder.x - hip.x;
  const vy = shoulder.y - hip.y;
  const length = Math.hypot(vx, vy);
  if (length < 1e-8) return 0;
  const cosFromUp = Math.min(1, Math.max(-1, -vy / length));
  return Math.acos(cosFromUp);
}
