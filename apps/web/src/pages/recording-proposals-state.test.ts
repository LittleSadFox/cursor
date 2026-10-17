import { describe, expect, it } from 'vitest';

import type { ReviewItem } from '@climbing-coach/api';

import { proposalNotice, visibleProposals } from './recording-proposals-state.js';

function item(status: ReviewItem['status']): ReviewItem {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    origin: 'detector',
    parentIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    climb: { startUs: 0, endUs: 1 },
    padding: { preUs: 0, postUs: 0 },
    clip: { startUs: 0, endUs: 1 },
    outcome: 'fall',
    confidence: null,
    touched: false,
    status,
  };
}

describe('recording proposals state', () => {
  it('hides rejected proposals', () => {
    expect(visibleProposals([item('draft'), item('rejected'), item('committed')])).toHaveLength(2);
  });

  it('explains an empty list by job and pose state', () => {
    expect(proposalNotice({ jobStatus: 'running', hasPose: false }, 0)).toBe(
      'recordings.proposalsWait',
    );
    expect(proposalNotice({ jobStatus: 'succeeded', hasPose: true }, 0)).toBe(
      'recordings.proposalsEmpty',
    );
    expect(proposalNotice({ jobStatus: 'succeeded', hasPose: false }, 0)).toBe(
      'recordings.proposalsPose',
    );
    expect(proposalNotice({ jobStatus: 'running', hasPose: true }, 2)).toBeNull();
  });
});
