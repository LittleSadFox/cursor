import { toDifficultyIndex } from './convert.js';
import { BOULDER_SYSTEMS, ROUTE_SYSTEMS, type GradeSystem } from './systems.js';

export type GradeDiscipline = 'boulder' | 'route';

/**
 * Difficulty index for a grade logged under `discipline`. Tries `preferred` first, then the
 * discipline's other systems, so a V grade still parses after the user switches to Font.
 */
export function gradeIndexFor(
  grade: string,
  discipline: GradeDiscipline,
  preferred?: GradeSystem,
): number | null {
  const systems = discipline === 'boulder' ? BOULDER_SYSTEMS : ROUTE_SYSTEMS;
  const order =
    preferred !== undefined && systems.includes(preferred) ? [preferred, ...systems] : systems;
  for (const system of order) {
    const index = toDifficultyIndex(grade, system);
    if (index !== null) return index;
  }
  return null;
}

/** Easiest first. Unparseable grades sort after known ones, in natural string order. */
export function compareGrades(a: string, b: string, discipline: GradeDiscipline): number {
  const ia = gradeIndexFor(a, discipline);
  const ib = gradeIndexFor(b, discipline);
  if (ia !== null && ib !== null && ia !== ib) return ia - ib;
  if (ia !== null && ib === null) return -1;
  if (ia === null && ib !== null) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
}
