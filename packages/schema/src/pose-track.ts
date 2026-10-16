import { z } from 'zod';

import { UlidSchema } from './ids.js';
import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarks.js';
import { UsSchema } from './time.js';

export const PoseTrackKindSchema = z.enum(['detection', 'hq']);
export type PoseTrackKind = z.infer<typeof PoseTrackKindSchema>;

export const ActiveWindowSchema = z.object({
  startUs: UsSchema,
  endUs: UsSchema,
});
export type ActiveWindow = z.infer<typeof ActiveWindowSchema>;

export const PoseTrackRefSchema = z.object({
  trackId: UlidSchema,
  firstFrame: z.number().int().nonnegative(),
  lastFrame: z.number().int().nonnegative(),
});
export type PoseTrackRef = z.infer<typeof PoseTrackRefSchema>;

function refineWindows(
  windows: readonly { startUs: number; endUs: number }[],
  ctx: z.RefinementCtx,
): void {
  let previousEnd = -1;
  windows.forEach((window, index) => {
    if (window.endUs < window.startUs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'window endUs must be >= startUs',
        path: ['windows', index, 'endUs'],
      });
    }
    if (window.startUs < previousEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'windows must be ordered and non-overlapping',
        path: ['windows', index, 'startUs'],
      });
    }
    previousEnd = Math.max(previousEnd, window.endUs);
  });
}

function refineTracks(
  header: {
    frameCount: number;
    selectedTrackId: string;
    tracks: readonly { trackId: string; firstFrame: number; lastFrame: number }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  header.tracks.forEach((track, index) => {
    if (seen.has(track.trackId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate trackId ${track.trackId}`,
        path: ['tracks', index, 'trackId'],
      });
    }
    seen.add(track.trackId);
    if (track.lastFrame < track.firstFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lastFrame must be >= firstFrame',
        path: ['tracks', index, 'lastFrame'],
      });
    }
    if (track.lastFrame >= header.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lastFrame must be < frameCount',
        path: ['tracks', index, 'lastFrame'],
      });
    }
  });
  if (!seen.has(header.selectedTrackId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selectedTrackId must be one of tracks',
      path: ['selectedTrackId'],
    });
  }
}

export const PoseTrackHeaderSchema = z
  .object({
    videoId: UlidSchema,
    kind: PoseTrackKindSchema,
    runtime: z.string().min(1),
    model: z.string().min(1),
    modelVersion: z.string().min(1).optional(),
    sampleFps: z.number().positive(),
    windows: z.array(ActiveWindowSchema),
    coordinateSpace: z.literal('display'),
    displayWidth: z.number().int().positive(),
    displayHeight: z.number().int().positive(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    tracks: z.array(PoseTrackRefSchema).min(1),
    selectedTrackId: UlidSchema,
    frameCount: z.number().int().nonnegative(),
  })
  .superRefine((header, ctx) => {
    refineWindows(header.windows, ctx);
    refineTracks(header, ctx);
  });
export type PoseTrackHeader = z.infer<typeof PoseTrackHeaderSchema>;

/**
 * In-memory pose track. Landmark data is Float32 [frameCount × 33 × 4].
 * Frames outside active windows are simply absent from `tUs`.
 */
export type PoseTrack = {
  header: PoseTrackHeader;
  /** Float64 timestamps in microseconds, length = frameCount. */
  tUs: Float64Array;
  /**
   * Per person track, landmark buffer length = frameCount × 33 × 4.
   * Keyed by trackId. Missing landmarks are NaN.
   */
  landmarksByTrack: ReadonlyMap<string, Float32Array>;
};

export function landmarkOffset(frameIndex: number, landmarkIndex: number): number {
  return (frameIndex * LANDMARK_COUNT + landmarkIndex) * LANDMARK_STRIDE;
}

export function assertTimestamps(tUs: Float64Array): void {
  for (let i = 0; i < tUs.length; i++) {
    const t = tUs[i]!;
    if (!Number.isInteger(t) || t < 0) {
      throw new Error(`tUs[${i}] must be a non-negative integer microsecond count`);
    }
    if (i > 0 && t <= tUs[i - 1]!) {
      throw new Error('tUs must be strictly increasing');
    }
  }
}

export function assertPoseTrackInvariants(track: PoseTrack): void {
  const header = PoseTrackHeaderSchema.parse(track.header);
  const { tUs, landmarksByTrack } = track;
  assertTimestamps(tUs);
  if (header.frameCount !== tUs.length) {
    throw new Error(
      `PoseTrack frameCount (${header.frameCount}) != tUs.length (${tUs.length})`,
    );
  }
  const expected = header.frameCount * LANDMARK_COUNT * LANDMARK_STRIDE;
  const trackIds = new Set(header.tracks.map((ref) => ref.trackId));
  if (landmarksByTrack.size !== trackIds.size) {
    throw new Error('landmarksByTrack must contain exactly the header tracks');
  }
  for (const ref of header.tracks) {
    const buf = landmarksByTrack.get(ref.trackId);
    if (!buf) {
      throw new Error(`missing landmark buffer for track ${ref.trackId}`);
    }
    if (buf.length !== expected) {
      throw new Error(
        `track ${ref.trackId} landmark length ${buf.length} != expected ${expected}`,
      );
    }
    if (ref.lastFrame < ref.firstFrame) {
      throw new Error(`track ${ref.trackId}: lastFrame < firstFrame`);
    }
  }
  if (!landmarksByTrack.has(header.selectedTrackId)) {
    throw new Error(`selectedTrackId ${header.selectedTrackId} not in landmarksByTrack`);
  }
}
