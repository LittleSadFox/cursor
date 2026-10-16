import { describe, expect, it } from 'vitest';

import { needsSeek, syncMedia, type MediaLike } from './drift.js';

const FRAME_US = 33_333;

function media(currentTime: number, paused = true): MediaLike & { plays: number } {
  return {
    currentTime,
    playbackRate: 1,
    paused,
    plays: 0,
    play() {
      this.plays += 1;
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
}

describe('needsSeek', () => {
  it('seeks only when drift exceeds one frame', () => {
    expect(needsSeek(1_000_000, 1_020_000, FRAME_US)).toBe(false);
    expect(needsSeek(1_000_000, 1_040_000, FRAME_US)).toBe(true);
  });
});

describe('syncMedia', () => {
  it('hard-seeks a drifted player and plays at the path rate', () => {
    const player = media(1);
    expect(syncMedia(player, { timeUs: 2_000_000, rate: 0.5, playing: true }, FRAME_US)).toBe(true);
    expect(player.currentTime).toBe(2);
    expect(player.playbackRate).toBe(0.5);
    expect(player.plays).toBe(1);
  });

  it('leaves a player within a frame alone', () => {
    const player = media(1.01, false);
    expect(syncMedia(player, { timeUs: 1_000_000, rate: 1, playing: true }, FRAME_US)).toBe(false);
    expect(player.currentTime).toBe(1.01);
    expect(player.plays).toBe(0);
  });

  it('pauses a side that holds on its frame', () => {
    const player = media(1, false);
    syncMedia(player, { timeUs: 1_000_000, rate: 0, playing: true }, FRAME_US);
    expect(player.paused).toBe(true);
  });
});
