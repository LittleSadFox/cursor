import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import {
  applyMigrations,
  dbSchema,
  type AppDatabase,
  type Migration,
  type SqlExecutor,
  type SqlValue,
  type SqliteBackup,
} from '@climbing-coach/core';

import { onlineBackup, snapshotSync } from './backups.js';

export type OpenedLibrary = {
  sqlite: Database.Database;
  db: AppDatabase;
  sql: SqlExecutor;
  backup: SqliteBackup;
  /** Path of the snapshot taken before pending migrations ran, if any. */
  preMigrationBackup: string | null;
  close: () => void;
};

export type OpenLibraryOptions = {
  /** Where backups go; `null` disables them (in-memory databases). */
  backupsDir: string | null;
  now?: () => string;
  /** Defaults to the bundled migrations; tests pass their own. */
  migrations?: readonly Migration[];
};

export function sqliteExecutor(sqlite: Database.Database): SqlExecutor {
  return {
    exec: (sql) => {
      sqlite.exec(sql);
    },
    get: (sql, params = []) =>
      sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined,
    run: (sql, params = []) => {
      sqlite.prepare(sql).run(...(params as SqlValue[]));
    },
  };
}

function backupPort(
  sqlite: Database.Database,
  dir: string | null,
  now: () => string,
): SqliteBackup {
  return {
    async backup(label) {
      if (dir === null) throw new Error('backups are disabled for this database');
      return onlineBackup(sqlite, dir, label, now());
    },
  };
}

export function openSqliteLibrary(
  dbPath: string,
  nowIso: string,
  options: OpenLibraryOptions = { backupsDir: null },
): OpenedLibrary {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const sql = sqliteExecutor(sqlite);
  const dir = options.backupsDir;
  let preMigrationBackup: string | null = null;
  applyMigrations(sql, nowIso, {
    ...(options.migrations ? { migrations: options.migrations } : {}),
    beforeApply: (pending) => {
      if (dir === null) return;
      preMigrationBackup = snapshotSync(
        sqlite,
        dir,
        `pre-${pending[0]?.id ?? 'migration'}`,
        nowIso,
      );
    },
  });
  const db = drizzle(sqlite, { schema: dbSchema }) as unknown as AppDatabase;
  return {
    sqlite,
    db,
    sql,
    backup: backupPort(sqlite, dir, options.now ?? (() => new Date().toISOString())),
    preMigrationBackup,
    close: () => sqlite.close(),
  };
}
