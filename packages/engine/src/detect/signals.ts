import { STARTING_PARAMS, type StartingParams } from '../params.js';
import { coreVisible, landmark, torsoLength } from '../pose/access.js';
import { bodyMetrics } from '../pose/metrics.js';
import type { PoseSample } from '../pose/types.js';
import type { ExitDirection, FloorEstimate, FrameSignal } from './types.js';

function exitEdge(x: number, y: number): ExitDirection {
  if (y < 0.02) return 'top';
  if (y > 0.98) return 'bottom';
  if (x < 0.02) return 'left';
  if (x > 0.98) return 'right';
  return 'none';
}

function limbSpeed(
  sample: PoseSample,
  previous: PoseSample | undefined,
  dtSec: number,
  name: 'leftWrist' | 'rightWrist',
): number {
  if (!previous || dtSec <= 0) return 0;
  const torso = Math.max(torsoLength(sample), 1e-6);
  const current = landmark(sample, name);
  const prior = landmark(previous, name);
  return Math.hypot(current.x - prior.x, current.y - prior.y) / dtSec / torso;
}

/** Per-frame detector signals in display space (y grows downward). */
export function detectorSignals(
  samples: readonly PoseSample[],
  floor: FloorEstimate,
  params: StartingParams = STARTING_PARAMS,
): FrameSignal[] {
  const lift = params.detect.ankleLiftBodyHeights;
  const still = params.detect.hipStillBodyHeightsPerSec;
  const stationary = params.moves.stationaryLimbTorsoPerSec;
  return samples.map((sample, index) => {
    const previous = index > 0 ? samples[index - 1] : undefined;
    const metrics = bodyMetrics(sample);
    const visible = coreVisible(sample, params.pose.minVisibility);
    const edge = exitEdge(metrics.midHipX, metrics.midHipY);
    const inFrame = visible && edge === 'none';
    const prevInFrame =
      previous !== undefined &&
      coreVisible(previous, params.pose.minVisibility) &&
      exitEdge(bodyMetrics(previous).midHipX, bodyMetrics(previous).midHipY) === 'none';
    const dt = previous ? (sample.tUs - previous.tUs) / 1_000_000 : 0;
    const prevHipY = previous ? bodyMetrics(previous).midHipY : metrics.midHipY;
    const hipVy =
      inFrame && prevInFrame && dt > 0 ? (metrics.midHipY - prevHipY) / dt / floor.bodyHeight : 0;
    const leftLift = (floor.floorY - landmark(sample, 'leftAnkle').y) / floor.bodyHeight;
    const rightLift = (floor.floorY - landmark(sample, 'rightAnkle').y) / floor.bodyHeight;
    const leftWrist = landmark(sample, 'leftWrist');
    const rightWrist = landmark(sample, 'rightWrist');
    const leg = metrics.lowerAnkleY - metrics.midHipY;
    const wristSpeed = Math.max(
      limbSpeed(sample, prevInFrame ? previous : undefined, dt, 'leftWrist'),
      limbSpeed(sample, prevInFrame ? previous : undefined, dt, 'rightWrist'),
    );
    return {
      tUs: sample.tUs,
      inFrame,
      bothAnklesUp: inFrame && leftLift > lift && rightLift > lift,
      hipVy,
      hipStill: inFrame && Math.abs(hipVy) < still,
      wristsAboveShoulders:
        inFrame &&
        leftWrist.y < landmark(sample, 'leftShoulder').y &&
        rightWrist.y < landmark(sample, 'rightShoulder').y,
      crouched: inFrame && leg < 0.45 * floor.bodyHeight,
      wristsStationary: inFrame && prevInFrame && wristSpeed < stationary,
      wristY: Math.min(leftWrist.y, rightWrist.y),
      hipX: metrics.midHipX,
      hipY: metrics.midHipY,
      exitEdge: edge,
    };
  });
}
