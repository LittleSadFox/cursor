import type { ChannelMetric, DivergenceChannel } from './channels.js';

export type DifferenceFacts = {
  moveIndexA: number;
  joint: DivergenceChannel;
  metric: ChannelMetric;
  /** Attempt A minus attempt B, averaged over the move. */
  meanDelta: number;
};

const JOINT_NAMES: Record<DivergenceChannel, string> = {
  leftElbow: 'Left elbow',
  rightElbow: 'Right elbow',
  leftShoulder: 'Left shoulder',
  rightShoulder: 'Right shoulder',
  leftHip: 'Left hip',
  rightHip: 'Right hip',
  leftKnee: 'Left knee',
  rightKnee: 'Right knee',
  hipToHands: 'Hips',
  comSupport: 'Center of mass',
};

const STRAIGHTENING: ReadonlySet<DivergenceChannel> = new Set([
  'leftElbow',
  'rightElbow',
  'leftKnee',
  'rightKnee',
]);

function torsoAmount(value: number): string {
  const rounded = Math.abs(value).toFixed(2).replace(/0$/, '');
  return `${rounded} torso lengths`;
}

function angleText(facts: DifferenceFacts): string {
  const degrees = Math.round(Math.abs(facts.meanDelta));
  const wider = facts.meanDelta > 0;
  const direction = STRAIGHTENING.has(facts.joint)
    ? wider
      ? 'straighter'
      : 'more bent'
    : wider
      ? 'more open'
      : 'more closed';
  return `${JOINT_NAMES[facts.joint]} ${degrees}° ${direction}`;
}

function compositeText(facts: DifferenceFacts): string {
  const amount = torsoAmount(facts.meanDelta);
  if (facts.joint === 'hipToHands') {
    return `Hips ${amount} ${facts.meanDelta > 0 ? 'further from' : 'closer to'} the hands`;
  }
  const side = facts.meanDelta > 0 ? 'right' : 'left';
  return `Center of mass ${amount} further ${side} over the support`;
}

/**
 * English observation for one per-move difference (PLAN 2.8: observations, not
 * prescriptions). Moves are numbered from 1 for people.
 */
export function describeDifference(facts: DifferenceFacts): string {
  const body = facts.metric === 'angleDeg' ? angleText(facts) : compositeText(facts);
  return `${body} through move ${facts.moveIndexA + 1}`;
}
