import { describe, expect, it } from 'vitest';

import type { AttemptDetection } from '@climbing-coach/engine';

import type { ReviewItemRow } from '../db/repos/review.js';
import { planDetectorUpdate } from './review-plan.js';

function attempt(startUs: number, endUs: number): AttemptDetection {
  return { startUs, endUs, outcome: 'fall', exitDirection: 'none', startConfidence: 'high' };
}

function row(
  id: string,
  startUs: number,
  endUs: number,
  extra: Partial<ReviewItemRow> = {},
): ReviewItemRow {
  return {
    id,
    videoId: 'video',
    origin: 'detector',
    parentIds: [id],
    outcome: 'fall',
    climbStartUs: startUs,
    climbEndUs: endUs,
    prePadUs: 0,
    postPadUs: 0,
    confidence: null,
    status: 'draft',
    touched: false,
    ...extra,
  };
}

describe('planDetectorUpdate', () => {
  it('inserts every detection on a fresh recording', () => {
    const plan = planDetectorUpdate([], [attempt(0, 1_000), attempt(2_000, 3_000)], ['a', 'b']);
    expect(plan.retireIds).toEqual([]);
    expect(plan.insert.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('is a no-op when detection repeats the stored drafts', () => {
    const plan = planDetectorUpdate([row('old', 0, 1_000)], [attempt(0, 1_000)], ['new']);
    expect(plan).toEqual({ retireIds: [], insert: [] });
  });

  it('replaces an untouched draft whose range moved', () => {
    const plan = planDetectorUpdate([row('old', 0, 1_000)], [attempt(100, 1_200)], ['new']);
    expect(plan.retireIds).toEqual(['old']);
    expect(plan.insert.map((item) => item.id)).toEqual(['new']);
  });

  it('keeps touched, rejected, and committed rows and drops detections over them', () => {
    const plan = planDetectorUpdate(
      [
        row('touched', 0, 1_000, { touched: true }),
        row('committed', 2_000, 3_000, { status: 'committed' }),
        row('rejected', 4_000, 5_000, { status: 'rejected' }),
      ],
      [attempt(100, 900), attempt(2_100, 2_900), attempt(4_100, 4_900), attempt(6_000, 7_000)],
      ['n1', 'n2', 'n3', 'n4'],
    );
    expect(plan.retireIds).toEqual([]);
    expect(plan.insert.map((item) => item.id)).toEqual(['n4']);
  });
});
