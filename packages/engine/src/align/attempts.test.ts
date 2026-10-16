import { describe, expect, it } from 'vitest';

import { LANDMARK_COUNT, type PoseTrack } from '@climbing-coach/schema';
import { PoseBuilder, REACH, STAND } from '@climbing-coach/test-fixtures';

import { trackSamples } from '../pose/from-track.js';
import type { PoseSample } from '../pose/types.js';
import { alignAttempts, openEndSide } from './attempts.js';

const TRACK_ID = '01JAB7AAAAAAAAAAAAAAAAAAAA';

function poseTrack(): { track: PoseTrack; raw: PoseBuilder } {
  const raw = new PoseBuilder();
  raw.hold(STAND, 1);
  raw.ramp(STAND, REACH, 1);
  raw.hold(REACH, 0.5);
  raw.ramp(REACH, { ...REACH, wristY: -0.2 }, 1);
  const frames = raw.samples.length;
  const buffer = new Float32Array(frames * LANDMARK_COUNT * 4);
  raw.samples.forEach((sample, frame) => {
    sample.landmarks.forEach((point, index) => {
      buffer.set(point, (frame * LANDMARK_COUNT + index) * 4);
    });
  });
  const track: PoseTrack = {
    header: {
      videoId: '01JAB6AAAAAAAAAAAAAAAAAAAA',
      kind: 'hq',
      runtime: 'test',
      model: 'synthetic',
      sampleFps: 15,
      windows: [],
      coordinateSpace: 'display',
      displayWidth: 1920,
      displayHeight: 1080,
      rotation: 0,
      tracks: [{ trackId: TRACK_ID, firstFrame: 0, lastFrame: frames - 1 }],
      selectedTrackId: TRACK_ID,
      frameCount: frames,
    },
    tUs: Float64Array.from(raw.samples, (sample) => sample.tUs),
    landmarksByTrack: new Map([[TRACK_ID, buffer]]),
  };
  return { track, raw };
}

describe('trackSamples', () => {
  it('unpacks the selected person and limits frames to a range', () => {
    const { track, raw } = poseTrack();
    const all = trackSamples(track);
    expect(all).toHaveLength(raw.samples.length);
    expect(all[3]?.landmarks[0]?.x).toBeCloseTo(raw.samples[3]?.landmarks[0]?.[0] ?? 0, 6);
    const tUs = track.tUs;
    const part = trackSamples(track, { startUs: tUs[5] ?? 0, endUs: tUs[9] ?? 0 });
    expect(part.map((sample) => sample.tUs)).toEqual(Array.from(tUs.slice(5, 9)));
    expect(() => trackSamples(track, undefined, 'missing')).toThrow(/no person track/);
  });
});

describe('alignAttempts', () => {
  const full = trackSamples(poseTrack().track);

  it('picks the attempt that did not top as the open-ended side', () => {
    expect(openEndSide('fall', 'top')).toBe('a');
    expect(openEndSide('top', 'drop')).toBe('b');
    expect(openEndSide('top', 'top')).toBe('none');
    expect(openEndSide('fall', 'unknown')).toBe('none');
  });

  it('keeps the path A → B when B is the prefix', () => {
    const prefix: PoseSample[] = full.slice(0, Math.floor(full.length * 0.6));
    const result = alignAttempts(full, prefix, { openEnd: 'b' });
    const last = result.path[result.path.length - 1];
    expect(last?.indexB).toBe(prefix.length - 1);
    expect(last?.tUsB).toBe(prefix[prefix.length - 1]?.tUs);
    for (const step of result.path) expect(step.tUsA).toBe(full[step.indexA]?.tUs);
    expect(result.path[0]).toMatchObject({ indexA: 0, indexB: 0 });
  });

  it('can align without collapsing rests', () => {
    const result = alignAttempts(full, full, { collapseRests: false });
    expect(result.path).toHaveLength(full.length);
    expect(result.cost).toBe(0);
  });
});
