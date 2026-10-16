import { median } from '../math.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';
import { coreVisible, landmark } from '../pose/access.js';
import { estimateBodyHeight } from '../pose/metrics.js';
import type { PoseSample } from '../pose/types.js';
import type { FloorEstimate } from './types.js';

/**
 * Floor is the lowest visible ankle (largest y).
 * If the first second sits clearly above that, the climber started on the wall
 * and the estimate is low confidence.
 */
export function estimateFloor(
  samples: readonly PoseSample[],
  params: StartingParams = STARTING_PARAMS,
): FloorEstimate {
  const bodyHeight = estimateBodyHeight(
    samples,
    params.pose.minVisibility,
    params.pose.torsoToBodyHeight,
  );
  const origin = samples[0]?.tUs ?? 0;
  const lows: { tUs: number; y: number }[] = [];
  for (const sample of samples) {
    if (!coreVisible(sample, params.pose.minVisibility)) continue;
    const y = Math.max(landmark(sample, 'leftAnkle').y, landmark(sample, 'rightAnkle').y);
    lows.push({ tUs: sample.tUs, y });
  }
  if (lows.length === 0) {
    return { floorY: 1, confidence: 'low', alreadyOnWall: true, bodyHeight };
  }
  const globalLow = Math.max(...lows.map((sample) => sample.y));
  const early = lows.filter((sample) => sample.tUs <= origin + params.detect.floorWindowUs);
  const earlyMedian = median(early.map((sample) => sample.y));
  const lifted = params.detect.ankleLiftBodyHeights * bodyHeight;
  const alreadyOnWall = earlyMedian < globalLow - lifted;
  return {
    floorY: globalLow,
    confidence: alreadyOnWall ? 'low' : 'high',
    alreadyOnWall,
    bodyHeight,
  };
}
