import { describe, expect, it } from 'vitest';

import { exportJsonSchemas } from './json-schema.js';
import { SCHEMA_VERSION } from './index.js';

describe('exportJsonSchemas', () => {
  it('exports named documents for research consumers', () => {
    const docs = exportJsonSchemas();
    expect(Object.keys(docs).sort()).toEqual(
      [
        'DatasetManifest',
        'EvalFixture',
        'FeatureSpec',
        'LabelExportRow',
        'PoseTrackHeader',
        'SignalsFile',
        'TemporalLabel',
      ].sort(),
    );
    expect(docs.PoseTrackHeader).toMatchObject({ $schema: expect.any(String) });
  });

  it('is schema v1', () => {
    expect(SCHEMA_VERSION).toBe('1.1.0');
  });
});
