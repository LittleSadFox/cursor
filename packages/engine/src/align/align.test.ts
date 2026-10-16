import { describe, expect, it } from 'vitest';

import { createMulberry32 } from '../eval/rng.js';
import { align } from './align.js';
import { bandedDtw, openEndDtw } from './dtw.js';
import { matchMoves } from './nw.js';
import { reduceFeatures } from './pca.js';
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

  it('PCA fallback stays within a frame of full-feature DTW', () => {
    const rng = createMulberry32(3);
    const row = (index: number): number[] => {
      const signal = [Math.sin(index / 3), Math.cos(index / 5)];
      const noise = Array.from({ length: 18 }, () => (rng() - 0.5) * 1e-3);
      return [...signal, ...noise];
    };
    const left = Array.from({ length: 20 }, (_, index) => row(index));
    const right = Array.from({ length: 20 }, (_, index) => row(index));
    const full = bandedDtw(left, right, 0.2);
    const reduced = bandedDtw(reduceFeatures(left, 16), reduceFeatures(right, 16), 0.2);
    expect(reduced.path.length).toBe(full.path.length);
    reduced.path.forEach((step, index) => {
      const other = full.path[index];
      expect(Math.abs(step.indexA - (other?.indexA ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs(step.indexB - (other?.indexB ?? 0))).toBeLessThanOrEqual(1);
    });
  });
});
