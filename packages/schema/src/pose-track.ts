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

export const PoseTrackHeaderSchema = z.object({
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

export function assertPoseTrackInvariants(track: PoseTrack): void {
  const { header, tUs, landmarksByTrack } = track;
  if (header.frameCount !== tUs.length) {
    throw new Error(
      `PoseTrack frameCount (${header.frameCount}) != tUs.length (${tUs.length})`,
    );
  }
  const expected = header.frameCount * LANDMARK_COUNT * LANDMARK_STRIDE;
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
