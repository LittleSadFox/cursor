import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  formatFps,
  formatResolution,
  hashSettled,
  secondsToUs,
} from './recordings-format.js';

describe('recording display', () => {
  it('formats probe fields', () => {
    expect(formatDuration(65_430_000)).toBe('1:05.43');
    expect(formatFps(29.970029)).toBe('29.97');
    expect(formatFps(30)).toBe('30');
    expect(formatResolution(1080, 1920)).toBe('1080×1920');
    expect(formatResolution(null, 1920)).toBe('—');
  });

  it('treats a finished job without a digest as settled', () => {
    expect(hashSettled('succeeded')).toBe(true);
    expect(hashSettled('running')).toBe(false);
    expect(hashSettled(null)).toBe(false);
  });

  it('converts seconds to integer microseconds', () => {
    expect(secondsToUs(1.5)).toBe(1_500_000);
    expect(secondsToUs(-1)).toBeNull();
  });
});
