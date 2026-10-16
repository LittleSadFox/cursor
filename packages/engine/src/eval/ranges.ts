export type ClimbRange = {
  startUs: number;
  endUs: number;
};

/** Overlap length of two half-open ranges `[startUs, endUs)`. Touching endpoints do not overlap. */
export function overlapUs(a: ClimbRange, b: ClimbRange): number {
  const start = Math.max(a.startUs, b.startUs);
  const end = Math.min(a.endUs, b.endUs);
  return Math.max(0, end - start);
}

export function rangesOverlap(a: ClimbRange, b: ClimbRange): boolean {
  return overlapUs(a, b) > 0;
}
