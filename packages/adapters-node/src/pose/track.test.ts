import { describe, expect, it } from 'vitest';

import { associateDetections, shouldRunDetector } from './track.js';

describe('pose tracking helpers', () => {
  it('reuses detector on an interval', () => {
    expect(shouldRunDetector(0, 5)).toBe(true);
    expect(shouldRunDetector(1, 5)).toBe(false);
    expect(shouldRunDetector(5, 5)).toBe(true);
  });

  it('associates detections by IoU and spawns new tracks', () => {
    const tracks = [
      { trackIndex: 0, box: { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.9 }, missed: 0 },
    ];
    const detections = [
      { x1: 1, y1: 1, x2: 11, y2: 11, score: 0.8 },
      { x1: 50, y1: 50, x2: 70, y2: 90, score: 0.7 },
    ];
    const next = associateDetections(tracks, detections, {
      iouThreshold: 0.3,
      maxPersons: 2,
      maxMissed: 3,
    });
    expect(next).toHaveLength(2);
    expect(next[0]?.trackIndex).toBe(0);
    expect(next[1]?.trackIndex).toBe(1);
  });
});
