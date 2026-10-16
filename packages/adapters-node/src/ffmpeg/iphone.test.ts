import { describe, expect, it } from 'vitest';

import {
  ffmpegMappedOutputArgs,
  hdrTransferFromProbe,
  isIphoneMediaName,
  tonemapFilter,
} from './iphone.js';

describe('hdrTransferFromProbe', () => {
  it('maps PQ and HLG names used by iPhone and FATE samples', () => {
    expect(hdrTransferFromProbe('smpte2084')).toBe('smpte2084');
    expect(hdrTransferFromProbe('arib-std-b67')).toBe('arib-std-b67');
    expect(hdrTransferFromProbe('HLG')).toBe('arib-std-b67');
    expect(hdrTransferFromProbe('bt709')).toBeNull();
    expect(hdrTransferFromProbe(null)).toBeNull();
  });
});

describe('isIphoneMediaName', () => {
  it('matches .MOV case-insensitively', () => {
    expect(isIphoneMediaName('IMG_7891.MOV')).toBe(true);
    expect(isIphoneMediaName('IMG_7907.mov')).toBe(true);
    expect(isIphoneMediaName('README.md')).toBe(false);
  });
});

describe('ffmpegMappedOutputArgs', () => {
  it('maps 0:v:0 and never 0:a (apac)', () => {
    expect(ffmpegMappedOutputArgs()).toEqual(['-map', '0:v:0', '-an', '-fps_mode', 'vfr']);
    expect(ffmpegMappedOutputArgs({ audio: true })).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-fps_mode',
      'vfr',
    ]);
    expect(ffmpegMappedOutputArgs({ audio: true }).join(' ')).not.toContain('0:a ');
    expect(ffmpegMappedOutputArgs({ vfr: false })).toEqual(['-map', '0:v:0', '-an']);
  });
});

describe('tonemapFilter', () => {
  it('sets zscale tin from the probed transfer', () => {
    expect(tonemapFilter('arib-std-b67')).toContain('tin=arib-std-b67');
    expect(tonemapFilter('smpte2084')).toContain('tin=smpte2084');
    expect(tonemapFilter('arib-std-b67')).toContain('tonemap=tonemap=hable');
  });
});
