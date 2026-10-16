import { eq, isNull } from 'drizzle-orm';

import { ProblemError, type FocusTag } from '@climbing-coach/api';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { focusTags } from '../schema.js';

const BUILTIN_FOCUS: { id: string; label: string }[] = [
  { id: 'capacity', label: 'Capacity' },
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'power-endurance', label: 'Power endurance' },
  { id: 'technique', label: 'Technique' },
  { id: 'projecting', label: 'Projecting' },
  { id: 'flexibility', label: 'Flexibility / mobility' },
  { id: 'rest', label: 'Rest / active recovery' },
];

export function seedFocusTags(db: AppDatabase, clock: Clock): void {
  const now = clock.nowIso();
  for (const tag of BUILTIN_FOCUS) {
    db.insert(focusTags)
      .values({
        id: tag.id,
        label: tag.label,
        builtin: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoNothing({ target: focusTags.id })
      .run();
  }
}

export function listFocusTags(db: AppDatabase): FocusTag[] {
  return db
    .select()
    .from(focusTags)
    .where(isNull(focusTags.deletedAt))
    .all()
    .map((row) => ({ id: row.id, label: row.label, builtin: row.builtin === 1 }));
}

/** Training logs may only reference live focus tags. */
export function assertFocusTagsExist(db: AppDatabase, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const known = new Set(listFocusTags(db).map((tag) => tag.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ProblemError('VALIDATION_FAILED', `unknown focus tag(s): ${unknown.join(', ')}`);
  }
}

export function focusTagIdFor(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function createFocusTag(db: AppDatabase, clock: Clock, label: string): FocusTag {
  const now = clock.nowIso();
  const id = focusTagIdFor(label);
  if (!id)
    throw new ProblemError(
      'VALIDATION_FAILED',
      'focus tag label needs at least one letter or digit',
    );
  const existing = db.select().from(focusTags).where(eq(focusTags.id, id)).get();
  if (existing && existing.deletedAt === null) {
    throw new ProblemError('VALIDATION_FAILED', `focus tag ${id} already exists`);
  }
  db.insert(focusTags)
    .values({
      id,
      label: label.trim(),
      builtin: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: focusTags.id,
      set: { label: label.trim(), deletedAt: null, updatedAt: now },
    })
    .run();
  return { id, label: label.trim(), builtin: existing?.builtin === 1 };
}
