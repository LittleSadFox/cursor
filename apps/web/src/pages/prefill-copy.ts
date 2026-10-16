import { formatMessage } from '../format.js';

export function formatPrefillBasis(
  basis: { attempts: number; mean: number | null; max: number | null },
  template: string,
  empty: string,
): string {
  if (basis.attempts === 0) return empty;
  return formatMessage(template, basis);
}
