export {
  FRAME_US,
  REACH,
  SIT_ON_MAT,
  SIT_ON_WALL,
  STAND,
  SYNTH_FPS,
  PoseBuilder,
  framesFor,
  landmarksFor,
  lerpPose,
  stillBystander,
  type BodyPose,
  type RawSample,
} from './climber.js';

export {
  CLIMB_SCENARIOS,
  alreadyOnWall,
  armWave,
  endsMidClimb,
  exitTop,
  exitTopMissing,
  hop,
  jumpOffTop,
  oneHandPauseFall,
  topThenWalkOff,
  secondPerson,
  sitStart,
  standClimbFall,
  topDownclimb,
  twoAttempts,
  walkOutLong,
  walkOutShort,
  type ClimbScenario,
  type ExpectedAttempt,
} from './scenarios.js';

export { movingBlob, panningFrames, staticFrames, type GrayFrame } from './gray.js';
