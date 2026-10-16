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

type FilterState = { xHat: number; dxHat: number; prevX: number; prevT: number };

function stepFilter(state: FilterState, x: number, t: number, params: OneEuroParams): number {
  const dt = (t - state.prevT) / 1_000_000;
  const dx = dt > 0 ? (x - state.prevX) / dt : 0;
  state.dxHat = smoothStep(lowPassAlpha(params.dCutoffHz, dt), dx, state.dxHat);
  const cutoff = params.minCutoffHz + params.beta * Math.abs(state.dxHat);
  state.xHat = smoothStep(lowPassAlpha(cutoff, dt), x, state.xHat);
  state.prevX = x;
  state.prevT = t;
  return state.xHat;
}

/**
 * Filter `values` into `out`. Non-finite samples (missing landmarks are NaN) pass
 * through unchanged and restart the filter, so a gap never poisons later frames.
 */
export function oneEuroInto(
  out: { [index: number]: number; length: number },
  tUs: ArrayLike<number>,
  values: ArrayLike<number>,
  params: OneEuroParams,
): void {
  if (tUs.length !== values.length || out.length < values.length) {
    throw new Error('oneEuroFilter: timestamp, value, and output lengths differ');
  }
  let state: FilterState | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const x = values[i] ?? Number.NaN;
    const t = tUs[i] ?? Number.NaN;
    if (!Number.isFinite(x) || !Number.isFinite(t)) {
      out[i] = x;
      state = null;
    } else if (state === null) {
      state = { xHat: x, dxHat: 0, prevX: x, prevT: t };
      out[i] = x;
    } else {
      out[i] = stepFilter(state, x, t, params);
    }
  }
}

/**
 * Filter a scalar series. `tUs` must be non-decreasing.
 * The first finite sample after the start or a gap is copied through.
 */
export function oneEuroFilter(
  tUs: readonly number[],
  values: readonly number[],
  params: OneEuroParams,
): number[] {
  const out = new Array<number>(values.length);
  oneEuroInto(out, tUs, values, params);
  return out;
}
