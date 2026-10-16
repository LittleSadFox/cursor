import { z } from 'zod';

import { LocalDateSchema, UlidSchema } from '@climbing-coach/schema';

import { CursorQuerySchema } from './common.js';

export const SessionSchema = z.object({
  id: UlidSchema,
  gymId: UlidSchema.nullable(),
  date: LocalDateSchema,
  tzOffsetMin: z.number().int(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionInputSchema = z.object({
  gymId: UlidSchema.nullable().optional(),
  date: LocalDateSchema,
  tzOffsetMin: z.number().int(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
});
export type SessionInput = z.infer<typeof SessionInputSchema>;

export const SessionPatchSchema = SessionInputSchema.partial().extend({
  expectedVersion: z.number().int().positive().optional(),
});
export type SessionPatch = z.infer<typeof SessionPatchSchema>;

export const SessionListQuerySchema = CursorQuerySchema.extend({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  gymId: UlidSchema.optional(),
});
export type SessionListQuery = z.input<typeof SessionListQuerySchema>;
