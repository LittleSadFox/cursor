import { z } from 'zod';

import { UlidSchema } from './ids.js';

export const WallAngleSchema = z.enum(['slab', 'vert', 'overhang', 'roof']);
export type WallAngle = z.infer<typeof WallAngleSchema>;

export const DatasetSplitSchema = z.enum(['train', 'dev', 'test']);
export type DatasetSplit = z.infer<typeof DatasetSplitSchema>;

export const RecordingManifestEntrySchema = z.object({
  id: UlidSchema,
  /** Relative path under private media storage (not in git). */
  mediaPath: z.string().min(1),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'expected lowercase sha256 hex'),
  durationUs: z.number().int().nonnegative(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
  climberId: z.string().min(1),
  gym: z.string().min(1).optional(),
  wallAngle: WallAngleSchema,
  attemptCount: z.number().int().positive(),
  handheld: z.boolean().default(false),
  hdr: z.boolean().default(false),
  hevc: z.boolean().default(false),
  consentId: z.string().min(1),
  split: DatasetSplitSchema,
  notes: z.string().optional(),
});
export type RecordingManifestEntry = z.infer<typeof RecordingManifestEntrySchema>;

export const DatasetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  datasetVersion: z.string().min(1),
  description: z.string(),
  testSplitRatio: z.number().min(0).max(1),
  frozen: z.boolean().default(false),
  captureProtocolVersion: z.string().min(1).optional(),
  recordings: z.array(RecordingManifestEntrySchema),
});
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

export function parseDatasetManifest(text: string): DatasetManifest {
  return DatasetManifestSchema.parse(JSON.parse(text));
}

export function stringifyDatasetManifest(manifest: DatasetManifest): string {
  return `${JSON.stringify(DatasetManifestSchema.parse(manifest), null, 2)}\n`;
}

/** Count recordings per split for quick sanity checks. */
export function countBySplit(manifest: DatasetManifest): Record<DatasetSplit, number> {
  const counts: Record<DatasetSplit, number> = { train: 0, dev: 0, test: 0 };
  for (const recording of manifest.recordings) {
    counts[recording.split] += 1;
  }
  return counts;
}
