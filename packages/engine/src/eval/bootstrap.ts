import type { Rng } from './rng.js';

export type MedianInterval = {
  median: number;
  low: number;
  high: number;
  n: number;
};

function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) {
    throw new RangeError('medianOf requires a non-empty array');
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function resample(values: readonly number[], rng: Rng): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const idx = Math.floor(rng() * values.length);
    out[i] = values[idx]!;
  }
  return out;
}

/**
 * Percentile bootstrap CI for the median (default 95%).
 * `rng` must be seeded so reports are reproducible.
 */
export function bootstrapMedianCi(
  values: readonly number[],
  options: { iterations: number; rng: Rng; alpha?: number },
): MedianInterval {
  if (values.length === 0) {
    return { median: Number.NaN, low: Number.NaN, high: Number.NaN, n: 0 };
  }
  const alpha = options.alpha ?? 0.05;
  const sorted = [...values].sort((a, b) => a - b);
  const median = medianOf(sorted);
  const boot: number[] = [];
  for (let i = 0; i < options.iterations; i++) {
    const sample = resample(values, options.rng).sort((a, b) => a - b);
    boot.push(medianOf(sample));
  }
  boot.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * boot.length);
  const hiIdx = Math.min(boot.length - 1, Math.ceil((1 - alpha / 2) * boot.length) - 1);
  return {
    median,
    low: boot[loIdx]!,
    high: boot[hiIdx]!,
    n: values.length,
  };
}
