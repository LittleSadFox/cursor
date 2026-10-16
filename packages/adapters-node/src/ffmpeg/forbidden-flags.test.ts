import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  forbiddenConfigureFlags,
  missingRequiredLgplFlags,
  textHasConfigureFlag,
} from './forbidden-flags.js';
import { detectRepoRoot } from './repo-root.js';

describe('forbiddenConfigureFlags', () => {
  it('does not treat --disable-gpl as --enable-gpl', () => {
    const text = '--disable-gpl --disable-nonfree --enable-videotoolbox --enable-libzimg';
    expect(forbiddenConfigureFlags(text)).toEqual([]);
    expect(missingRequiredLgplFlags(text)).toEqual([]);
    expect(textHasConfigureFlag(text, '--disable-gpl')).toBe(true);
    expect(textHasConfigureFlag(text, '--enable-gpl')).toBe(false);
  });

  it('flags GPL and nonfree enables', () => {
    expect(forbiddenConfigureFlags('--enable-gpl --enable-libx264 --enable-libzimg')).toEqual([
      '--enable-gpl',
      '--enable-libx264',
    ]);
  });
});

describe('LGPL build scripts', () => {
  it('pin a version and never enable GPL or libx264', () => {
    const root = detectRepoRoot();
    expect(root).toBeTruthy();
    const flags = readFileSync(join(root!, 'scripts/ffmpeg/configure-lgpl.sh'), 'utf8');
    const versions = readFileSync(join(root!, 'scripts/ffmpeg/versions.env'), 'utf8');
    const build = readFileSync(join(root!, 'scripts/ffmpeg/build-macos-arm64.sh'), 'utf8');
    expect(versions).toMatch(/FFMPEG_VERSION=/);
    expect(flags).toContain('--disable-gpl');
    expect(flags).toContain('--disable-nonfree');
    expect(flags).toContain('--enable-videotoolbox');
    expect(flags).toContain('--enable-libzimg');
    expect(forbiddenConfigureFlags(flags)).toEqual([]);
    expect(forbiddenConfigureFlags(build)).toEqual([]);
    expect(build).toContain('FFMPEG_LGPL_CONFIGURE_FLAGS');
    expect(build).toMatch(/\$\{FFMPEG_LGPL_CONFIGURE_FLAGS\[@\]\}/);
  });
});
