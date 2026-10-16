export type OneEuroParams = {
  minCutoffHz: number;
  beta: number;
  dCutoffHz: number;
};

/**
 * Low-pass alpha from Casiez et al., "The 1€ Filter" (CHI 2012).
 * `cutoffHz` is the cutoff, `dtSec` is the sample period.
 */
export function lowPassAlpha(cutoffHz: number, dtSec: number): number {
  if (dtSec <= 0 || cutoffHz <= 0) return 1;
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export function smoothStep(alpha: number, value: number, previous: number): number {
  return alpha * value + (1 - alpha) * previous;
}

/**
 * Filter a scalar series. `tUs` must be non-decreasing.
 * The first sample is copied through.
 */
export function oneEuroFilter(
  tUs: readonly number[],
  values: readonly number[],
  params: OneEuroParams,
): number[] {
  if (tUs.length !== values.length) {
    throw new Error('oneEuroFilter: timestamp and value length differ');
  }
  if (values.length === 0) return [];
  const out: number[] = [];
  const first = values[0];
  const firstT = tUs[0];
  if (first === undefined || firstT === undefined) return [];
  out.push(first);
  let xHat = first;
  let dxHat = 0;
  let prevX = first;
  let prevT = firstT;
  for (let i = 1; i < values.length; i += 1) {
    const x = values[i];
    const t = tUs[i];
    if (x === undefined || t === undefined) break;
    const dt = (t - prevT) / 1_000_000;
    const alphaD = lowPassAlpha(params.dCutoffHz, dt);
    const dx = dt > 0 ? (x - prevX) / dt : 0;
    dxHat = smoothStep(alphaD, dx, dxHat);
    const cutoff = params.minCutoffHz + params.beta * Math.abs(dxHat);
    const alpha = lowPassAlpha(cutoff, dt);
    xHat = smoothStep(alpha, x, xHat);
    out.push(xHat);
    prevX = x;
    prevT = t;
  }
  return out;
}
