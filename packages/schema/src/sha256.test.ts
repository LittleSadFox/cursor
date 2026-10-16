import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from './sha256.js';

describe('sha256Hex', () => {
  it('matches Node for known strings', () => {
    for (const value of ['', 'abc', 'climber\nboulder']) {
      expect(sha256Hex(value)).toBe(createHash('sha256').update(value).digest('hex'));
    }
  });
});