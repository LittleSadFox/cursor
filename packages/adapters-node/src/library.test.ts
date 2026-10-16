import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS, type Migration } from '@climbing-coach/core';

import { backupFileName, pruneBackups } from './backups.js';
import { libraryBlobs } from './blobs.js';
import { readLibraryPointer, writeLibraryPointer } from './paths.js';
import { openSqliteLibrary } from './sqlite.js';

const NOW = '2026-10-15T12:00:00.000Z';
const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coach-adapters-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('backups', () => {
  it('keeps the newest seven backups per label', () => {
    const dir = tempDir();
    for (let day = 1; day <= 9; day += 1) {
      writeFileSync(join(dir, backupFileName('daily', `2026-10-0${day}T00:00:00.000Z`)), '');
    }
    writeFileSync(join(dir, backupFileName('pre-0002_x', NOW)), '');
    const removed = pruneBackups(dir, 'daily');
    expect(removed).toEqual([
      backupFileName('daily', '2026-10-01T00:00:00.000Z'),
      backupFileName('daily', '2026-10-02T00:00:00.000Z'),
    ]);
    expect(readdirSync(dir)).toHaveLength(8);
  });

  it('writes daily backups into the library backups folder, not the working directory', async () => {
    const root = tempDir();
    const backups = join(root, 'backups');
    const library = openSqliteLibrary(join(root, 'library.db'), NOW, {
      backupsDir: backups,
      now: () => NOW,
    });
    const { path } = await library.backup.backup('daily');
    library.close();
    expect(path).toBe(join(backups, backupFileName('daily', NOW)));
    const copy = new Database(path, { readonly: true });
    expect(
      copy.prepare("SELECT name FROM sqlite_master WHERE name = 'training_logs'").get(),
    ).toBeDefined();
    copy.close();
  });

  it('refuses to back up when backups are disabled', async () => {
    const library = openSqliteLibrary(':memory:', NOW);
    await expect(library.backup.backup('daily')).rejects.toThrow(/disabled/);
    library.close();
  });

  it('snapshots an existing library before applying new migrations', () => {
    const root = tempDir();
    const dbPath = join(root, 'library.db');
    const backups = join(root, 'backups');
    const fresh = openSqliteLibrary(dbPath, NOW, { backupsDir: backups });
    expect(fresh.preMigrationBackup).toBeNull();
    fresh.close();

    const next: Migration = {
      id: '0099_test',
      sql: 'CREATE TABLE upgrade_probe (id INTEGER PRIMARY KEY);',
    };
    const upgraded = openSqliteLibrary(dbPath, NOW, {
      backupsDir: backups,
      migrations: [...MIGRATIONS, next],
    });
    upgraded.close();
    expect(upgraded.preMigrationBackup).toBe(join(backups, backupFileName('pre-0099_test', NOW)));
    const snapshot = new Database(upgraded.preMigrationBackup ?? '', { readonly: true });
    expect(
      snapshot.prepare("SELECT name FROM sqlite_master WHERE name = 'upgrade_probe'").get(),
    ).toBeUndefined();
    expect(
      snapshot.prepare("SELECT name FROM sqlite_master WHERE name = 'gyms'").get(),
    ).toBeDefined();
    snapshot.close();
  });
});

describe('library pointer', () => {
  it('round-trips the library root and treats a missing or broken file as unset', () => {
    const dir = join(tempDir(), 'config');
    expect(readLibraryPointer(dir)).toBeNull();
    writeLibraryPointer(dir, '/Users/me/Movies/Coach');
    expect(readLibraryPointer(dir)).toBe('/Users/me/Movies/Coach');
    writeLibraryPointer(dir, null);
    expect(readLibraryPointer(dir)).toBeNull();
    writeFileSync(join(dir, 'config.json'), '{not json');
    expect(readLibraryPointer(dir)).toBeNull();
  });
});

describe('libraryBlobs', () => {
  it('writes nested files atomically and reads them back', async () => {
    const root = tempDir();
    const blobs = libraryBlobs(root);
    await blobs.write('comparisons/abc.bin', Uint8Array.from([1, 2, 3]));
    expect(Array.from(await blobs.read('comparisons/abc.bin'))).toEqual([1, 2, 3]);
    expect(readdirSync(join(root, 'comparisons'))).toEqual(['abc.bin']);
  });

  it('refuses paths outside the library root', async () => {
    const blobs = libraryBlobs(tempDir());
    await expect(blobs.read('../etc/passwd')).rejects.toThrow(/escapes the library/);
    await expect(blobs.write('/tmp/x.bin', new Uint8Array(0))).rejects.toThrow(/escapes the library/);
  });
});
