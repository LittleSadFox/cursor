/**
 * Smallest chart ceiling. The score is a mean over every channel, so one joint 25° off scores
 * under 0.1; a fixed ceiling near the highlight level would flatten real differences, while a
 * floor keeps sensor noise on identical climbs from filling the chart.
 */
export const MIN_SCORE_CEILING = 0.25;

/** `pad` keeps a zero line off the chart border. */
export type ChartBox = { width: number; height: number; pad?: number };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Chart top: the largest finite score with 10% headroom, never below `MIN_SCORE_CEILING`. */
export function chartCeiling(scores: Float32Array): number {
  let max = 0;
  for (const score of scores) if (Number.isFinite(score) && score > max) max = score;
  return Math.max(MIN_SCORE_CEILING, max * 1.1);
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
  ceiling = chartCeiling(scores),
): string {
  if (durationUs <= 0) return '';
  const pad = box.pad ?? 0;
  const span = box.height - pad * 2;
  const parts: string[] = [];
  let drawing = false;
  scores.forEach((score, step) => {
    const position = positions[step];
    if (!Number.isFinite(score) || position === undefined) {
      drawing = false;
      return;
    }
    const x = round((position / durationUs) * box.width);
    const y = round(pad + span - (Math.min(score, ceiling) / ceiling) * span);
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
