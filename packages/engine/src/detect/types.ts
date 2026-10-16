import type { AttemptOutcome } from '@climbing-coach/schema';

export type ExitDirection = 'top' | 'bottom' | 'left' | 'right' | 'none';

export type FrameSignal = {
  tUs: number;
  inFrame: boolean;
  bothAnklesUp: boolean;
  hipVy: number;
  hipStill: boolean;
  wristsAboveShoulders: boolean;
  crouched: boolean;
  wristsStationary: boolean;
  /** Higher of the two wrists. Smaller y is higher in the image. */
  wristY: number;
  /** Lower of the two wrists. Both wrists are at the high point only when this is too. */
  lowerWristY: number;
  hipX: number;
  hipY: number;
  exitEdge: ExitDirection;
};

export type FloorEstimate = {
  floorY: number;
  confidence: 'high' | 'low';
  alreadyOnWall: boolean;
  bodyHeight: number;
};

export type AttemptDetection = {
  startUs: number;
  endUs: number;
  outcome: AttemptOutcome;
  exitDirection: ExitDirection;
  startConfidence: 'high' | 'low';
};
