import { describe, expect, it } from 'vitest';

import { stringifySignals } from '@climbing-coach/schema';

import { buildSignalsFile, needsDenseActivitySample, type ActivityFrame } from './signals.js';

function block(tUs: number, on: boolean): ActivityFrame {
  const pixels = new Float32Array(16 * 16);
  if (on) pixels.fill(1, 0, 128);
  return { tUs, width: 16, height: 16, pixels };
}

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('activity signals', () => {
  it('asks for a 2 fps decode when keyframes are missing or far apart', () => {
    expect(needsDenseActivitySample([], 5_000_000)).toBe(true);
    expect(needsDenseActivitySample([0, 3_000_000], 4_000_000)).toBe(true);
    expect(needsDenseActivitySample([0, 1_000_000], 2_000_000)).toBe(false);
    expect(needsDenseActivitySample([0], 3_000_000)).toBe(true);
  });

  it('opens a window around motion and leaves a long idle outside it', () => {
    const frames = [
      block(0, false),
      block(500_000, false),
      block(1_000_000, true),
      block(1_500_000, true),
      block(2_000_000, false),
      block(8_000_000, false),
    ];
    const durationUs = 10_000_000;
    const file = buildSignalsFile(VIDEO_ID, durationUs, frames);
    expect(JSON.parse(stringifySignals(file)).videoId).toBe(VIDEO_ID);
    expect(file.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
    const idleAt = 8_000_000;
    expect(
      file.activeWindows.some((window) => idleAt >= window.startUs && idleAt < window.endUs),
    ).toBe(false);
    expect(file.warnings).toEqual([]);
  });
});
