import { listLabels, type LabelRecord } from '../db/repos/labels.js';
import type { AppDatabase } from '../ports/sql.js';

/** One "misaligned" flag: the pose tracks (no video) and the move pair the user rejected. */
export type AlignmentRegressionCase = {
  labelId: string;
  comparisonId: string;
  attemptAId: string;
  attemptBId: string;
  poseTrackAId: string;
  poseTrackBId: string;
  moveIndexA: number;
  predictedMoveIndexB: number | null;
  engineVersion: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** The newest verdict per comparison move: a later "aligned" withdraws an earlier "misaligned". */
export function latestVerdicts(labels: readonly LabelRecord[]): LabelRecord[] {
  const latest = new Map<string, LabelRecord>();
  for (const label of labels) {
    const key = `${label.subjectId}:${String(label.final?.moveIndexA)}`;
    latest.delete(key);
    latest.set(key, label);
  }
  return [...latest.values()];
}

function regressionCase(label: LabelRecord): AlignmentRegressionCase {
  const final = label.final ?? {};
  return {
    labelId: label.id,
    comparisonId: label.subjectId,
    attemptAId: text(final.attemptAId),
    attemptBId: text(final.attemptBId),
    poseTrackAId: text(final.poseTrackAId),
    poseTrackBId: text(final.poseTrackBId),
    moveIndexA: count(final.moveIndexA) ?? -1,
    predictedMoveIndexB: count(label.predicted?.moveIndexB),
    engineVersion: text(final.engineVersion),
  };
}

/** Local alignment regression set (BUILD_PLAN §7.5), in the order the verdicts were given. */
export function alignmentRegressionCases(db: AppDatabase): AlignmentRegressionCase[] {
  return latestVerdicts(listLabels(db, 'alignment_feedback'))
    .filter((label) => label.final?.verdict === 'misaligned')
    .map(regressionCase);
}
