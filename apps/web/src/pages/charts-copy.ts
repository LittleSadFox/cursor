import type { FocusTag } from '@climbing-coach/api';

export function formatRatio(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

/** "Power 3 · Technique 1", most frequent first, using tag labels where known. */
export function focusCountsText(
  counts: Readonly<Record<string, number>>,
  tags: readonly FocusTag[],
): string {
  const label = (id: string) => tags.find((tag) => tag.id === id)?.label ?? id;
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([a, x], [b, y]) => y - x || label(a).localeCompare(label(b)))
    .map(([id, count]) => `${label(id)} ${count}`)
    .join(' · ');
}
