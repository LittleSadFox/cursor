import { describe, expect, it } from 'vitest';

import { movingBlob, panningFrames, staticFrames, wallPan } from '@climbing-coach/test-fixtures';

import { STARTING_PARAMS } from '../params.js';
import { activityEnergy, activitySeries } from './energy.js';
import { cameraMovingWarning, globalMotion } from './motion.js';
import { activeWindows } from './windows.js';

const dtUs = 500_000;

describe('activity', () => {
  it('scores a static scene as zero energy', () => {
    const frames = staticFrames(4, dtUs);
    const first = frames[0];
    const second = frames[1];
    if (!first || !second) throw new Error('expected frames');
    expect(activityEnergy(first.pixels, second.pixels)).toBe(0);
    expect(activitySeries(frames).every((sample) => sample.energy === 0)).toBe(true);
  });

  it('opens a window around a moving person and skips a long idle gap', () => {
    const before = staticFrames(4, dtUs);
    const motion = movingBlob(8, dtUs).map((frame, index) => ({
      ...frame,
      tUs: before.length * dtUs + index * dtUs,
    }));
    const idle = staticFrames(30, dtUs).map((frame, index) => ({
      ...frame,
      tUs: (before.length + motion.length) * dtUs + index * dtUs,
    }));
    const later = movingBlob(6, dtUs).map((frame, index) => ({
      ...frame,
      tUs: (before.length + motion.length + idle.length) * dtUs + index * dtUs,
    }));
    const frames = [...before, ...motion, ...idle, ...later];
    const durationUs = (frames.length - 1) * dtUs;
    const windows = activeWindows(activitySeries(frames), durationUs, {
      ...STARTING_PARAMS.activity,
      energyThreshold: 0.001,
    });
    expect(windows.length).toBe(2);
    const idleAt = (before.length + motion.length + 15) * dtUs;
    expect(windows.some((window) => idleAt >= window.startUs && idleAt < window.endUs)).toBe(false);
    const motionAt = (before.length + 4) * dtUs;
    expect(windows.some((window) => motionAt >= window.startUs && motionAt < window.endUs)).toBe(
      true,
    );
  });

  it('keeps a second moving person inside the active window', () => {
    const frames = movingBlob(10, dtUs);
    const series = activitySeries(frames);
    expect(series.some((sample) => sample.energy > 0)).toBe(true);
    const windows = activeWindows(series, 9 * dtUs, {
      ...STARTING_PARAMS.activity,
      energyThreshold: 0.001,
    });
    expect(windows.length).toBe(1);
  });

  it('processes the whole recording when almost all of it is active', () => {
    const samples = Array.from({ length: 11 }, (_, index) => ({
      tUs: index * 1_000_000,
      energy: 0.2,
    }));
    const windows = activeWindows(samples, 10_000_000, STARTING_PARAMS.activity);
    expect(windows).toEqual([{ startUs: 0, endUs: 10_000_000 }]);
  });

  it('recovers a whole-frame pan and warns; a local blob does not', () => {
    const pan = panningFrames(8, dtUs);
    const shifts = [];
    for (let i = 1; i < pan.length; i += 1) {
      const prev = pan[i - 1];
      const next = pan[i];
      if (!prev || !next) continue;
      shifts.push(globalMotion(prev.pixels, next.pixels, prev.width, prev.height));
    }
    expect(
      shifts.every(
        (shift) => shift.dx === 2 && shift.peak >= STARTING_PARAMS.activity.cameraMinPeak,
      ),
    ).toBe(true);
    expect(cameraMovingWarning(shifts, STARTING_PARAMS.activity)).toBe(true);

    const blob = movingBlob(8, dtUs);
    const local = [];
    for (let i = 1; i < blob.length; i += 1) {
      const prev = blob[i - 1];
      const next = blob[i];
      if (!prev || !next) continue;
      local.push(globalMotion(prev.pixels, next.pixels, prev.width, prev.height));
    }
    expect(cameraMovingWarning(local, STARTING_PARAMS.activity)).toBe(false);
  });

  it('recovers a pan on a 160×90 wall with a clear correlation peak', () => {
    for (const [dx, dy] of [
      [3, 1],
      [-4, 2],
      [6, -3],
    ] as const) {
      const [previous, next] = wallPan(2, dtUs, dx, dy);
      if (!previous || !next) throw new Error('expected frames');
      const shift = globalMotion(previous.pixels, next.pixels, previous.width, previous.height);
      expect({ dx: shift.dx, dy: shift.dy }).toEqual({ dx, dy });
      expect(shift.peak).toBeGreaterThan(0.9);
    }
  });

  it('merges padded windows that only touch', () => {
    const samples = [
      { tUs: 0, energy: 1 },
      { tUs: 6_000_000, energy: 1 },
    ];
    const windows = activeWindows(samples, 100_000_000, {
      ...STARTING_PARAMS.activity,
      energyThreshold: 0.5,
    });
    expect(windows).toEqual([{ startUs: 0, endUs: 9_000_000 }]);
  });

  it('phase correlation reports a rightward shift', () => {
    const width = 16;
    const height = 16;
    const previous = new Float32Array(width * height);
    const next = new Float32Array(width * height);
    previous[3 * width + 2] = 1;
    next[3 * width + 5] = 1;
    const shift = globalMotion(previous, next, width, height);
    expect(shift.dx).toBe(3);
    expect(shift.dy).toBe(0);
  });
});
