import { describe, expect, it } from 'vitest';

import { countRunning, defaultLimits, hasCapacity } from './resources.js';

describe('job resources', () => {
  it('caps pose at 1 and compute at cores-1', () => {
    expect(defaultLimits(8)).toEqual({ pose: 1, ffmpeg: 2, compute: 7, idle: 1 });
  });

  it('holds idle until other classes drain', () => {
    const limits = defaultLimits(4);
    const running = countRunning(['compute']);
    expect(hasCapacity(limits, running, 'idle', true)).toBe(false);
    expect(hasCapacity(limits, { pose: 0, ffmpeg: 0, compute: 0, idle: 0 }, 'idle', false)).toBe(true);
  });
});
