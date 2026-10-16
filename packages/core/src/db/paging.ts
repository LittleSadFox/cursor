import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { decodeCursor, encodeCursor, ProblemError, type Page } from '@climbing-coach/api';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function pageLimit(limit: number | undefined): number {
  return Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));
}

/** Decodes an opaque cursor; anything malformed is a 400, not a 500. */
export function readCursor<T>(
  cursor: string | undefined,
  isValid: (value: unknown) => value is T,
): T | undefined {
  if (cursor === undefined) return undefined;
  let value: unknown;
  try {
    value = decodeCursor<unknown>(cursor);
  } catch {
    value = undefined;
  }
  if (!isValid(value)) throw new ProblemError('VALIDATION_FAILED', 'invalid cursor');
  return value;
}

/** `rows` must hold up to `limit + 1` rows; the extra row only signals another page. */
export function toPage<Row, Item>(
  rows: readonly Row[],
  limit: number,
  toItem: (row: Row) => Item,
  cursorOf: (row: Row) => unknown,
): Page<Item> {
  const slice = rows.slice(0, limit);
  const last = slice[slice.length - 1];
  return {
    items: slice.map(toItem),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

export type IdCursor = { id: string };

export function isIdCursor(value: unknown): value is IdCursor {
  return typeof value === 'object' && value !== null && typeof (value as IdCursor).id === 'string';
}

/** Case-insensitive substring match with `%`, `_`, and `\` in the query taken literally. */
export function containsText(column: SQLiteColumn, query: string): SQL {
  const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return sql`${column} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
}
