import type { Recording, ReviewItem } from '@climbing-coach/api';

import { jobBusy } from './recordings-format.js';

/** Rejected proposals stay stored for label derivation but are not offered for cutting. */
export function visibleProposals(items: readonly ReviewItem[]): ReviewItem[] {
  return items.filter((item) => item.status !== 'rejected');
}

export type ProposalNotice =
  'recordings.proposalsWait' | 'recordings.proposalsEmpty' | 'recordings.proposalsPose' | null;

/** Which status line explains an empty list; null once proposals are showing. */
export function proposalNotice(
  recording: Pick<Recording, 'jobStatus' | 'hasPose'>,
  count: number,
): ProposalNotice {
  if (count > 0) return null;
  if (jobBusy(recording.jobStatus)) return 'recordings.proposalsWait';
  return recording.hasPose ? 'recordings.proposalsEmpty' : 'recordings.proposalsPose';
}
