import { describe, expect, it } from 'vitest';

import { createMulberry32 } from '../eval/rng.js';
import { align } from './align.js';
import { bandedDtw, openEndDtw } from './dtw.js';
import { matchMoves } from './nw.js';
import { reduceFeatures, reducePair } from './pca.js';
import { collapseRests } from './rest.js';
import type { AlignFrame } from './align.js';

function series(values: readonly number[], speed = 1, frameUs = 66_667): AlignFrame[] {
  return values.map((value, index) => ({
    tUs: index * frameUs,
    values: [value],
    speed,
  }));
}

function pathSteps(path: { indexA: number; indexB: number }[]): void {
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    if (!prev || !next) continue;
    const di = next.indexA - prev.indexA;
    const dj = next.indexB - prev.indexB;
    expect([0, 1]).toContain(di);
    expect([0, 1]).toContain(dj);
    expect(di + dj).toBeGreaterThan(0);
  }
}

describe('align', () => {
  it('matches identical move sequences on the diagonal', () => {
    const moves = [{ limb: 'leftWrist' }, { limb: 'rightWrist' }, { limb: 'leftWrist' }];
    const pairs = matchMoves(moves, moves);
    expect(pairs).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 1, bIndex: 1 },
      { aIndex: 2, bIndex: 2 },
    ]);
  });

  it('collapses a long rest to three frames', () => {
    const frames = series(
      Array.from({ length: 40 }, () => 1),
      0,
      50_000,
    );
    const kept = collapseRests(frames, { maxSpeed: 0.1, minDurationUs: 1_000_000, keep: 3 });
    expect(kept).toHaveLength(3);
  });

  it('aligns a series to itself on the diagonal', () => {
    const frames = series(Array.from({ length: 30 }, (_, index) => index));
    const result = align(frames, frames, { openEnd: false });
    expect(result.path).toHaveLength(30);
    result.path.forEach((step) => expect(step.indexA).toBe(step.indexB));
    pathSteps(result.path);
  });

  it('recovers a mild slow-down plus an inserted rest', () => {
    const frameUs = 66_667;
    const source = Array.from({ length: 36 }, (_, index) => index / 6);
    const warped: { value: number; source: number; speed: number }[] = [];
    source.forEach((value, index) => {
      const copies = index >= 16 && index < 22 ? 2 : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        warped.push({ value, source: index, speed: copy === 0 ? 1 : 0.5 });
      }
      if (index === 28) {
        for (let rest = 0; rest < 18; rest += 1) warped.push({ value, source: index, speed: 0 });
      }
    });
    const left = series(source, 1, frameUs);
    const right = warped.map((frame, index) => ({
      tUs: index * frameUs,
      values: [frame.value],
      speed: frame.speed,
    }));
    const collapsed = collapseRests(
      right.map((frame, index) => ({ ...frame, source: warped[index]?.source ?? 0 })),
      { maxSpeed: 0.1, minDurationUs: 1_000_000, keep: 3 },
    );
    const result = align(left, right, { openEnd: false, pcaComponents: 4 });
    pathSteps(result.path);
    const errors = result.path.map((step) =>
      Math.abs((collapsed[step.indexB]?.source ?? step.indexA) - step.indexA),
    );
    const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
    const within = errors.filter((error) => error <= 2).length / errors.length;
    expect(mean).toBeLessThanOrEqual(1);
    expect(within).toBeGreaterThanOrEqual(0.95);
  });

  it('open-end DTW stops at the end of the shorter attempt', () => {
    const full = Array.from({ length: 24 }, (_, index) => [index]);
    const prefix = full.slice(0, 10);
    const result = openEndDtw(prefix, full, 0.2);
    const last = result.path[result.path.length - 1];
    expect(last?.indexA).toBe(9);
    expect(last?.indexB).toBeLessThan(16);
    pathSteps(result.path);
  });

  it('PCA fallback on a shared basis stays within a frame of full-feature DTW', () => {
    const rng = createMulberry32(3);
    const mix = Array.from({ length: 21 }, () => [rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const row = (phase: number): number[] => {
      const latent = [Math.sin(phase / 3), Math.cos(phase / 5), Math.sin(phase / 7) * 0.5];
      return mix.map(
        (weights) =>
          weights.reduce((sum, weight, k) => sum + weight * (latent[k] ?? 0), 0) +
          (rng() - 0.5) * 1e-3,
      );
    };
    const left = Array.from({ length: 60 }, (_, index) => row(index));
    // Right runs at 0.75× speed through the middle third.
    const phases: number[] = [];
    for (let phase = 0; phase < 60; phase += phase >= 20 && phase < 40 ? 0.75 : 1) {
      phases.push(phase);
    }
    const right = phases.map(row);
    const full = bandedDtw(left, right, 0.2);
    const reduced = reducePair(left, right, 16);
    const fallback = bandedDtw(reduced.left, reduced.right, 0.2);
    const meanMatch = (path: { indexA: number; indexB: number }[]): number[] =>
      left.map((_, i) => {
        const matches = path.filter((step) => step.indexA === i).map((step) => step.indexB);
        return matches.reduce((sum, j) => sum + j, 0) / Math.max(1, matches.length);
      });
    const fullMatch = meanMatch(full.path);
    meanMatch(fallback.path).forEach((j, i) =>
      expect(Math.abs(j - (fullMatch[i] ?? 0))).toBeLessThanOrEqual(1),
    );
  });

  it('PCA projects onto decorrelated components in descending variance', () => {
    const rng = createMulberry32(9);
    const mix = Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => rng() - 0.5));
    const rows = Array.from({ length: 300 }, () => {
      const latent = Array.from({ length: 21 }, (_, k) => (rng() - 0.5) * (21 - k));
      return mix.map((weights) => weights.reduce((sum, w, k) => sum + w * (latent[k] ?? 0), 0));
    });
    const projected = reduceFeatures(rows, 16);
    const cov = (i: number, j: number): number =>
      projected.reduce((sum, row) => sum + (row[i] ?? 0) * (row[j] ?? 0), 0) / (rows.length - 1);
    for (let i = 0; i < 16; i += 1) {
      if (i > 0) expect(cov(i, i)).toBeLessThanOrEqual(cov(i - 1, i - 1) + 1e-9);
      for (let j = i + 1; j < 16; j += 1) {
        expect(Math.abs(cov(i, j))).toBeLessThan(1e-6 * cov(0, 0));
      }
    }
  });

  it('keeps the requested number of evenly spaced rest frames', () => {
    const frames = series(
      Array.from({ length: 40 }, () => 1),
      0,
      50_000,
    );
    const kept = collapseRests(frames, { maxSpeed: 0.1, minDurationUs: 1_000_000, keep: 5 });
    expect(kept.map((frame) => frame.tUs / 50_000)).toEqual([0, 10, 20, 29, 39]);
  });

  it('aligns a complete but slower attempt end to end by default', () => {
    const source = Array.from({ length: 40 }, (_, index) => Math.sin(index / 5));
    const slow = source.flatMap((value) => [value, value]);
    const left = source.map((value, index) => ({
      tUs: index * 66_667,
      values: [value, Math.cos(value)],
      speed: 1,
    }));
    const right = slow.map((value, index) => ({
      tUs: index * 33_333,
      values: [value, Math.cos(value)],
      speed: 1,
    }));
    const result = align(left, right);
    expect(result.path.at(-1)).toMatchObject({ indexA: 39, indexB: 79 });
    pathSteps(result.path);
  });

  it('open-end alignment maps a fallen prefix onto the start of the full attempt', () => {
    const full = series(Array.from({ length: 40 }, (_, index) => Math.sin(index / 4) + index / 10));
    const prefix = full.slice(0, 15);
    const result = align(prefix, full, { openEnd: true });
    const last = result.path.at(-1);
    expect(last?.indexA).toBe(14);
    expect(Math.abs((last?.indexB ?? 0) - 14)).toBeLessThanOrEqual(1);
  });

  it('banded DTW matches a full-matrix reference', () => {
    const rng = createMulberry32(21);
    const reference = (a: number[][], b: number[][], fraction: number): number => {
      const n = a.length;
      const m = b.length;
      const band = Math.max(1, Math.ceil(fraction * Math.max(n, m)));
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Infinity));
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < m; j += 1) {
          const expected = n <= 1 || m <= 1 ? j : (i * (m - 1)) / (n - 1);
          if (Math.abs(j - expected) > band) continue;
          const d = (a[i] ?? []).reduce((s, v, k) => s + (v - (b[j]?.[k] ?? 0)) ** 2, 0);
          const prev =
            i === 0 && j === 0
              ? 0
              : Math.min(
                  cost[i - 1]?.[j - 1] ?? Infinity,
                  cost[i - 1]?.[j] ?? Infinity,
                  cost[i]?.[j - 1] ?? Infinity,
                );
          cost[i]![j] = prev + d;
        }
      }
      return cost[n - 1]?.[m - 1] ?? Infinity;
    };
    for (let trial = 0; trial < 30; trial += 1) {
      const n = 5 + Math.floor(rng() * 40);
      const m = 5 + Math.floor(rng() * 40);
      const a = Array.from({ length: n }, () => [rng(), rng(), rng()]);
      const b = Array.from({ length: m }, () => [rng(), rng(), rng()]);
      const result = bandedDtw(a, b, 0.2);
      expect(result.cost).toBeCloseTo(reference(a, b, 0.2), 9);
      pathSteps(result.path);
      expect(result.path.at(-1)).toEqual({ indexA: n - 1, indexB: m - 1 });
    }
  });
});
