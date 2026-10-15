import { zodToJsonSchema } from './zod-to-json-schema.js';
import { LabelExportRowSchema, TemporalLabelSchema } from './labels.js';
import { PoseTrackHeaderSchema } from './pose-track.js';
import { SignalsFileSchema } from './signals.js';

/** JSON Schema documents for Python research code and external validators. */
export function exportJsonSchemas(): Record<string, unknown> {
  return {
    PoseTrackHeader: zodToJsonSchema(PoseTrackHeaderSchema, 'PoseTrackHeader'),
    SignalsFile: zodToJsonSchema(SignalsFileSchema, 'SignalsFile'),
    LabelExportRow: zodToJsonSchema(LabelExportRowSchema, 'LabelExportRow'),
    TemporalLabel: zodToJsonSchema(TemporalLabelSchema, 'TemporalLabel'),
  };
}
