import { z } from 'zod';

import { AttemptOutcomeSchema, UlidSchema } from '@climbing-coach/schema';

export const ReviewItemSchema = z.object({
  id: UlidSchema,
  videoId: UlidSchema,
  outcome: AttemptOutcomeSchema,
  climbStartUs: z.number().int().nonnegative(),
  climbEndUs: z.number().int().nonnegative(),
  /** Climb range plus padding, clamped to the recording. This is what a cut should use. */
  clipStartUs: z.number().int().nonnegative(),
  clipEndUs: z.number().int().nonnegative(),
  confidence: z.number().nullable(),
  status: z.enum(['draft', 'committed', 'rejected']),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
