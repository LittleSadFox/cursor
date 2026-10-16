import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type Database from 'better-sqlite3';

export const KEEP_BACKUPS = 7;

function stamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

export function backupFileName(label: string, nowIso: string): string {
  return `library-${label}-${stamp(nowIso)}.db`;
}

/** Keeps the newest `keep` backups for `label`; names sort by their timestamp. */
export function pruneBackups(dir: string, label: string, keep = KEEP_BACKUPS): string[] {
  const prefix = `library-${label}-`;
  const ours = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.db'))
    .sort();
  const doomed = ours.slice(0, Math.max(0, ours.length - keep));
  for (const name of doomed) rmSync(join(dir, name), { force: true });
  return doomed;
}

/** Online backup API: consistent while the app keeps writing. */
export async function onlineBackup(
  sqlite: Database.Database,
  dir: string,
  label: string,
  nowIso: string,
  keep = KEEP_BACKUPS,
): Promise<{ path: string }> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, backupFileName(label, nowIso));
  await sqlite.backup(path);
  pruneBackups(dir, label, keep);
  return { path };
}

/** Synchronous snapshot for use before migrations, while nothing else holds the database. */
export function snapshotSync(
  sqlite: Database.Database,
  dir: string,
  label: string,
  nowIso: string,
): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, backupFileName(label, nowIso));
  sqlite.prepare('VACUUM INTO ?').run(path);
  pruneBackups(dir, label);
  return path;
}
