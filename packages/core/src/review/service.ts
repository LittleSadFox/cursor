import {
  ProblemError,
  type ActivityTrack,
  type PosePeople,
  type ReviewItemInput,
  type ReviewSave,
  type ReviewSaved,
  type ReviewState,
} from '@climbing-coach/api';
import { STARTING_PARAMS } from '@climbing-coach/engine';

import { getBoulder } from '../db/repos/boulders.js';
import {
  insertUserReviewItem,
  listRetiredReviewItems,
  listReviewItems,
  retireReviewItems,
  reviveReviewItems,
  updateReviewItem,
  type ReviewItemRow,
} from '../db/repos/review.js';
import { getVideo, updateVideo } from '../db/repos/videos.js';
import { inTransaction } from '../db/tx.js';
import type { IdGen } from '../ids/ulid.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { AppDatabase } from '../ports/sql.js';
import { jobActive, jobOf } from '../recordings/job-of.js';
import { loadActivityTrack } from './activity.js';
import { toReviewItem } from './items.js';
import { planReviewSave, type SavePlan } from './save-plan.js';
import { listDetectionTracks, selectDetectionTrack } from './tracks.js';

export type ReviewDeps = {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  events?: EventBus | undefined;
  blobs?: BlobStore | undefined;
};

function reviewStateOf(value: string): ReviewState['reviewState'] {
  return value === 'in_review' || value === 'done' ? value : 'unreviewed';
}

/** A newly picked boulder must exist; one picked earlier may since have gone to the trash. */
function assertBoulders(
  db: AppDatabase,
  items: readonly ReviewItemInput[],
  rows: readonly ReviewItemRow[],
): void {
  const stored = new Map(rows.map((row) => [row.id, row.boulderId]));
  const picked = new Set(
    items.flatMap((item) =>
      item.boulderId !== null && stored.get(item.id) !== item.boulderId ? [item.boulderId] : [],
    ),
  );
  for (const id of picked) {
    try {
      getBoulder(db, id);
    } catch {
      throw new ProblemError('VALIDATION_FAILED', `Unknown boulder ${id}.`);
    }
  }
}

/** Review draft load and autosave (BUILD_PLAN §3.2 `ReviewService`, minus commit). */
export function createReviewService(deps: ReviewDeps) {
  const { db, clock } = deps;

  function state(recordingId: string): ReviewState {
    const row = getVideo(db, recordingId);
    const job = jobOf(db, row.importJobId);
    const durationUs = row.durationUs ?? 0;
    return {
      recordingId,
      revision: row.reviewRevision,
      reviewState: reviewStateOf(row.reviewState),
      durationUs: row.durationUs,
      items: listReviewItems(db, recordingId).flatMap((item) => {
        const mapped = toReviewItem(item, durationUs);
        return mapped ? [mapped] : [];
      }),
      processing: {
        jobId: job?.id ?? null,
        jobStatus: job?.status ?? null,
        complete: !jobActive(job?.status),
        proxyReady: Boolean(row.proxyPath),
      },
    };
  }

  function apply(recordingId: string, plan: SavePlan): number {
    const now = clock.nowIso();
    return inTransaction(db, (tx) => {
      retireReviewItems(tx, plan.retireIds, now);
      reviveReviewItems(tx, plan.reviveIds, now);
      for (const { id, patch } of plan.updates) updateReviewItem(tx, id, patch, now);
      for (const insert of plan.inserts) insertUserReviewItem(tx, insert, now);
      const revision = getVideo(tx, recordingId).reviewRevision + 1;
      updateVideo(tx, recordingId, { reviewState: 'in_review', reviewRevision: revision }, now);
      return revision;
    });
  }

  return {
    async get(recordingId: string): Promise<ReviewState> {
      return state(recordingId);
    },
    async save(recordingId: string, input: ReviewSave): Promise<ReviewSaved> {
      const row = getVideo(db, recordingId);
      if (row.kind !== 'original') {
        throw new ProblemError('VALIDATION_FAILED', 'Only original recordings have a review.');
      }
      if (input.baseRevision !== row.reviewRevision) {
        throw new ProblemError(
          'REVIEW_REVISION_CONFLICT',
          `The review changed (revision ${row.reviewRevision}); reload and merge your edits.`,
        );
      }
      const existing = listReviewItems(db, recordingId);
      const retired = listRetiredReviewItems(db, recordingId);
      assertBoulders(db, input.items, [...retired, ...existing]);
      const plan = planReviewSave({
        videoId: recordingId,
        existing,
        retired,
        items: input.items,
        durationUs: row.durationUs,
        padding: STARTING_PARAMS.padding,
        newId: () => deps.ids.ulid(),
      });
      const revision = apply(recordingId, plan);
      deps.events?.publish({ type: 'review.updated', recordingId, revision });
      return { ...state(recordingId), idMap: plan.idMap };
    },
    activity(recordingId: string): Promise<ActivityTrack> {
      getVideo(db, recordingId);
      return loadActivityTrack(db, deps.blobs, recordingId);
    },
    tracks(recordingId: string): Promise<PosePeople> {
      return listDetectionTracks(deps, recordingId);
    },
    selectTrack(recordingId: string, input: { trackId: string }): Promise<PosePeople> {
      return selectDetectionTrack(deps, recordingId, input.trackId);
    },
  };
}
