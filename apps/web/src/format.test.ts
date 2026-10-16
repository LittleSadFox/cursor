import { setupI18n } from '@lingui/core';
import { describe, expect, it } from 'vitest';

import { ProblemError } from '@climbing-coach/api';

import { errorText, translate } from './format.js';

describe('translate', () => {
  const i18n = setupI18n({ locale: 'en', messages: { en: { pair: '{a} and {a}, {b}' } } });

  it('fills every placeholder and dashes missing values', () => {
    expect(translate(i18n, 'pair', { a: 1, b: null })).toBe('1 and 1, —');
  });

  it('keeps placeholders that a bare catalog lookup would blank', () => {
    expect(i18n._('pair')).toBe(' and , ');
    expect(translate(i18n, 'pair', { a: 'x', b: 0 })).toBe('x and x, 0');
  });
});

describe('errorText', () => {
  it('prefers the problem detail', () => {
    expect(errorText(new ProblemError('VERSION_CONFLICT', 'stale'), 'generic')).toBe('stale');
    expect(errorText(new Error('boom'), 'generic')).toBe('generic');
  });
});
