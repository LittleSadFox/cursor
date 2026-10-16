import type { MessageValues } from '../format.js';

export function formatPrefillBasis(
  basis: { attempts: number; mean: number | null; max: number | null },
  fill: (values: MessageValues) => string,
  empty: string,
): string {
  if (basis.attempts === 0) return empty;
  return fill(basis);
}
