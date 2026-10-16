import { describe, expect, it } from 'vitest';

import { us } from '@climbing-coach/schema';

import { copyMapArgs, proxyArgs, reencodeCutArgs, selectEq } from './args.js';
import { quickHashFile } from './hash.js';
import {
  AUTO_EXPANSION_US,
  chooseCutMode,
  evenlySpacedIndices,
  expandOutward,
  h264EncoderArgs,
  parseEncoderNames,
  proxyFilter,
  quickHashSlices,
} from './plan.js';
import { assembleProbe, durationsVary, normalizeRotation, parsePacketCsv } from './parse.js';
import { drainImages } from './ppm.js';
import { assertSafeOutputArgs } from './tools.js';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parsePacketCsv', () => {
  it('reads pts, duration, and keyframe flags', () => {
    const frames = parsePacketCsv('0.000000,0.033333,K__\n0.033333,0.033333,___\n');
    expect(frames).toHaveLength(2);
    expect(frames[0]?.keyframe).toBe(true);
    expect(frames[0]?.tUs).toBe(0);
    expect(frames[1]?.tUs).toBe(33_333);
    expect(frames[1]?.keyframe).toBe(false);
  });
});

describe('assembleProbe', () => {
  it('marks HLG portrait VFR and Dolby Vision from side data', () => {
    const probe = assembleProbe(
      {
        streams: [
          {
            codec_type: 'video',
            codec_name: 'hevc',
            width: 1920,
            height: 1080,
            avg_frame_rate: '30000/1001',
            r_frame_rate: '60/1',
            color_transfer: 'arib-std-b67',
            side_data_list: [
              { side_data_type: 'Display Matrix', rotation: -90 },
              {
                side_data_type: 'DOVI configuration record',
                dv_profile: 8,
                dv_bl_signal_compatibility_id: 4,
              },
            ],
          },
          { codec_type: 'audio', codec_name: 'aac' },
          { codec_type: 'audio', codec_name: 'apac' },
        ],
        format: { duration: '1.0' },
      },
      '0.000000,0.016000,K__\n0.020000,0.040000,___\n',
    );
    expect(probe?.codec).toBe('hevc');
    expect(probe?.rotation).toBe(-90);
    expect(probe?.displayWidth).toBe(1080);
    expect(probe?.displayHeight).toBe(1920);
    expect(probe?.hdrTransfer).toBe('arib-std-b67');
    expect(probe?.isHdr).toBe(true);
    expect(probe?.dolbyVision).toBe('8.4');
    expect(probe?.isVfr).toBe(true);
    expect(probe?.hasAudio).toBe(true);
    expect(probe?.fps).toBeCloseTo(29.97, 2);
  });

  it('returns null when there is no video stream', () => {
    expect(assembleProbe({ streams: [{ codec_type: 'audio' }] }, '')).toBeNull();
  });
});

describe('rotation and vfr helpers', () => {
  it('normalizes 270° to −90°', () => {
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-90)).toBe(-90);
  });

  it('treats a 1 ms duration spread as VFR', () => {
    expect(
      durationsVary([
        { tUs: us(0), durationUs: us(16_000), keyframe: true },
        { tUs: us(16_000), durationUs: us(20_000), keyframe: false },
      ]),
    ).toBe(true);
  });
});

describe('quick hash', () => {
  it('samples head, middle, and tail', () => {
    const slices = quickHashSlices(20 * 1024 * 1024);
    expect(slices).toHaveLength(3);
    expect(slices[0]).toEqual({ offset: 0, length: 4 * 1024 * 1024 });
    expect(slices[2]?.offset).toBe(16 * 1024 * 1024);
  });

  it('changes when the bytes change and stays stable for the same file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coach-hash-'));
    const path = join(dir, 'a.bin');
    await writeFile(path, Buffer.from('hello-video-bytes'));
    const first = await quickHashFile(path);
    const second = await quickHashFile(path);
    await writeFile(path, Buffer.from('hello-video-bytes!'));
    expect(second).toBe(first);
    expect(await quickHashFile(path)).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('cut planning', () => {
  const frames = [
    { tUs: us(0), durationUs: us(1_000_000), keyframe: true },
    { tUs: us(1_000_000), durationUs: us(1_000_000), keyframe: false },
    { tUs: us(2_000_000), durationUs: us(1_000_000), keyframe: false },
    { tUs: us(3_000_000), durationUs: us(1_000_000), keyframe: true },
    { tUs: us(4_000_000), durationUs: us(1_000_000), keyframe: false },
  ];

  it('expands the start to the previous keyframe and keeps the requested end frame', () => {
    const expansion = expandOutward(frames, { startUs: us(1_500_000), endUs: us(2_500_000) });
    expect(expansion.actual.startUs).toBe(0);
    expect(expansion.actual.endUs).toBe(3_000_000);
    expect(expansion.coversRequest).toBe(true);
    expect(expansion.startExpansionUs).toBe(1_500_000);
  });

  it('re-encodes in auto mode when one side grows by more than 2 s', () => {
    const expansion = expandOutward(frames, { startUs: us(2_500_000), endUs: us(3_200_000) });
    expect(expansion.startExpansionUs).toBeGreaterThan(AUTO_EXPANSION_US);
    expect(chooseCutMode('auto', expansion)).toBe('reencode');
    expect(chooseCutMode('lossless', expansion)).toBe('lossless');
    expect(chooseCutMode('reencode', expansion)).toBe('reencode');
  });
});

describe('sprites and encoders', () => {
  it('includes both ends when spacing frames', () => {
    expect(evenlySpacedIndices(11, 3)).toEqual([0, 5, 10]);
  });

  it('prefers VideoToolbox, then libx264', () => {
    expect(h264EncoderArgs(['libx264', 'h264_videotoolbox'], 15)).toContain('h264_videotoolbox');
    expect(h264EncoderArgs(['libx264'], 15)).toContain('libx264');
    expect(parseEncoderNames(' V..... libx264              H.264\n V....D h264_videotoolbox   VideoToolbox\n')).toEqual([
      'libx264',
      'h264_videotoolbox',
    ]);
  });
});

describe('ffmpeg argv', () => {
  it('maps 0:v:0, keeps VFR, and does not turn autorotate off', () => {
    const proxy = proxyArgs(
      'in.mov',
      'out.mp4',
      proxyFilter('arib-std-b67'),
      ['-c:v', 'h264_videotoolbox'],
      true,
    );
    expect(proxy).toContain('0:v:0');
    expect(proxy).toContain('-fps_mode');
    expect(proxy).toContain('vfr');
    expect(proxy.join(' ')).toContain('tin=arib-std-b67');
    expect(proxy).toContain('bt709');
    assertSafeOutputArgs(proxy);
    const copy = ['ffmpeg', ...copyMapArgs(true)];
    expect(copy).toContain('0:a:0');
    assertSafeOutputArgs(copy);
    const reencode = reencodeCutArgs(
      'in.mov',
      'out.mp4',
      { startUs: us(0), endUs: us(1) },
      'format=yuv420p',
      [],
    );
    assertSafeOutputArgs(reencode);
    expect(selectEq([0, 4])).toBe("select='eq(n\\,0)+eq(n\\,4)'");
  });
});

describe('ppm drain', () => {
  it('reads one gray pixel and keeps a partial tail', () => {
    const body = Buffer.from([7]);
    const header = Buffer.from('P5\n1 1\n255\n');
    const extra = Buffer.from('P6');
    const drained = drainImages(Buffer.concat([header, body, extra]));
    expect(drained.images).toEqual([
      { format: 'gray', width: 1, height: 1, data: Uint8Array.from([7]) },
    ]);
    expect(drained.rest.toString('ascii')).toBe('P6');
  });
});
