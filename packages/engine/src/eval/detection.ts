export type ClimbRange = {
  startUs: number;
  endUs: number;
};

export type BoundaryMatch = {
  labeledIndex: number;
  predictedIndex: number;
  startAbsErrorUs: number;
  endAbsErrorUs: number;
  startWithin: boolean;
  endWithin: boolean;
};

/**
 * Greedy 1:1 match of predicted climbs to labeled climbs by start-time proximity.
 */
export function matchClimbRanges(
  predicted: readonly ClimbRange[],
  labeled: readonly ClimbRange[],
  toleranceUs: number,
): BoundaryMatch[] {
  const usedPred = new Set<number>();
  const matches: BoundaryMatch[] = [];

  for (let li = 0; li < labeled.length; li++) {
    const label = labeled[li]!;
    let bestPi = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let pi = 0; pi < predicted.length; pi++) {
      if (usedPred.has(pi)) continue;
      const dist = Math.abs(predicted[pi]!.startUs - label.startUs);
      if (dist < bestDist) {
        bestDist = dist;
        bestPi = pi;
      }
    }
    if (bestPi < 0) continue;
    usedPred.add(bestPi);
    const pred = predicted[bestPi]!;
    const startAbsErrorUs = Math.abs(pred.startUs - label.startUs);
    const endAbsErrorUs = Math.abs(pred.endUs - label.endUs);
    matches.push({
      labeledIndex: li,
      predictedIndex: bestPi,
      startAbsErrorUs,
      endAbsErrorUs,
      startWithin: startAbsErrorUs <= toleranceUs,
      endWithin: endAbsErrorUs <= toleranceUs,
    });
  }
  return matches;
}

export type DetectionScore = {
  labeledCount: number;
  predictedCount: number;
  matchedCount: number;
  startWithinCount: number;
  endWithinCount: number;
  recall: number;
  startWithinRate: number;
  endWithinRate: number;
  startErrorsUs: number[];
  endErrorsUs: number[];
};

export function scoreDetection(
  predicted: readonly ClimbRange[],
  labeled: readonly ClimbRange[],
  toleranceUs: number,
): DetectionScore {
  const matches = matchClimbRanges(predicted, labeled, toleranceUs);
  const startWithinCount = matches.filter((m) => m.startWithin).length;
  const endWithinCount = matches.filter((m) => m.endWithin).length;
  const labeledCount = labeled.length;
  return {
    labeledCount,
    predictedCount: predicted.length,
    matchedCount: matches.length,
    startWithinCount,
    endWithinCount,
    recall: labeledCount === 0 ? 0 : matches.length / labeledCount,
    startWithinRate: labeledCount === 0 ? 0 : startWithinCount / labeledCount,
    endWithinRate: labeledCount === 0 ? 0 : endWithinCount / labeledCount,
    startErrorsUs: matches.map((m) => m.startAbsErrorUs),
    endErrorsUs: matches.map((m) => m.endAbsErrorUs),
  };
}
