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

export const LimbSchema = z.enum(['lh', 'rh', 'lf', 'rf']);
export type Limb = z.infer<typeof LimbSchema>;

/** One JSONL row for ML label export (BUILD_PLAN §3.4). */
export const LabelExportRowSchema = z.object({
  subjectId: UlidSchema,
  kind: LabelKindSchema,
  features: z.array(z.number()),
  featureSpecVersion: z.string().min(1),
  target: z.union([z.number(), z.string(), z.boolean(), z.record(z.unknown())]),
  sourceVersion: z.string().min(1),
});
export type LabelExportRow = z.infer<typeof LabelExportRowSchema>;

/** Temporal annotation used by research/label-tool and eval fixtures. */
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
  limb: LimbSchema.optional(),
  /** Partner attempt id for move_correspondence rows. */
  otherSubjectId: UlidSchema.optional(),
  moveIndex: z.number().int().nonnegative().optional(),
  otherMoveIndex: z.number().int().nonnegative().optional(),
  predicted: z.record(z.unknown()).optional(),
  final: z.record(z.unknown()).optional(),
  sourceVersion: z.string().min(1),
});
export type TemporalLabel = z.infer<typeof TemporalLabelSchema>;

function parseJsonlLines<T>(text: string, parseRow: (value: unknown) => T): T[] {
  const rows: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(parseRow(JSON.parse(trimmed) as unknown));
  }
  return rows;
}

export function parseLabelJsonl(text: string): LabelExportRow[] {
  return parseJsonlLines(text, (value) => LabelExportRowSchema.parse(value));
}

export function stringifyLabelJsonl(rows: LabelExportRow[]): string {
  return rows.map((row) => JSON.stringify(LabelExportRowSchema.parse(row))).join('\n') + '\n';
}

export function parseTemporalLabelJsonl(text: string): TemporalLabel[] {
  return parseJsonlLines(text, (value) => TemporalLabelSchema.parse(value));
}

export function stringifyTemporalLabelJsonl(rows: TemporalLabel[]): string {
  return rows.map((row) => JSON.stringify(TemporalLabelSchema.parse(row))).join('\n') + '\n';
}
