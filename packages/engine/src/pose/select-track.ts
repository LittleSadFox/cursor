import { midHip } from './access.js';
import type { TrackSamples, WallRect } from './types.js';

/** Default wall region: upper/mid frame, excluding a typical mat strip at the bottom. */
export const DEFAULT_WALL: WallRect = { x0: 0.25, y0: 0, x1: 0.85, y1: 0.8 };

function hipPathNearWall(track: TrackSamples, wall: WallRect): number {
  let motion = 0;
  let previous: { x: number; y: number } | null = null;
  for (const sample of track.samples) {
    const hip = midHip(sample);
    const inside =
      hip.x >= wall.x0 &&
      hip.x <= wall.x1 &&
      hip.y >= wall.y0 &&
      hip.y <= wall.y1 &&
      hip.visibility >= 0.5;
    if (inside && previous) {
      motion += Math.hypot(hip.x - previous.x, hip.y - previous.y);
    }
    previous = inside ? { x: hip.x, y: hip.y } : null;
  }
  return motion;
}

/** Climber = the track with the most hip motion inside the wall region. */
export function selectClimberTrack(
  tracks: readonly TrackSamples[],
  wall: WallRect = DEFAULT_WALL,
): string {
  let bestId = tracks[0]?.trackId ?? '';
  let bestMotion = -1;
  for (const track of tracks) {
    const motion = hipPathNearWall(track, wall);
    if (motion > bestMotion) {
      bestMotion = motion;
      bestId = track.trackId;
    }
  }
  return bestId;
}
