import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarks.js';
import type { PoseTrack, PoseTrackRef } from './pose-track.js';

const FRAME_FLOATS = LANDMARK_COUNT * LANDMARK_STRIDE;

function frameRange(tUs: Float64Array, fromUs: number, toUs: number): [number, number] {
  let first = 0;
  while (first < tUs.length && (tUs[first] ?? 0) < fromUs) first += 1;
  let end = first;
  while (end < tUs.length && (tUs[end] ?? 0) < toUs) end += 1;
  return [first, end];
}

/**
 * Frames with `fromUs <= tUs < toUs`. Person tracks without frames in the slice are dropped;
 * the selected track must keep at least one frame, otherwise this returns null.
 */
export function slicePoseTrack(track: PoseTrack, fromUs: number, toUs: number): PoseTrack | null {
  const [first, end] = frameRange(track.tUs, fromUs, toUs);
  const tracks: PoseTrackRef[] = [];
  const landmarksByTrack = new Map<string, Float32Array>();
  for (const ref of track.header.tracks) {
    const firstFrame = Math.max(ref.firstFrame, first);
    const lastFrame = Math.min(ref.lastFrame, end - 1);
    if (lastFrame < firstFrame) continue;
    const buffer = track.landmarksByTrack.get(ref.trackId);
    if (!buffer) continue;
    tracks.push({
      trackId: ref.trackId,
      firstFrame: firstFrame - first,
      lastFrame: lastFrame - first,
    });
    landmarksByTrack.set(ref.trackId, buffer.slice(first * FRAME_FLOATS, end * FRAME_FLOATS));
  }
  if (!tracks.some((ref) => ref.trackId === track.header.selectedTrackId)) return null;
  return {
    header: { ...track.header, tracks, frameCount: end - first },
    tUs: track.tUs.slice(first, end),
    landmarksByTrack,
  };
}
