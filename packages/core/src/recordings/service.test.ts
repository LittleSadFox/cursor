import { describe, expect, it } from 'vitest';

import { ProblemError } from '@climbing-coach/api';
import { us } from '@climbing-coach/schema';

import { createCoreApi } from '../create-api.js';
import { createEventBus } from '../ports/events.js';
import { silentLogger } from '../ports/logger.js';
import type { MediaFiles } from '../ports/media-files.js';
import { systemClock } from '../ports/clock.js';
import type { ProbeResult, VideoTools } from '../ports/video.js';
import { openMemoryLibrary } from '../test/memory-db.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';

const probe: ProbeResult = {
  durationUs: us(2_000_000),
  codec: 'h264',
  width: 160,
  height: 120,
  displayWidth: 120,
  displayHeight: 160,
  rotation: -90,
  fps: 30,
  isHdr: true,
  isVfr: false,
  colorTransfer: 'arib-std-b67',
  hdrTransfer: 'arib-std-b67',
  dolbyVision: '8.4',
  hasAudio: false,
  frames: [
    { tUs: us(0), durationUs: us(1_000_000), keyframe: true },
    { tUs: us(1_000_000), durationUs: us(1_000_000), keyframe: true },
  ],
};

function tools(): VideoTools {
  return {
    ready: () => true,
    probe: async () => probe,
    quickHash: async () => 'quick-hash',
    fullHash: async () => 'full-hash',
    makeProxy: async () => undefined,
    cut: async (_src, _dst, range) => ({
      actualRange: range,
      modeUsed: 'reencode',
      frameCount: 2,
    }),
    thumbnail: async () => undefined,
    filmstrip: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    loupe: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    keyframes: async function* () {},
    frames: async function* () {},
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

async function drain(tick: () => Promise<number>): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    if ((await tick()) === 0) return;
  }
}

describe('recording import', () => {
  it('persists probe, both hashes, and a proxy, then cuts a clip', async () => {
    const clock = systemClock();
    const opened = openMemoryLibrary(clock.nowIso());
    const api = createCoreApi({
      db: opened.db,
      sql: opened.sql,
      clock,
      ids: createIdGen(clock, sequentialRandomBytes(1)),
      events: createEventBus(() => clock.nowMs()),
      logger: silentLogger(),
      // Pose stays out of this slice; health is degraded while ffmpeg can still import.
      ffmpegAvailable: true,
      ffmpegVersion: '8.1.3',
      poseAvailable: false,
      video: tools(),
      mediaFiles: files(),
      mediaUrl: (id, variant) => `/api/v1/media/videos/${id}?variant=${variant}&sig=test`,
    });
    const health = await api.system.health();
    expect(health.status).toBe('degraded');
    expect(health.ffmpeg.available).toBe(true);
    expect(health.pose.available).toBe(false);
    const imported = await api.recordings.importPath({
      sourcePath: '/tmp/climb.mov',
      importMode: 'copy',
      fileName: 'climb.mov',
    });
    expect(imported.recording.fileName).toBe('climb.mov');
    expect(imported.recording.proxyReady).toBe(false);
    await drain(() => api.jobsRunner.tick());
    const ready = await api.recordings.get(imported.recording.id);
    expect(ready.codec).toBe('h264');
    expect(ready.displayWidth).toBe(120);
    expect(ready.displayHeight).toBe(160);
    expect(ready.rotation).toBe(-90);
    expect(ready.isHdr).toBe(true);
    expect(ready.dolbyVision).toBe('8.4');
    expect(ready.fps).toBe(30);
    expect(ready.quickHash).toBe('quick-hash');
    expect(ready.sha256).toBe('full-hash');
    expect(ready.proxyReady).toBe(true);
    expect(ready.proxyUrl).toContain('variant=proxy');
    expect(ready.jobStatus).toBe('succeeded');

    const clip = await api.recordings.cut(ready.id, {
      startUs: 0,
      endUs: 1_000_000,
      mode: 'auto',
    });
    await drain(() => api.jobsRunner.tick());
    const cut = await api.recordings.get(clip.recording.id);
    expect(cut.kind).toBe('clip');
    expect(cut.proxyReady).toBe(true);
    expect(cut.codec).toBe('h264');
    expect(cut.sourceVideoId).toBe(ready.id);
  });

  it('refuses import when ffmpeg is missing', async () => {
    const clock = systemClock();
    const opened = openMemoryLibrary(clock.nowIso());
    const api = createCoreApi({
      db: opened.db,
      sql: opened.sql,
      clock,
      ids: createIdGen(clock, sequentialRandomBytes(2)),
      events: createEventBus(() => clock.nowMs()),
      logger: silentLogger(),
    });
    await expect(
      api.recordings.importPath({ sourcePath: '/tmp/climb.mov', importMode: 'copy' }),
    ).rejects.toBeInstanceOf(ProblemError);
  });
});
