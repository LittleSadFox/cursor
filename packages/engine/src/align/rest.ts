export type RestCollapseParams = {
  maxSpeed: number;
  minDurationUs: number;
  keep: number;
};

/** `keep` evenly spaced indices into a run of `length`, always including both ends. */
export function representativeIndices(length: number, keep: number): number[] {
  if (length <= 0) return [];
  if (keep <= 1) return [Math.floor((length - 1) / 2)];
  const picks = Array.from({ length: keep }, (_, k) => Math.round((k * (length - 1)) / (keep - 1)));
  return [...new Set(picks)];
}

/** Collapse a near-stationary run longer than `minDurationUs` to `keep` frames. */
export function collapseRests<T extends { tUs: number; speed: number }>(
  frames: readonly T[],
  params: RestCollapseParams,
): T[] {
  const kept: T[] = [];
  let index = 0;
  while (index < frames.length) {
    const frame = frames[index];
    if (!frame || !(frame.speed < params.maxSpeed)) {
      if (frame) kept.push(frame);
      index += 1;
      continue;
    }
    let end = index;
    while (end < frames.length && (frames[end]?.speed ?? Number.NaN) < params.maxSpeed) {
      end += 1;
    }
    const run = frames.slice(index, end);
    const duration = (run[run.length - 1]?.tUs ?? 0) - (run[0]?.tUs ?? 0);
    const picks =
      duration > params.minDurationUs && run.length > params.keep
        ? representativeIndices(run.length, params.keep)
        : run.map((_, offset) => offset);
    for (const pick of picks) {
      const chosen = run[pick];
      if (chosen) kept.push(chosen);
    }
    index = end;
  }
  return kept;
}
