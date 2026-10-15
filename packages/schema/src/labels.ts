import { z } from 'zod';

import { UlidSchema } from './ids.js';
import { UsSchema } from './time.js';

export const LabelKindSchema = z.enum([
  'climb_start',
  'climb_end',
  'outcome',
  'exit_direction',
  'limb_placement',
  'boundary_correction',
  'move_correspondence',
  'alignment_feedback',
  'insight_feedback',
]);
export type LabelKind = z.infer<typeof LabelKindSchema>;

export const AttemptOutcomeSchema = z.enum(['fall', 'drop', 'top', 'unknown']);
export type AttemptOutcome = z.infer<typeof AttemptOutcomeSchema>;

export const ExitDirectionSchema = z.enum(['top', 'side', 'bottom', 'unknown']);
export type ExitDirection = z.infer<typeof ExitDirectionSchema>;

/** One JSONL row for label export (BUILD_PLAN §3.4). */
export const LabelExportRowSchema = z.object({
  subjectId: UlidSchema,
  kind: LabelKindSchema,
  features: z.array(z.number()),
  featureSpecVersion: z.string().min(1),
  target: z.union([z.number(), z.string(), z.boolean(), z.record(z.unknown())]),
  sourceVersion: z.string().min(1),
});
export type LabelExportRow = z.infer<typeof LabelExportRowSchema>;

export const TemporalLabelSchema = z.object({
  id: UlidSchema,
  kind: LabelKindSchema,
  subjectId: UlidSchema,
  videoId: UlidSchema.optional(),
  tUs: UsSchema.optional(),
  startUs: UsSchema.optional(),
  endUs: UsSchema.optional(),
  outcome: AttemptOutcomeSchema.optional(),
  exitDirection: ExitDirectionSchema.optional(),
  limb: z.enum(['lh', 'rh', 'lf', 'rf']).optional(),
  predicted: z.record(z.unknown()).optional(),
  final: z.record(z.unknown()).optional(),
  sourceVersion: z.string().min(1),
});
export type TemporalLabel = z.infer<typeof TemporalLabelSchema>;

export function parseLabelJsonl(text: string): LabelExportRow[] {
  const rows: LabelExportRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(LabelExportRowSchema.parse(JSON.parse(trimmed)));
  }
  return rows;
}

export function stringifyLabelJsonl(rows: LabelExportRow[]): string {
  return rows.map((row) => JSON.stringify(LabelExportRowSchema.parse(row))).join('\n') + '\n';
}
