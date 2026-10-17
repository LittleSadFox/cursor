import { z } from 'zod';

import { UlidSchema } from '@climbing-coach/schema';

import type { Accepted } from './common.js';

export const CutModeSchema = z.enum(['lossless', 'reencode', 'auto']);
export type CutMode = z.infer<typeof CutModeSchema>;

export const ImportModeSchema = z.enum(['copy', 'move', 'reference']);

export const RecordingImportSchema = z.object({
  sourcePath: z.string().min(1),
  importMode: ImportModeSchema.default('copy'),
  fileName: z.string().min(1).optional(),
});
export type RecordingImport = z.infer<typeof RecordingImportSchema>;

export const RecordingCutSchema = z.object({
  startUs: z.number().int().nonnegative(),
  endUs: z.number().int().positive(),
  mode: CutModeSchema.default('auto'),
});
export type RecordingCut = z.infer<typeof RecordingCutSchema>;

export const RecordingSchema = z.object({
  id: UlidSchema,
  kind: z.enum(['original', 'clip']),
  fileName: z.string(),
  proxyReady: z.boolean(),
  /** True when a detection (or hq) pose track exists for this video. */
  hasPose: z.boolean(),
  quickHash: z.string().nullable(),
  sha256: z.string().nullable(),
  durationUs: z.number().int().nullable(),
  displayWidth: z.number().int().nullable(),
  displayHeight: z.number().int().nullable(),
  rotation: z.number().int(),
  codec: z.string().nullable(),
  fps: z.number().nullable(),
  isHdr: z.boolean(),
  isVfr: z.boolean(),
  colorTransfer: z.string().nullable(),
  dolbyVision: z.string().nullable(),
  frameCount: z.number().int().nullable(),
  reviewState: z.enum(['unreviewed', 'in_review', 'done']),
  sourceVideoId: z.string().nullable(),
  sourceStartUs: z.number().int().nullable(),
  sourceEndUs: z.number().int().nullable(),
  jobId: z.string().nullable(),
  jobStatus: z.string().nullable(),
  error: z.string().nullable(),
  proxyUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type Recording = z.infer<typeof RecordingSchema>;

export type RecordingAccepted = Accepted<{ recording: Recording }>;

export const MediaVariantSchema = z.enum(['original', 'proxy']);
export type MediaVariant = z.infer<typeof MediaVariantSchema>;

export type MediaFile = { path: string; contentType: string };
