import { describe, expect, it } from 'vitest';

import {
  parseTemporalLabelJsonl,
  stringifyTemporalLabelJsonl,
  type TemporalLabel,
} from './labels.js';

const SAMPLE: TemporalLabel = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  kind: 'climb_start',
  subjectId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  videoId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
  tUs: 12_400_000,
  sourceVersion: 'label-tool@0.0.0',
};

describe('temporal labels', () => {
  it('round-trips JSONL', () => {
    const text = stringifyTemporalLabelJsonl([SAMPLE]);
    expect(parseTemporalLabelJsonl(text)).toEqual([SAMPLE]);
  });

  it('rejects a climb_start without tUs', () => {
    expect(() =>
      parseTemporalLabelJsonl(
        `${JSON.stringify({ ...SAMPLE, tUs: undefined })}\n`,
      ),
    ).toThrow();
  });

  it('rejects a move_correspondence missing the partner fields', () => {
    expect(() =>
      parseTemporalLabelJsonl(
        `${JSON.stringify({ ...SAMPLE, kind: 'move_correspondence' })}\n`,
      ),
    ).toThrow();
  });

  it('rejects a boundary correction whose end is before its start', () => {
    expect(() =>
      parseTemporalLabelJsonl(
        `${JSON.stringify({
          id: SAMPLE.id,
          kind: 'boundary_correction',
          subjectId: SAMPLE.subjectId,
          sourceVersion: SAMPLE.sourceVersion,
          startUs: 5,
          endUs: 4,
        })}\n`,
      ),
    ).toThrow(/endUs/);
  });
});
