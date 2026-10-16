import type { Us } from '@climbing-coach/schema';
import { us } from '@climbing-coach/schema';

import {
  VideoToolError,
  type CutMode,
  type HdrTransfer,
  type PacketFrame,
  type SpriteLayout,
  type SpriteTile,
  type TimeRange,
} from '@climbing-coach/core';

export const QUICK_HASH_SAMPLE_BYTES = 4 * 1024 * 1024;
/** BUILD_PLAN: `auto` re-encodes when keyframe slack exceeds 2 s on a side. */
export const AUTO_EXPANSION_US = 2_000_000;
export const PROXY_GOP_US = 500_000;

export type HashSlice = { offset: number; length: number };

/** Three windows: head, middle, tail. Short files overlap; the size prefix keeps the digest unique. */
export function quickHashSlices(size: number): HashSlice[] {
  if (size <= 0) return [];
  const sample = Math.min(QUICK_HASH_SAMPLE_BYTES, size);
  const middle = Math.max(0, Math.floor(size / 2) - Math.floor(sample / 2));
  const tail = Math.max(0, size - sample);
  return [
    { offset: 0, length: sample },
    { offset: middle, length: Math.min(sample, size - middle) },
    { offset: tail, length: size - tail },
  ];
}

export function gopFrameCount(fps: number): number {
  const rate = fps > 0 ? fps : 30;
  return Math.max(1, Math.round((rate * PROXY_GOP_US) / 1_000_000));
}

export function proxyScaleFilter(): string {
  return "scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h=-2";
}

/** SDR, or HLG/PQ tonemap then the 720p-class scale. Autorotate stays ffmpeg's default. */
export function proxyFilter(transfer: HdrTransfer | null): string {
  const scale = proxyScaleFilter();
  if (!transfer) return `${scale},format=yuv420p`;
  return [
    `zscale=tin=${transfer}:min=bt2020nc:pin=bt2020:t=linear:npl=100`,
    'tonemap=tonemap=hable:desat=0',
    'zscale=p=bt709:t=bt709:m=bt709',
    'format=yuv420p',
    scale,
  ].join(',');
}

export function parseEncoderNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^ .{6} (\S+)/.exec(line);
    const name = match?.[1];
    if (!name || name === '------' || name.startsWith('-')) continue;
    names.push(name);
  }
  return names;
}

export function h264EncoderArgs(encoders: readonly string[], gop: number): string[] {
  const keys = ['-force_key_frames', 'expr:gte(t,n_forced*0.5)'];
  if (encoders.includes('h264_videotoolbox')) {
    return [
      '-c:v',
      'h264_videotoolbox',
      '-allow_sw',
      '1',
      '-b:v',
      '4M',
      '-g',
      String(gop),
      ...keys,
    ];
  }
  if (encoders.includes('libx264')) {
    return [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-g',
      String(gop),
      '-keyint_min',
      String(gop),
      ...keys,
    ];
  }
  if (encoders.includes('libopenh264')) {
    return ['-c:v', 'libopenh264', '-b:v', '4M', '-g', String(gop), ...keys];
  }
  throw new VideoToolError(
    'FFMPEG_UNAVAILABLE',
    'no H.264 encoder (h264_videotoolbox, libx264, or libopenh264)',
  );
}

export type LosslessExpansion = {
  actual: TimeRange;
  startExpansionUs: number;
  endExpansionUs: number;
  coversRequest: boolean;
};

function frameEnd(frame: PacketFrame): number {
  return frame.tUs + Math.max(0, frame.durationUs);
}

/** Previous keyframe at the start; the end snaps to the frame that covers the request. Never inward when a keyframe exists. */
export function expandOutward(frames: readonly PacketFrame[], range: TimeRange): LosslessExpansion {
  if (frames.length === 0) {
    throw new VideoToolError('UNSUPPORTED_MEDIA', 'video has no packets to cut');
  }
  const duration = Math.max(...frames.map(frameEnd));
  const start = Math.min(Math.max(0, range.startUs), duration);
  const end = Math.min(Math.max(start, range.endUs), duration);
  let keyframe = frames[0]!;
  for (const frame of frames) {
    if (frame.keyframe && frame.tUs <= start) keyframe = frame;
  }
  let endFrame = frames[frames.length - 1]!;
  for (const frame of frames) {
    if (frameEnd(frame) >= end) {
      endFrame = frame;
      break;
    }
  }
  const actualStart = keyframe.tUs;
  const actualEnd = us(Math.max(frameEnd(endFrame), end));
  const coversRequest = actualStart <= start && actualEnd >= end;
  return {
    actual: { startUs: actualStart, endUs: actualEnd },
    startExpansionUs: Math.max(0, start - actualStart),
    endExpansionUs: Math.max(0, actualEnd - end),
    coversRequest,
  };
}

export function chooseCutMode(
  mode: CutMode,
  expansion: Pick<LosslessExpansion, 'startExpansionUs' | 'endExpansionUs' | 'coversRequest'>,
): 'lossless' | 'reencode' {
  if (mode === 'reencode') return 'reencode';
  if (!expansion.coversRequest) return 'reencode';
  if (mode === 'lossless') return 'lossless';
  if (
    expansion.startExpansionUs > AUTO_EXPANSION_US ||
    expansion.endExpansionUs > AUTO_EXPANSION_US
  ) {
    return 'reencode';
  }
  return 'lossless';
}

export function clampRange(range: TimeRange, durationUs: number): TimeRange {
  const start = Math.min(Math.max(0, range.startUs), durationUs);
  const end = Math.min(Math.max(start, range.endUs), durationUs);
  return { startUs: us(start), endUs: us(end) };
}

export function evenlySpacedIndices(frameCount: number, count: number): number[] {
  if (count <= 0 || frameCount <= 0) return [];
  if (count === 1) return [0];
  if (count >= frameCount) return Array.from({ length: frameCount }, (_, index) => index);
  const seen = new Set<number>();
  const indices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (frameCount - 1)) / (count - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    indices.push(index);
  }
  return indices;
}

export function framesInWindow(
  frames: readonly PacketFrame[],
  centerUs: number,
  halfWindowUs: number,
): PacketFrame[] {
  const start = centerUs - halfWindowUs;
  const end = centerUs + halfWindowUs;
  return frames.filter((frame) => frame.tUs >= start && frame.tUs <= end);
}

export function spriteColumns(count: number): number {
  if (count <= 0) return 0;
  return Math.min(10, count);
}

export function layoutTiles(
  times: readonly Us[],
  tileWidth: number,
  tileHeight: number,
): SpriteLayout {
  const columns = spriteColumns(times.length);
  const rows = columns === 0 ? 0 : Math.ceil(times.length / columns);
  const tiles: SpriteTile[] = times.map((tUs, index) => ({
    tUs,
    x: (index % columns) * tileWidth,
    y: Math.floor(index / columns) * tileHeight,
    w: tileWidth,
    h: tileHeight,
  }));
  return {
    width: columns * tileWidth,
    height: rows * tileHeight,
    columns,
    rows,
    tiles,
  };
}

export function indicesOfTimes(
  frames: readonly PacketFrame[],
  picked: readonly PacketFrame[],
): number[] {
  const wanted = new Set(picked.map((frame) => frame.tUs));
  const indices: number[] = [];
  frames.forEach((frame, index) => {
    if (wanted.has(frame.tUs)) indices.push(index);
  });
  return indices;
}
