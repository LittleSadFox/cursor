import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  libraryBlobs,
  libraryMediaFiles,
  openSqliteLibrary,
  signMedia,
} from '@climbing-coach/adapters-node';
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
import { thumbVariant } from './routes/media.js';

const TOKEN = 'secret-token';
const SECRET = 'media-secret';
const HOST = '127.0.0.1:8787';
const AUTH = { host: HOST, authorization: `Bearer ${TOKEN}` };

async function writeBytes(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(text));
}

function fakeTools(): VideoTools {
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
    frames: [{ tUs: us(0), durationUs: us(10_000_000), keyframe: true }],
  };
  const layout = (tUs: number) => ({
    width: 80,
    height: 45,
    columns: 1,
    rows: 1,
    tiles: [{ tUs: us(tUs), x: 0, y: 0, w: 80, h: 45 }],
  });
  return {
    ready: () => true,
    probe: async () => probe,
    quickHash: async () => 'a'.repeat(64),
    fullHash: async () => 'b'.repeat(64),
    makeProxy: async (_src, dst) => writeBytes(dst, 'proxy-bytes'),
    cut: async () => {
      throw new Error('not used');
    },
    thumbnail: async () => undefined,
    filmstrip: async (_src, range, _count, dst) => {
      await writeBytes(dst, 'jpeg-bytes');
      return layout(range.startUs);
    },
    loupe: async (_src, centerUs, _half, dst) => {
      await writeBytes(dst, 'loupe-bytes');
      return layout(centerUs);
    },
    keyframes: async function* () {},
    frames: async function* () {},
  };
}

async function setup(dirs: string[], apps: FastifyInstance[]) {
  const root = await mkdtemp(join(tmpdir(), 'coach-review-'));
  dirs.push(root);
  await writeBytes(join(root, 'in.mov'), 'fake-video');
  const clock = systemClock();
  const opened = openSqliteLibrary(join(root, 'library.db'), clock.nowIso());
  const events = createEventBus(() => clock.nowMs());
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids: createIdGen(clock, sequentialRandomBytes(5)),
    events,
    logger: silentLogger(),
    video: fakeTools(),
    mediaFiles: libraryMediaFiles(root),
    blobs: libraryBlobs(root),
    thumbUrl: (id, name) =>
      `/api/v1/media/thumbs/${id}/${name}?sig=${signMedia(SECRET, id, thumbVariant(name))}`,
  });
  const app = await createApp({
    api,
    events,
    token: TOKEN,
    allowedOrigins: [APP_ORIGIN],
    mediaSecret: SECRET,
    libraryRoot: root,
    resolveMedia: api.resolveMedia,
    resolveThumb: api.resolveThumb,
  });
  apps.push(app);
  app.addHook('onClose', async () => opened.close());
  const imported = await api.recordings.importPath({
    sourcePath: join(root, 'in.mov'),
    importMode: 'copy',
  });
  for (let i = 0; i < 16; i += 1) {
    if ((await api.jobsRunner.tick()) === 0) break;
  }
  return { app, id: imported.recording.id };
}

describe('review routes', () => {
  const apps: FastifyInstance[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it('autosaves a manual climb and rejects a stale revision', async () => {
    const { app, id } = await setup(dirs, apps);
    const loaded = await app.inject({
      method: 'GET',
      url: `/api/v1/recordings/${id}/review`,
      headers: AUTH,
    });
    expect(loaded.statusCode).toBe(200);
    const state = loaded.json() as { revision: number; items: unknown[] };
    expect(state.items).toEqual([]);
    const body = {
      baseRevision: state.revision,
      items: [
        {
          id: 'new-1',
          origin: 'manual',
          parentIds: [],
          climb: { startUs: 1_000_000, endUs: 4_000_000 },
          outcome: 'top',
          touched: true,
          status: 'draft',
        },
      ],
    };
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/v1/recordings/${id}/review`,
      headers: AUTH,
      payload: body,
    });
    expect(saved.statusCode).toBe(200);
    const json = saved.json() as {
      revision: number;
      idMap: Record<string, string>;
      items: { id: string; clip: { startUs: number; endUs: number } }[];
    };
    expect(json.revision).toBe(state.revision + 1);
    expect(json.items[0]?.id).toBe(json.idMap['new-1']);
    expect(json.items[0]?.clip).toEqual({ startUs: 0, endUs: 5_500_000 });
    const stale = await app.inject({
      method: 'PUT',
      url: `/api/v1/recordings/${id}/review`,
      headers: AUTH,
      payload: body,
    });
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { code: string }).code).toBe('REVIEW_REVISION_CONFLICT');
  });

  it('refuses a full reprocess without the pose runtime', async () => {
    const { app, id } = await setup(dirs, apps);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recordings/${id}/reprocess`,
      headers: AUTH,
      payload: { scope: 'full' },
    });
    expect(response.statusCode).toBe(503);
    expect((response.json() as { code: string }).code).toBe('POSE_RUNTIME_UNAVAILABLE');
  });

  it('serves a filmstrip through a signed thumbs URL only', async () => {
    const { app, id } = await setup(dirs, apps);
    const strip = await app.inject({
      method: 'GET',
      url: `/api/v1/recordings/${id}/filmstrip?startUs=0&endUs=10000000&count=4&width=80`,
      headers: AUTH,
    });
    expect(strip.statusCode).toBe(200);
    const sprite = strip.json() as { spriteUrl: string; tiles: { tUs: number }[] };
    expect(sprite.tiles[0]?.tUs).toBe(0);
    const image = await app.inject({
      method: 'GET',
      url: sprite.spriteUrl,
      headers: { host: HOST },
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/jpeg');
    expect(image.body).toBe('jpeg-bytes');
    const forged = await app.inject({
      method: 'GET',
      url: sprite.spriteUrl.replace(/sig=[^&]+/, 'sig=forged'),
      headers: { host: HOST },
    });
    expect(forged.statusCode).toBe(403);
    const loupe = await app.inject({
      method: 'GET',
      url: `/api/v1/recordings/${id}/loupe?atUs=2400000`,
      headers: AUTH,
    });
    expect((loupe.json() as { tiles: { tUs: number }[] }).tiles[0]?.tUs).toBe(2_000_000);
  });
});
