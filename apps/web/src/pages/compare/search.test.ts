import { describe, expect, it } from 'vitest';

import { messages } from '../../locales/en.js';

import { compareSearch } from './search.js';

describe('compareSearch', () => {
  it('keeps trimmed, non-empty attempt ids', () => {
    expect(compareSearch({ a: ' 01A ', b: '01B' })).toEqual({ a: '01A', b: '01B' });
  });

  it('drops blank or non-string values', () => {
    expect(compareSearch({ a: '  ', b: 7 })).toEqual({});
  });
});

describe('compare copy', () => {
  it('has a message for every sync mode, layout, and verdict', () => {
    const keys = [
      'compare.mode.synced',
      'compare.mode.realtime',
      'compare.layout.side_by_side',
      'compare.layout.ghost',
      'compare.aligned',
      'compare.misaligned',
    ];
    expect(keys.filter((key) => messages[key] === undefined)).toEqual([]);
  });
});
