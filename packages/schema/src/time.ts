import { z } from 'zod';

/** Media time in integer microseconds from stream start. */
export type Us = number & { readonly __brand: 'Us' };

export const UsSchema = z
  .number()
  .int('Us must be an integer')
  .nonnegative('Us must be non-negative')
  .transform((n) => n as Us);

export function us(value: number): Us {
  return UsSchema.parse(value);
}

export function usOrThrow(value: number, label = 'Us'): Us {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer microsecond count`);
  }
  return value as Us;
}

/** Wall-clock ISO 8601 UTC timestamp string. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** Calendar day in the climber's local time: YYYY-MM-DD. */
export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export type LocalDate = z.infer<typeof LocalDateSchema>;
