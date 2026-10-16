import { MIGRATIONS, type Migration } from './migrations.js';
import type { SqlExecutor } from '../ports/sql.js';

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);`;

export type MigrateOptions = {
  migrations?: readonly Migration[];
  /**
   * Runs once before the first pending migration, only when the database already has applied
   * migrations (a fresh library has nothing to back up). Used for the pre-migration snapshot.
   */
  beforeApply?: (pending: readonly Migration[]) => void;
};

function isApplied(exec: SqlExecutor, id: string): boolean {
  return exec.get('SELECT id FROM schema_migrations WHERE id = ?', [id]) !== undefined;
}

export function appliedMigrationIds(
  exec: SqlExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): string[] {
  exec.exec(ENSURE_TABLE);
  return migrations
    .filter((migration) => isApplied(exec, migration.id))
    .map((migration) => migration.id);
}

export function pendingMigrations(
  exec: SqlExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): Migration[] {
  exec.exec(ENSURE_TABLE);
  return migrations.filter((migration) => !isApplied(exec, migration.id));
}

/** Each migration and its bookkeeping row commit together or not at all. */
function applyOne(exec: SqlExecutor, migration: Migration, nowIso: string): void {
  exec.exec('BEGIN IMMEDIATE');
  try {
    exec.exec(migration.sql);
    exec.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
      migration.id,
      nowIso,
    ]);
    exec.exec('COMMIT');
  } catch (error) {
    exec.exec('ROLLBACK');
    throw error;
  }
}

export function applyMigrations(
  exec: SqlExecutor,
  nowIso: string,
  options: MigrateOptions = {},
): string[] {
  const migrations = options.migrations ?? MIGRATIONS;
  const pending = pendingMigrations(exec, migrations);
  if (pending.length === 0) return [];
  if (pending.length < migrations.length) options.beforeApply?.(pending);
  for (const migration of pending) applyOne(exec, migration, nowIso);
  return pending.map((migration) => migration.id);
}
