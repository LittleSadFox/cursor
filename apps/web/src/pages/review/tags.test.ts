import { describe, expect, it } from 'vitest';

import { formatTags, parseTags } from './tags.js';

describe('parseTags', () => {
  it('trims, drops empties, and keeps order', () => {
    expect(parseTags(' crimp, sloper ,crimp,')).toEqual(['crimp', 'sloper']);
    expect(formatTags(['crimp', 'sloper'])).toBe('crimp, sloper');
  });

  it('stops at 20 tags and skips ones longer than 40 characters', () => {
    const many = Array.from({ length: 25 }, (_, index) => `t${index}`).join(',');
    expect(parseTags(many)).toHaveLength(20);
    expect(parseTags(`${'a'.repeat(41)}, ok`)).toEqual(['ok']);
  });
});
