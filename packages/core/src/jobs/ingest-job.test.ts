import { describe, expect, it } from 'vitest';

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
import { posebinOf } from '../test/attempts.js';
import { memoryBlobs } from '../test/fakes.js';
import { openMemoryLibrary } from '../test/memory-db.js';

const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const DURATION_US = 10_000_000;

function gray(tUs: number, lit: boolean): VideoFrame {
  const data = new Uint8Array(16 * 16);
  if (lit) data.fill(255, 0, 128);
  return { tUs: us(tUs), width: 16, height: 16, data, format: 'gray' };
}

/** One frame per second, lit only at 1 s: activity at 1 s and 2 s, padded to `[0, 5 s]`. */
function secondFrames(): VideoFrame[] {
  return Array.from({ length: 11 }, (_, index) => gray(index * 1_000_000, index === 1));
}

type FakeTools = VideoTools & { frameCalls: FrameWindowOptions[] };

function tools(keyframes: readonly VideoFrame[], dense: readonly VideoFrame[]): FakeTools {
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
  return {
    frameCalls,
    ready: () => true,
    probe: async () => probe,
    quickHash: async () => 'quick-hash',
    fullHash: async () => 'full-hash',
    makeProxy: async () => undefined,
    cut: async (_src, _dst, range) => ({ actualRange: range, modeUsed: 'reencode', frameCount: 1 }),
    thumbnail: async () => undefined,
    filmstrip: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    loupe: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    async *keyframes() {
      yield* keyframes;
    },
    async *frames(_path, opts) {
      frameCalls.push(opts);
      if (opts.sampleFps === 2) yield* dense;
    },
  };
}

function files(): MediaFiles {
  return {
    stat: async () => ({ size: 32 }),
    copyInto: async () => undefined,
    moveInto: async () => undefined,
    absolute: (stored) => (stored.startsWith('/') ? stored : `/lib/${stored}`),
  };
}

function fakePose(seen: PoseExtractOptions[]): PoseExtractor {
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

async function importWith(video: FakeTools) {
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
    mediaFiles: files(),
  });
  const imported = await api.recordings.importPath({
    sourcePath: '/tmp/climb.mov',
    importMode: 'copy',
    fileName: 'climb.mov',
  });
  for (let i = 0; i < 24; i += 1) {
    if ((await api.jobsRunner.tick()) === 0) break;
  }
  const id = imported.recording.id;
  return { api, blobs, id, seen, signals: await readSignals(blobs, id) };
}

describe('import ingest', () => {
  it('stores activity windows, poses only those windows, and proposes the climb', async () => {
    const video = tools(secondFrames(), []);
    const { api, id, seen, signals } = await importWith(video);
    const ready = await api.recordings.get(id);
    expect(ready.jobStatus).toBe('succeeded');
    expect(ready.hasPose).toBe(true);
    expect(ready.reviewState).toBe('in_review');
    expect(signals?.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
    expect(video.frameCalls.some((call) => call.sampleFps === 2)).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.windows).toEqual(signals?.activeWindows);
    expect(seen[0]?.rotation).toBe(270);
    const review = await api.recordings.review(id);
    expect(review).toHaveLength(1);
    expect(review[0]?.outcome).toBe('fall');
    expect(review[0]?.clipStartUs).toBeLessThan(review[0]?.climbStartUs ?? 0);
    expect(review[0]?.clipEndUs).toBeGreaterThan(review[0]?.climbEndUs ?? 0);
  });

  it('decodes at 2 fps when keyframes are more than 2 s apart', async () => {
    const video = tools([gray(0, false), gray(6_000_000, false)], secondFrames());
    const { signals } = await importWith(video);
    const dense = video.frameCalls.filter((call) => call.sampleFps === 2);
    expect(dense).toHaveLength(1);
    expect(dense[0]?.windows).toEqual([{ startUs: 0, endUs: DURATION_US }]);
    expect(signals?.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
  });
});
