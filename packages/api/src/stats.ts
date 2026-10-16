import { z } from 'zod';

import { LocalDateSchema } from '@climbing-coach/schema';

import { DisciplineSchema } from './common.js';
import { GradeBreakdownSchema } from './training-logs.js';

export const AcwrBandSchema = z.enum([
  'detraining',
  'steady',
  'caution',
  'ramping_fast',
  'insufficient_data',
]);

export const DailyLoadPointSchema = z.object({
  date: LocalDateSchema,
  logged: z.boolean(),
  rest: z.boolean(),
  load: z.number().nullable(),
  short: z.number().nullable(),
  long: z.number().nullable(),
  acwr: z.number().nullable(),
  band: AcwrBandSchema,
});
export type DailyLoadPoint = z.infer<typeof DailyLoadPointSchema>;

export const TrainingLoadSeriesSchema = z.object({
  unit: z.literal('AU (session exertion × minutes)'),
  method: z.enum(['rolling', 'ewma']),
  days: z.array(DailyLoadPointSchema),
});
export type TrainingLoadSeries = z.infer<typeof TrainingLoadSeriesSchema>;

export const ExertionVolumePointSchema = z.object({
  date: LocalDateSchema,
  exertion: z.number().nullable(),
  volume: z.number(),
});
export type ExertionVolumePoint = z.infer<typeof ExertionVolumePointSchema>;

export const FocusBucketSchema = z.object({
  bucket: z.string().min(1),
  counts: z.record(z.number()),
});
export type FocusBucket = z.infer<typeof FocusBucketSchema>;

export const WeeklySummarySchema = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  sessions: z.number().int().nonnegative(),
  totalLoad: z.number().nullable(),
  hardestSend: z.string().nullable(),
  daysSinceRest: z.number().int().nullable(),
});
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;

export const GradeCountSchema = GradeBreakdownSchema;
export type GradeCount = z.infer<typeof GradeCountSchema>;

export const TrainingLoadQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  method: z.enum(['rolling', 'ewma']).optional(),
});

export const FocusDistributionQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  bucket: z.enum(['week', 'month']),
});

export const GradePyramidQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  discipline: DisciplineSchema,
});
