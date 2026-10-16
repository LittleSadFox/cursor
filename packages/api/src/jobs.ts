import { z } from 'zod';

import { UlidSchema } from '@climbing-coach/schema';

export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ResourceClassSchema = z.enum(['pose', 'ffmpeg', 'compute', 'idle']);
export type ResourceClass = z.infer<typeof ResourceClassSchema>;

export const JobStepSchema = z.object({
  name: z.string().min(1),
  status: JobStatusSchema,
  resource: ResourceClassSchema,
  dependsOn: z.array(z.string()),
  error: z.string().nullable(),
});
export type JobStep = z.infer<typeof JobStepSchema>;

export const JobSchema = z.object({
  id: UlidSchema,
  type: z.string().min(1),
  status: JobStatusSchema,
  steps: z.array(JobStepSchema),
  progress: z.number().min(0).max(1),
  payload: z.unknown(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  type: z.string().min(1).optional(),
});
export type JobQuery = z.input<typeof JobQuerySchema>;
