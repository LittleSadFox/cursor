import { describe, expect, it } from 'vitest';

import { focusCountsText, formatRatio } from './charts-copy.js';

describe('chart copy', () => {
  it('labels focus counts, most frequent first', () => {
    const tags = [
      { id: 'power', label: 'Power', builtin: true },
      { id: 'technique', label: 'Technique', builtin: true },
    ];
    expect(focusCountsText({ technique: 1, power: 3, custom: 1, rest: 0 }, tags)).toBe(
      'Power 3 · custom 1 · Technique 1',
    );
  });

  it('rounds the ratio for display', () => {
    expect(formatRatio(1.23456)).toBe('1.23');
    expect(formatRatio(null)).toBeNull();
  });
});
