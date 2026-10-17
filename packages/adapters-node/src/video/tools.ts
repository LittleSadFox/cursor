import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  VideoToolError,
  type CutResult,
  type ProbeResult,
  type SpriteLayout,
  type TimeRange,
  type VideoFrame,
  type VideoTools,
} from '@climbing-coach/core';
import { type Us } from '@climbing-coach/schema';
import { locateFfmpeg } from '../ffmpeg/locate.js';
import {
  encoderListArgs,
  frameFilter,
  keyframeArgs,
  losslessCutArgs,
  packetArgs,
  proxyArgs,
  reencodeCutArgs,
  spriteArgs,
  streamJsonArgs,
  thumbnailArgs,
  windowArgs,
} from './args.js';
import { decodePipedFrames } from './frames.js';
import { fullHashFile, quickHashFile } from './hash.js';
import {
  chooseCutMode,
  clampRange,
  evenlySpacedIndices,
  expandOutward,
  framesInWindow,
  gopFrameCount,
  h264EncoderArgs,
  indicesOfTimes,
  layoutTiles,
  parseEncoderNames,
  proxyFilter,
} from './plan.js';
import { assembleProbe } from './parse.js';
import { runChecked, runProcess } from './spawn.js';

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function imageSize(text: string): { width: number; height: number } | null {
  const width = /width=(\d+)/.exec(text)?.[1];
  const height = /height=(\d+)/.exec(text)?.[1];
  if (!width || !height) return null;
  return { width: Number(width), height: Number(height) };
}

export function createNodeVideoTools(): VideoTools {
  const located = locateFfmpeg();
  const ffmpeg = located.ffmpegPath;
  const ffprobe = located.ffprobePath;
  let encoders: string[] | null = null;

  function bins(): { ffmpeg: string; ffprobe: string } {
    if (!ffmpeg || !ffprobe) {
      throw new VideoToolError(
        'FFMPEG_UNAVAILABLE',
        'ffmpeg/ffprobe not found. On Apple Silicon run scripts/ffmpeg/build-macos-arm64.sh or set COACH_FFMPEG.',
      );
    }
    return { ffmpeg, ffprobe };
  }

  async function encoderNames(signal?: AbortSignal): Promise<string[]> {
    if (encoders) return encoders;
    const { ffmpeg: bin } = bins();
    const listed = await runProcess(bin, encoderListArgs(), signal);
    encoders = parseEncoderNames(listed.stdout.toString('utf8') + listed.stderr);
    return encoders;
  }

  async function probe(path: string): Promise<ProbeResult> {
    const { ffprobe: bin } = bins();
    const [streams, packets] = await Promise.all([
      runChecked(bin, streamJsonArgs(path)),
      runChecked(bin, packetArgs(path)),
    ]);
    let json: unknown;
    try {
      json = JSON.parse(streams.stdout.toString('utf8')) as unknown;
    } catch {
      throw new VideoToolError('UNSUPPORTED_MEDIA', 'ffprobe returned invalid JSON');
    }
    const result = assembleProbe(json, packets.stdout.toString('utf8'));
    if (!result) throw new VideoToolError('UNSUPPORTED_MEDIA', 'no video stream');
    return result;
  }

  async function encode(
    src: string,
    dst: string,
    filter: string,
    fps: number,
    tonemapped: boolean,
    range: TimeRange | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const { ffmpeg: bin } = bins();
    const encoder = h264EncoderArgs(await encoderNames(signal), gopFrameCount(fps));
    const args = range
      ? reencodeCutArgs(src, dst, range, filter, encoder)
      : proxyArgs(src, dst, filter, encoder, tonemapped);
    await ensureParent(dst);
    await runChecked(bin, args, signal);
  }

  async function sprite(
    src: string,
    dst: string,
    indices: number[],
    times: Us[],
    tileWidth: number,
    signal?: AbortSignal,
  ): Promise<SpriteLayout> {
    if (indices.length === 0) {
      throw new VideoToolError('VALIDATION_FAILED', 'no frames in that range');
    }
    const { ffmpeg: bin, ffprobe: probeBin } = bins();
    const columns = Math.min(10, indices.length);
    const rows = Math.ceil(indices.length / columns);
    await ensureParent(dst);
    await runChecked(bin, spriteArgs(src, dst, indices, tileWidth, columns, rows), signal);
    const info = await runChecked(probeBin, [
      '-hide_banner',
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'default=nw=1',
      dst,
    ]);
    const size = imageSize(info.stdout.toString('utf8'));
    const tileHeight = size ? Math.max(1, Math.round(size.height / rows)) : tileWidth;
    const tileW = size ? Math.max(1, Math.round(size.width / columns)) : tileWidth;
    return layoutTiles(times, tileW, tileHeight);
  }

  return {
    ready: () => ffmpeg !== null && ffprobe !== null,
    probe,
    quickHash: quickHashFile,
    fullHash: (path, signal) => fullHashFile(path, signal),
    async makeProxy(src, dst, opts) {
      const info = await probe(src);
      const filter = proxyFilter(info.hdrTransfer);
      await encode(src, dst, filter, info.fps, info.hdrTransfer !== null, null, opts?.signal);
    },
    async cut(src, dst, range, mode, opts): Promise<CutResult> {
      const info = await probe(src);
      const requested = clampRange(range, info.durationUs);
      if (requested.endUs <= requested.startUs) {
        throw new VideoToolError('VALIDATION_FAILED', 'cut range is empty');
      }
      const expansion = expandOutward(info.frames, requested);
      const modeUsed = chooseCutMode(mode, expansion);
      await ensureParent(dst);
      const { ffmpeg: bin } = bins();
      if (modeUsed === 'lossless') {
        await runChecked(
          bin,
          losslessCutArgs(src, dst, expansion.actual, info.hasAudio),
          opts?.signal,
        );
      } else {
        await encode(src, dst, 'format=yuv420p', info.fps, false, requested, opts?.signal);
      }
      const cutProbe = await probe(dst);
      const actual = modeUsed === 'lossless' ? expansion.actual : requested;
      return { actualRange: actual, modeUsed, frameCount: cutProbe.frames.length };
    },
    async thumbnail(src, atUs, dst, width, opts) {
      const { ffmpeg: bin } = bins();
      await ensureParent(dst);
      await runChecked(bin, thumbnailArgs(src, dst, atUs, width), opts?.signal);
    },
    async filmstrip(src, range, count, dst, tileWidth, opts) {
      if (count <= 0)
        throw new VideoToolError('VALIDATION_FAILED', 'filmstrip count must be positive');
      const info = await probe(src);
      const inside = info.frames.filter(
        (frame) => frame.tUs >= range.startUs && frame.tUs <= range.endUs,
      );
      const pool = inside.length > 0 ? inside : info.frames;
      const picked = evenlySpacedIndices(pool.length, count).map((index) => pool[index]!);
      const indices = indicesOfTimes(info.frames, picked);
      return sprite(
        src,
        dst,
        indices,
        picked.map((frame) => frame.tUs),
        tileWidth,
        opts?.signal,
      );
    },
    async loupe(src, centerUs, halfWindowUs, dst, tileWidth, opts) {
      const info = await probe(src);
      const picked = framesInWindow(info.frames, centerUs, halfWindowUs);
      return sprite(
        src,
        dst,
        indicesOfTimes(info.frames, picked),
        picked.map((frame) => frame.tUs),
        tileWidth,
        opts?.signal,
      );
    },
    keyframes(videoPath, opts): AsyncIterable<VideoFrame> {
      const { ffmpeg: bin } = bins();
      const filter = frameFilter({
        maxSide: opts.maxSide,
        gray: true,
        toSdr: false,
        transfer: null,
      });
      return decodePipedFrames(bin, keyframeArgs(videoPath, filter), opts.signal);
    },
    frames(videoPath, opts): AsyncIterable<VideoFrame> {
      const { ffmpeg: bin } = bins();
      return (async function* frames() {
        const info = await probe(videoPath);
        const filter = frameFilter({
          windows: opts.windows,
          sampleFps: opts.sampleFps,
          maxSide: opts.maxSide,
          toSdr: opts.toSdr,
          transfer: info.hdrTransfer,
          gray: false,
        });
        yield* decodePipedFrames(bin, windowArgs(videoPath, filter, false), opts.signal);
      })();
    },
  };
}

export function assertSafeOutputArgs(args: readonly string[]): void {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] !== '-map') continue;
    const spec = args[index + 1];
    if (spec === '0' || spec === '0:a') {
      throw new Error(`unsafe ffmpeg map ${spec}`);
    }
  }
  if (args.includes('-noautorotate')) throw new Error('autorotate disabled');
}
