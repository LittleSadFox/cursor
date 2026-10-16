import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bundledFfmpegPrefix, locateFfmpeg, shippedFfmpegTriple } from './locate.js';
import { ffmpegStatusFromLocation } from './status.js';

const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coach-ffmpeg-'));
  temps.push(dir);
  return dir;
}

function writeBin(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('shippedFfmpegTriple', () => {
  it('is only darwin-arm64 in v1', () => {
    expect(shippedFfmpegTriple('darwin', 'arm64')).toBe('darwin-arm64');
    expect(shippedFfmpegTriple('darwin', 'x64')).toBeNull();
    expect(shippedFfmpegTriple('linux', 'arm64')).toBeNull();
  });
});

describe('locateFfmpeg', () => {
  it('prefers COACH_FFMPEG and a sibling ffprobe', () => {
    const dir = tempDir();
    const ffmpegPath = writeBin(dir, 'ffmpeg');
    writeBin(dir, 'ffprobe');
    const located = locateFfmpeg({
      env: { COACH_FFMPEG: ffmpegPath },
      platform: 'linux',
      arch: 'x64',
    });
    expect(located).toEqual({ source: 'env', ffmpegPath, ffprobePath: join(dir, 'ffprobe') });
  });

  it('does not fall through when COACH_FFMPEG is set but not runnable', () => {
    const located = locateFfmpeg({
      env: { COACH_FFMPEG: join(tempDir(), 'missing'), PATH: '' },
      platform: 'linux',
      arch: 'x64',
      lookupOnPath: () => '/usr/bin/ffmpeg',
    });
    expect(located.source).toBe('env');
    expect(located.ffmpegPath).toBeNull();
  });

  it('reads the CI prefix on darwin-arm64', () => {
    const vendor = tempDir();
    const bin = join(vendor, 'darwin-arm64', 'bin');
    const ffmpegPath = writeBin(bin, 'ffmpeg');
    const ffprobePath = writeBin(bin, 'ffprobe');
    const located = locateFfmpeg({
      env: {},
      platform: 'darwin',
      arch: 'arm64',
      vendorRoot: vendor,
    });
    expect(located).toEqual({ source: 'bundled', ffmpegPath, ffprobePath });
    expect(bundledFfmpegPrefix({ platform: 'darwin', arch: 'arm64', vendorRoot: vendor })).toBe(
      join(vendor, 'darwin-arm64'),
    );
  });

  it('uses PATH only as a Linux fallback', () => {
    const dir = tempDir();
    const ffmpegPath = writeBin(dir, 'ffmpeg');
    const ffprobePath = writeBin(dir, 'ffprobe');
    const linux = locateFfmpeg({
      env: { PATH: dir },
      platform: 'linux',
      arch: 'x64',
    });
    expect(linux).toEqual({ source: 'system-fallback', ffmpegPath, ffprobePath });

    const darwin = locateFfmpeg({
      env: { PATH: dir },
      platform: 'darwin',
      arch: 'arm64',
      vendorRoot: tempDir(),
    });
    expect(darwin.source).toBe('missing');
  });
});

describe('ffmpegStatusFromLocation', () => {
  it('treats only bundled and env binaries as available for product tools', () => {
    expect(
      ffmpegStatusFromLocation({
        source: 'system-fallback',
        ffmpegPath: '/usr/bin/ffmpeg',
        ffprobePath: '/usr/bin/ffprobe',
      }).available,
    ).toBe(false);
    expect(
      ffmpegStatusFromLocation({
        source: 'bundled',
        ffmpegPath: '/opt/ffmpeg',
        ffprobePath: '/opt/ffprobe',
      }).shipping,
    ).toBe(true);
  });
});
