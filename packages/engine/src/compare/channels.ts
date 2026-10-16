import type { BlazePoseLandmark } from '@climbing-coach/schema';

/** Interior angle at `pivot` between `from` and `to`. Same triplets as `FEATURE_SPEC`. */
export type JointTriplet = {
  from: BlazePoseLandmark;
  pivot: BlazePoseLandmark;
  to: BlazePoseLandmark;
};

export const COMPARE_JOINTS = [
  'leftElbow',
  'rightElbow',
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
] as const;
export type CompareJoint = (typeof COMPARE_JOINTS)[number];

export const JOINT_TRIPLETS: Record<CompareJoint, JointTriplet> = {
  leftElbow: { from: 'leftShoulder', pivot: 'leftElbow', to: 'leftWrist' },
  rightElbow: { from: 'rightShoulder', pivot: 'rightElbow', to: 'rightWrist' },
  leftShoulder: { from: 'leftElbow', pivot: 'leftShoulder', to: 'leftHip' },
  rightShoulder: { from: 'rightElbow', pivot: 'rightShoulder', to: 'rightHip' },
  leftHip: { from: 'leftShoulder', pivot: 'leftHip', to: 'leftKnee' },
  rightHip: { from: 'rightShoulder', pivot: 'rightHip', to: 'rightKnee' },
  leftKnee: { from: 'leftHip', pivot: 'leftKnee', to: 'leftAnkle' },
  rightKnee: { from: 'rightHip', pivot: 'rightKnee', to: 'rightAnkle' },
};

/** Composite metrics in torso lengths (PLAN 2.8). */
export const COMPOSITE_METRICS = ['hipToHands', 'comSupport'] as const;
export type CompositeMetric = (typeof COMPOSITE_METRICS)[number];

/** Columns of one divergence row: 8 joint angles then 2 composite metrics. */
export const DIVERGENCE_CHANNELS = [...COMPARE_JOINTS, ...COMPOSITE_METRICS] as const;
export type DivergenceChannel = (typeof DIVERGENCE_CHANNELS)[number];
export const CHANNEL_COUNT = DIVERGENCE_CHANNELS.length;

export type ChannelMetric = 'angleDeg' | 'torsoLengths';

export function channelMetric(channel: DivergenceChannel): ChannelMetric {
  return (COMPARE_JOINTS as readonly string[]).includes(channel) ? 'angleDeg' : 'torsoLengths';
}
