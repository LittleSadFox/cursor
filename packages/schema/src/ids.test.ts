import { describe, expect, it } from 'vitest';

import { isUlid, UlidSchema } from './ids.js';
import { UsSchema } from './time.js';

describe('ids and time', () => {
  it('accepts valid ULIDs', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    expect(isUlid(id)).toBe(true);
    expect(UlidSchema.parse(id)).toBe(id);
  });

  it('rejects invalid ULIDs', () => {
    expect(isUlid('not-a-ulid')).toBe(false);
    expect(() => UlidSchema.parse('zzzz')).toThrow();
  });

  it('requires non-negative integer Us', () => {
    expect(UsSchema.parse(0)).toBe(0);
    expect(() => UsSchema.parse(-1)).toThrow();
    expect(() => UsSchema.parse(1.5)).toThrow();
  });
});
