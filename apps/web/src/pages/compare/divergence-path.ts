/** Scores at or above this fill the chart; the engine highlights at 0.5. */
export const SCORE_CEILING = 1.5;

export type ChartBox = { width: number; height: number };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * SVG path of `scores` at timeline `positions`. Non-finite scores break the line rather than
 * dropping to zero, so a stretch without pose data reads as a gap.
 */
export function divergencePath(
  scores: Float32Array,
  positions: readonly number[],
  durationUs: number,
  box: ChartBox,
): string {
  if (durationUs <= 0) return '';
  const parts: string[] = [];
  let drawing = false;
  scores.forEach((score, step) => {
    const position = positions[step];
    if (!Number.isFinite(score) || position === undefined) {
      drawing = false;
      return;
    }
    const x = round((position / durationUs) * box.width);
    const y = round(box.height - (Math.min(score, SCORE_CEILING) / SCORE_CEILING) * box.height);
    parts.push(`${drawing ? 'L' : 'M'}${x} ${y}`);
    drawing = true;
  });
  return parts.join(' ');
}

/** Timeline position under a click at `x` pixels of a `width`-pixel chart. */
export function positionAtX(x: number, width: number, durationUs: number): number {
  if (width <= 0) return 0;
  return Math.min(durationUs, Math.max(0, (x / width) * durationUs));
}

export function xOfPosition(position: number, durationUs: number, width: number): number {
  return durationUs > 0 ? (position / durationUs) * width : 0;
}
