import { ffmpegMappedOutputArgs } from '../ffmpeg/iphone.js';

import { secondsText } from './parse.js';
import type { TimeRange } from '@climbing-coach/core';

const FFMPEG = ['-hide_banner', '-nostdin'];
const FFPROBE = ['-hide_banner'];

/** Stream copy maps `0:v:0` and optional `0:a:0`. `-fps_mode` is not valid with `-c copy`. */
export function copyMapArgs(audio: boolean): string[] {
  const args = ['-map', '0:v:0'];
  if (audio) args.push('-map', '0:a:0');
  else args.push('-an');
  args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
  return args;
}

export function losslessCutArgs(
  src: string,
  dst: string,
  range: TimeRange,
  audio: boolean,
): string[] {
  return [
    ...FFMPEG,
    '-y',
    '-ss',
    secondsText(range.startUs),
    '-to',
    secondsText(range.endUs),
    '-i',
    src,
    ...copyMapArgs(audio),
    dst,
  ];
}

export function reencodeCutArgs(
  src: string,
  dst: string,
  range: TimeRange,
  filter: string,
  encoderArgs: readonly string[],
): string[] {
  return [
    ...FFMPEG,
    '-y',
    '-i',
    src,
    '-ss',
    secondsText(range.startUs),
    '-to',
    secondsText(range.endUs),
    ...ffmpegMappedOutputArgs({ audio: false, vfr: true }),
    '-vf',
    filter,
    ...encoderArgs,
    '-movflags',
    '+faststart',
    dst,
  ];
}

export function proxyArgs(
  src: string,
  dst: string,
  filter: string,
  encoderArgs: readonly string[],
  tonemapped: boolean,
): string[] {
  const color = tonemapped
    ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
    : [];
  return [
    ...FFMPEG,
    '-y',
    '-i',
    src,
    ...ffmpegMappedOutputArgs({ audio: false, vfr: true }),
    '-copyts',
    '-vf',
    filter,
    ...encoderArgs,
    ...color,
    '-movflags',
    '+faststart',
    dst,
  ];
}

export function thumbnailArgs(src: string, dst: string, atUs: number, width: number): string[] {
  return [
    ...FFMPEG,
    '-y',
    '-ss',
    secondsText(atUs),
    '-i',
    src,
    '-map',
    '0:v:0',
    '-an',
    '-frames:v',
    '1',
    '-vf',
    `scale=${width}:-2`,
    dst,
  ];
}

export function selectEq(indices: readonly number[]): string {
  return `select='${indices.map((index) => `eq(n\\,${index})`).join('+')}'`;
}

export function spriteArgs(
  src: string,
  dst: string,
  indices: readonly number[],
  tileWidth: number,
  columns: number,
  rows: number,
): string[] {
  const filter = [
    selectEq(indices),
    'setpts=N/TB',
    `scale=${tileWidth}:-2`,
    `tile=${columns}x${rows}`,
  ].join(',');
  return [...FFMPEG, '-y', '-i', src, '-map', '0:v:0', '-an', '-vf', filter, '-frames:v', '1', dst];
}

export function selectWindows(windows: readonly TimeRange[]): string {
  const expr = windows
    .map((window) => `between(t\\,${secondsText(window.startUs)}\\,${secondsText(window.endUs)})`)
    .join('+');
  return `select='${expr}'`;
}

export function frameFilter(options: {
  windows?: readonly TimeRange[];
  sampleFps?: number;
  maxSide: number;
  toSdr: boolean;
  transfer: 'smpte2084' | 'arib-std-b67' | null;
  gray: boolean;
}): string {
  const parts: string[] = [];
  if (options.windows && options.windows.length > 0) parts.push(selectWindows(options.windows));
  if (options.toSdr && options.transfer) {
    parts.push(
      `zscale=tin=${options.transfer}:min=bt2020nc:pin=bt2020:t=linear:npl=100`,
      'tonemap=tonemap=hable:desat=0',
      'zscale=p=bt709:t=bt709:m=bt709',
    );
  }
  parts.push(`scale=${options.maxSide}:${options.maxSide}:force_original_aspect_ratio=decrease`);
  if (options.sampleFps && options.sampleFps > 0) parts.push(`fps=${options.sampleFps}`);
  parts.push(options.gray ? 'format=gray' : 'format=rgb24');
  parts.push('showinfo');
  return parts.join(',');
}

export function keyframeArgs(src: string, filter: string): string[] {
  return [
    ...FFMPEG,
    '-skip_frame',
    'nokey',
    '-i',
    src,
    ...ffmpegMappedOutputArgs({ audio: false, vfr: true }),
    '-vf',
    filter,
    '-f',
    'image2pipe',
    '-c:v',
    'pgm',
    'pipe:1',
  ];
}

export function windowArgs(src: string, filter: string, gray: boolean): string[] {
  return [
    ...FFMPEG,
    '-i',
    src,
    ...ffmpegMappedOutputArgs({ audio: false, vfr: true }),
    '-vf',
    filter,
    '-f',
    'image2pipe',
    '-c:v',
    gray ? 'pgm' : 'ppm',
    'pipe:1',
  ];
}

export function streamJsonArgs(src: string): string[] {
  return [...FFPROBE, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', src];
}

export function packetArgs(src: string): string[] {
  return [
    ...FFPROBE,
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'packet=pts_time,duration_time,flags',
    '-of',
    'csv=p=0',
    src,
  ];
}

export function encoderListArgs(): string[] {
  return ['-hide_banner', '-encoders'];
}
