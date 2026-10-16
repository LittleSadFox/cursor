import { describe, expect, it } from 'vitest';

import { forbiddenConfigureFlags } from './forbidden-flags.js';
import { parseFfmpegBanner } from './probe.js';

describe('parseFfmpegBanner', () => {
  it('reads version and configuration', () => {
    const banner = parseFfmpegBanner(
      [
        'ffmpeg version 8.1.3 Copyright (c) 2000-2026 the FFmpeg developers',
        'built with Apple clang',
        'configuration: --disable-gpl --disable-nonfree --enable-videotoolbox --enable-libzimg',
        'libavcodec 62.28.103',
      ].join('\n'),
    );
    expect(banner.version).toBe('8.1.3');
    expect(banner.configuration).toContain('--enable-videotoolbox');
    expect(forbiddenConfigureFlags(banner.configuration ?? '')).toEqual([]);
  });
});
