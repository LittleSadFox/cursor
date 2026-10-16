import { type Ulid, UlidSchema } from '@climbing-coach/schema';

import type { Clock } from '../ports/clock.js';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type RandomBytes = (size: number) => Uint8Array;

export type IdGen = {
  ulid(): Ulid;
};

/** Crockford Base32 ULID. Timestamp from Clock; entropy from RandomBytes. */
export function encodeUlid(timeMs: number, entropy: Uint8Array): Ulid {
  if (entropy.length < 10) throw new RangeError('ULID entropy must be 10 bytes');
  const time = Math.max(0, Math.floor(timeMs));
  const chars: string[] = new Array(26);
  let t = time;
  for (let i = 9; i >= 0; i -= 1) {
    chars[i] = ENCODING[t & 31] ?? '0';
    t = Math.floor(t / 32);
  }
  let acc = 0;
  let bits = 0;
  let index = 10;
  for (let i = 0; i < 10; i += 1) {
    acc = (acc << 8) | (entropy[i] ?? 0);
    bits += 8;
    while (bits >= 5 && index < 26) {
      chars[index] = ENCODING[(acc >>> (bits - 5)) & 31] ?? '0';
      bits -= 5;
      index += 1;
    }
  }
  return UlidSchema.parse(chars.join(''));
}

export function createIdGen(clock: Clock, randomBytes: RandomBytes): IdGen {
  return {
    ulid: () => encodeUlid(clock.nowMs(), randomBytes(10)),
  };
}

export function sequentialRandomBytes(start = 0): RandomBytes {
  let seq = start;
  return (size) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      out[i] = (seq + i) & 0xff;
    }
    seq += 1;
    return out;
  };
}
