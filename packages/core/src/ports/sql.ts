import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from '../db/schema.js';

/**
 * Drizzle database bound to the library schema.
 * The better-sqlite3 driver is constructed in adapters-node; core only sees this type.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

export type SqlValue = string | number | bigint | Buffer | null;

export type SqlExecutor = {
  exec(sql: string): void;
  get(sql: string, params?: SqlValue[]): Record<string, unknown> | undefined;
  run(sql: string, params?: SqlValue[]): void;
};

export type SqliteBackup = {
  /** Writes a consistent copy into the library's `backups/` folder and prunes old copies. */
  backup(label: string): Promise<{ path: string }>;
};
