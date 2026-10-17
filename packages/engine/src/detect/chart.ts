import type { FrameSignal } from './types.js';

/** One point on the review activity lane, taken from the detector's own frame signals. */
export type ActivityChartPoint = {
  tUs: number;
  /** Signed vertical hip speed in body heights per second. Positive is downward. */
  hipVy: number;
  /** Detector on-wall gate: the climber is in frame and both ankles are lifted. */
  onWall: boolean;
};

/** At most this many points, so a long recording stays a small chart. */
export const ACTIVITY_CHART_POINTS = 480;

function pointOf(frame: FrameSignal): ActivityChartPoint {
  return {
    tUs: Math.round(frame.tUs),
    hipVy: Number.isFinite(frame.hipVy) ? frame.hipVy : 0,
    onWall: frame.inFrame && frame.bothAnklesUp,
  };
}

/** Downsamples detector frames for the activity lane. */
export function activityChart(
  frames: readonly FrameSignal[],
  maxPoints = ACTIVITY_CHART_POINTS,
): ActivityChartPoint[] {
  if (frames.length === 0 || maxPoints < 1) return [];
  if (frames.length <= maxPoints) return frames.map(pointOf);
  const step = frames.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => {
    const frame = frames[Math.min(frames.length - 1, Math.floor(index * step))];
    return pointOf(frame ?? frames[frames.length - 1]!);
  });
}
