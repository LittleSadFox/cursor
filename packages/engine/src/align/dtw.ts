export type DtwStep = { indexA: number; indexB: number };

export type DtwResult = { path: DtwStep[]; cost: number };

function cellCost(left: readonly number[], right: readonly number[]): number {
  const width = Math.max(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < width; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    sum += delta * delta;
  }
  return sum;
}

function inBand(
  i: number,
  j: number,
  n: number,
  m: number,
  band: number,
  openEnd: boolean,
): boolean {
  if (n <= 1 || m <= 1) return true;
  if (openEnd) return Math.abs(j - i) <= band;
  const expected = (i * (m - 1)) / (n - 1);
  return Math.abs(j - expected) <= band;
}

/**
 * Sakoe-Chiba banded DTW. `bandFraction` is a fraction of the longer series.
 * Ties prefer the diagonal step, so a series matched to itself is the diagonal.
 */
export function bandedDtw(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
  bandFraction: number,
): DtwResult {
  return alignDtw(left, right, bandFraction, false);
}

/** Align all of `left` to a prefix of `right` (the attempt that ended early is `left`). */
export function openEndDtw(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
  bandFraction: number,
): DtwResult {
  return alignDtw(left, right, bandFraction, true);
}

function alignDtw(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
  bandFraction: number,
  openEnd: boolean,
): DtwResult {
  const n = left.length;
  const m = right.length;
  if (n === 0 || m === 0) return { path: [], cost: 0 };
  const band = Math.max(1, Math.ceil(bandFraction * Math.max(n, m)));
  const cost: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: m }, () => Number.POSITIVE_INFINITY),
  );
  const from: number[][] = Array.from({ length: n }, () => Array.from({ length: m }, () => 0));
  const origin = cost[0];
  if (origin) origin[0] = cellCost(left[0] ?? [], right[0] ?? []);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      if ((i === 0 && j === 0) || !inBand(i, j, n, m, band, openEnd)) continue;
      const step = cellCost(left[i] ?? [], right[j] ?? []);
      let best = Number.POSITIVE_INFINITY;
      let stepFrom = 0;
      const diag =
        i > 0 && j > 0
          ? (cost[i - 1]?.[j - 1] ?? Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY;
      const up = i > 0 ? (cost[i - 1]?.[j] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const across =
        j > 0 ? (cost[i]?.[j - 1] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      if (diag < best) {
        best = diag;
        stepFrom = 0;
      }
      if (up < best) {
        best = up;
        stepFrom = 1;
      }
      if (across < best) {
        best = across;
        stepFrom = 2;
      }
      if (Number.isFinite(best)) {
        const row = cost[i];
        const fromRow = from[i];
        if (row) row[j] = best + step;
        if (fromRow) fromRow[j] = stepFrom;
      }
    }
  }
  let endJ = m - 1;
  if (openEnd) {
    let best = Number.POSITIVE_INFINITY;
    const last = cost[n - 1] ?? [];
    for (let j = 0; j < m; j += 1) {
      const value = last[j] ?? Number.POSITIVE_INFINITY;
      if (value < best) {
        best = value;
        endJ = j;
      }
    }
  }
  const endCost = cost[n - 1]?.[endJ] ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(endCost)) return { path: [], cost: endCost };
  const path: DtwStep[] = [];
  let i = n - 1;
  let j = endJ;
  while (i > 0 || j > 0) {
    path.push({ indexA: i, indexB: j });
    const stepFrom = from[i]?.[j] ?? 0;
    if (stepFrom === 0 && i > 0 && j > 0) {
      i -= 1;
      j -= 1;
    } else if (stepFrom === 1 && i > 0) {
      i -= 1;
    } else if (j > 0) {
      j -= 1;
    } else {
      i -= 1;
    }
  }
  path.push({ indexA: 0, indexB: 0 });
  path.reverse();
  return { path, cost: endCost };
}
