import { describe, expect, it } from 'vitest';

import { ProblemError } from '@climbing-coach/api';

import { errorText, formatMessage } from './format.js';

describe('formatMessage', () => {
  it('fills every placeholder and dashes missing values', () => {
    expect(formatMessage('{a} and {a}, {b}', { a: 1, b: null })).toBe('1 and 1, —');
  });
});

describe('errorText', () => {
  it('prefers the problem detail', () => {
    expect(errorText(new ProblemError('VERSION_CONFLICT', 'stale'), 'generic')).toBe('stale');
    expect(errorText(new Error('boom'), 'generic')).toBe('generic');
  });
});
