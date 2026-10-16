import { toDifficultyIndex } from '../grades/convert.js';
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

export function exertionVolume(
  logs: readonly DailyLog[],
  range: DateRange,
): ExertionVolumePoint[] {
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
  return [...byGrade.values()].sort((a, b) => a.grade.localeCompare(b.grade));
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

  let hardestSend: string | null = null;
  let hardestIndex = -Infinity;
  for (const log of inWeek) {
    for (const row of log.grades) {
      if (row.sent <= 0) continue;
      const index = toDifficultyIndex(row.grade, row.discipline === 'boulder' ? gradeSystem : 'yds');
      if (index === null) continue;
      if (index > hardestIndex) {
        hardestIndex = index;
        hardestSend = row.grade;
      }
    }
  }

  const restDays = logs.filter((log) => log.rest).map((log) => log.date).sort();
  const weekLogs = inWeek.map((log) => log.date).sort();
  const weekEnd = weekLogs[weekLogs.length - 1];
  const lastRest = restDays.reduce<string | null>((latest, date) => {
    if (weekEnd !== undefined && date > weekEnd) return latest;
    return date;
  }, null);
  const daysSinceRest =
    lastRest === null || weekEnd === undefined ? null : daysBetween(lastRest, weekEnd);

  return { week, sessions, totalLoad, hardestSend, daysSinceRest };
}
