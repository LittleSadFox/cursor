import { us, type PoseTrack, type Us } from '@climbing-coach/schema';

export type PersonSpan = {
  trackId: string;
  firstFrame: number;
  lastFrame: number;
  startUs: Us;
  endUs: Us;
  selected: boolean;
};

/** One row per person in a detection posebin, in header order. */
export function peopleOf(track: PoseTrack): PersonSpan[] {
  return track.header.tracks.map((ref) => ({
    trackId: ref.trackId,
    firstFrame: ref.firstFrame,
    lastFrame: ref.lastFrame,
    startUs: us(Math.round(track.tUs[ref.firstFrame] ?? 0)),
    endUs: us(Math.round(track.tUs[ref.lastFrame] ?? 0)),
    selected: ref.trackId === track.header.selectedTrackId,
  }));
}

/** Same buffers, with `trackId` marked selected. Returns the same track when it already is. */
export function withSelected(track: PoseTrack, trackId: string): PoseTrack {
  if (!track.header.tracks.some((ref) => ref.trackId === trackId)) {
    throw new Error(`unknown track ${trackId}`);
  }
  if (track.header.selectedTrackId === trackId) return track;
  return { ...track, header: { ...track.header, selectedTrackId: trackId } };
}
