import { ProblemError, type PosePeople } from '@climbing-coach/api';
import { PARAMS_VERSION, STARTING_PARAMS } from '@climbing-coach/engine';
import { readPosebin, writePosebin, type PoseTrack } from '@climbing-coach/schema';

import { findPoseTrack } from '../db/repos/attempts.js';
import { insertReviewItem, listReviewItems, retireReviewItems } from '../db/repos/review.js';
import { getVideo, updateVideo } from '../db/repos/videos.js';
import { inTransaction } from '../db/tx.js';
import { detectFromPoseTrack } from '../ingest/proposals.js';
import { planDetectorUpdate, type DetectorPlan } from '../ingest/review-plan.js';
import type { IdGen } from '../ids/ulid.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { AppDatabase } from '../ports/sql.js';
import { jobActive, jobOf } from '../recordings/job-of.js';
import { peopleOf, withSelected } from './people.js';

export type TrackDeps = {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  blobs?: BlobStore | undefined;
  events?: EventBus | undefined;
};

/** People in the detection posebin. Empty when pose has not run. */
export async function listDetectionTracks(
  deps: TrackDeps,
  recordingId: string,
): Promise<PosePeople> {
  getVideo(deps.db, recordingId);
  const track = await readDetection(deps, recordingId);
  return { tracks: track ? peopleOf(track) : [] };
}

/**
 * Marks `trackId` as the climber and re-runs detection on that person.
 * Touched, rejected, and committed climbs stay (engine `mergeDetectorUpdate`).
 */
export async function selectDetectionTrack(
  deps: TrackDeps,
  recordingId: string,
  trackId: string,
): Promise<PosePeople> {
  const video = getVideo(deps.db, recordingId);
  if (jobActive(jobOf(deps.db, video.importJobId)?.status)) {
    throw new ProblemError('VALIDATION_FAILED', 'This recording is still processing.');
  }
  const stored = findPoseTrack(deps.db, recordingId, 'detection');
  if (!deps.blobs || !stored) throw new ProblemError('NOT_FOUND', 'No detection pose track.');
  const track = readPosebin(await deps.blobs.read(stored.path));
  if (!track.header.tracks.some((ref) => ref.trackId === trackId)) {
    throw new ProblemError('VALIDATION_FAILED', `Unknown climber track ${trackId}.`);
  }
  const next = withSelected(track, trackId);
  if (next !== track) await deps.blobs.write(stored.path, writePosebin(next));
  const attempts = detectFromPoseTrack(next);
  const plan = planDetectorUpdate(
    listReviewItems(deps.db, recordingId),
    attempts,
    attempts.map(() => deps.ids.ulid()),
  );
  if (plan.insert.length > 0 || plan.retireIds.length > 0) {
    const revision = applyPlan(deps, recordingId, plan);
    deps.events?.publish({ type: 'review.updated', recordingId, revision });
  }
  return { tracks: peopleOf(next) };
}

async function readDetection(deps: TrackDeps, recordingId: string): Promise<PoseTrack | null> {
  if (!deps.blobs) return null;
  const stored = findPoseTrack(deps.db, recordingId, 'detection');
  if (!stored) return null;
  try {
    return readPosebin(await deps.blobs.read(stored.path));
  } catch {
    return null;
  }
}

function applyPlan(deps: TrackDeps, videoId: string, plan: DetectorPlan): number {
  const now = deps.clock.nowIso();
  return inTransaction(deps.db, (tx) => {
    retireReviewItems(tx, plan.retireIds, now);
    for (const item of plan.insert) {
      insertReviewItem(
        tx,
        {
          id: item.id,
          videoId,
          outcome: item.outcome,
          climbStartUs: item.climb.startUs,
          climbEndUs: item.climb.endUs,
          prePadUs: STARTING_PARAMS.padding.preUs,
          postPadUs: STARTING_PARAMS.padding.postUs,
          confidence: null,
          detectorVersion: PARAMS_VERSION,
          parentIds: item.parentIds,
        },
        now,
      );
    }
    const revision = getVideo(tx, videoId).reviewRevision + 1;
    updateVideo(tx, videoId, { reviewState: 'in_review', reviewRevision: revision }, now);
    return revision;
  });
}
