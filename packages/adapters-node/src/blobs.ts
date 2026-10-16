import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { BlobStore } from '@climbing-coach/core';

import { resolveUnderRoot } from './paths.js';

function resolved(root: string, relativePath: string): string {
  const path = resolveUnderRoot(root, relativePath);
  if (!path) throw new Error(`path escapes the library: ${relativePath}`);
  return path;
}

/** Library-root files. Writes go to a temp file first so readers never see half a result. */
export function libraryBlobs(root: string): BlobStore {
  return {
    async read(relativePath) {
      return new Uint8Array(await readFile(resolved(root, relativePath)));
    },
    async write(relativePath, bytes) {
      const target = resolved(root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, target);
    },
  };
}
