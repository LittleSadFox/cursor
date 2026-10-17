import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { ProblemError } from '@climbing-coach/api';
import type { MoveSegment } from '@climbing-coach/engine';

import type { AppDatabase } from '../../ports/sql.js';
import { attempts, moveSegments, poseTracks } from '../schema.js';

export type AttemptRecord = {
  id: string;
  clipVideoId: string;
  climbStartUs: number;
  climbEndUs: number;
  outcome: string;
};

export type PoseTrackRecord = {
  id: string;
  videoId: string;
  kind: string;
  model: string;
  modelVersion: string;
  path: string;
};

const POSE_TRACK_COLUMNS = {
  id: poseTracks.id,
  videoId: poseTracks.videoId,
  kind: poseTracks.kind,
  model: poseTracks.model,
  modelVersion: poseTracks.modelVersion,
  path: poseTracks.path,
};

export function getAttemptRecord(db: AppDatabase, id: string): AttemptRecord {
  const row = db
    .select({
      id: attempts.id,
      clipVideoId: attempts.clipVideoId,
      climbStartUs: attempts.climbStartUs,
      climbEndUs: attempts.climbEndUs,
      outcome: attempts.outcome,
    })
    .from(attempts)
    .where(and(eq(attempts.id, id), isNull(attempts.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `attempt ${id} not found`);
  return row;
}

/** Newest live pose track of `kind` for a video, or null. */
export function findPoseTrack(
  db: AppDatabase,
  videoId: string,
  kind: string,
): PoseTrackRecord | null {
  const row = db
    .select(POSE_TRACK_COLUMNS)
    .from(poseTracks)
    .where(
      and(eq(poseTracks.videoId, videoId), eq(poseTracks.kind, kind), isNull(poseTracks.deletedAt)),
    )
    .orderBy(desc(poseTracks.id))
    .limit(1)
    .get();
  return row ?? null;
}

/** `model@version`: comparisons need both attempts extracted with the same one. */
export function poseModelOf(track: PoseTrackRecord): string {
  return `${track.model}@${track.modelVersion}`;
}

/** Stored move segments of an attempt, in move order. Empty until P2-B writes them. */
export function listMoveSegments(db: AppDatabase, attemptId: string): MoveSegment[] {
  return db
    .select({
      index: moveSegments.index,
      limb: moveSegments.limb,
      startUs: moveSegments.startUs,
      endUs: moveSegments.endUs,
    })
    .from(moveSegments)
    .where(and(eq(moveSegments.attemptId, attemptId), isNull(moveSegments.deletedAt)))
    .orderBy(asc(moveSegments.index))
    .all()
    .map((row) => ({ ...row, limb: row.limb as MoveSegment['limb'] }));
}

export function getPoseTrackRecord(db: AppDatabase, id: string): PoseTrackRecord {
  const row = db
    .select(POSE_TRACK_COLUMNS)
    .from(poseTracks)
    .where(and(eq(poseTracks.id, id), isNull(poseTracks.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `pose track ${id} not found`);
  return row;
}

export type InsertPoseTrackInput = {
  id: string;
  videoId: string;
  kind: string;
  runtime: string;
  model: string;
  modelVersion: string;
  sampleFps: number;
  path: string;
  windowsJson?: string;
};

export function insertPoseTrack(
  db: AppDatabase,
  input: InsertPoseTrackInput,
  nowIso: string,
): void {
  db.insert(poseTracks)
    .values({
      id: input.id,
      videoId: input.videoId,
      kind: input.kind,
      runtime: input.runtime,
      model: input.model,
      modelVersion: input.modelVersion,
      sampleFps: input.sampleFps,
      windowsJson: input.windowsJson ?? '[]',
      path: input.path,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
}
