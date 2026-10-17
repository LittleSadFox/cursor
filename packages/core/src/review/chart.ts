/** Evenly spaced samples, including the last, capped at `maxPoints`. */
export function chartStride<T>(items: readonly T[], maxPoints: number): T[] {
  if (maxPoints < 1 || items.length === 0) return [];
  if (items.length <= maxPoints) return [...items];
  const step = items.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => {
    const item = items[Math.min(items.length - 1, Math.floor(index * step))];
    return item ?? items[items.length - 1]!;
  });
}
