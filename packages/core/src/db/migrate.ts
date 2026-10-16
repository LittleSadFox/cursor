import { MIGRATIONS } from './migrations.js';
import type { SqlExecutor } from '../ports/sql.js';

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);`;

export function appliedMigrationIds(exec: SqlExecutor): string[] {
  exec.exec(ENSURE_TABLE);
  const ids: string[] = [];
  // Sequential lookup keeps the executor interface small (no `all` yet).
  for (const migration of MIGRATIONS) {
    const row = exec.get('SELECT id FROM schema_migrations WHERE id = ?', [migration.id]);
    if (row) ids.push(migration.id);
  }
  return ids;
}

export function applyMigrations(exec: SqlExecutor, nowIso: string): string[] {
  exec.exec(ENSURE_TABLE);
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    const existing = exec.get('SELECT id FROM schema_migrations WHERE id = ?', [migration.id]);
    if (existing) continue;
    exec.exec(migration.sql);
    exec.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [migration.id, nowIso]);
    applied.push(migration.id);
  }
  return applied;
}
