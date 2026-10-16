export type RestCollapseParams = {
  maxSpeed: number;
  minDurationUs: number;
  keep: number;
};

/** Collapse a near-stationary run longer than `minDurationUs` to `keep` frames. */
export function collapseRests<T extends { tUs: number; speed: number }>(
  frames: readonly T[],
  params: RestCollapseParams,
): T[] {
  const kept: T[] = [];
  let index = 0;
  while (index < frames.length) {
    const frame = frames[index];
    if (!frame || frame.speed >= params.maxSpeed) {
      if (frame) kept.push(frame);
      index += 1;
      continue;
    }
    let end = index;
    while (
      end < frames.length &&
      (frames[end]?.speed ?? Number.POSITIVE_INFINITY) < params.maxSpeed
    ) {
      end += 1;
    }
    const run = frames.slice(index, end);
    const duration = (run[run.length - 1]?.tUs ?? 0) - (run[0]?.tUs ?? 0);
    if (duration > params.minDurationUs && run.length > params.keep) {
      const picks = [0, Math.floor((run.length - 1) / 2), run.length - 1];
      for (const pick of [...new Set(picks)]) {
        const chosen = run[pick];
        if (chosen) kept.push(chosen);
      }
    } else {
      kept.push(...run);
    }
    index = end;
  }
  return kept;
}
