import { readPosebin, us } from '@climbing-coach/schema';
import { standClimbFall } from '@climbing-coach/test-fixtures';

import { createCoreApi } from '../create-api.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';
import { readSignals } from '../ingest/signals-store.js';
import { systemClock } from '../ports/clock.js';
import { createEventBus } from '../ports/events.js';
import { silentLogger } from '../ports/logger.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { PoseExtractOptions, PoseExtractor } from '../ports/pose.js';
import type { FrameWindowOptions, ProbeResult, VideoFrame, VideoTools } from '../ports/video.js';
import { posebinOf } from './attempts.js';
import { memoryBlobs } from './fakes.js';
import { openMemoryLibrary } from './memory-db.js';

/** Fake ffmpeg, pose, and library files for import / review job tests. */
export const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
export const DURATION_US = 10_000_000;

export function gray(tUs: number, lit: boolean): VideoFrame {
  const data = new Uint8Array(16 * 16);
  if (lit) data.fill(255, 0, 128);
  return { tUs: us(tUs), width: 16, height: 16, data, format: 'gray' };
}

/** One frame per second, lit only at 1 s: activity at 1 s and 2 s, padded to `[0, 5 s]`. */
export function secondFrames(): VideoFrame[] {
  return Array.from({ length: 11 }, (_, index) => gray(index * 1_000_000, index === 1));
}

export type FakeTools = VideoTools & { frameCalls: FrameWindowOptions[]; spriteCalls: string[] };

export function fakeVideoTools(
  keyframes: readonly VideoFrame[],
  dense: readonly VideoFrame[],
): FakeTools {
  const probe: ProbeResult = {
    durationUs: us(DURATION_US),
    codec: 'h264',
    width: 16,
    height: 16,
    displayWidth: 16,
    displayHeight: 16,
    rotation: -90,
    fps: 30,
    isHdr: false,
    isVfr: false,
    colorTransfer: 'bt709',
    hdrTransfer: null,
    dolbyVision: null,
    hasAudio: false,
    frames: [],
  };
  const frameCalls: FrameWindowOptions[] = [];
  const spriteCalls: string[] = [];
  const tile = (tUs: number) => ({ tUs: us(tUs), x: 0, y: 0, w: 8, h: 8 });
  return {
    frameCalls,
    spriteCalls,
    ready: () => true,
    probe: async () => probe,
    quickHash: async () => 'quick-hash',
    fullHash: async () => 'full-hash',
    makeProxy: async () => undefined,
    cut: async (_src, _dst, range) => ({ actualRange: range, modeUsed: 'reencode', frameCount: 1 }),
    thumbnail: async () => undefined,
    filmstrip: async (src, range, _count, dst) => {
      spriteCalls.push(`filmstrip ${src} -> ${dst}`);
      return { width: 8, height: 8, columns: 1, rows: 1, tiles: [tile(range.startUs)] };
    },
    loupe: async (src, centerUs, _half, dst) => {
      spriteCalls.push(`loupe ${src} -> ${dst}`);
      return { width: 8, height: 8, columns: 1, rows: 1, tiles: [tile(centerUs)] };
    },
    async *keyframes() {
      yield* keyframes;
    },
    async *frames(_path, opts) {
      frameCalls.push(opts);
      if (opts.sampleFps === 2) yield* dense;
    },
  };
}

export function fakeFiles(): MediaFiles {
  return {
    stat: async () => ({ size: 32 }),
    copyInto: async () => undefined,
    moveInto: async () => undefined,
    absolute: (stored) => (stored.startsWith('/') ? stored : `/lib/${stored}`),
  };
}

export function fakePose(seen: PoseExtractOptions[]): PoseExtractor {
  return {
    info: () => ({
      runtime: 'test',
      model: 'rtmpose-m-halpe26',
      modelVersion: '20230605',
      keypointSet: 'halpe26',
      executionProvider: 'cpu',
      inputSize: { width: 192, height: 256 },
    }),
    ready: () => true,
    extract: async (_frames, options) => {
      seen.push(options);
      const samples = standClimbFall().samples;
      return {
        track: readPosebin(
          posebinOf(options.videoId, TRACK_ID, samples, 'rtmpose-m-halpe26', '20230605'),
        ),
        framesProcessed: samples.length,
        persons: 1,
      };
    },
  };
}

export async function importWith(video: FakeTools) {
  const seen: PoseExtractOptions[] = [];
  const clock = systemClock();
  const opened = openMemoryLibrary(clock.nowIso());
  const blobs = memoryBlobs();
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids: createIdGen(clock, sequentialRandomBytes(3)),
    events: createEventBus(() => clock.nowMs()),
    logger: silentLogger(),
    ffmpegAvailable: true,
    ffmpegVersion: '8.1.3',
    poseAvailable: true,
    pose: fakePose(seen),
    blobs,
    video,
    mediaFiles: fakeFiles(),
    thumbUrl: (videoId: string, name: string) => `/thumbs/${videoId}/${name}`,
  });
  const imported = await api.recordings.importPath({
    sourcePath: '/tmp/climb.mov',
    importMode: 'copy',
    fileName: 'climb.mov',
  });
  const drain = async () => {
    for (let i = 0; i < 24; i += 1) {
      if ((await api.jobsRunner.tick()) === 0) break;
    }
  };
  await drain();
  const id = imported.recording.id;
  return { api, blobs, drain, id, seen, signals: await readSignals(blobs, id) };
}
