import { STARTING_PARAMS, type StartingParams } from '../params.js';
import { coreVisible, landmark, torsoLength } from '../pose/access.js';
import { bodyMetrics, type BodyMetrics } from '../pose/metrics.js';
import type { PoseSample } from '../pose/types.js';
import type { ExitDirection, FloorEstimate, FrameSignal } from './types.js';

/** Edge the point is beyond, if any. Non-finite (missing) positions are `none`. */
export function exitEdge(x: number, y: number, margin: number): ExitDirection {
  if (y < margin) return 'top';
  if (y > 1 - margin) return 'bottom';
  if (x < margin) return 'left';
  if (x > 1 - margin) return 'right';
  return 'none';
}

type FrameBase = {
  sample: PoseSample;
  metrics: BodyMetrics;
  edge: ExitDirection;
  inFrame: boolean;
};

function frameBase(sample: PoseSample, params: StartingParams): FrameBase {
  const metrics = bodyMetrics(sample);
  const edge = exitEdge(metrics.midHipX, metrics.midHipY, params.detect.exitEdgeMargin);
  const inFrame = coreVisible(sample, params.pose.minVisibility) && edge === 'none';
  return { sample, metrics, edge, inFrame };
}

function wristSpeed(current: FrameBase, previous: FrameBase, dtSec: number): number {
  const torso = Math.max(torsoLength(current.sample), 1e-6);
  let fastest = 0;
  for (const name of ['leftWrist', 'rightWrist'] as const) {
    const now = landmark(current.sample, name);
    const before = landmark(previous.sample, name);
    fastest = Math.max(fastest, Math.hypot(now.x - before.x, now.y - before.y) / dtSec / torso);
  }
  return fastest;
}

function frameSignal(
  current: FrameBase,
  previous: FrameBase | undefined,
  floor: FloorEstimate,
  params: StartingParams,
): FrameSignal {
  const { sample, metrics, inFrame } = current;
  const dt = previous ? (sample.tUs - previous.sample.tUs) / 1_000_000 : 0;
  const tracked = inFrame && previous !== undefined && previous.inFrame && dt > 0;
  const hipVy = tracked ? (metrics.midHipY - previous.metrics.midHipY) / dt / floor.bodyHeight : 0;
  const lift = params.detect.ankleLiftBodyHeights;
  const leftLift = (floor.floorY - landmark(sample, 'leftAnkle').y) / floor.bodyHeight;
  const rightLift = (floor.floorY - landmark(sample, 'rightAnkle').y) / floor.bodyHeight;
  const leftWrist = landmark(sample, 'leftWrist');
  const rightWrist = landmark(sample, 'rightWrist');
  const leg = metrics.lowerAnkleY - metrics.midHipY;
  return {
    tUs: sample.tUs,
    inFrame,
    bothAnklesUp: inFrame && leftLift > lift && rightLift > lift,
    hipVy,
    hipStill: inFrame && Math.abs(hipVy) < params.detect.hipStillBodyHeightsPerSec,
    wristsAboveShoulders:
      inFrame &&
      leftWrist.y < landmark(sample, 'leftShoulder').y &&
      rightWrist.y < landmark(sample, 'rightShoulder').y,
    crouched: inFrame && leg < 0.45 * floor.bodyHeight,
    wristsStationary:
      tracked && wristSpeed(current, previous, dt) < params.moves.stationaryLimbTorsoPerSec,
    wristY: Math.min(leftWrist.y, rightWrist.y),
    lowerWristY: Math.max(leftWrist.y, rightWrist.y),
    hipX: metrics.midHipX,
    hipY: metrics.midHipY,
    exitEdge: current.edge,
  };
}

/** Per-frame detector signals in display space (y grows downward). */
export function detectorSignals(
  samples: readonly PoseSample[],
  floor: FloorEstimate,
  params: StartingParams = STARTING_PARAMS,
): FrameSignal[] {
  const bases = samples.map((sample) => frameBase(sample, params));
  return bases.map((base, index) =>
    frameSignal(base, index > 0 ? bases[index - 1] : undefined, floor, params),
  );
}
