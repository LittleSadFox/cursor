/** Supported grade systems (PLAN 2.10–2.11). */
export const GRADE_SYSTEMS = ['v', 'font', 'yds', 'french'] as const;
export type GradeSystem = (typeof GRADE_SYSTEMS)[number];

export const BOULDER_SYSTEMS: readonly GradeSystem[] = ['v', 'font'];
export const ROUTE_SYSTEMS: readonly GradeSystem[] = ['yds', 'french'];

export function isGradeSystem(value: string): value is GradeSystem {
  return (GRADE_SYSTEMS as readonly string[]).includes(value);
}
