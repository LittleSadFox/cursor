import { describe, expect, it } from 'vitest';

import { isSyncFolder } from './sync-folder.js';

describe('isSyncFolder', () => {
  it('refuses iCloud Drive and Dropbox paths', () => {
    expect(isSyncFolder('/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Coach')).toBe(true);
    expect(isSyncFolder('/Users/me/Dropbox/Climbing')).toBe(true);
    expect(isSyncFolder('/Users/me/Movies/Climbing Coach Library')).toBe(false);
  });
});
