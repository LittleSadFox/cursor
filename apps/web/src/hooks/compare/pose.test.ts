import { LANDMARK_COUNT, type PoseTrack } from '@climbing-coach/schema';
import { describe, expect, it } from 'vitest';

import { frameIndexAt, framePoints, poseAt, poseFrames } from './pose.js';

const TRACK = '01J00000000000000000000001';

function track(): PoseTrack {
  const landmarks = new Float32Array(2 * LANDMARK_COUNT * 4);
  landmarks.set([0.5, 0.25, 0, 0.9], 0);
  landmarks.set([0.6, 0.35, 0, 0.8], LANDMARK_COUNT * 4);
  return {
    header: {
      videoId: '01J00000000000000000000002',
      kind: 'hq',
      runtime: 'test',
      model: 'm',
      sampleFps: 15,
      windows: [],
      coordinateSpace: 'display',
      displayWidth: 100,
      displayHeight: 100,
      rotation: 0,
      tracks: [{ trackId: TRACK, firstFrame: 0, lastFrame: 1 }],
      selectedTrackId: TRACK,
      frameCount: 2,
    },
    tUs: Float64Array.from([1000, 2000]),
    landmarksByTrack: new Map([[TRACK, landmarks]]),
  };
}

describe('pose frames', () => {
  it('picks the nearest frame, preferring the earlier on a tie', () => {
    const tUs = Float64Array.from([1000, 2000, 3000]);
    expect(frameIndexAt(tUs, 0)).toBe(0);
    expect(frameIndexAt(tUs, 1500)).toBe(0);
    expect(frameIndexAt(tUs, 1501)).toBe(1);
    expect(frameIndexAt(tUs, 9000)).toBe(2);
    expect(frameIndexAt(new Float64Array(), 0)).toBe(-1);
  });

  it('reads the selected person’s landmarks', () => {
    const frames = poseFrames(track());
    expect(frames).not.toBeNull();
    if (!frames) return;
    const points = framePoints(frames, 1);
    expect(points).toHaveLength(LANDMARK_COUNT);
    expect(points[0]?.x).toBeCloseTo(0.6);
    expect(points[0]?.visibility).toBeCloseTo(0.8);
    expect(poseAt(frames, 1100)?.[0]?.y).toBeCloseTo(0.25);
  });
});
