import { useLingui } from '@lingui/react';

import type { ActivityTrack } from '@climbing-coach/api';

import {
  ENERGY_BAND,
  HIP_BAND,
  ON_WALL_HEIGHT,
  ON_WALL_TOP,
  chartPoints,
  energyScale,
  flagSpans,
  peakOf,
  thresholdY,
} from './activity-geometry.js';
import { rangeStyle } from './timeline-math.js';

/** Energy, the activity threshold, on-wall samples, and hip speed under the filmstrip. */
export function ActivityLane({
  track,
  durationUs,
}: {
  track: ActivityTrack | undefined;
  durationUs: number;
}) {
  const { i18n } = useLingui();
  if (!track || durationUs <= 0) return null;
  if (track.samples.length === 0 && track.hip === null) {
    return <p className="lede">{i18n._('review.activity.empty')}</p>;
  }
  const scale = energyScale(
    track.samples.map((sample) => sample.energy),
    track.energyThreshold,
  );
  const hip = track.hip ?? [];
  const hipScale = Math.max(peakOf(hip.map((sample) => sample.hipVy)), 1e-6);
  const onWall = flagSpans(
    hip.map((sample) => ({ tUs: sample.tUs, on: sample.onWall })),
    durationUs,
  );
  return (
    <figure className="review-activity">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={i18n._('review.activity')}
      >
        {track.activeWindows.map((window) => (
          <rect
            key={`${window.startUs}-${window.endUs}`}
            className="review-activity-window"
            {...rectOf(window, durationUs, 0, 100)}
          />
        ))}
        <polyline
          className="review-activity-energy"
          points={chartPoints(
            track.samples.map((sample) => ({ tUs: sample.tUs, value: sample.energy })),
            durationUs,
            scale,
            ENERGY_BAND,
          )}
        />
        <line
          className="review-activity-threshold"
          x1="0"
          x2="100"
          y1={thresholdY(track.energyThreshold, scale, ENERGY_BAND)}
          y2={thresholdY(track.energyThreshold, scale, ENERGY_BAND)}
        />
        {hip.length > 0 ? (
          <polyline
            className="review-activity-hip"
            points={chartPoints(
              hip.map((sample) => ({ tUs: sample.tUs, value: sample.hipVy })),
              durationUs,
              hipScale,
              HIP_BAND,
              true,
            )}
          />
        ) : null}
        {onWall.map((span) => (
          <rect
            key={`${span.startUs}-${span.endUs}`}
            className="review-activity-wall"
            {...rectOf(span, durationUs, ON_WALL_TOP, ON_WALL_HEIGHT)}
          />
        ))}
      </svg>
      <figcaption className="review-activity-legend">
        <span>{i18n._('review.activity.energy')}</span>
        <span>{i18n._('review.activity.threshold')}</span>
        <span>{i18n._('review.activity.hip')}</span>
        <span>{i18n._('review.activity.onWall')}</span>
      </figcaption>
    </figure>
  );
}

function rectOf(
  span: { startUs: number; endUs: number },
  durationUs: number,
  y: number,
  height: number,
): { x: string; y: number; width: string; height: number } {
  const style = rangeStyle(span, durationUs);
  return { x: style.left, y, width: style.width, height };
}
