import { z } from 'zod';

import { UsSchema } from './time.js';

export const ClimbRangeSchema = z
  .object({
    startUs: UsSchema,
    endUs: UsSchema,
  })
  .refine((range) => range.endUs >= range.startUs, {
    message: 'endUs must be >= startUs',
    path: ['endUs'],
  });
export type ClimbRangeDto = z.infer<typeof ClimbRangeSchema>;

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  durationUs: UsSchema,
  labeled: z.array(ClimbRangeSchema),
  predicted: z.array(ClimbRangeSchema),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

/** Synthetic or cached detection fixture scored by `coach eval`. */
export const EvalFixtureSchema = z.object({
  name: z.string().min(1),
  detectorVersion: z.string().min(1),
  toleranceUs: UsSchema,
  maxMatchUs: UsSchema,
  cases: z.array(EvalCaseSchema),
});
export type EvalFixture = z.infer<typeof EvalFixtureSchema>;

export function parseEvalFixture(value: unknown): EvalFixture {
  return EvalFixtureSchema.parse(value);
}
