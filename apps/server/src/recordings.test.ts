import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { libraryMediaFiles, openSqliteLibrary, signMedia } from '@climbing-coach/adapters-node';
import { us } from '@climbing-coach/schema';
import {
  createCoreApi,
  createEventBus,
  createIdGen,
  sequentialRandomBytes,
  silentLogger,
  systemClock,
  type ProbeResult,
  type VideoTools,
} from '@climbing-coach/core';

import { APP_ORIGIN } from './config.js';
import { createApp } from './create-app.js';

const TOKEN = 'secret-token';
const SECRET = 'media-secret';

function fakeTools(): VideoTools {
  const probe: ProbeResult = {
    durationUs: us(1_000_000),
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
    frames: [{ tUs: us(0), durationUs: us(1_000_000), keyframe: true }],
  };
  return {
    ready: () => true,
    probe: async () => probe,
    quickHash: async () => 'a'.repeat(64),
    fullHash: async () => 'b'.repeat(64),
    makeProxy: async (_src, dst) => {
      await mkdir(dirname(dst), { recursive: true });
      await writeFile(dst, Buffer.from('proxy-bytes'));
    },
    cut: async (_src, dst) => {
      await mkdir(dirname(dst), { recursive: true });
      await writeFile(dst, Buffer.from('clip-bytes'));
      return {
        actualRange: { startUs: us(0), endUs: us(500_000) },
        modeUsed: 'lossless',
        frameCount: 1,
      };
    },
    thumbnail: async () => undefined,
    filmstrip: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    loupe: async () => ({ width: 1, height: 1, columns: 1, rows: 1, tiles: [] }),
    keyframes: async function* () {},
    frames: async function* () {},
  };
}

describe('recording upload', () => {
  const apps: FastifyInstance[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it('stores an uploaded file, probe fields, and streams the proxy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coach-lib-'));
    dirs.push(root);
    const clock = systemClock();
    const opened = openSqliteLibrary(join(root, 'library.db'), clock.nowIso());
    const events = createEventBus(() => clock.nowMs());
    const api = createCoreApi({
      db: opened.db,
      sql: opened.sql,
      clock,
      ids: createIdGen(clock, sequentialRandomBytes(4)),
      events,
      logger: silentLogger(),
      video: fakeTools(),
      mediaFiles: libraryMediaFiles(root),
      mediaUrl: (id, variant) =>
        `/api/v1/media/videos/${id}?variant=${variant}&sig=${signMedia(SECRET, id, variant)}`,
    });
    const app = await createApp({
      api,
      events,
      token: TOKEN,
      allowedOrigins: [APP_ORIGIN],
      mediaSecret: SECRET,
      libraryRoot: root,
      resolveMedia: api.resolveMedia,
    });
    apps.push(app);
    app.addHook('onClose', async () => {
      opened.close();
    });

    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/recordings/upload',
      headers: {
        host: '127.0.0.1:8787',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/octet-stream',
        'x-filename': encodeURIComponent('gym.mov'),
      },
      payload: Buffer.from('fake-video-bytes'),
    });
    expect(upload.statusCode).toBe(202);
    const created = upload.json() as { recording: { id: string; fileName: string } };
    expect(created.recording.fileName).toBe('gym.mov');
    for (let i = 0; i < 8; i += 1) {
      if ((await api.jobsRunner.tick()) === 0) break;
    }
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/recordings',
      headers: { host: '127.0.0.1:8787', authorization: `Bearer ${TOKEN}` },
    });
    const rows = listed.json() as {
      id: string;
      codec: string;
      quickHash: string;
      sha256: string;
      proxyUrl: string | null;
      fps: number;
    }[];
    const row = rows.find((item) => item.id === created.recording.id);
    expect(row?.codec).toBe('h264');
    expect(row?.fps).toBe(30);
    expect(row?.quickHash).toBe('a'.repeat(64));
    expect(row?.sha256).toBe('b'.repeat(64));
    expect(row?.proxyUrl).toContain('variant=proxy');
    const media = await app.inject({
      method: 'GET',
      url: row?.proxyUrl ?? '',
      headers: { host: '127.0.0.1:8787', range: 'bytes=0-3' },
    });
    expect(media.statusCode).toBe(206);
    expect(media.body).toBe('prox');

    const cut = await app.inject({
      method: 'POST',
      url: `/api/v1/recordings/${created.recording.id}/cut`,
      headers: {
        host: '127.0.0.1:8787',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { startUs: 0, endUs: 500_000, mode: 'auto' },
    });
    expect(cut.statusCode).toBe(202);
    for (let i = 0; i < 8; i += 1) {
      if ((await api.jobsRunner.tick()) === 0) break;
    }
    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/recordings',
      headers: { host: '127.0.0.1:8787', authorization: `Bearer ${TOKEN}` },
    });
    const clips = after.json() as { kind: string; proxyReady: boolean; fileName: string }[];
    expect(clips.some((item) => item.kind === 'clip' && item.proxyReady && item.fileName.includes('cut'))).toBe(
      true,
    );
  });
});
