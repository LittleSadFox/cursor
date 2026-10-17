#!/usr/bin/env node
/**
 * Workspace packages export `dist/` only. Dev (tsx / Vite) fails opaquely when those
 * outputs are missing after a fresh checkout or `git pull`. Fail loudly instead.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const needed = [
  'packages/schema/dist/index.js',
  'packages/api/dist/index.js',
  'packages/engine/dist/index.js',
  'packages/core/dist/index.js',
  'packages/adapters-node/dist/index.js',
];

const missing = needed.filter((rel) => !existsSync(join(root, rel)));
if (missing.length === 0) process.exit(0);

console.error('[climbing-coach] workspace packages are not built. Missing:');
for (const rel of missing) console.error(`  ${rel}`);
console.error('From the repo root run: pnpm build');
process.exit(1);
