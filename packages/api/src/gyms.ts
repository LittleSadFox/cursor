import { z } from 'zod';

import { UlidSchema } from '@climbing-coach/schema';

import { CursorQuerySchema } from './common.js';

export const GymSchema = z.object({
  id: UlidSchema,
  name: z.string().min(1),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
});
export type Gym = z.infer<typeof GymSchema>;

export const GymInputSchema = z.object({
  name: z.string().min(1),
  notes: z.string().default(''),
});
export type GymInput = z.infer<typeof GymInputSchema>;

export const GymPatchSchema = GymInputSchema.partial().extend({
  expectedVersion: z.number().int().positive().optional(),
});
export type GymPatch = z.infer<typeof GymPatchSchema>;

export const GymListQuerySchema = CursorQuerySchema.extend({
  q: z.string().min(1).optional(),
});
export type GymListQuery = z.input<typeof GymListQuerySchema>;
