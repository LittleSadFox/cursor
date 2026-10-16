import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '../db/schema.js';
import { applyMigrations } from '../db/migrate.js';
import type { AppDatabase, SqlExecutor, SqlValue } from '../ports/sql.js';

export type MemoryLibrary = {
  sqlite: Database.Database;
  db: AppDatabase;
  sql: SqlExecutor;
};

export function openMemoryLibrary(nowIso: string): MemoryLibrary {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const sql: SqlExecutor = {
    exec: (text) => {
      sqlite.exec(text);
    },
    get: (text, params = []) =>
      sqlite.prepare(text).get(...params) as Record<string, unknown> | undefined,
    run: (text, params = []) => {
      sqlite.prepare(text).run(...(params as SqlValue[]));
    },
  };
  applyMigrations(sql, nowIso);
  const db = drizzle(sqlite, { schema }) as unknown as AppDatabase;
  return { sqlite, db, sql };
}
