import { describe, expect, it } from 'vitest';

import { parseSignalsJson, readPosebin, us } from '@climbing-coach/schema';
import { standClimbFall } from '@climbing-coach/test-fixtures';

import { createCoreApi } from '../create-api.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';
import { systemClock } from '../ports/clock.js';
import { createEventBus } from '../ports/events.js';
import { silentLogger } from '../ports/logger.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { PoseExtractor } from '../ports/pose.js';
import type { ProbeResult, VideoFrame, VideoTools } from '../ports/video.js';
import { posebinOf } from '../test/attempts.js';
import { memoryBlobs } from '../test/fakes.js';
import { openMemoryLibrary } from '../test/memory-db.js';
import { signalsPath } from '../ingest/signals.js';

const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function gray(tUs: number, lit: boolean): VideoFrame {
  const data = new Uint8Array(16 * 16);
  if (lit) data.fill(255, 0, 128);
  return { tUs: us(tUs), width: 16, height: 16, data, format: 'gray' };
}

function tools(): VideoTools {
  const probe: ProbeResult = {
    durationUs: us(10_000_000),
    codec: 'h264',
    width: 16,
    height: 16,
    displayWidth: 16,
    displayHeight: 16,
    rotation: 0,
    fps: 30,
    isHdr: false,
    isVfr: false,
    colorTransfer: 'bt709',
    hdrTransfer: null,
    dolbyVision: null,
    hasAudio: false,
    frames: Array.from({ length: 11 }, (_, index) => ({
      tUs: us(index * 1_000_000),
      durationUs: us(1_000_000),
      keyframe: true,
    })),
  };
  return {
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
      yield gray(0, false);
      yield gray(500_000, false);
      yield gray(1_000_000, true);
      yield gray(1_500_000, true);
      yield gray(2_000_000, false);
      yield gray(8_000_000, false);
    },
    async *frames() {},
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

describe('import ingest', () => {
  it('stores activity windows, poses only those windows, and proposes the climb', async () => {
    const seen: { startUs: number; endUs: number }[] = [];
    const pose: PoseExtractor = {
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
        seen.push(...options.windows);
        const scenario = standClimbFall();
        return {
          track: readPosebin(
            posebinOf(options.videoId, TRACK_ID, scenario.samples, 'rtmpose-m-halpe26', '20230605'),
          ),
          framesProcessed: 1,
          persons: 1,
        };
      },
    };
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
      pose,
      blobs,
      video: tools(),
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
    const ready = await api.recordings.get(imported.recording.id);
    expect(ready.jobStatus).toBe('succeeded');
    expect(ready.hasPose).toBe(true);
    expect(ready.reviewState).toBe('in_review');
    const signals = parseSignalsJson(
      new TextDecoder().decode(blobs.files.get(signalsPath(imported.recording.id)) ?? new Uint8Array()),
    );
    expect(signals.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
    expect(seen).toEqual(signals.activeWindows);
    const review = await api.recordings.review(imported.recording.id);
    expect(review).toHaveLength(1);
    expect(review[0]?.outcome).toBe('fall');
    expect(review[0]?.clipStartUs).toBeLessThan(review[0]?.climbStartUs ?? 0);
    expect(review[0]?.clipEndUs).toBeGreaterThan(review[0]?.climbEndUs ?? 0);
  });
});
