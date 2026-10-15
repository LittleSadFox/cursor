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
});
