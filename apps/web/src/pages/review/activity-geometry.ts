/** Vertical band inside a 0–100 SVG viewBox. */
export type ChartBand = { top: number; height: number };

/** Energy sits in the upper band; hip speed in the lower one; on-wall is a strip along the bottom. */
export const ENERGY_BAND: ChartBand = { top: 4, height: 52 };
export const HIP_BAND: ChartBand = { top: 62, height: 28 };
export const ON_WALL_TOP = 94;
export const ON_WALL_HEIGHT = 6;

export function peakOf(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

/** Scale that keeps the threshold line off the top of the energy band. */
export function energyScale(energies: readonly number[], threshold: number): number {
  return Math.max(peakOf(energies), threshold * 2, 1e-6);
}

export function chartPoints(
  samples: readonly { tUs: number; value: number }[],
  durationUs: number,
  yMax: number,
  band: ChartBand,
  signed = false,
): string {
  if (durationUs <= 0 || yMax <= 0 || samples.length === 0) return '';
  return samples
    .map((sample) => {
      const x = (sample.tUs / durationUs) * 100;
      const fraction = signed ? 0.5 - (sample.value / yMax) * 0.5 : 1 - sample.value / yMax;
      const y = band.top + band.height * Math.min(1, Math.max(0, fraction));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function thresholdY(threshold: number, yMax: number, band: ChartBand): number {
  if (yMax <= 0) return band.top + band.height;
  const fraction = 1 - Math.min(1, Math.max(0, threshold / yMax));
  return band.top + band.height * fraction;
}

/** Runs of `on` samples, closed at `durationUs` when the last sample is still on. */
export function flagSpans(
  points: readonly { tUs: number; on: boolean }[],
  durationUs: number,
): { startUs: number; endUs: number }[] {
  const spans: { startUs: number; endUs: number }[] = [];
  let start: number | null = null;
  for (const point of points) {
    if (point.on && start === null) start = point.tUs;
    if (!point.on && start !== null) {
      spans.push({ startUs: start, endUs: point.tUs });
      start = null;
    }
  }
  if (start !== null) spans.push({ startUs: start, endUs: durationUs });
  return spans;
}
