import { describe, expect, it } from 'vitest';

import { scoreDetection } from './detection.js';

describe('scoreDetection', () => {
  it('scores perfect overlap as full recall and within-tolerance', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const predicted = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const score = scoreDetection(predicted, labeled, 500_000);
    expect(score.recall).toBe(1);
    expect(score.startWithinRate).toBe(1);
    expect(score.endWithinRate).toBe(1);
  });

  it('counts a late start outside tolerance', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const predicted = [{ startUs: 2_000_000, endUs: 2_100_000 }];
    const score = scoreDetection(predicted, labeled, 500_000);
    expect(score.matchedCount).toBe(1);
    expect(score.startWithinRate).toBe(0);
  });
});
