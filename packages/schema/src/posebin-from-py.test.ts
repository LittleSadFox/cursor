import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readPosebin, writePosebin } from './posebin.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../research/pose-lab/fixtures/from-py.posebin',
);

describe.skipIf(!existsSync(fixture))('python posebin fixture', () => {
  it('round-trips the Python bytes', () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const decoded = readPosebin(bytes);
    expect(decoded.header.runtime).toBe('python-ref');
    expect(decoded.header.rotation).toBe(180);
    expect(decoded.header.tracks).toHaveLength(2);
    expect(decoded.tUs[0]).toBe(16_000_000 + 7);
    expect(Buffer.from(writePosebin(decoded))).toEqual(Buffer.from(bytes));
  });
});
