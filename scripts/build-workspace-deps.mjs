#!/usr/bin/env node
/**
 * Workspace packages export `dist/` only (see each package.json `exports`).
 * After `git pull`, that output can exist but be stale — tsx then crashes with
 * "does not provide an export named …". Rebuild this package's dependencies
 * through turbo (cached when sources are unchanged) before `dev`.
 *
 * Usage: node scripts/build-workspace-deps.mjs @climbing-coach/server
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = process.argv[2];
if (!pkg || !pkg.startsWith('@climbing-coach/')) {
  console.error('usage: node scripts/build-workspace-deps.mjs @climbing-coach/<pkg>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
console.error(`[climbing-coach] building workspace deps for ${pkg}…`);
const result = spawnSync(
  'pnpm',
  ['exec', 'turbo', 'run', 'build', `--filter=${pkg}^...`],
  { cwd: root, stdio: 'inherit', env: process.env },
);
if (result.error) {
  console.error(`[climbing-coach] failed to spawn turbo: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(
    `[climbing-coach] dependency build failed for ${pkg} (exit ${result.status ?? 'unknown'}). Fix the errors above, then retry the dev command.`,
  );
  process.exit(result.status ?? 1);
}
