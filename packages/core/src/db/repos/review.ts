import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { AppDatabase } from '../../ports/sql.js';
import { reviewItems } from '../schema.js';

export type ReviewItemRow = {
  id: string;
  videoId: string;
  outcome: string;
  climbStartUs: number;
  climbEndUs: number;
  prePadUs: number;
  postPadUs: number;
  confidence: number | null;
  status: string;
  touched: boolean;
};

export type InsertReviewItemInput = {
  id: string;
  videoId: string;
  outcome: string;
  climbStartUs: number;
  climbEndUs: number;
  prePadUs: number;
  postPadUs: number;
  confidence: number | null;
  detectorVersion: string;
  parentIds: readonly string[];
};

export function listReviewItems(db: AppDatabase, videoId: string): ReviewItemRow[] {
  return db
    .select({
      id: reviewItems.id,
      videoId: reviewItems.videoId,
      outcome: reviewItems.outcome,
      climbStartUs: reviewItems.climbStartUs,
      climbEndUs: reviewItems.climbEndUs,
      prePadUs: reviewItems.prePadUs,
      postPadUs: reviewItems.postPadUs,
      confidence: reviewItems.confidence,
      status: reviewItems.status,
      touched: reviewItems.touched,
    })
    .from(reviewItems)
    .where(and(eq(reviewItems.videoId, videoId), isNull(reviewItems.deletedAt)))
    .orderBy(asc(reviewItems.climbStartUs), asc(reviewItems.id))
    .all()
    .map((row) => ({ ...row, touched: row.touched === 1 }));
}

export function insertReviewItem(
  db: AppDatabase,
  input: InsertReviewItemInput,
  nowIso: string,
): void {
  db.insert(reviewItems)
    .values({
      id: input.id,
      videoId: input.videoId,
      origin: 'detector',
      detectorVersion: input.detectorVersion,
      detectedClimbStartUs: input.climbStartUs,
      detectedClimbEndUs: input.climbEndUs,
      detectedOutcome: input.outcome,
      confidence: input.confidence,
      derivedFromJson: JSON.stringify(input.parentIds),
      climbStartUs: input.climbStartUs,
      climbEndUs: input.climbEndUs,
      prePadUs: input.prePadUs,
      postPadUs: input.postPadUs,
      outcome: input.outcome,
      tagsJson: '[]',
      touched: 0,
      status: 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
}

/** Soft-deletes review rows a newer detection replaced. */
export function retireReviewItems(db: AppDatabase, ids: readonly string[], nowIso: string): void {
  if (ids.length === 0) return;
  db.update(reviewItems)
    .set({ deletedAt: nowIso, updatedAt: nowIso })
    .where(inArray(reviewItems.id, [...ids]))
    .run();
}
