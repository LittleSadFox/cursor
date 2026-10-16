export function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null || text === '') return fallback;
  return JSON.parse(text) as T;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
