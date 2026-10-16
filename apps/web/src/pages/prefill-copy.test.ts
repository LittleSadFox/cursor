import { describe, expect, it } from 'vitest';

import { formatPrefillBasis } from './prefill-copy.js';

describe('formatPrefillBasis', () => {
  it('fills the basis sentence', () => {
    expect(
      formatPrefillBasis(
        { attempts: 12, mean: 6.4, max: 9 },
        'Prefill from {attempts} attempts (mean {mean}, max {max})',
        'none',
      ),
    ).toBe('Prefill from 12 attempts (mean 6.4, max 9)');
  });

  it('uses the empty copy when nothing is rated', () => {
    expect(formatPrefillBasis({ attempts: 0, mean: null, max: null }, 'x', 'none')).toBe('none');
  });
});
