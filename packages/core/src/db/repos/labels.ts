import { and, asc, eq, isNull } from 'drizzle-orm';

import type { LabelKind } from '@climbing-coach/schema';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { labels } from '../schema.js';

export type LabelRecord = {
  id: string;
  kind: LabelKind;
  subjectId: string;
  predicted: Record<string, unknown> | null;
  final: Record<string, unknown> | null;
  sourceVersion: string;
  createdAt: string;
};

export function insertLabel(
  db: AppDatabase,
  clock: Clock,
  label: Omit<LabelRecord, 'createdAt'>,
): LabelRecord {
  const now = clock.nowIso();
  db.insert(labels)
    .values({
      id: label.id,
      kind: label.kind,
      subjectId: label.subjectId,
      predictedJson: label.predicted === null ? null : stringifyJson(label.predicted),
      finalJson: label.final === null ? null : stringifyJson(label.final),
      sourceVersion: label.sourceVersion,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { ...label, createdAt: now };
}

/** Live labels of one kind, oldest first. */
export function listLabels(db: AppDatabase, kind: LabelKind): LabelRecord[] {
  return db
    .select()
    .from(labels)
    .where(and(eq(labels.kind, kind), isNull(labels.deletedAt)))
    .orderBy(asc(labels.createdAt), asc(labels.id))
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind as LabelKind,
      subjectId: row.subjectId,
      predicted: parseJson<Record<string, unknown> | null>(row.predictedJson, null),
      final: parseJson<Record<string, unknown> | null>(row.finalJson, null),
      sourceVersion: row.sourceVersion,
      createdAt: row.createdAt,
    }));
}
