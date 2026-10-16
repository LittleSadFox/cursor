import {
  BLAZEPOSE_LANDMARKS,
  LANDMARK_COUNT,
  type BlazePoseLandmark,
} from '@climbing-coach/schema';

/** Detection sample rate used by the synthetic climber. */
export const SYNTH_FPS = 15;
export const FRAME_US = Math.round(1_000_000 / SYNTH_FPS);

export type RawSample = {
  tUs: number;
  landmarks: number[][];
};

export type BodyPose = {
  x: number;
  ankleY: number;
  hipY: number;
  shoulderY: number;
  wristY: number;
  /** Left wrist height when the hands are on different holds. Defaults to `wristY`. */
  leftWristY?: number;
  visibility: number;
};

const INDEX = Object.fromEntries(BLAZEPOSE_LANDMARKS.map((name, index) => [name, index])) as Record<
  BlazePoseLandmark,
  number
>;

export const STAND: BodyPose = {
  x: 0.55,
  ankleY: 0.88,
  hipY: 0.58,
  shoulderY: 0.38,
  wristY: 0.62,
  visibility: 1,
};

/** On the wall, arms above the shoulders, hips still. */
export const REACH: BodyPose = {
  x: 0.55,
  ankleY: 0.6,
  hipY: 0.3,
  shoulderY: 0.1,
  wristY: 0.02,
  visibility: 1,
};

/** Sit start: ankles up, hips close to the feet, wrists still below the shoulders. */
export const SIT_ON_WALL: BodyPose = {
  x: 0.55,
  ankleY: 0.7,
  hipY: 0.62,
  shoulderY: 0.42,
  wristY: 0.55,
  visibility: 1,
};

export const SIT_ON_MAT: BodyPose = {
  x: 0.55,
  ankleY: 0.88,
  hipY: 0.78,
  shoulderY: 0.58,
  wristY: 0.7,
  visibility: 1,
};

export function framesFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * SYNTH_FPS));
}

export function landmarksFor(pose: BodyPose, wristOffset = 0): number[][] {
  const points = Array.from({ length: LANDMARK_COUNT }, () => [
    pose.x,
    pose.shoulderY - 0.08,
    0,
    pose.visibility,
  ]);
  const set = (name: BlazePoseLandmark, x: number, y: number): void => {
    points[INDEX[name]] = [x, y, 0, pose.visibility];
  };
  const wristY = pose.wristY + wristOffset;
  const leftWristY = (pose.leftWristY ?? pose.wristY) + wristOffset;
  const kneeY = (pose.hipY + pose.ankleY) / 2;
  const elbowY = (pose.shoulderY + wristY) / 2;
  set('nose', pose.x, pose.shoulderY - 0.08);
  set('leftShoulder', pose.x - 0.08, pose.shoulderY);
  set('rightShoulder', pose.x + 0.08, pose.shoulderY);
  set('leftElbow', pose.x - 0.1, (pose.shoulderY + leftWristY) / 2);
  set('rightElbow', pose.x + 0.1, elbowY);
  set('leftWrist', pose.x - 0.12, leftWristY);
  set('rightWrist', pose.x + 0.12, wristY);
  set('leftHip', pose.x - 0.06, pose.hipY);
  set('rightHip', pose.x + 0.06, pose.hipY);
  set('leftKnee', pose.x - 0.05, kneeY);
  set('rightKnee', pose.x + 0.05, kneeY);
  set('leftAnkle', pose.x - 0.05, pose.ankleY);
  set('rightAnkle', pose.x + 0.05, pose.ankleY);
  set('leftHeel', pose.x - 0.05, pose.ankleY + 0.02);
  set('rightHeel', pose.x + 0.05, pose.ankleY + 0.02);
  set('leftFootIndex', pose.x - 0.04, pose.ankleY - 0.01);
  set('rightFootIndex', pose.x + 0.04, pose.ankleY - 0.01);
  return points;
}

export function lerpPose(from: BodyPose, to: BodyPose, t: number): BodyPose {
  const mix = (a: number, b: number): number => a + (b - a) * t;
  return {
    x: mix(from.x, to.x),
    ankleY: mix(from.ankleY, to.ankleY),
    hipY: mix(from.hipY, to.hipY),
    shoulderY: mix(from.shoulderY, to.shoulderY),
    wristY: mix(from.wristY, to.wristY),
    ...(from.leftWristY !== undefined || to.leftWristY !== undefined
      ? { leftWristY: mix(from.leftWristY ?? from.wristY, to.leftWristY ?? to.wristY) }
      : {}),
    visibility: t < 1 ? from.visibility : to.visibility,
  };
}

export class PoseBuilder {
  readonly samples: RawSample[] = [];

  hold(pose: BodyPose, seconds: number, wristTravel = 0): number {
    const count = framesFor(seconds);
    const start = this.samples.length;
    for (let i = 0; i < count; i += 1) {
      const offset = count === 1 ? 0 : (wristTravel * i) / (count - 1);
      this.push(pose, offset);
    }
    return start;
  }

  ramp(from: BodyPose, to: BodyPose, seconds: number): number {
    const count = framesFor(seconds);
    const start = this.samples.length;
    for (let i = 1; i <= count; i += 1) {
      this.push(lerpPose(from, to, i / count), 0);
    }
    return start;
  }

  tUsAt(frame: number): number {
    return this.samples[frame]?.tUs ?? 0;
  }

  private push(pose: BodyPose, wristOffset: number): void {
    this.samples.push({
      tUs: this.samples.length * FRAME_US,
      landmarks: landmarksFor(pose, wristOffset),
    });
  }
}

/** Same timestamps, standing still at `x`, so a moving climber outranks them. */
export function stillBystander(samples: readonly RawSample[], x = 0.4): RawSample[] {
  const pose = { ...STAND, x };
  return samples.map((sample) => ({
    tUs: sample.tUs,
    landmarks: landmarksFor(pose),
  }));
}
