import { LANDMARK_COUNT, LANDMARK_STRIDE, type PoseTrack } from '@climbing-coach/schema';

/** The selected person's frames: Float32 `[frames × 33 × 4]`, display-normalized x/y. */
export type PoseFrames = {
  tUs: Float64Array;
  landmarks: Float32Array;
};

export type PosePoint = { x: number; y: number; visibility: number };

const FRAME_FLOATS = LANDMARK_COUNT * LANDMARK_STRIDE;

export function poseFrames(track: PoseTrack): PoseFrames | null {
  const landmarks = track.landmarksByTrack.get(track.header.selectedTrackId);
  return landmarks ? { tUs: track.tUs, landmarks } : null;
}

/** Index of the frame nearest `tUs`, or -1 when there are none. */
export function frameIndexAt(tUs: Float64Array, t: number): number {
  if (tUs.length === 0) return -1;
  let lo = 0;
  let hi = tUs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((tUs[mid] ?? 0) < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs((tUs[lo - 1] ?? 0) - t) <= Math.abs((tUs[lo] ?? 0) - t)) return lo - 1;
  return lo;
}

export function framePoints(frames: PoseFrames, index: number): PosePoint[] {
  const base = index * FRAME_FLOATS;
  return Array.from({ length: LANDMARK_COUNT }, (_, landmark) => {
    const offset = base + landmark * LANDMARK_STRIDE;
    return {
      x: frames.landmarks[offset] ?? Number.NaN,
      y: frames.landmarks[offset + 1] ?? Number.NaN,
      visibility: frames.landmarks[offset + 3] ?? 0,
    };
  });
}

export function poseAt(frames: PoseFrames, t: number): PosePoint[] | null {
  const index = frameIndexAt(frames.tUs, t);
  return index < 0 ? null : framePoints(frames, index);
}
