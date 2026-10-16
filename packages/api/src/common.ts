import { z } from 'zod';

import { LocalDateSchema, UlidSchema } from '@climbing-coach/schema';

export const IdSchema = UlidSchema;
export type Id = z.infer<typeof IdSchema>;

export const DisciplineSchema = z.enum(['boulder', 'route']);
export type Discipline = z.infer<typeof DisciplineSchema>;

export const CursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});
export type CursorQuery = z.infer<typeof CursorQuerySchema>;

export type Page<T> = { items: T[]; nextCursor: string | null };

export type Accepted<T extends object = object> = { jobId: Id } & T;

export const DateRangeQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
});
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

export function encodeCursor(value: unknown): string {
  return utf8ToBase64Url(JSON.stringify(value));
}

export function decodeCursor<T>(cursor: string): T {
  return JSON.parse(base64UrlToUtf8(cursor)) as T;
}

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(cursor: string): string {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export type ListQuery = { limit?: number | undefined; cursor?: string | undefined };
