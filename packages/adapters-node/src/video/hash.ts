import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

import { quickHashSlices } from './plan.js';

/** SHA-256 of `size:<bytes>` plus head, middle, and tail samples (4 MiB each). */
export async function quickHashFile(path: string): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const size = (await handle.stat()).size;
    const hash = createHash('sha256');
    hash.update(`size:${size}\n`);
    for (const slice of quickHashSlices(size)) {
      const buf = Buffer.alloc(slice.length);
      await handle.read(buf, 0, slice.length, slice.offset);
      hash.update(buf);
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

export function fullHashFile(path: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    const fail = (error: Error) => {
      stream.destroy();
      reject(error);
    };
    const onAbort = () => fail(new Error('cancelled'));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', fail);
    stream.on('end', () => {
      signal?.removeEventListener('abort', onAbort);
      resolve(hash.digest('hex'));
    });
  });
}
