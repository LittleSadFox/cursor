import { addDays } from '@climbing-coach/engine';

/** Shift an ISO timestamp by whole days using the calendar date prefix. */
export function addDaysIso(iso: string, days: number): string {
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return iso;
  const next = addDays(date, days);
  return `${next}${iso.slice(10)}`;
}
