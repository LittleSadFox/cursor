import { ProblemError } from '@climbing-coach/api';

type SafeParser<T> = {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
      };
};

/** Parses with an API schema so in-process callers get the same VALIDATION_FAILED problem as HTTP callers. */
export function parseInput<T>(schema: SafeParser<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const errors = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  throw new ProblemError(
    'VALIDATION_FAILED',
    errors.map((e) => `${e.path || 'input'}: ${e.message}`).join('; '),
    errors,
  );
}
