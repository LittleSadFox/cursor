export type CompareSearch = { a?: string; b?: string };

/** `/compare?a=&b=` search params: trimmed, non-empty attempt ids only. */
export function compareSearch(search: Record<string, unknown>): CompareSearch {
  const pick = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  const a = pick(search.a);
  const b = pick(search.b);
  return { ...(a ? { a } : {}), ...(b ? { b } : {}) };
}
