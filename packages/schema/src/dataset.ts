import { z } from 'zod';

import { UlidSchema } from './ids.js';
import { sha256Hex } from './sha256.js';

export const WallAngleSchema = z.enum(['slab', 'vert', 'overhang', 'roof']);
export type WallAngle = z.infer<typeof WallAngleSchema>;

export const DatasetSplitSchema = z.enum(['train', 'dev', 'test']);
export type DatasetSplit = z.infer<typeof DatasetSplitSchema>;

/** Relative path under private media storage. No absolute paths or `..` segments. */
export const RelativeMediaPathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/.test(path), {
    message: 'mediaPath must be relative',
  })
  .refine((path) => path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'), {
    message: 'mediaPath must not contain . or .. segments',
  });

export const RecordingManifestEntrySchema = z.object({
  id: UlidSchema,
  mediaPath: RelativeMediaPathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'expected lowercase sha256 hex'),
  durationUs: z.number().int().nonnegative(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
  climberId: z.string().min(1),
  /** Grouping key for the split. A climber+boulder pair must stay in one split. */
  boulderId: z.string().min(1),
  gym: z.string().min(1),
  grade: z.string().min(1),
  color: z.string().min(1),
  lighting: z.string().min(1),
  cameraDistanceM: z.number().positive(),
  cameraHeightM: z.number().positive(),
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

/**
 * SHA-256 of the test-split recording hashes, sorted, joined by `\n` (no trailing newline).
 * The empty test split hashes the empty string.
 */
export function testSplitSha256Of(
  recordings: readonly { split: DatasetSplit; sha256: string }[],
): string {
  const lines = recordings
    .filter((recording) => recording.split === 'test')
    .map((recording) => recording.sha256)
    .sort();
  return sha256Hex(lines.join('\n'));
}

function refineManifest(
  manifest: {
    frozen: boolean;
    testSplitSha256?: string | undefined;
    recordings: readonly { climberId: string; boulderId: string; split: DatasetSplit; sha256: string }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seen = new Map<string, DatasetSplit>();
  manifest.recordings.forEach((recording, index) => {
    const key = `${recording.climberId}\0${recording.boulderId}`;
    const previous = seen.get(key);
    if (previous && previous !== recording.split) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `climber ${recording.climberId} boulder ${recording.boulderId} leaks across ${previous} and ${recording.split}`,
        path: ['recordings', index, 'split'],
      });
    } else if (!previous) {
      seen.set(key, recording.split);
    }
  });

  if (!manifest.frozen) return;
  const expected = testSplitSha256Of(manifest.recordings);
  if (!manifest.testSplitSha256) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'frozen manifest requires testSplitSha256',
      path: ['testSplitSha256'],
    });
    return;
  }
  if (manifest.testSplitSha256 !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'testSplitSha256 does not match the sorted test-recording hashes',
      path: ['testSplitSha256'],
    });
  }
}

export const DatasetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasetVersion: z.string().min(1),
    description: z.string(),
    testSplitRatio: z.number().min(0).max(1),
    frozen: z.boolean().default(false),
    captureProtocolVersion: z.string().min(1).optional(),
    testSplitSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    recordings: z.array(RecordingManifestEntrySchema),
  })
  .superRefine(refineManifest);
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
