import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FRAME_US, standClimbFall } from '@climbing-coach/test-fixtures';
import { describe, expect, it } from 'vitest';

import { run } from './run.js';

describe('coach commands', () => {
  it('detects a synthetic climb from a pose JSON file', () => {
    const scenario = standClimbFall();
    const dir = mkdtempSync(join(tmpdir(), 'coach-'));
    const poses = join(dir, 'poses.json');
    writeFileSync(poses, JSON.stringify({ samples: scenario.samples }));
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: string) => {
      lines.push(String(line));
    };
    try {
      run(['detect', '--poses', poses]);
    } finally {
      console.log = original;
    }
    const body = JSON.parse(lines[0] ?? '{}') as {
      attempts: { outcome: string; startUs: number }[];
    };
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]?.outcome).toBe('fall');
    expect(
      Math.abs((body.attempts[0]?.startUs ?? 0) - (scenario.attempts[0]?.startUs ?? 0)),
    ).toBeLessThanOrEqual(FRAME_US);
  });

  it('refuses video process without ffmpeg', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => {
      errors.push(String(line));
    };
    const previous = process.exitCode;
    try {
      run(['process', 'climb.mov']);
    } finally {
      console.error = original;
      process.exitCode = previous;
    }
    expect(errors.join(' ')).toContain('P1.7');
  });
});
