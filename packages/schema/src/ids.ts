import { z } from 'zod';

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** Crockford Base32 ULID (26 chars). Generation belongs in `core`; schema only validates. */
export const UlidSchema = z.string().regex(ULID_RE, 'invalid ULID');

export type Ulid = z.infer<typeof UlidSchema>;

export function isUlid(value: string): value is Ulid {
  return ULID_RE.test(value);
}
