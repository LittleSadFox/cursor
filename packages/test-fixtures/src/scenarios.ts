import type { AttemptOutcome } from '@climbing-coach/schema';

import {
  FRAME_US,
  PoseBuilder,
  REACH,
  SIT_ON_MAT,
  SIT_ON_WALL,
  STAND,
  stillBystander,
  type BodyPose,
  type RawSample,
} from './climber.js';

export type ExpectedAttempt = {
  startUs: number;
  endUs: number;
  outcome: AttemptOutcome;
  startConfidence?: 'high' | 'low';
  exitDirection?: 'top' | 'bottom' | 'left' | 'right' | 'none';
};

export type ClimbScenario = {
  name: string;
  samples: RawSample[];
  attempts: ExpectedAttempt[];
  bystander?: RawSample[];
};

function done(
  name: string,
  builder: PoseBuilder,
  attempts: ExpectedAttempt[],
  bystander = false,
): ClimbScenario {
  return {
    name,
    samples: builder.samples,
    attempts,
    ...(bystander ? { bystander: stillBystander(builder.samples) } : {}),
  };
}

/** Stand, pull on, keep reaching (wrists moving), fall. */
export function standClimbFall(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1.5);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 0.8, -0.06);
  const end = builder.ramp(REACH, STAND, 0.2);
  builder.hold(STAND, 1);
  return done('stand-climb-fall', builder, [
    { startUs: builder.tUsAt(start), endUs: builder.tUsAt(end), outcome: 'fall' },
  ]);
}

/** Feet leave the mat in a crouch. Wrists stay below the shoulders. */
export function sitStart(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1.2);
  builder.hold(SIT_ON_MAT, 0.4);
  builder.ramp(SIT_ON_MAT, SIT_ON_WALL, 0.3);
  const start = builder.hold(SIT_ON_WALL, 0.8, -0.04);
  const landed: BodyPose = { ...STAND, hipY: 0.82, shoulderY: 0.62, wristY: 0.74 };
  const end = builder.ramp(SIT_ON_WALL, landed, 0.2);
  builder.hold(STAND, 0.6);
  return done('sit-start', builder, [
    { startUs: builder.tUsAt(start), endUs: builder.tUsAt(end), outcome: 'fall' },
  ]);
}

/** Stationary match at the high point, then a slow downclimb. */
export function topDownclimb(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 1.1);
  const end = builder.ramp(REACH, STAND, 1);
  builder.hold(STAND, 0.5);
  return done('top-downclimb', builder, [
    { startUs: builder.tUsAt(start), endUs: builder.tUsAt(end), outcome: 'top' },
  ]);
}

/** Brief pause at the top, then a fast fall. Not long enough to count as a top. */
export function jumpOffTop(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 0.6, -0.05);
  builder.hold(REACH, 0.3);
  const end = builder.ramp(REACH, STAND, 0.2);
  builder.hold(STAND, 0.5);
  return done('jump-off-top', builder, [
    { startUs: builder.tUsAt(start), endUs: builder.tUsAt(end), outcome: 'fall' },
  ]);
}

/** Climber leaves through the top of the frame without a finish dwell. */
export function exitTop(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 0.8, -0.04);
  const endFrame = builder.samples.length - 1;
  builder.hold({ ...REACH, hipY: -0.25, shoulderY: -0.45, ankleY: -0.05, wristY: -0.5 }, 0.5);
  return done('exit-top', builder, [
    {
      startUs: builder.tUsAt(start),
      endUs: builder.tUsAt(endFrame),
      outcome: 'top',
      exitDirection: 'top',
    },
  ]);
}

/** Recording opens with the climber already established on the wall. */
export function alreadyOnWall(): ClimbScenario {
  const builder = new PoseBuilder();
  const start = builder.hold(REACH, 1, -0.05);
  const end = builder.ramp(REACH, STAND, 0.2);
  builder.hold(STAND, 1.2);
  return done('already-on-wall', builder, [
    {
      startUs: builder.tUsAt(start),
      endUs: builder.tUsAt(end),
      outcome: 'fall',
      startConfidence: 'low',
    },
  ]);
}

export function twoAttempts(): ClimbScenario {
  const first = standClimbFall();
  const builder = new PoseBuilder();
  for (const sample of first.samples) {
    builder.samples.push({ ...sample, tUs: builder.samples.length * FRAME_US });
  }
  builder.hold(STAND, 2);
  builder.ramp(STAND, REACH, 0.4);
  const start2 = builder.hold(REACH, 0.8, -0.06);
  const end2 = builder.ramp(REACH, STAND, 0.2);
  builder.hold(STAND, 0.8);
  const firstAttempt = first.attempts[0];
  if (!firstAttempt) throw new Error('stand-climb-fall produced no attempt');
  return done('two-attempts', builder, [
    firstAttempt,
    { startUs: builder.tUsAt(start2), endUs: builder.tUsAt(end2), outcome: 'fall' },
  ]);
}

function walkOut(secondsGone: number, name: string): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 0.8);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 1, -0.04);
  const gonePose = { ...REACH, x: -0.2, visibility: 0 };
  const gone = builder.hold(gonePose, secondsGone);
  const back = builder.hold(REACH, 0.8, -0.04);
  const end = builder.ramp(REACH, STAND, 0.2);
  builder.hold(STAND, 0.6);
  if (secondsGone < 3) {
    return done(name, builder, [
      { startUs: builder.tUsAt(start), endUs: builder.tUsAt(end), outcome: 'fall' },
    ]);
  }
  return done(name, builder, [
    {
      startUs: builder.tUsAt(start),
      endUs: builder.tUsAt(Math.max(start, gone - 1)),
      outcome: 'unknown',
      exitDirection: 'left',
    },
    { startUs: builder.tUsAt(back), endUs: builder.tUsAt(end), outcome: 'fall' },
  ]);
}

export function walkOutShort(): ClimbScenario {
  return walkOut(1, 'walk-out-short');
}

export function walkOutLong(): ClimbScenario {
  return walkOut(4, 'walk-out-long');
}

/** Clip ends while the climber is still on the wall. */
export function endsMidClimb(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 0.8);
  builder.ramp(STAND, REACH, 0.4);
  const start = builder.hold(REACH, 1.2, -0.06);
  const last = builder.samples.length - 1;
  return done('ends-mid-climb', builder, [
    { startUs: builder.tUsAt(start), endUs: builder.tUsAt(last), outcome: 'unknown' },
  ]);
}

/** Arms wave overhead. Feet stay on the floor, so this is not an attempt. */
export function armWave(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 0.8);
  builder.hold({ ...STAND, wristY: 0.2 }, 2);
  builder.hold(STAND, 0.6);
  return done('arm-wave', builder, []);
}

/** A hop shorter than the stillness window. */
export function hop(): ClimbScenario {
  const builder = new PoseBuilder();
  builder.hold(STAND, 0.8);
  const up = { ...STAND, ankleY: 0.7, hipY: 0.4, shoulderY: 0.2, wristY: 0.45 };
  builder.ramp(STAND, up, 0.2);
  builder.ramp(up, STAND, 0.2);
  builder.hold(STAND, 0.8);
  return done('hop', builder, []);
}

export function secondPerson(): ClimbScenario {
  const scenario = standClimbFall();
  return { ...scenario, name: 'second-person', bystander: stillBystander(scenario.samples, 0.4) };
}

export const CLIMB_SCENARIOS: readonly ClimbScenario[] = [
  standClimbFall(),
  sitStart(),
  topDownclimb(),
  jumpOffTop(),
  exitTop(),
  alreadyOnWall(),
  twoAttempts(),
  walkOutShort(),
  walkOutLong(),
  endsMidClimb(),
  armWave(),
  hop(),
  secondPerson(),
];
