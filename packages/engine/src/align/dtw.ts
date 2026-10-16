export type DtwStep = { indexA: number; indexB: number };

export type DtwResult = { path: DtwStep[]; cost: number };

const DIAG = 0;
const UP = 1;
const ACROSS = 2;

type Series = { data: Float64Array; length: number; width: number };

function flatten(rows: readonly (readonly number[])[], width: number): Series {
  const data = new Float64Array(rows.length * width);
  rows.forEach((row, i) => {
    for (let k = 0; k < width; k += 1) data[i * width + k] = row[k] ?? 0;
  });
  return { data, length: rows.length, width };
}

function cellCost(a: Series, i: number, b: Series, j: number): number {
  let sum = 0;
  const offA = i * a.width;
  const offB = j * b.width;
  for (let k = 0; k < a.width; k += 1) {
    const delta = (a.data[offA + k] ?? 0) - (b.data[offB + k] ?? 0);
    sum += delta * delta;
  }
  return sum;
}

/** Columns of row `i` inside the band: `|j - center| <= band`. */
export function bandRange(
  i: number,
  n: number,
  m: number,
  band: number,
  openEnd: boolean,
): [number, number] {
  if (n <= 1 || m <= 1) return [0, m - 1];
  const center = openEnd ? i : (i * (m - 1)) / (n - 1);
  return [Math.max(0, Math.ceil(center - band)), Math.min(m - 1, Math.floor(center + band))];
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

/**
 * Accumulated cost over the band only. Keeps two cost rows and one step byte per cell,
 * so memory is O(n·m) bytes rather than O(n·m) doubles.
 */
function fillCosts(
  a: Series,
  b: Series,
  band: number,
  openEnd: boolean,
): { steps: Uint8Array; lastRow: Float64Array } {
  const n = a.length;
  const m = b.length;
  const steps = new Uint8Array(n * m);
  let previous = new Float64Array(m).fill(Number.POSITIVE_INFINITY);
  let current = new Float64Array(m);
  for (let i = 0; i < n; i += 1) {
    current.fill(Number.POSITIVE_INFINITY);
    const [lo, hi] = bandRange(i, n, m, band, openEnd);
    for (let j = lo; j <= hi; j += 1) {
      const step = cellCost(a, i, b, j);
      if (i === 0 && j === 0) {
        current[0] = step;
        continue;
      }
      const diag = i > 0 && j > 0 ? (previous[j - 1] ?? Infinity) : Infinity;
      const up = i > 0 ? (previous[j] ?? Infinity) : Infinity;
      const across = j > 0 ? (current[j - 1] ?? Infinity) : Infinity;
      let best = diag;
      let from = DIAG;
      if (up < best) {
        best = up;
        from = UP;
      }
      if (across < best) {
        best = across;
        from = ACROSS;
      }
      if (best === Infinity) continue;
      current[j] = best + step;
      steps[i * m + j] = from;
    }
    [previous, current] = [current, previous];
  }
  return { steps, lastRow: previous };
}

function endColumn(lastRow: Float64Array, openEnd: boolean): number {
  const m = lastRow.length;
  if (!openEnd) return m - 1;
  let best = m - 1;
  for (let j = 0; j < m; j += 1) {
    if ((lastRow[j] ?? Infinity) < (lastRow[best] ?? Infinity)) best = j;
  }
  return best;
}

function tracePath(steps: Uint8Array, m: number, endI: number, endJ: number): DtwStep[] {
  const path: DtwStep[] = [];
  let i = endI;
  let j = endJ;
  while (i > 0 || j > 0) {
    path.push({ indexA: i, indexB: j });
    const from = steps[i * m + j] ?? DIAG;
    if (from === DIAG && i > 0 && j > 0) {
      i -= 1;
      j -= 1;
    } else if ((from === UP && i > 0) || j === 0) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  path.push({ indexA: 0, indexB: 0 });
  return path.reverse();
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
  const width = Math.max(left[0]?.length ?? 0, right[0]?.length ?? 0);
  const band = Math.max(1, Math.ceil(bandFraction * Math.max(n, m)));
  const { steps, lastRow } = fillCosts(flatten(left, width), flatten(right, width), band, openEnd);
  const endJ = endColumn(lastRow, openEnd);
  const cost = lastRow[endJ] ?? Infinity;
  if (!Number.isFinite(cost)) return { path: [], cost };
  return { path: tracePath(steps, m, n - 1, endJ), cost };
}
