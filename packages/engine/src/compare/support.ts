import { at } from '../math.js';
import { landmark, torsoLength } from '../pose/access.js';
import type { PoseSample } from '../pose/types.js';
import { MOVE_LIMBS, type MoveLimb, type StationaryPeriod } from '../moves/segment.js';
import { centerOfMass } from './posture.js';

export type Point2 = { x: number; y: number };

export type SupportOffset = {
  /** Signed horizontal offset of the center of mass from the support centroid, torso lengths. */
  dx: number;
  /** Distance from the center of mass to the support polygon; 0 inside. Torso lengths. */
  outside: number;
};

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, without repeated end point. */
export function convexHull(points: readonly Point2[]): Point2[] {
  const sorted = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const lower: Point2[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(at(lower, lower.length - 2), at(lower, lower.length - 1), p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = at(sorted, i);
    while (
      upper.length >= 2 &&
      cross(at(upper, upper.length - 2), at(upper, upper.length - 1), p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length2 = vx * vx + vy * vy;
  const t =
    length2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function insideConvex(p: Point2, hull: readonly Point2[]): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i += 1) {
    if (cross(at(hull, i), at(hull, (i + 1) % hull.length), p) < 0) return false;
  }
  return true;
}

/** Distance from `p` to a convex polygon (0 inside). Degenerate hulls use points or segments. */
export function polygonDistance(p: Point2, hull: readonly Point2[]): number {
  if (hull.length === 0) return Number.NaN;
  if (hull.length === 1) return Math.hypot(p.x - at(hull, 0).x, p.y - at(hull, 0).y);
  if (insideConvex(p, hull)) return 0;
  let best = Number.POSITIVE_INFINITY;
  const edges = hull.length === 2 ? 1 : hull.length;
  for (let i = 0; i < edges; i += 1) {
    best = Math.min(best, segmentDistance(p, at(hull, i), at(hull, (i + 1) % hull.length)));
  }
  return best;
}

function centroid(points: readonly Point2[]): Point2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, points.length), y: y / Math.max(1, points.length) };
}

/** Limbs in contact at `tUs`: the ones inside one of their stationary periods. */
export function contactsAt(tUs: number, periods: readonly StationaryPeriod[]): MoveLimb[] {
  return MOVE_LIMBS.filter((limb) =>
    periods.some((period) => period.limb === limb && tUs >= period.startUs && tUs <= period.endUs),
  );
}

/**
 * Center of mass vs. the support polygon spanned by the contact limbs (PLAN 2.8).
 * Without contact data all four limbs count as contacts. No contacts → NaN.
 */
export function comSupportOffset(
  sample: PoseSample,
  contacts: readonly MoveLimb[] = MOVE_LIMBS,
): SupportOffset {
  const points = contacts.map((limb) => landmark(sample, limb));
  if (points.length === 0) return { dx: Number.NaN, outside: Number.NaN };
  const torso = Math.max(torsoLength(sample), 1e-6);
  const com = centerOfMass(sample);
  const hull = convexHull(points);
  return {
    dx: (com.x - centroid(points).x) / torso,
    outside: polygonDistance(com, hull) / torso,
  };
}
