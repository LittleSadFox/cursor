export function formatPrefillBasis(
  basis: { attempts: number; mean: number | null; max: number | null },
  template: string,
  empty: string,
): string {
  if (basis.attempts === 0) return empty;
  return template
    .replace('{attempts}', String(basis.attempts))
    .replace('{mean}', String(basis.mean ?? '—'))
    .replace('{max}', String(basis.max ?? '—'));
}
