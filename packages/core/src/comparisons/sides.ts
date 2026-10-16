import { ProblemError, type ComparisonSide } from '@climbing-coach/api';

import {
  findPoseTrack,
  getAttemptRecord,
  poseModelOf,
  type PoseTrackRecord,
} from '../db/repos/attempts.js';
import type { AppDatabase } from '../ports/sql.js';

export type ResolvedSide = { side: ComparisonSide; track: PoseTrackRecord };

/** Attempt plus the HQ pose track on its clip (BUILD_PLAN `compare` → `load-tracks`). */
export function resolveSide(db: AppDatabase, attemptId: string): ResolvedSide {
  const attempt = getAttemptRecord(db, attemptId);
  const track = findPoseTrack(db, attempt.clipVideoId, 'hq');
  if (!track) {
    throw new ProblemError(
      'VALIDATION_FAILED',
      `attempt ${attemptId} has no HQ pose track yet (pose-hq runs after commit)`,
    );
  }
  return {
    track,
    side: {
      attemptId: attempt.id,
      clipVideoId: attempt.clipVideoId,
      poseTrackId: track.id,
      climbStartUs: attempt.climbStartUs,
      climbEndUs: attempt.climbEndUs,
      outcome: attempt.outcome,
    },
  };
}

/** Both sides must come from the same pose model; otherwise 409 with a re-extraction hint. */
export function sharedPoseModel(a: ResolvedSide, b: ResolvedSide): string {
  const modelA = poseModelOf(a.track);
  const modelB = poseModelOf(b.track);
  if (modelA !== modelB) {
    throw new ProblemError(
      'POSE_MODEL_MISMATCH',
      `attempt ${a.side.attemptId} uses ${modelA} but ${b.side.attemptId} uses ${modelB}; re-extract one of them with the same pose model`,
    );
  }
  return modelA;
}
