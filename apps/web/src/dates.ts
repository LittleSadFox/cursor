export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days, 12));
  return next.toISOString().slice(0, 10);
}

export type RangeKey = 'week' | '4weeks' | '3months' | 'year' | 'all';

export function rangeFrom(key: RangeKey, today: string): { from: string; to: string } {
  if (key === 'week') return { from: addLocalDays(today, -6), to: today };
  if (key === '4weeks') return { from: addLocalDays(today, -27), to: today };
  if (key === '3months') return { from: addLocalDays(today, -89), to: today };
  if (key === 'year') return { from: addLocalDays(today, -364), to: today };
  return { from: addLocalDays(today, -3650), to: today };
}

export function isoWeekOf(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const year = parsed.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((parsed.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
