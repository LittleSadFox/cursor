import { z } from 'zod';

import { AttemptOutcomeSchema, UlidSchema } from '@climbing-coach/schema';

import { JobStatusSchema } from './jobs.js';

const UsSchema = z.number().int().nonnegative();

export const ReviewRangeSchema = z
  .object({ startUs: UsSchema, endUs: UsSchema })
  .refine((range) => range.endUs >= range.startUs, { message: 'endUs must not precede startUs' });
export type ReviewRange = z.infer<typeof ReviewRangeSchema>;

export const ReviewPaddingSchema = z.object({ preUs: UsSchema, postUs: UsSchema });
export type ReviewPadding = z.infer<typeof ReviewPaddingSchema>;

export const ReviewOriginSchema = z.enum(['detector', 'manual']);
export type ReviewOrigin = z.infer<typeof ReviewOriginSchema>;

export const ReviewStatusSchema = z.enum(['draft', 'rejected', 'committed']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * Review row (BUILD_PLAN §4.3). `climb` is what the handles mark; `clip` is `climb` plus
 * `padding`, clamped to the recording, and is read-only. `parentIds` are the detector rows
 * this item descends from through splits and merges (empty for a manual add).
 */
export const ReviewItemSchema = z.object({
  id: UlidSchema,
  origin: ReviewOriginSchema,
  parentIds: z.array(UlidSchema),
  climb: ReviewRangeSchema,
  padding: ReviewPaddingSchema,
  clip: ReviewRangeSchema,
  outcome: AttemptOutcomeSchema,
  confidence: z.number().nullable(),
  touched: z.boolean(),
  status: ReviewStatusSchema,
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const ReviewProcessingSchema = z.object({
  jobId: UlidSchema.nullable(),
  jobStatus: JobStatusSchema.nullable(),
  /** False while import or reprocess may still add proposals. */
  complete: z.boolean(),
  proxyReady: z.boolean(),
});
export type ReviewProcessing = z.infer<typeof ReviewProcessingSchema>;

export const ReviewStateSchema = z.object({
  recordingId: UlidSchema,
  revision: z.number().int().nonnegative(),
  reviewState: z.enum(['unreviewed', 'in_review', 'done']),
  durationUs: UsSchema.nullable(),
  items: z.array(ReviewItemSchema),
  processing: ReviewProcessingSchema,
});
export type ReviewState = z.infer<typeof ReviewStateSchema>;

/** Client-made rows carry a temporary id until the save that stores them returns `idMap`. */
export const NEW_REVIEW_ITEM_ID = /^new-[a-z0-9]{1,40}$/;

export const ReviewItemInputSchema = z.object({
  id: z.union([UlidSchema, z.string().regex(NEW_REVIEW_ITEM_ID)]),
  origin: ReviewOriginSchema,
  parentIds: z.array(UlidSchema).max(64),
  climb: ReviewRangeSchema,
  outcome: AttemptOutcomeSchema,
  touched: z.boolean(),
  status: z.enum(['draft', 'rejected']),
});
export type ReviewItemInput = z.infer<typeof ReviewItemInputSchema>;

/** Autosave body. Committed rows are never sent and never change. */
export const ReviewSaveSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  items: z.array(ReviewItemInputSchema).max(500),
});
export type ReviewSave = z.infer<typeof ReviewSaveSchema>;

export const ReviewSavedSchema = ReviewStateSchema.extend({
  /** Temporary id → stored ULID for every new row in this save. */
  idMap: z.record(z.string(), UlidSchema),
});
export type ReviewSaved = z.infer<typeof ReviewSavedSchema>;

export const ReprocessScopeSchema = z.enum(['active', 'full']);
export type ReprocessScope = z.infer<typeof ReprocessScopeSchema>;

export const RecordingReprocessSchema = z.object({ scope: ReprocessScopeSchema });
export type RecordingReprocess = z.infer<typeof RecordingReprocessSchema>;

export const SpriteTileSchema = z.object({
  tUs: UsSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type SpriteTile = z.infer<typeof SpriteTileSchema>;

/** A JPEG sprite of frame tiles plus where each tile sits (filmstrip and loupe). */
export const SpriteSchema = z.object({
  spriteUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tiles: z.array(SpriteTileSchema),
});
export type Sprite = z.infer<typeof SpriteSchema>;

export const FilmstripQuerySchema = z
  .object({
    startUs: z.coerce.number().int().nonnegative(),
    endUs: z.coerce.number().int().positive(),
    count: z.coerce.number().int().min(1).max(60),
    width: z.coerce.number().int().min(32).max(320),
  })
  .refine((query) => query.endUs > query.startUs, { message: 'endUs must follow startUs' });
export type FilmstripQuery = z.infer<typeof FilmstripQuerySchema>;

export const LoupeQuerySchema = z.object({ atUs: z.coerce.number().int().nonnegative() });
export type LoupeQuery = z.infer<typeof LoupeQuerySchema>;
