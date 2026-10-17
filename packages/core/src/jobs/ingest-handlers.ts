import { PARAMS_VERSION, STARTING_PARAMS, type DraftItem } from '@climbing-coach/engine';
import { readPosebin, us, writePosebin, type SignalsFile } from '@climbing-coach/schema';

import { findPoseTrack, insertPoseTrack } from '../db/repos/attempts.js';
import { insertReviewItem, listReviewItems, retireReviewItems } from '../db/repos/review.js';
import { getVideo, updateVideo } from '../db/repos/videos.js';
import { inTransaction } from '../db/tx.js';
import type { IdGen } from '../ids/ulid.js';
import {
  ACTIVITY_MAX_SIDE,
  needsDenseActivitySample,
  runActivityPass,
} from '../ingest/activity.js';
import { detectFromPoseTrack } from '../ingest/proposals.js';
import { planDetectorUpdate, type DetectorPlan } from '../ingest/review-plan.js';
import { quarterTurn } from '../ingest/rotation.js';
import { readSignals, writeSignals } from '../ingest/signals-store.js';
import { setCameraMovingWarning } from '../ingest/warnings.js';
import { detectionWindows } from '../ingest/windows.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { PoseExtractor } from '../ports/pose.js';
import type { AppDatabase } from '../ports/sql.js';
import type { VideoTools } from '../ports/video.js';
import { videoIdOf } from './job-payload.js';
import type { StepHandler } from './types.js';

const DETECTION_FPS = STARTING_PARAMS.pose.detectionFps;
const DETECTION_MAX_SIDE = 640;

export type IngestHandlerDeps = {
  db: AppDatabase;
  clock: Clock;
  video: VideoTools;
  files: MediaFiles;
  pose?: PoseExtractor | undefined;
  blobs?: BlobStore | undefined;
  ids?: IdGen | undefined;
  events?: EventBus | undefined;
};

/**
 * `activity → pose-detection → propose` of the import DAG (BUILD_PLAN §3.3). Each step
 * hands off through the library (signals JSON, posebin, review rows), so a restart resumes
 * from whatever the previous step stored.
 */
export function ingestHandlers(deps: IngestHandlerDeps): Record<string, StepHandler> {
  const { db, clock, video, files } = deps;

  /** Keyframes first; a 2 fps decode only when they turn out to be more than 2 s apart. */
  async function scanActivity(
    path: string,
    videoId: string,
    durationUs: number,
    signal?: AbortSignal,
  ): Promise<{ file: SignalsFile; dense: boolean }> {
    const abort = signal ? { signal } : {};
    const keyed = await runActivityPass(
      video.keyframes(path, { maxSide: ACTIVITY_MAX_SIDE, ...abort }),
      signal,
    );
    if (!needsDenseActivitySample(keyed.times(), durationUs)) {
      return { file: keyed.signals(videoId, durationUs), dense: false };
    }
    const dense = await runActivityPass(
      video.frames(path, {
        windows: [{ startUs: us(0), endUs: us(durationUs) }],
        sampleFps: STARTING_PARAMS.activity.sampleFps,
        maxSide: ACTIVITY_MAX_SIDE,
        toSdr: true,
        ...abort,
      }),
      signal,
    );
    return { file: dense.signals(videoId, durationUs), dense: true };
  }

  const activity: StepHandler = async ({ job, signal }) => {
    if (!deps.blobs) return { skipped: true, reason: 'blob store unavailable' };
    const id = videoIdOf(job);
    const row = getVideo(db, id);
    const { file, dense } = await scanActivity(
      files.absolute(row.path),
      id,
      row.durationUs ?? 0,
      signal,
    );
    await writeSignals(deps.blobs, file);
    const moving = file.warnings.includes('camera_moving');
    updateVideo(
      db,
      id,
      { warningsJson: setCameraMovingWarning(row.warningsJson, moving) },
      clock.nowIso(),
    );
    return { windows: file.activeWindows.length, samples: file.samples.length, dense };
  };

  const poseDetection: StepHandler = async ({ job, signal }) => {
    const { pose, blobs, ids } = deps;
    if (!pose?.ready() || !blobs || !ids) {
      return { skipped: true, reason: 'pose runtime unavailable' };
    }
    const id = videoIdOf(job);
    const row = getVideo(db, id);
    const windows = detectionWindows(await readSignals(blobs, id), row.durationUs ?? 0);
    const abort = signal ? { signal } : {};
    const summary = await pose.extract(
      video.frames(files.absolute(row.path), {
        windows,
        sampleFps: DETECTION_FPS,
        maxSide: DETECTION_MAX_SIDE,
        toSdr: true,
        ...abort,
      }),
      {
        videoId: id,
        kind: 'detection',
        sampleFps: DETECTION_FPS,
        displayWidth: row.displayWidth ?? 1,
        displayHeight: row.displayHeight ?? 1,
        rotation: quarterTurn(row.rotation),
        windows,
        maxPersons: 2,
        ...abort,
        nextTrackId: () => ids.ulid(),
      },
    );
    const poseTrackId = ids.ulid();
    const path = `pose/${id}.${poseTrackId}.detection.posebin`;
    await blobs.write(path, writePosebin(summary.track));
    insertPoseTrack(
      db,
      {
        id: poseTrackId,
        videoId: id,
        kind: 'detection',
        runtime: summary.track.header.runtime,
        model: summary.track.header.model,
        modelVersion: summary.track.header.modelVersion ?? '1',
        sampleFps: DETECTION_FPS,
        path,
        windowsJson: JSON.stringify(summary.track.header.windows),
      },
      clock.nowIso(),
    );
    return { poseTrackId, framesProcessed: summary.framesProcessed, persons: summary.persons };
  };

  function insertDraft(tx: AppDatabase, videoId: string, item: DraftItem, now: string): void {
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

  /** One transaction: retire replaced rows, insert new ones, bump the review revision. */
  function applyPlan(videoId: string, plan: DetectorPlan): number {
    const now = clock.nowIso();
    return inTransaction(db, (tx) => {
      retireReviewItems(tx, plan.retireIds, now);
      for (const item of plan.insert) insertDraft(tx, videoId, item, now);
      const revision = getVideo(tx, videoId).reviewRevision + 1;
      updateVideo(tx, videoId, { reviewState: 'in_review', reviewRevision: revision }, now);
      return revision;
    });
  }

  const propose: StepHandler = async ({ job }) => {
    const { blobs, ids } = deps;
    if (!blobs || !ids) return { skipped: true, reason: 'pose runtime unavailable' };
    const id = videoIdOf(job);
    const track = findPoseTrack(db, id, 'detection');
    if (!track) return { skipped: true, reason: 'no pose track' };
    const attempts = detectFromPoseTrack(readPosebin(await blobs.read(track.path)));
    const plan = planDetectorUpdate(
      listReviewItems(db, id),
      attempts,
      attempts.map(() => ids.ulid()),
    );
    if (plan.insert.length === 0 && plan.retireIds.length === 0) {
      return { proposed: 0, retired: 0 };
    }
    const revision = applyPlan(id, plan);
    deps.events?.publish({ type: 'review.updated', recordingId: id, revision });
    return { proposed: plan.insert.length, retired: plan.retireIds.length };
  };

  return {
    'import-recording.activity': activity,
    'import-recording.pose-detection': poseDetection,
    'import-recording.propose': propose,
  };
}
