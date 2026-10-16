import { at } from '../math.js';

/**
 * Project rows onto the top principal components.
 * Rows already at or below `components` are copied through.
 */
export function reduceFeatures(
  rows: readonly (readonly number[])[],
  components: number,
): number[][] {
  if (rows.length === 0) return [];
  const width = rows[0]?.length ?? 0;
  if (width === 0 || width <= components) {
    return rows.map((row) => [...row]);
  }
  const mean = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) + (row[col] ?? 0);
  }
  for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) / rows.length;
  const centered = rows.map((row) => row.map((value, col) => value - (mean[col] ?? 0)));
  const basis = topEigenvectors(covariance(centered), Math.min(components, width));
  return centered.map((row) => basis.map((vector) => dot(row, vector)));
}

export function reducePair(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
  components: number,
): { left: number[][]; right: number[][] } {
  const width = left[0]?.length ?? right[0]?.length ?? 0;
  if (width <= components) {
    return { left: left.map((row) => [...row]), right: right.map((row) => [...row]) };
  }
  const projected = reduceFeatures([...left, ...right], components);
  return { left: projected.slice(0, left.length), right: projected.slice(left.length) };
}

function covariance(rows: readonly number[][]): number[][] {
  const width = rows[0]?.length ?? 0;
  const cov = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const scale = Math.max(1, rows.length - 1);
  for (const row of rows) {
    for (let i = 0; i < width; i += 1) {
      for (let j = i; j < width; j += 1) {
        const value = ((row[i] ?? 0) * (row[j] ?? 0)) / scale;
        const covRow = cov[i];
        const covCol = cov[j];
        if (covRow) covRow[j] = (covRow[j] ?? 0) + value;
        if (i !== j && covCol) covCol[i] = (covCol[i] ?? 0) + value;
      }
    }
  }
  return cov;
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += (left[i] ?? 0) * (right[i] ?? 0);
  return sum;
}

const MAX_SWEEPS = 60;

function squaredNorms(matrix: readonly number[][]): { off: number; total: number } {
  let off = 0;
  let total = 0;
  matrix.forEach((row, i) =>
    row.forEach((value, j) => {
      total += value * value;
      if (i !== j) off += value * value;
    }),
  );
  return { off, total };
}

/**
 * Cyclic Jacobi eigen-decomposition, swept until the off-diagonal mass is negligible.
 * Columns of the returned vectors are the largest components.
 */
export function topEigenvectors(matrix: number[][], count: number): number[][] {
  const n = matrix.length;
  const work = matrix.map((row) => [...row]);
  const vectors = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    const { off, total } = squaredNorms(work);
    if (off <= 1e-24 * total || off === 0) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(work[p]?.[q] ?? 0) > 1e-300) rotate(work, vectors, p, q);
      }
    }
  }
  const order = Array.from({ length: n }, (_, index) => index).sort(
    (a, b) => Math.abs(work[b]?.[b] ?? 0) - Math.abs(work[a]?.[a] ?? 0),
  );
  return order.slice(0, count).map((column) => vectors.map((row) => at(row, column)));
}

function rotate(matrix: number[][], vectors: number[][], p: number, q: number): void {
  const app = matrix[p]?.[p] ?? 0;
  const aqq = matrix[q]?.[q] ?? 0;
  const apq = matrix[p]?.[q] ?? 0;
  const tau = (aqq - app) / (2 * apq);
  const root = Math.hypot(1, tau);
  const t = tau >= 0 ? 1 / (tau + root) : -1 / (-tau + root);
  const c = 1 / Math.sqrt(1 + t * t);
  const s = t * c;
  const n = matrix.length;
  for (let k = 0; k < n; k += 1) {
    if (k === p || k === q) continue;
    const mikp = matrix[k]?.[p] ?? 0;
    const mikq = matrix[k]?.[q] ?? 0;
    const row = matrix[k];
    if (row) {
      row[p] = c * mikp - s * mikq;
      row[q] = s * mikp + c * mikq;
    }
    const prow = matrix[p];
    const qrow = matrix[q];
    if (prow) prow[k] = row?.[p] ?? 0;
    if (qrow) qrow[k] = row?.[q] ?? 0;
  }
  const prow = matrix[p];
  const qrow = matrix[q];
  if (prow) {
    prow[p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    prow[q] = 0;
  }
  if (qrow) {
    qrow[q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    qrow[p] = 0;
  }
  for (let k = 0; k < n; k += 1) {
    const vkp = vectors[k]?.[p] ?? 0;
    const vkq = vectors[k]?.[q] ?? 0;
    const row = vectors[k];
    if (!row) continue;
    row[p] = c * vkp - s * vkq;
    row[q] = s * vkp + c * vkq;
  }
}
