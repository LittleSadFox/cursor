import { z } from 'zod';

import { IdSchema } from './common.js';

/** Clip-time microseconds. Unbranded in DTOs, like the settings paddings. */
const MicrosSchema = z.number().int().nonnegative();

export const SpatialModeSchema = z.enum(['body', 'wall']);
export type SpatialMode = z.infer<typeof SpatialModeSchema>;

export const ComparisonOptionsSchema = z
  .object({
    collapseRests: z.boolean().default(true),
    spatialMode: SpatialModeSchema.default('body'),
  })
  .strict();
export type ComparisonOptions = z.infer<typeof ComparisonOptionsSchema>;

export const ComparisonInputSchema = z
  .object({
    attemptAId: IdSchema,
    attemptBId: IdSchema,
    options: ComparisonOptionsSchema.default({}),
  })
  .strict()
  .refine((input) => input.attemptAId !== input.attemptBId, {
    message: 'compare two different attempts',
    path: ['attemptBId'],
  });
export type ComparisonInput = z.input<typeof ComparisonInputSchema>;

export const ComparisonStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type ComparisonStatus = z.infer<typeof ComparisonStatusSchema>;

export const DifferenceMetricSchema = z.enum(['angleDeg', 'torsoLengths']);

export const ComparisonDifferenceSchema = z.object({
  moveIndexA: z.number().int().nonnegative(),
  joint: z.string().min(1),
  metric: DifferenceMetricSchema,
  /** Attempt A minus attempt B. */
  meanDelta: z.number(),
  text: z.string(),
});
export type ComparisonDifference = z.infer<typeof ComparisonDifferenceSchema>;

export const MoveMatchSchema = z.object({
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative().nullable(),
  cost: z.number().optional(),
});
export type MoveMatch = z.infer<typeof MoveMatchSchema>;

/** Per-move aggregates; JSON has no NaN, so channels without data are null. */
export const MoveComparisonSchema = z.object({
  moveIndexA: z.number().int().nonnegative(),
  startUs: MicrosSchema,
  endUs: MicrosSchema,
  steps: z.number().int().nonnegative(),
  meanScore: z.number().nullable(),
  meanDeltas: z.array(z.number().nullable()),
  /** Every difference of this move above the reporting minimum, largest first. */
  differences: z.array(ComparisonDifferenceSchema),
});
export type MoveComparison = z.infer<typeof MoveComparisonSchema>;

export const ComparisonSummarySchema = z.object({
  meanDivergence: z.number().nullable(),
  topDifferences: z.array(ComparisonDifferenceSchema),
});
export type ComparisonSummary = z.infer<typeof ComparisonSummarySchema>;

export const ComparisonSideSchema = z.object({
  attemptId: IdSchema,
  clipVideoId: IdSchema,
  poseTrackId: IdSchema,
  climbStartUs: MicrosSchema,
  climbEndUs: MicrosSchema,
  outcome: z.string(),
});
export type ComparisonSide = z.infer<typeof ComparisonSideSchema>;

export const ComparisonSchema = z.object({
  id: IdSchema,
  status: ComparisonStatusSchema,
  error: z.string().nullable(),
  /** Set while `pending`: the `compare` job computing this result. */
  jobId: IdSchema.nullable(),
  attemptAId: IdSchema,
  attemptBId: IdSchema,
  a: ComparisonSideSchema,
  b: ComparisonSideSchema,
  poseModel: z.string(),
  engineVersion: z.string(),
  options: ComparisonOptionsSchema,
  /** Column names of one divergence row: signed deltas (A − B), then `score`. */
  channels: z.array(z.string()),
  steps: z.number().int().nonnegative(),
  moveMatches: z.array(MoveMatchSchema),
  perMove: z.array(MoveComparisonSchema),
  summary: ComparisonSummarySchema,
  warpUrl: z.string(),
  divergenceUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const AlignmentVerdictSchema = z.enum(['aligned', 'misaligned']);
export type AlignmentVerdict = z.infer<typeof AlignmentVerdictSchema>;

export const AlignmentFeedbackSchema = z
  .object({
    moveIndexA: z.number().int().nonnegative(),
    verdict: AlignmentVerdictSchema,
    note: z.string().max(500).optional(),
  })
  .strict();
export type AlignmentFeedback = z.infer<typeof AlignmentFeedbackSchema>;

export const ComparisonExportInputSchema = z
  .object({
    layout: z.enum(['side_by_side', 'ghost']),
    format: z.enum(['mp4', 'gif']).default('mp4'),
  })
  .strict();
export type ComparisonExportInput = z.input<typeof ComparisonExportInputSchema>;

export const VideoPoseQuerySchema = z
  .object({
    kind: z.enum(['detection', 'hq']).default('hq'),
    fromUs: z.coerce.number().int().nonnegative().optional(),
    toUs: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((q) => q.fromUs === undefined || q.toUs === undefined || q.fromUs < q.toUs, {
    message: 'fromUs must be before toUs',
    path: ['toUs'],
  });
export type VideoPoseQuery = z.input<typeof VideoPoseQuerySchema>;
