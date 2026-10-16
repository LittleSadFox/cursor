import { z } from 'zod';

import { LocalDateSchema } from '@climbing-coach/schema';

import { DisciplineSchema } from './common.js';

export const BUILTIN_FOCUS_IDS = [
  'capacity',
  'strength',
  'power',
  'endurance',
  'power-endurance',
  'technique',
  'projecting',
  'flexibility',
  'rest',
] as const;

export const SessionTypeSchema = z.enum([
  'climbing',
  'board',
  'hangboard',
  'gym',
  'cardio',
  'rest',
]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const BodyFlagSchema = z.enum(['ok', 'sore', 'pain', 'thin', 'flapper']);

export const TrainingLogBodySchema = z.object({
  fingers: BodyFlagSchema.optional(),
  skin: BodyFlagSchema.optional(),
  joints: BodyFlagSchema.optional(),
});
export type TrainingLogBody = z.infer<typeof TrainingLogBodySchema>;

export const GradeBreakdownSchema = z.object({
  discipline: DisciplineSchema,
  grade: z.string().min(1),
  attempted: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
});
export type GradeBreakdown = z.infer<typeof GradeBreakdownSchema>;

export const FocusTagSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  builtin: z.boolean(),
});
export type FocusTag = z.infer<typeof FocusTagSchema>;

export const TrainingLogSchema = z.object({
  date: LocalDateSchema,
  tzOffsetMin: z.number().int(),
  sessionExertion: z.number().int().min(0).max(10).nullable(),
  exertionSource: z.enum(['prefill', 'user']),
  boulderCount: z.number().int().nonnegative(),
  routeCount: z.number().int().nonnegative(),
  durationMin: z.number().int().nonnegative().nullable(),
  sessionType: SessionTypeSchema,
  primaryFocusId: z.string().min(1).nullable(),
  secondaryFocusIds: z.array(z.string().min(1)),
  grades: z.array(GradeBreakdownSchema),
  body: TrainingLogBodySchema.nullable(),
  notes: z.string(),
  load: z.number().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TrainingLog = z.infer<typeof TrainingLogSchema>;

export const TrainingLogInputSchema = z.object({
  tzOffsetMin: z.number().int(),
  sessionExertion: z.number().int().min(0).max(10).nullable(),
  exertionSource: z.enum(['prefill', 'user']).default('user'),
  boulderCount: z.number().int().nonnegative().default(0),
  routeCount: z.number().int().nonnegative().default(0),
  durationMin: z.number().int().nonnegative().nullable().optional(),
  sessionType: SessionTypeSchema.default('climbing'),
  primaryFocusId: z.string().min(1).nullable().optional(),
  secondaryFocusIds: z.array(z.string().min(1)).default([]),
  grades: z
    .array(GradeBreakdownSchema)
    .default([])
    .refine(
      (rows) => new Set(rows.map((row) => `${row.discipline}:${row.grade}`)).size === rows.length,
      'each discipline + grade may appear once',
    ),
  body: TrainingLogBodySchema.nullable().optional(),
  notes: z.string().default(''),
  expectedVersion: z.number().int().positive().optional(),
});
export type TrainingLogInput = z.infer<typeof TrainingLogInputSchema>;

export const PrefillBasisSchema = z.object({
  attempts: z.number().int().nonnegative(),
  mean: z.number().nullable(),
  max: z.number().nullable(),
});

export const TrainingLogPrefillSchema = z.object({
  sessionExertion: z.number().int().min(0).max(10).nullable(),
  basis: PrefillBasisSchema,
  boulderCount: z.number().int().nonnegative(),
  grades: z.array(GradeBreakdownSchema),
});
export type TrainingLogPrefill = z.infer<typeof TrainingLogPrefillSchema>;

export const TrainingLogDaySchema = z.object({
  entry: TrainingLogSchema.nullable(),
  prefill: TrainingLogPrefillSchema,
});
export type TrainingLogDay = z.infer<typeof TrainingLogDaySchema>;
