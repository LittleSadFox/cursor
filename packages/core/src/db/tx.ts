import type { AppDatabase } from '../ports/sql.js';

/** Runs `fn` in one SQLite transaction (a savepoint when already inside one). */
export function inTransaction<T>(db: AppDatabase, fn: (tx: AppDatabase) => T): T {
  return db.transaction((tx) => fn(tx as unknown as AppDatabase));
}
