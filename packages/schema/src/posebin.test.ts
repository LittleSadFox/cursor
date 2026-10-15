import { describe, expect, it } from 'vitest';

import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarks.js';
import { readPosebin, writePosebin } from './posebin.js';
import type { PoseTrack } from './pose-track.js';
import { us } from './time.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function makeTrack(frameCount: number): PoseTrack {
  const tUs = new Float64Array(frameCount);
  const landmarks = new Float32Array(frameCount * LANDMARK_COUNT * LANDMARK_STRIDE);

  for (let f = 0; f < frameCount; f++) {
    tUs[f] = us(1_000_000 + f * 33_333);
    for (let l = 0; l < LANDMARK_COUNT; l++) {
      const o = (f * LANDMARK_COUNT + l) * LANDMARK_STRIDE;
      landmarks[o] = 0.1 + l * 0.01;
      landmarks[o + 1] = 0.2 + f * 0.001;
      landmarks[o + 2] = -0.05;
      landmarks[o + 3] = 0.9;
    }
  }
  // Leave one landmark missing as NaN
  landmarks[4] = Number.NaN;

  return {
    header: {
      videoId: VIDEO_ID,
      kind: 'detection',
      runtime: 'onnxruntime',
      model: 'rtmpose-body26',
      modelVersion: '0.0.0-test',
      sampleFps: 15,
      windows: [{ startUs: us(1_000_000), endUs: us(1_000_000 + frameCount * 33_333) }],
      coordinateSpace: 'display',
      displayWidth: 1080,
      displayHeight: 1920,
      rotation: 0,
      tracks: [{ trackId: TRACK_ID, firstFrame: 0, lastFrame: frameCount - 1 }],
      selectedTrackId: TRACK_ID,
      frameCount,
    },
    tUs,
    landmarksByTrack: new Map([[TRACK_ID, landmarks]]),
  };
}

describe('posebin', () => {
  it('round-trips a multi-frame track with Float64 timestamps', () => {
    const original = makeTrack(12);
    const bytes = writePosebin(original);
    expect(bytes.byteLength).toBeGreaterThan(64);

    const decoded = readPosebin(bytes);
    expect(decoded.header.videoId).toBe(VIDEO_ID);
    expect(decoded.header.frameCount).toBe(12);
    expect(decoded.header.coordinateSpace).toBe('display');
    expect(decoded.tUs.length).toBe(12);
    expect(decoded.tUs[0]).toBe(1_000_000);
    expect(decoded.tUs[11]).toBe(1_000_000 + 11 * 33_333);

    const lm = decoded.landmarksByTrack.get(TRACK_ID)!;
    expect(lm[0]).toBeCloseTo(0.1, 5);
    expect(Number.isNaN(lm[4])).toBe(true);
  });

  it('preserves microsecond precision past 16 seconds (Float32 would lose it)', () => {
    const track = makeTrack(1);
    const precise = 16_000_000 + 7; // 16s + 7µs
    track.tUs[0] = precise;
    const decoded = readPosebin(writePosebin(track));
    expect(decoded.tUs[0]).toBe(precise);
  });

  it('rejects truncated buffers', () => {
    const bytes = writePosebin(makeTrack(3));
    expect(() => readPosebin(bytes.subarray(0, 20))).toThrow(/truncated|overruns|too short/);
  });

  it('rejects bad magic', () => {
    const bytes = writePosebin(makeTrack(1));
    bytes[0] = 0x00;
    expect(() => readPosebin(bytes)).toThrow(/magic/);
  });
});
