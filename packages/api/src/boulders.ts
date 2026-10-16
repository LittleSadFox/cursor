import { z } from 'zod';

import { LocalDateSchema, UlidSchema } from '@climbing-coach/schema';

import { CursorQuerySchema, DisciplineSchema } from './common.js';

export const BoulderSchema = z.object({
  id: UlidSchema,
  gymId: UlidSchema,
  name: z.string().min(1),
  grade: z.string().min(1),
  difficultyIndex: z.number().int(),
  color: z.string().min(1),
  setOn: LocalDateSchema.nullable(),
  retiredOn: LocalDateSchema.nullable(),
  wallPhotoPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
  stats: z
    .object({
      attempts: z.number().int().nonnegative(),
      sends: z.number().int().nonnegative(),
      bestProximity: z.number().int().min(1).max(5).nullable(),
      lastAttemptAt: z.string().nullable(),
    })
    .optional(),
});
export type Boulder = z.infer<typeof BoulderSchema>;

export const BoulderInputSchema = z.object({
  gymId: UlidSchema,
  name: z.string().min(1).optional(),
  grade: z.string().min(1),
  color: z.string().min(1).default('unknown'),
  setOn: LocalDateSchema.optional(),
  discipline: DisciplineSchema.optional(),
});
export type BoulderInput = z.infer<typeof BoulderInputSchema>;

export const BoulderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  grade: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  setOn: LocalDateSchema.nullable().optional(),
  retiredOn: LocalDateSchema.nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type BoulderPatch = z.infer<typeof BoulderPatchSchema>;

export const BoulderListQuerySchema = CursorQuerySchema.extend({
  gymId: UlidSchema.optional(),
  active: z.coerce.boolean().optional(),
  gradeMin: z.string().min(1).optional(),
  gradeMax: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
});
export type BoulderListQuery = z.input<typeof BoulderListQuerySchema>;

export const ProgressPointSchema = z.object({
  attemptId: UlidSchema,
  sessionId: UlidSchema,
  proximity: z.number().int().min(1).max(5).nullable(),
  exertion: z.number().int().min(1).max(10).nullable(),
  recordedAt: z.string(),
});
export type ProgressPoint = z.infer<typeof ProgressPointSchema>;
