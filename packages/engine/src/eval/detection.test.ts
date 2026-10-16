import { describe, expect, it } from 'vitest';

import { matchClimbRanges, scoreDetection } from './detection.js';

const opts = { toleranceUs: 500_000, maxMatchUs: 500_000, durationUs: 60_000_000 };

describe('matchClimbRanges', () => {
  it('does not match a prediction that neither overlaps nor is near the start', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 5_000_000 }];
    const predicted = [{ startUs: 600_000_000, endUs: 610_000_000 }];
    const score = scoreDetection(predicted, labeled, opts);
    expect(score.matchedCount).toBe(0);
    expect(score.recall).toBe(0);
    expect(score.falsePositives).toBe(1);
    expect(score.falsePositivesPerMinute).toBe(1);
  });

  it('does not count a touching but non-overlapping late start outside the match gate', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const predicted = [{ startUs: 2_000_000, endUs: 2_100_000 }];
    const score = scoreDetection(predicted, labeled, opts);
    expect(score.matchedCount).toBe(0);
    expect(score.falsePositives).toBe(1);
    expect(score.startWithinRate).toBe(0);
  });

  it('assigns the closer label even when an earlier label is listed first', () => {
    const labeled = [
      { startUs: 1_000_000, endUs: 2_000_000 },
      { startUs: 5_100_000, endUs: 6_000_000 },
    ];
    const predicted = [{ startUs: 5_000_000, endUs: 6_000_000 }];
    const matches = matchClimbRanges(predicted, labeled, opts.maxMatchUs);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.labeledIndex).toBe(1);
    const score = scoreDetection(predicted, labeled, opts);
    expect(score.startWithinCount).toBe(1);
    expect(score.recall).toBe(0.5);
  });

  it('counts extra predictions as false positives', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const predicted = [
      { startUs: 1_000_000, endUs: 2_000_000 },
      { startUs: 9_000_000, endUs: 9_500_000 },
    ];
    const score = scoreDetection(predicted, labeled, opts);
    expect(score.matchedCount).toBe(1);
    expect(score.falsePositives).toBe(1);
    expect(score.recall).toBe(1);
  });

  it('handles empty inputs', () => {
    const score = scoreDetection([], [], opts);
    expect(score.matchedCount).toBe(0);
    expect(score.falsePositives).toBe(0);
    expect(score.recall).toBe(0);
    expect(matchClimbRanges([], [{ startUs: 0, endUs: 1 }], opts.maxMatchUs)).toEqual([]);
  });

  it('scores a perfect overlap as full recall and within tolerance', () => {
    const labeled = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const predicted = [{ startUs: 1_000_000, endUs: 2_000_000 }];
    const score = scoreDetection(predicted, labeled, opts);
    expect(score.recall).toBe(1);
    expect(score.startWithinRate).toBe(1);
    expect(score.endWithinRate).toBe(1);
    expect(score.falsePositives).toBe(0);
  });
});
