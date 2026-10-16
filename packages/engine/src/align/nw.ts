const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;

/** Global alignment on limb identity. Identical sequences match on the diagonal. */
export function matchMoves<T extends { limb: string }>(
  left: readonly T[],
  right: readonly T[],
): { aIndex: number; bIndex: number }[] {
  const n = left.length;
  const m = right.length;
  const score = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = 1; i <= n; i += 1) {
    const row = score[i];
    const prev = score[i - 1];
    if (row && prev) row[0] = (prev[0] ?? 0) + GAP;
  }
  const first = score[0];
  if (first) {
    for (let j = 1; j <= m; j += 1) first[j] = (first[j - 1] ?? 0) + GAP;
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const diag =
        (score[i - 1]?.[j - 1] ?? 0) +
        (left[i - 1]?.limb === right[j - 1]?.limb ? MATCH : MISMATCH);
      const up = (score[i - 1]?.[j] ?? 0) + GAP;
      const leftScore = (score[i]?.[j - 1] ?? 0) + GAP;
      const cell = score[i];
      if (cell) cell[j] = Math.max(diag, up, leftScore);
    }
  }
  const pairs: { aIndex: number; bIndex: number }[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const current = score[i]?.[j] ?? 0;
    if (i > 0 && j > 0) {
      const diag =
        (score[i - 1]?.[j - 1] ?? 0) +
        (left[i - 1]?.limb === right[j - 1]?.limb ? MATCH : MISMATCH);
      if (current === diag) {
        pairs.push({ aIndex: i - 1, bIndex: j - 1 });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && current === (score[i - 1]?.[j] ?? 0) + GAP) {
      i -= 1;
      continue;
    }
    j -= 1;
  }
  pairs.reverse();
  return pairs;
}
