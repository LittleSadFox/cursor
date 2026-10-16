import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { probeFfmpegStatus } from './status.js';

const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coach-ffmpeg-status-'));
  temps.push(dir);
  return dir;
}

function writeScript(dir: string, name: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('probeFfmpegStatus', () => {
  it('refuses a bundled/env banner with --enable-gpl', () => {
    const dir = tempDir();
    const ffmpegPath = writeScript(
      dir,
      'ffmpeg',
      [
        '#!/bin/sh',
        'echo "ffmpeg version 8.1.3 Copyright (c) 2000-2026 the FFmpeg developers"',
        'echo "configuration: --enable-gpl --enable-libx264 --enable-videotoolbox"',
      ].join('\n'),
    );
    writeScript(dir, 'ffprobe', '#!/bin/sh\n');
    const status = probeFfmpegStatus({
      env: { COACH_FFMPEG: ffmpegPath },
      platform: 'linux',
      arch: 'x64',
    });
    expect(status.available).toBe(false);
    expect(status.shipping).toBe(false);
    expect(status.note).toContain('--enable-gpl');
    expect(status.note).toContain('--enable-libx264');
  });

  it('accepts an env override that is LGPL', () => {
    const dir = tempDir();
    const ffmpegPath = writeScript(
      dir,
      'ffmpeg',
      [
        '#!/bin/sh',
        'echo "ffmpeg version 8.1.3 Copyright (c) 2000-2026 the FFmpeg developers"',
        'echo "configuration: --disable-gpl --disable-nonfree --enable-videotoolbox --enable-libzimg"',
      ].join('\n'),
    );
    writeScript(dir, 'ffprobe', '#!/bin/sh\n');
    const status = probeFfmpegStatus({
      env: { COACH_FFMPEG: ffmpegPath },
      platform: 'linux',
      arch: 'x64',
    });
    expect(status.available).toBe(true);
    expect(status.source).toBe('env');
    expect(status.version).toBe('8.1.3');
  });
});
