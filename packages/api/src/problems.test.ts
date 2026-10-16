import { describe, expect, it } from 'vitest';

import { encodeCursor, decodeCursor } from './common.js';
import { ProblemError } from './problems.js';

describe('ProblemError', () => {
  it('builds RFC-7807 problem+json fields', () => {
    const error = new ProblemError('NOT_FOUND', 'gym missing');
    expect(error.problem.status).toBe(404);
    expect(error.problem.code).toBe('NOT_FOUND');
    expect(error.problem.type).toContain('not-found');
    expect(error.problem.detail).toBe('gym missing');
  });
});

describe('cursors', () => {
  it('round-trips JSON payloads', () => {
    const encoded = encodeCursor({ t: '2026-10-15T12:00:00.000Z', id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
    expect(decodeCursor(encoded)).toEqual({
      t: '2026-10-15T12:00:00.000Z',
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });
});
