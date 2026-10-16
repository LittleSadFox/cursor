import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FRAME_US, standClimbFall } from '@climbing-coach/test-fixtures';
import { describe, expect, it } from 'vitest';

import { flagValue } from './args.js';
import { draftItems } from './io.js';
import { run } from './run.js';

type Captured = { out: string[]; err: string[]; exitCode: number | string | undefined };

function capture(argv: readonly string[]): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  const previous = process.exitCode;
  process.exitCode = undefined;
  console.log = (line: string) => out.push(String(line));
  console.error = (line: string) => err.push(String(line));
  try {
    run(argv);
    return { out, err, exitCode: process.exitCode };
  } finally {
    console.log = log;
    console.error = error;
    process.exitCode = previous;
  }
}

function tempFile(name: string, body: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'coach-')), name);
  writeFileSync(path, JSON.stringify(body));
  return path;
}

describe('coach commands', () => {
  it('detects a synthetic climb from a pose JSON file', () => {
    const scenario = standClimbFall();
    const poses = tempFile('poses.json', { samples: scenario.samples });
    const { out } = capture(['detect', '--poses', poses]);
    const body = JSON.parse(out[0] ?? '{}') as {
      attempts: { outcome: string; startUs: number }[];
    };
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]?.outcome).toBe('fall');
    expect(
      Math.abs((body.attempts[0]?.startUs ?? 0) - (scenario.attempts[0]?.startUs ?? 0)),
    ).toBeLessThanOrEqual(FRAME_US);
  });

  it('prints usage when a flag has no value', () => {
    const { err, exitCode } = capture(['detect', '--poses']);
    expect(exitCode).toBe(1);
    expect(err.join(' ')).toContain('usage: coach detect');
    expect(flagValue(['--poses', '--json', 'out.json'], 'poses')).toBeUndefined();
    expect(flagValue(['--json', 'out.json'], 'json')).toBe('out.json');
  });

  it('validates a review draft and clamps clip padding to the video', () => {
    const draft = tempFile('draft.json', {
      video: { startUs: 0, endUs: 10_000_000 },
      items: [
        { id: 'a', startUs: 1_000_000, endUs: 4_000_000 },
        { id: 'b', startUs: 3_000_000, endUs: 9_500_000 },
      ],
    });
    const { out, exitCode } = capture(['cut', '--draft', draft]);
    const body = JSON.parse(out[0] ?? '{}') as {
      ok: boolean;
      conflicts: string[][];
      clips: { id: string; clip: { startUs: number; endUs: number } }[];
    };
    expect(body.ok).toBe(false);
    expect(body.conflicts).toEqual([['a', 'b']]);
    expect(body.clips[0]?.clip).toEqual({ startUs: 0, endUs: 5_500_000 });
    expect(body.clips[1]?.clip).toEqual({ startUs: 1_000_000, endUs: 10_000_000 });
    expect(exitCode).toBe(1);
  });

  it('gives manual draft rows no detector lineage by default', () => {
    const [manual, detector] = draftItems({
      items: [
        { id: 'm', startUs: 0, endUs: 1, source: 'manual' },
        { id: 'd', startUs: 2, endUs: 3 },
      ],
    });
    expect(manual?.parentIds).toEqual([]);
    expect(detector?.parentIds).toEqual(['d']);
  });

  it('aligns two frame files', () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      tUs: index * FRAME_US,
      values: [Math.sin(index / 3)],
      speed: 1,
    }));
    const a = tempFile('a.json', { frames });
    const { out } = capture(['align', '--a', a, '--b', a]);
    expect(JSON.parse(out[0] ?? '{}')).toEqual({ cost: 0, steps: 20 });
  });

  it('compares a pose track with itself as zero divergence', () => {
    const poses = tempFile('poses.json', { samples: standClimbFall().samples });
    const { out } = capture(['compare', '--a', poses, '--b', poses]);
    const body = JSON.parse(out[0] ?? '{}') as {
      steps: number;
      summary: { meanDivergence: number; topDifferences: unknown[] };
    };
    expect(body.steps).toBeGreaterThan(0);
    expect(body.summary).toEqual({ meanDivergence: 0, topDifferences: [] });
    expect(capture(['compare', '--a', poses]).exitCode).toBe(1);
  });

  it('reports engine timings against the BUILD_PLAN budgets', () => {
    const { out } = capture(['bench']);
    const body = JSON.parse(out[0] ?? '{}') as {
      results: { name: string; ms: number; budgetMs: number | null }[];
      withinBudget: boolean;
    };
    expect(body.results.map((result) => result.budgetMs)).toEqual([1000, 300, null, null]);
    body.results.forEach((result) => expect(result.ms).toBeGreaterThan(0));
    expect(typeof body.withinBudget).toBe('boolean');
  });

  it('refuses video process without ffmpeg', () => {
    const { err, exitCode } = capture(['process', 'climb.mov']);
    expect(err.join(' ')).toContain('P1.7');
    expect(exitCode).toBe(2);
  });
});
