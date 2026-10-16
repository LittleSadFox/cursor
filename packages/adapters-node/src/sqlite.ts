import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import {
  applyMigrations,
  dbSchema,
  type AppDatabase,
  type SqlExecutor,
  type SqlValue,
  type SqliteBackup,
} from '@climbing-coach/core';

export type OpenedLibrary = {
  sqlite: Database.Database;
  db: AppDatabase;
  sql: SqlExecutor;
  backup: SqliteBackup;
  close: () => void;
};

export function sqliteExecutor(sqlite: Database.Database): SqlExecutor {
  return {
    exec: (sql) => {
      sqlite.exec(sql);
    },
    get: (sql, params = []) => sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined,
    run: (sql, params = []) => {
      sqlite.prepare(sql).run(...(params as SqlValue[]));
    },
  };
}

export function openSqliteLibrary(dbPath: string, nowIso: string): OpenedLibrary {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const sql = sqliteExecutor(sqlite);
  applyMigrations(sql, nowIso);
  const db = drizzle(sqlite, { schema: dbSchema }) as unknown as AppDatabase;
  return {
    sqlite,
    db,
    sql,
    backup: {
      async backupTo(destPath: string) {
        mkdirSync(dirname(destPath), { recursive: true });
        await sqlite.backup(destPath);
      },
    },
    close: () => sqlite.close(),
  };
}
