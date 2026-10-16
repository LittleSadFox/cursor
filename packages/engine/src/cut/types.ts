import type { AttemptOutcome } from '@climbing-coach/schema';

import type { ClimbRange } from '../eval/ranges.js';

export type DraftSource = 'detector' | 'manual' | 'split' | 'merge';

/** Review item. Climb ranges are half-open `[startUs, endUs)`. */
export type DraftItem = {
  id: string;
  climb: ClimbRange;
  outcome: AttemptOutcome;
  touched: boolean;
  rejected: boolean;
  source: DraftSource;
  /**
   * Detector item ids this row descends from, through any number of splits and merges.
   * A detector row lists its own id. Empty for a manual add.
   */
  parentIds: readonly string[];
};

export type DerivedLabel =
  | { kind: 'rejected'; itemId: string }
  | { kind: 'manual'; itemId: string }
  | { kind: 'adjusted'; itemId: string; startDeltaUs: number; endDeltaUs: number }
  | { kind: 'split'; fromId: string; intoIds: readonly string[] }
  | { kind: 'merged'; fromIds: readonly string[]; intoId: string };
