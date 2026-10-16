/** Mean absolute pixel difference. Both buffers are the same length, typically 0..1. */
export function activityEnergy(previous: ArrayLike<number>, next: ArrayLike<number>): number {
  if (previous.length !== next.length || previous.length === 0) {
    throw new Error('activityEnergy: frames must be non-empty and the same length');
  }
  let sum = 0;
  for (let i = 0; i < previous.length; i += 1) {
    sum += Math.abs((previous[i] ?? 0) - (next[i] ?? 0));
  }
  return sum / previous.length;
}

export type GrayFrame = {
  tUs: number;
  width: number;
  height: number;
  pixels: ArrayLike<number>;
};

/** Energy of each frame after the first, timestamped on the later frame. */
export function activitySeries(frames: readonly GrayFrame[]): { tUs: number; energy: number }[] {
  const out: { tUs: number; energy: number }[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (!prev || !next) continue;
    out.push({ tUs: next.tUs, energy: activityEnergy(prev.pixels, next.pixels) });
  }
  return out;
}
