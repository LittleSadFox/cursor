import { describe, expect, it } from 'vitest';

import { stringifySignals, us } from '@climbing-coach/schema';

import type { VideoFrame } from '../ports/video.js';
import { createActivityPass, needsDenseActivitySample } from './activity.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function gray(tUs: number, lit: boolean, size = 16): VideoFrame {
  const data = new Uint8Array(size * size);
  if (lit) data.fill(255, 0, (size * size) / 2);
  return { tUs: us(tUs), width: size, height: size, data, format: 'gray' };
}

function signalsOf(frames: readonly VideoFrame[], durationUs: number) {
  const pass = createActivityPass();
  for (const frame of frames) pass.push(frame);
  return { pass, file: pass.signals(VIDEO_ID, durationUs) };
}

describe('needsDenseActivitySample', () => {
  it('asks for a 2 fps decode when keyframes are missing or far apart', () => {
    expect(needsDenseActivitySample([], 5_000_000)).toBe(true);
    expect(needsDenseActivitySample([0, 3_000_000], 4_000_000)).toBe(true);
    expect(needsDenseActivitySample([0, 1_000_000], 2_000_000)).toBe(false);
    expect(needsDenseActivitySample([0], 3_000_000)).toBe(true);
    expect(needsDenseActivitySample([], 0)).toBe(false);
  });
});

describe('activity pass', () => {
  it('opens a window around motion and leaves a long idle outside it', () => {
    const { file } = signalsOf(
      [
        gray(0, false),
        gray(500_000, false),
        gray(1_000_000, true),
        gray(1_500_000, true),
        gray(2_000_000, false),
        gray(8_000_000, false),
      ],
      10_000_000,
    );
    expect(() => stringifySignals(file)).not.toThrow();
    expect(file.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
    expect(file.warnings).toEqual([]);
    expect(file.samples).toHaveLength(5);
  });

  it('skips a pair whose frame size changes instead of throwing', () => {
    const { pass, file } = signalsOf(
      [gray(0, false), gray(500_000, true, 8), gray(1_000_000, false, 8)],
      2_000_000,
    );
    expect(pass.times()).toEqual([0, 500_000, 1_000_000]);
    expect(file.samples.map((sample) => sample.tUs)).toEqual([1_000_000]);
  });

  it('ignores a truncated buffer', () => {
    const short: VideoFrame = { ...gray(0, false), data: new Uint8Array(4) };
    const { pass } = signalsOf([short], 1_000_000);
    expect(pass.times()).toEqual([]);
  });

  it('flags a panning camera', () => {
    const size = 32;
    const frames: VideoFrame[] = [];
    for (let index = 0; index < 8; index += 1) {
      const data = new Uint8Array(size * size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const source = x - index * 2;
          data[y * size + x] = ((source * 37 + y * 91) & 0xff) ^ ((source * y) & 0x3f);
        }
      }
      frames.push({ tUs: us(index * 500_000), width: size, height: size, data, format: 'gray' });
    }
    const { file } = signalsOf(frames, 4_000_000);
    expect(file.warnings).toEqual(['camera_moving']);
  });
});
