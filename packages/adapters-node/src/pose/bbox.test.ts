import { describe, expect, it } from 'vitest';

import { bboxIoU, nms } from './bbox.js';

describe('bbox helpers', () => {
  it('computes IoU for overlapping boxes', () => {
    const a = { x1: 0, y1: 0, x2: 10, y2: 10, score: 1 };
    const b = { x1: 5, y1: 5, x2: 15, y2: 15, score: 1 };
    expect(bboxIoU(a, b)).toBeCloseTo(25 / 175);
  });

  it('suppresses overlapping lower-score boxes', () => {
    const kept = nms(
      [
        { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.9 },
        { x1: 1, y1: 1, x2: 11, y2: 11, score: 0.5 },
        { x1: 40, y1: 40, x2: 50, y2: 50, score: 0.8 },
      ],
      0.3,
    );
    expect(kept.map((box) => box.score)).toEqual([0.9, 0.8]);
  });
});
