import { describe, expect, it } from 'vitest';

import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarks.js';
import { slicePoseTrack } from './pose-slice.js';
import { readPosebin, writePosebin } from './posebin.js';
import type { PoseTrack } from './pose-track.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CLIMBER = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const BYSTANDER = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const FRAME = LANDMARK_COUNT * LANDMARK_STRIDE;

function track(frames: number): PoseTrack {
  const buffer = (seed: number) =>
    Float32Array.from({ length: frames * FRAME }, (_, i) => seed + Math.floor(i / FRAME));
  return {
    header: {
      videoId: VIDEO_ID,
      kind: 'hq',
      runtime: 'test',
      model: 'm',
      sampleFps: 10,
      windows: [],
      coordinateSpace: 'display',
      displayWidth: 100,
      displayHeight: 100,
      rotation: 0,
      tracks: [
        { trackId: CLIMBER, firstFrame: 0, lastFrame: frames - 1 },
        { trackId: BYSTANDER, firstFrame: 0, lastFrame: 2 },
      ],
      selectedTrackId: CLIMBER,
      frameCount: frames,
    },
    tUs: Float64Array.from({ length: frames }, (_, i) => i * 100_000),
    landmarksByTrack: new Map([
      [CLIMBER, buffer(0)],
      [BYSTANDER, buffer(1000)],
    ]),
  };
}

describe('slicePoseTrack', () => {
  it('keeps frames in [fromUs, toUs) and re-bases person track frames', () => {
    const slice = slicePoseTrack(track(10), 200_000, 600_000);
    expect(slice).not.toBeNull();
    expect(Array.from(slice?.tUs ?? [])).toEqual([200_000, 300_000, 400_000, 500_000]);
    expect(slice?.header.tracks).toEqual([
      { trackId: CLIMBER, firstFrame: 0, lastFrame: 3 },
      { trackId: BYSTANDER, firstFrame: 0, lastFrame: 0 },
    ]);
    expect(slice?.landmarksByTrack.get(CLIMBER)?.[0]).toBe(2);
    expect(slice?.landmarksByTrack.get(BYSTANDER)?.[FRAME - 1]).toBe(1002);
    const decoded = readPosebin(writePosebin(slice as PoseTrack));
    expect(decoded.header.frameCount).toBe(4);
  });

  it('drops person tracks outside the slice and rejects a slice without the climber', () => {
    const slice = slicePoseTrack(track(10), 500_000, 2_000_000);
    expect(slice?.header.tracks.map((ref) => ref.trackId)).toEqual([CLIMBER]);
    expect(slicePoseTrack(track(10), 5_000_000, 6_000_000)).toBeNull();
  });
});
