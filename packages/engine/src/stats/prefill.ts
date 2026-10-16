import { median } from '../math.js';

import type { AttemptSummary, GradeTally, TrainingLogPrefill } from './types.js';

function roundHalf(value: number): number {
  return Math.round(value);
}

function tallyGrades(attempts: readonly AttemptSummary[]): GradeTally[] {
  const byKey = new Map<string, GradeTally>();
  for (const attempt of attempts) {
    if (attempt.boulderGrade === null) continue;
    const key = `${attempt.discipline}:${attempt.boulderGrade}`;
    const existing = byKey.get(key) ?? {
      discipline: attempt.discipline,
      grade: attempt.boulderGrade,
      attempted: 0,
      sent: 0,
    };
    existing.attempted += 1;
    if (attempt.outcome === 'top') existing.sent += 1;
    byKey.set(key, existing);
  }
  return [...byKey.values()].sort((a, b) => a.grade.localeCompare(b.grade));
}

/**
 * Prefill today's training log from filmed attempts (PLAN 2.11).
 * Session exertion = round(0.5 × max + 0.5 × mean) of rated exertions.
 */
export function prefillTrainingLog(
  _date: string,
  attempts: readonly AttemptSummary[],
): TrainingLogPrefill {
  const rated = attempts
    .map((attempt) => attempt.exertion)
    .filter((value): value is number => value !== null);
  const mean = rated.length === 0 ? null : rated.reduce((sum, n) => sum + n, 0) / rated.length;
  const max = rated.length === 0 ? null : Math.max(...rated);
  const sessionExertion =
    mean === null || max === null ? null : roundHalf(0.5 * max + 0.5 * mean);

  const boulderIds = new Set(
    attempts
      .filter((attempt) => attempt.discipline === 'boulder' && attempt.boulderId !== null)
      .map((attempt) => attempt.boulderId as string),
  );

  return {
    sessionExertion,
    basis: {
      attempts: rated.length,
      mean: mean === null ? null : Math.round(mean * 10) / 10,
      max,
    },
    boulderCount: boulderIds.size,
    grades: tallyGrades(attempts),
  };
}

/** Exposed for tests that want a known-stable average besides the blend. */
export function prefillMedianExertion(attempts: readonly AttemptSummary[]): number | null {
  const rated = attempts
    .map((attempt) => attempt.exertion)
    .filter((value): value is number => value !== null);
  return rated.length === 0 ? null : median(rated);
}
