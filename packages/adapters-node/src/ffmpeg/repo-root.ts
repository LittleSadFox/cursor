import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEARCH_LIMIT = 12;

/** Walk up from `startDir` until `pnpm-workspace.yaml` (monorepo root). */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < SEARCH_LIMIT; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Repo root from this file, then `process.cwd()`. Null when neither is inside the monorepo. */
export function detectRepoRoot(cwd = process.cwd()): string | null {
  const fromHere = findRepoRoot(fileURLToPath(new URL('.', import.meta.url)));
  return fromHere ?? findRepoRoot(cwd);
}
