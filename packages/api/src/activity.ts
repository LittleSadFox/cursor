import { z } from 'zod';

import { ActiveWindowSchema, UlidSchema, UsSchema } from '@climbing-coach/schema';

export const ActivityEnergySchema = z.object({
  tUs: UsSchema,
  energy: z.number().nonnegative(),
});
export type ActivityEnergy = z.infer<typeof ActivityEnergySchema>;

export const ActivityHipSchema = z.object({
  tUs: UsSchema,
  /** Signed vertical hip speed in body heights per second. Positive is downward. */
  hipVy: z.number().finite(),
  /** Detector on-wall gate for this sample. */
  onWall: z.boolean(),
});
export type ActivityHip = z.infer<typeof ActivityHipSchema>;

/**
 * What the review activity lane draws. Energy and windows come from the stored
 * signals file; hip speed is derived from the selected detection track.
 */
export const ActivityTrackSchema = z.object({
  energyThreshold: z.number().nonnegative(),
  samples: z.array(ActivityEnergySchema),
  activeWindows: z.array(ActiveWindowSchema),
  /** Null until a detection pose track exists. */
  hip: z.array(ActivityHipSchema).nullable(),
});
export type ActivityTrack = z.infer<typeof ActivityTrackSchema>;

export const PosePersonSchema = z.object({
  trackId: UlidSchema,
  firstFrame: z.number().int().nonnegative(),
  lastFrame: z.number().int().nonnegative(),
  startUs: UsSchema,
  endUs: UsSchema,
  selected: z.boolean(),
});
export type PosePerson = z.infer<typeof PosePersonSchema>;

export const PosePeopleSchema = z.object({
  tracks: z.array(PosePersonSchema),
});
export type PosePeople = z.infer<typeof PosePeopleSchema>;

export const SelectPoseTrackSchema = z.object({
  trackId: UlidSchema,
});
export type SelectPoseTrack = z.infer<typeof SelectPoseTrackSchema>;
