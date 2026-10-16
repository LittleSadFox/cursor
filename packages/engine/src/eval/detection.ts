import { rangesOverlap, type ClimbRange } from './ranges.js';

export type { ClimbRange };

export type BoundaryMatch = {
  labeledIndex: number;
  predictedIndex: number;
  startAbsErrorUs: number;
  endAbsErrorUs: number;
};

export type MatchOptions = {
  /** A pair may match when ranges overlap or |Δstart| is within this gate. */
  maxMatchUs: number;
  /** Boundary is "within tolerance" when |Δ| ≤ this value. Separate from the match gate. */
  toleranceUs: number;
};

type Candidate = {
  labeledIndex: number;
  predictedIndex: number;
  cost: number;
};

function isMatchCandidate(label: ClimbRange, pred: ClimbRange, maxMatchUs: number): boolean {
  if (rangesOverlap(label, pred)) return true;
  return Math.abs(pred.startUs - label.startUs) <= maxMatchUs;
}

function candidatePairs(
  predicted: readonly ClimbRange[],
  labeled: readonly ClimbRange[],
  maxMatchUs: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let li = 0; li < labeled.length; li++) {
    const label = labeled[li]!;
    for (let pi = 0; pi < predicted.length; pi++) {
      const pred = predicted[pi]!;
      if (!isMatchCandidate(label, pred, maxMatchUs)) continue;
      candidates.push({
        labeledIndex: li,
        predictedIndex: pi,
        cost: Math.abs(pred.startUs - label.startUs),
      });
    }
  }
  candidates.sort(
    (a, b) => a.cost - b.cost || a.labeledIndex - b.labeledIndex || a.predictedIndex - b.predictedIndex,
  );
  return candidates;
}

/**
 * 1:1 assignment of predictions to labels.
 * A pair is eligible only when the ranges overlap or |Δstart| ≤ `maxMatchUs`.
 * Eligible pairs are taken greedily by ascending |Δstart| so label order cannot steal a closer match.
 */
export function matchClimbRanges(
  predicted: readonly ClimbRange[],
  labeled: readonly ClimbRange[],
  maxMatchUs: number,
): BoundaryMatch[] {
  const usedLabels = new Set<number>();
  const usedPreds = new Set<number>();
  const matches: BoundaryMatch[] = [];

  for (const candidate of candidatePairs(predicted, labeled, maxMatchUs)) {
    if (usedLabels.has(candidate.labeledIndex) || usedPreds.has(candidate.predictedIndex)) {
      continue;
    }
    usedLabels.add(candidate.labeledIndex);
    usedPreds.add(candidate.predictedIndex);
    const label = labeled[candidate.labeledIndex]!;
    const pred = predicted[candidate.predictedIndex]!;
    matches.push({
      labeledIndex: candidate.labeledIndex,
      predictedIndex: candidate.predictedIndex,
      startAbsErrorUs: Math.abs(pred.startUs - label.startUs),
      endAbsErrorUs: Math.abs(pred.endUs - label.endUs),
    });
  }
  return matches;
}

export type DetectionScore = {
  labeledCount: number;
  predictedCount: number;
  matchedCount: number;
  falsePositives: number;
  /** Unmatched predictions per minute of `durationUs`. NaN when duration is missing or zero. */
  falsePositivesPerMinute: number;
  startWithinCount: number;
  endWithinCount: number;
  recall: number;
  startWithinRate: number;
  endWithinRate: number;
  startErrorsUs: number[];
  endErrorsUs: number[];
};

export function falsePositivesPerMinute(falsePositives: number, durationUs: number): number {
  if (!Number.isFinite(durationUs) || durationUs <= 0) return Number.NaN;
  return falsePositives / (durationUs / 60_000_000);
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function scoreDetection(
  predicted: readonly ClimbRange[],
  labeled: readonly ClimbRange[],
  options: MatchOptions & { durationUs?: number },
): DetectionScore {
  const matches = matchClimbRanges(predicted, labeled, options.maxMatchUs);
  const startWithinCount = matches.filter((m) => m.startAbsErrorUs <= options.toleranceUs).length;
  const endWithinCount = matches.filter((m) => m.endAbsErrorUs <= options.toleranceUs).length;
  const falsePositives = predicted.length - matches.length;
  return {
    labeledCount: labeled.length,
    predictedCount: predicted.length,
    matchedCount: matches.length,
    falsePositives,
    falsePositivesPerMinute: falsePositivesPerMinute(falsePositives, options.durationUs ?? Number.NaN),
    startWithinCount,
    endWithinCount,
    recall: rate(matches.length, labeled.length),
    startWithinRate: rate(startWithinCount, labeled.length),
    endWithinRate: rate(endWithinCount, labeled.length),
    startErrorsUs: matches.map((m) => m.startAbsErrorUs),
    endErrorsUs: matches.map((m) => m.endAbsErrorUs),
  };
}
