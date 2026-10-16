import { readFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import type { SqlExecutor, SqlValue } from '../ports/sql.js';
import { appliedMigrationIds, applyMigrations } from './migrate.js';
import { MIGRATIONS, type Migration } from './migrations.js';

const NOW = '2026-10-15T12:00:00.000Z';

function executor(sqlite: Database.Database): SqlExecutor {
  return {
    exec: (text) => {
      sqlite.exec(text);
    },
    get: (text, params = []) =>
      sqlite.prepare(text).get(...params) as Record<string, unknown> | undefined,
    run: (text, params = []) => {
      sqlite.prepare(text).run(...(params as SqlValue[]));
    },
  };
}

function tableExists(exec: SqlExecutor, name: string): boolean {
  return (
    exec.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]) !==
    undefined
  );
}

const first: Migration = { id: '0001_a', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' };
const broken: Migration = {
  id: '0002_b',
  sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY); INSERT INTO missing_table VALUES (1);',
};

describe('applyMigrations', () => {
  it('rolls back a failing migration, leaving neither its tables nor its bookkeeping row', () => {
    const exec = executor(new Database(':memory:'));
    expect(() => applyMigrations(exec, NOW, { migrations: [first, broken] })).toThrow(
      /missing_table/,
    );
    expect(tableExists(exec, 'a')).toBe(true);
    expect(tableExists(exec, 'b')).toBe(false);
    expect(appliedMigrationIds(exec, [first, broken])).toEqual(['0001_a']);
  });

  it('calls beforeApply only when upgrading an existing library', () => {
    const exec = executor(new Database(':memory:'));
    const calls: string[][] = [];
    const beforeApply = (pending: readonly Migration[]) => calls.push(pending.map((m) => m.id));
    const second: Migration = { id: '0002_c', sql: 'CREATE TABLE c (id INTEGER PRIMARY KEY);' };

    applyMigrations(exec, NOW, { migrations: [first], beforeApply });
    expect(calls).toEqual([]);
    expect(applyMigrations(exec, NOW, { migrations: [first, second], beforeApply })).toEqual([
      '0002_c',
    ]);
    expect(calls).toEqual([['0002_c']]);
    expect(applyMigrations(exec, NOW, { migrations: [first, second], beforeApply })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('applies the bundled migrations to a fresh database', () => {
    const exec = executor(new Database(':memory:'));
    expect(applyMigrations(exec, NOW)).toEqual(MIGRATIONS.map((m) => m.id));
  });
});

describe('embedded migrations', () => {
  it('match the .sql sources (run `pnpm --filter @climbing-coach/core migrations:embed`)', () => {
    for (const migration of MIGRATIONS) {
      const file = new URL(`./migrations/${migration.id.replace('_', '-')}.sql`, import.meta.url);
      expect(migration.sql).toBe(readFileSync(file, 'utf8'));
    }
  });
});
