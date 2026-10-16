import { DatasetManifestSchema } from './dataset.js';
import { EvalFixtureSchema } from './eval-fixture.js';
import { FeatureSpecSchema } from './feature-spec.js';
import { LabelExportRowSchema, TemporalLabelSchema } from './labels.js';
import { PoseTrackHeaderSchema } from './pose-track.js';
import { SignalsFileSchema } from './signals.js';
import { zodToJsonSchema } from './zod-to-json-schema.js';

/** JSON Schema documents for Python research code and external validators. */
export function exportJsonSchemas(): Record<string, unknown> {
  return {
    PoseTrackHeader: zodToJsonSchema(PoseTrackHeaderSchema, 'PoseTrackHeader'),
    SignalsFile: zodToJsonSchema(SignalsFileSchema, 'SignalsFile'),
    LabelExportRow: zodToJsonSchema(LabelExportRowSchema, 'LabelExportRow'),
    TemporalLabel: zodToJsonSchema(TemporalLabelSchema, 'TemporalLabel'),
    FeatureSpec: zodToJsonSchema(FeatureSpecSchema, 'FeatureSpec'),
    DatasetManifest: zodToJsonSchema(DatasetManifestSchema, 'DatasetManifest'),
    EvalFixture: zodToJsonSchema(EvalFixtureSchema, 'EvalFixture'),
  };
}
