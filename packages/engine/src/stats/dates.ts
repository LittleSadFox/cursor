const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD as UTC noon so calendar math is free of DST shifts. */
export function parseLocalDate(date: string): Date {
  if (!LOCAL_DATE_RE.test(date)) {
    throw new RangeError(`expected YYYY-MM-DD, got ${date}`);
  }
  return new Date(`${date}T12:00:00.000Z`);
}

export function formatLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const parsed = parseLocalDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatLocalDate(parsed);
}

export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from).getTime();
  const b = parseLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  if (from > to) return [];
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * ISO week label `YYYY-Www`. Week 1 is the week containing the year's first Thursday.
 */
export function isoWeek(date: string): string {
  const parsed = parseLocalDate(date);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const year = parsed.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((parsed.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isoMonth(date: string): string {
  return date.slice(0, 7);
}

export function compareLocalDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
