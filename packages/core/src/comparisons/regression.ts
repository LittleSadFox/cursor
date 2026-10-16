import { listLabels } from '../db/repos/labels.js';
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

/** Local alignment regression set (BUILD_PLAN §7.5), oldest first. */
export function alignmentRegressionCases(db: AppDatabase): AlignmentRegressionCase[] {
  return listLabels(db, 'alignment_feedback').flatMap((label) => {
    const final = label.final ?? {};
    if (final.verdict !== 'misaligned') return [];
    return [
      {
        labelId: label.id,
        comparisonId: label.subjectId,
        attemptAId: text(final.attemptAId),
        attemptBId: text(final.attemptBId),
        poseTrackAId: text(final.poseTrackAId),
        poseTrackBId: text(final.poseTrackBId),
        moveIndexA: count(final.moveIndexA) ?? -1,
        predictedMoveIndexB: count(label.predicted?.moveIndexB),
        engineVersion: text(final.engineVersion),
      },
    ];
  });
}
