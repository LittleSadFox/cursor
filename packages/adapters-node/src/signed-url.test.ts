import { describe, expect, it } from 'vitest';

import { resolveUnderRoot } from './paths.js';
import { signMedia, verifyMedia } from './signed-url.js';

describe('signed media URLs', () => {
  it('accepts the matching HMAC and rejects a stale one', () => {
    const sig = signMedia('launch-secret', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'proxy');
    expect(verifyMedia('launch-secret', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'proxy', sig)).toBe(true);
    expect(verifyMedia('other-secret', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'proxy', sig)).toBe(false);
  });
});

describe('path traversal guard', () => {
  it('rejects parent segments', () => {
    expect(resolveUnderRoot('/lib', 'clips/a.mp4')).toBe('/lib/clips/a.mp4');
    expect(resolveUnderRoot('/lib', '../etc/passwd')).toBeNull();
    expect(resolveUnderRoot('/lib', 'clips/../../etc/passwd')).toBeNull();
  });
});
