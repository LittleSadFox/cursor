import { describe, expect, it } from 'vitest';

import { advanceClock, seekClock, startClock } from './clock.js';

describe('playback clock', () => {
  it('advances by wall time while playing and stops at the end', () => {
    expect(advanceClock({ position: 0, playing: true }, 16, 1_000_000)).toEqual({
      position: 16_000,
      playing: true,
    });
    expect(advanceClock({ position: 990_000, playing: true }, 16, 1_000_000)).toEqual({
      position: 1_000_000,
      playing: false,
    });
  });

  it('does not move while paused', () => {
    const paused = { position: 5, playing: false };
    expect(advanceClock(paused, 100, 1_000_000)).toBe(paused);
  });

  it('restarts from zero when started at the end', () => {
    expect(startClock({ position: 1_000_000, playing: false }, 1_000_000)).toEqual({
      position: 0,
      playing: true,
    });
    expect(startClock({ position: 0, playing: false }, 0).playing).toBe(false);
  });

  it('clamps seeks into the timeline', () => {
    expect(seekClock({ position: 0, playing: true }, -5, 100).position).toBe(0);
    expect(seekClock({ position: 0, playing: true }, 500, 100).position).toBe(100);
  });
});
