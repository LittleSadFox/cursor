import { setupI18n } from '@lingui/core';
import { describe, expect, it } from 'vitest';

import { translate } from '../format.js';
import { messages } from '../locales/en.js';

import { formatPrefillBasis } from './prefill-copy.js';

const i18n = setupI18n({ locale: 'en', messages: { en: messages } });
const fill = (values: Parameters<typeof translate>[2]) =>
  translate(i18n, 'home.prefillBasis', values);

describe('formatPrefillBasis', () => {
  it('fills the basis sentence from the catalog', () => {
    expect(formatPrefillBasis({ attempts: 12, mean: 6.4, max: 9 }, fill, 'none')).toBe(
      'Prefill from 12 attempts (mean 6.4, max 9)',
    );
  });

  it('uses the empty copy when nothing is rated', () => {
    expect(formatPrefillBasis({ attempts: 0, mean: null, max: null }, fill, 'none')).toBe('none');
  });
});
