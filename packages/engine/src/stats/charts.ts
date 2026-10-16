import { compareGrades, gradeIndexFor } from '../grades/order.js';
import type { GradeSystem } from '../grades/systems.js';

import { daysBetween, isoMonth, isoWeek } from './dates.js';
import { sessionLoad } from './load.js';
import type {
  DailyLog,
  DateRange,
  Discipline,
  ExertionVolumePoint,
  FocusBucket,
  GradeTally,
  WeeklySummary,
} from './types.js';

export function exertionVolume(logs: readonly DailyLog[], range: DateRange): ExertionVolumePoint[] {
  return logs
    .filter((log) => log.date >= range.from && log.date <= range.to)
    .map((log) => ({
      date: log.date,
      exertion: log.rest ? 0 : log.sessionExertion,
      volume: log.boulderCount + log.routeCount,
    }));
}

export function focusDistribution(
  logs: readonly DailyLog[],
  range: DateRange,
  bucket: 'week' | 'month',
): FocusBucket[] {
  const grouped = new Map<string, Record<string, number>>();
  for (const log of logs) {
    if (log.date < range.from || log.date > range.to) continue;
    if (log.rest) continue;
    const key = bucket === 'week' ? isoWeek(log.date) : isoMonth(log.date);
    const counts = grouped.get(key) ?? {};
    const tags = [
      ...(log.primaryFocusId === null ? [] : [log.primaryFocusId]),
      ...log.secondaryFocusIds,
    ];
    for (const tag of tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
    grouped.set(key, counts);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([bucketKey, counts]) => ({ bucket: bucketKey, counts }));
}

export function gradePyramid(
  logs: readonly DailyLog[],
  range: DateRange,
  discipline: Discipline,
): GradeTally[] {
  const byGrade = new Map<string, GradeTally>();
  for (const log of logs) {
    if (log.date < range.from || log.date > range.to) continue;
    for (const row of log.grades) {
      if (row.discipline !== discipline) continue;
      const existing = byGrade.get(row.grade) ?? {
        discipline,
        grade: row.grade,
        attempted: 0,
        sent: 0,
      };
      existing.attempted += row.attempted;
      existing.sent += row.sent;
      byGrade.set(row.grade, existing);
    }
  }
  return [...byGrade.values()].sort((a, b) => compareGrades(a.grade, b.grade, discipline));
}

function hardestSendIn(
  logs: readonly DailyLog[],
  discipline: Discipline,
  gradeSystem: GradeSystem,
): string | null {
  let hardest: string | null = null;
  let hardestIndex = -Infinity;
  for (const log of logs) {
    for (const row of log.grades) {
      if (row.discipline !== discipline || row.sent <= 0) continue;
      const index = gradeIndexFor(row.grade, discipline, gradeSystem);
      if (index !== null && index > hardestIndex) {
        hardestIndex = index;
        hardest = row.grade;
      }
    }
  }
  return hardest;
}

function daysSinceLastRest(logs: readonly DailyLog[], asOf: string | undefined): number | null {
  if (asOf === undefined) return null;
  let lastRest: string | null = null;
  for (const log of logs) {
    if (!log.rest || log.date > asOf) continue;
    if (lastRest === null || log.date > lastRest) lastRest = log.date;
  }
  return lastRest === null ? null : daysBetween(lastRest, asOf);
}

export function weeklySummary(
  logs: readonly DailyLog[],
  week: string,
  gradeSystem: GradeSystem = 'v',
): WeeklySummary {
  const inWeek = logs.filter((log) => isoWeek(log.date) === week);
  const sessions = inWeek.filter((log) => !log.rest).length;
  const loads = inWeek.map(sessionLoad).filter((value): value is number => value !== null);
  const totalLoad = loads.length === 0 ? null : loads.reduce((sum, n) => sum + n, 0);

  // Boulder and route indices are on different scales, so a route send only counts when
  // there was no boulder send that week.
  const hardestSend =
    hardestSendIn(inWeek, 'boulder', gradeSystem) ?? hardestSendIn(inWeek, 'route', gradeSystem);

  const lastLoggedInWeek = inWeek.reduce<string | undefined>(
    (latest, log) => (latest === undefined || log.date > latest ? log.date : latest),
    undefined,
  );
  const daysSinceRest = daysSinceLastRest(logs, lastLoggedInWeek);

  return { week, sessions, totalLoad, hardestSend, daysSinceRest };
}
