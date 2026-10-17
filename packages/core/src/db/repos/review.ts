import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { AppDatabase } from '../../ports/sql.js';
import { reviewItems } from '../schema.js';

export type ReviewItemRow = {
  id: string;
  videoId: string;
  origin: string;
  /** Detector rows this one descends from (`derived_from_json`). */
  parentIds: string[];
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

/** A row the user made in review: a manual add, or a split / merge of detector rows. */
export type InsertUserReviewItemInput = {
  id: string;
  videoId: string;
  origin: 'detector' | 'manual';
  parentIds: readonly string[];
  outcome: string;
  climbStartUs: number;
  climbEndUs: number;
  prePadUs: number;
  postPadUs: number;
  status: 'draft' | 'rejected';
};

export type ReviewItemPatch = {
  parentIds: readonly string[];
  outcome: string;
  climbStartUs: number;
  climbEndUs: number;
  touched: boolean;
  status: 'draft' | 'rejected';
};

function parseIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function listReviewItems(db: AppDatabase, videoId: string): ReviewItemRow[] {
  return db
    .select({
      id: reviewItems.id,
      videoId: reviewItems.videoId,
      origin: reviewItems.origin,
      derivedFromJson: reviewItems.derivedFromJson,
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
    .map(({ derivedFromJson, touched, ...row }) => ({
      ...row,
      parentIds: parseIds(derivedFromJson),
      touched: touched === 1,
    }));
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

/** User rows have no detected range of their own; labels read it from their parents. */
export function insertUserReviewItem(
  db: AppDatabase,
  input: InsertUserReviewItemInput,
  nowIso: string,
): void {
  db.insert(reviewItems)
    .values({
      id: input.id,
      videoId: input.videoId,
      origin: input.origin,
      derivedFromJson: JSON.stringify(input.parentIds),
      climbStartUs: input.climbStartUs,
      climbEndUs: input.climbEndUs,
      prePadUs: input.prePadUs,
      postPadUs: input.postPadUs,
      outcome: input.outcome,
      tagsJson: '[]',
      touched: 1,
      status: input.status,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();
}

export function updateReviewItem(
  db: AppDatabase,
  id: string,
  patch: ReviewItemPatch,
  nowIso: string,
): void {
  db.update(reviewItems)
    .set({
      derivedFromJson: JSON.stringify(patch.parentIds),
      outcome: patch.outcome,
      climbStartUs: patch.climbStartUs,
      climbEndUs: patch.climbEndUs,
      touched: patch.touched ? 1 : 0,
      status: patch.status,
      updatedAt: nowIso,
    })
    .where(eq(reviewItems.id, id))
    .run();
}

/** Soft-deletes review rows a newer detection or a split / merge replaced. */
export function retireReviewItems(db: AppDatabase, ids: readonly string[], nowIso: string): void {
  if (ids.length === 0) return;
  db.update(reviewItems)
    .set({ deletedAt: nowIso, updatedAt: nowIso })
    .where(inArray(reviewItems.id, [...ids]))
    .run();
}
