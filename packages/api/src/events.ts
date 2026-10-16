import { z } from 'zod';

import { UlidSchema } from '@climbing-coach/schema';

export const JobProgressEventSchema = z.object({
  type: z.literal('job.progress'),
  jobId: UlidSchema,
  jobType: z.string(),
  step: z.string(),
  progress: z.number().min(0).max(1),
  etaMs: z.number().int().nonnegative().optional(),
});

export const JobTerminalEventSchema = z.object({
  type: z.enum(['job.completed', 'job.failed']),
  jobId: UlidSchema,
  jobType: z.string(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

export const CoachEventSchema = z.discriminatedUnion('type', [
  JobProgressEventSchema,
  JobTerminalEventSchema,
  z.object({ type: z.literal('review.updated'), recordingId: UlidSchema, revision: z.number() }),
  z.object({ type: z.literal('attempt.created'), attemptId: UlidSchema }),
  z.object({ type: z.literal('attempt.updated'), attemptId: UlidSchema }),
  z.object({ type: z.literal('comparison.ready'), comparisonId: UlidSchema }),
]);
export type CoachEvent = z.infer<typeof CoachEventSchema> & { id?: string };

export type EventHandler = (event: CoachEvent) => void;
