import { ProblemError } from '@climbing-coach/api';

export function assertVersion(actual: number, expected: number | undefined, label: string): void {
  if (expected === undefined) return;
  if (actual !== expected) {
    throw new ProblemError(
      'VERSION_CONFLICT',
      `${label} version ${actual} does not match expected ${expected}`,
    );
  }
}

export function nextVersion(current: number): number {
  return current + 1;
}
