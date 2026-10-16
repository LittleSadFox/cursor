import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { openSqliteLibrary, signMedia } from '@climbing-coach/adapters-node';
import { createHttpCoachApi, ProblemError, runCoachApiConformance } from '@climbing-coach/api';
import {
  createCoreApi,
  createEventBus,
  createIdGen,
  sequentialRandomBytes,
  silentLogger,
  systemClock,
} from '@climbing-coach/core';

import { APP_ORIGIN, VITE_ORIGINS } from './config.js';
import { createApp } from './create-app.js';

const TOKEN = 'secret-token';
const ORIGINS = [APP_ORIGIN, ...VITE_ORIGINS];
const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function testApp(overrides: { heartbeatMs?: number } = {}) {
  const clock = systemClock();
  const opened = openSqliteLibrary(':memory:', clock.nowIso());
  const events = createEventBus(() => clock.nowMs());
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids: createIdGen(clock, sequentialRandomBytes(3)),
    events,
    logger: silentLogger(),
  });
  const app = await createApp({
    api,
    events,
    token: TOKEN,
    allowedOrigins: ORIGINS,
    mediaSecret: 'media-secret',
    libraryRoot: '/tmp/coach-lib',
    ...overrides,
  });
  apps.push(app);
  return { app, api, events };
}

async function listening(app: FastifyInstance): Promise<string> {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}

const authed = { host: '127.0.0.1:8787', authorization: `Bearer ${TOKEN}` };

describe('HTTP security', () => {
  it('rejects missing tokens, bad origins, and foreign hosts', async () => {
    const { app } = await testApp();
    const get = (headers: Record<string, string>) =>
      app.inject({ method: 'GET', url: '/api/v1/health', headers });

    expect((await get({ host: '127.0.0.1:8787' })).statusCode).toBe(401);
    expect(
      (await get({ host: '127.0.0.1:8787', authorization: `Bearer ${TOKEN}x` })).statusCode,
    ).toBe(401);
    expect((await get({ host: '127.0.0.1:8787', authorization: 'Bearer ' })).statusCode).toBe(401);
    expect((await get({ ...authed, origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await get({ ...authed, origin: 'null' })).statusCode).toBe(403);
    expect((await get({ host: 'evil.example', authorization: `Bearer ${TOKEN}` })).statusCode).toBe(
      403,
    );
    expect(
      (await get({ host: '127.0.0.1.evil.example', authorization: `Bearer ${TOKEN}` })).statusCode,
    ).toBe(403);

    const ok = await get({ ...authed, origin: APP_ORIGIN });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(ok.json().status).toBe('degraded');
  });

  it('rejects a Host naming a different port than the one the server listens on', async () => {
    const { app } = await testApp();
    const base = await listening(app);
    const port = Number(new URL(base).port);
    // fetch() refuses to override Host, so use node:http directly.
    const status = (host: string) =>
      new Promise<number | undefined>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port,
            path: '/api/v1/health',
            headers: { host, authorization: `Bearer ${TOKEN}` },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on('error', reject);
        req.end();
      });
    expect(await status(`127.0.0.1:${port + 1}`)).toBe(403);
    expect(await status(`localhost:${port}`)).toBe(200);
  });

  it('lets signed media URLs through without a bearer token but checks the signature', async () => {
    const { app } = await testApp();
    const sig = signMedia('media-secret', VIDEO_ID, 'proxy');
    const signed = await app.inject({
      method: 'GET',
      url: `/api/v1/media/videos/${VIDEO_ID}?variant=proxy&sig=${sig}`,
      headers: { host: '127.0.0.1:8787' },
    });
    expect(signed.json().code).toBe('FFMPEG_UNAVAILABLE');

    const forged = await app.inject({
      method: 'GET',
      url: `/api/v1/media/videos/${VIDEO_ID}?variant=original&sig=${sig}`,
      headers: { host: '127.0.0.1:8787' },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json().code).toBe('INVALID_SIGNATURE');

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/media/videos/${VIDEO_ID}?variant=proxy&sig=${sig}`,
      headers: { host: 'evil.example' },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('refuses media ids that are not ULIDs, even with a valid signature', async () => {
    const { app } = await testApp();
    const videoId = '../../etc/passwd';
    const sig = signMedia('media-secret', videoId, 'proxy');
    const traversal = await app.inject({
      method: 'GET',
      url: `/api/v1/media/videos/${encodeURIComponent(videoId)}?variant=proxy&sig=${sig}`,
      headers: { host: '127.0.0.1:8787' },
    });
    expect(traversal.statusCode).toBe(404);
  });

  it('answers CORS preflight for allowed origins only', async () => {
    const { app } = await testApp();
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/gyms',
      headers: {
        host: '127.0.0.1:8787',
        origin: VITE_ORIGINS[0],
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(VITE_ORIGINS[0]);
    expect(preflight.headers['access-control-allow-headers']).toContain('Authorization');
  });
});

describe('problem responses', () => {
  it('maps invalid ids, bad JSON, and unknown routes to 4xx problems', async () => {
    const { app } = await testApp();
    const badId = await app.inject({
      method: 'GET',
      url: '/api/v1/gyms/not-a-ulid',
      headers: authed,
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.headers['content-type']).toContain('application/problem+json');

    const badJson = await app.inject({
      method: 'POST',
      url: '/api/v1/gyms',
      headers: { ...authed, 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(badJson.statusCode).toBe(400);
    expect(badJson.json().code).toBe('VALIDATION_FAILED');

    const missing = await app.inject({ method: 'GET', url: '/api/v1/nope', headers: authed });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('NOT_FOUND');
  });

  it('reports unexpected failures as 500 INTERNAL, not 400', async () => {
    const { app, api } = await testApp();
    api.gyms.list = () => Promise.reject(new Error('disk on fire'));
    const res = await app.inject({ method: 'GET', url: '/api/v1/gyms', headers: authed });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL', detail: 'internal error' });
  });

  it('are instanceof ProblemError on the client', async () => {
    const { app } = await testApp();
    const client = createHttpCoachApi({ baseUrl: await listening(app), token: TOKEN });
    await expect(client.gyms.get(VIDEO_ID)).rejects.toBeInstanceOf(ProblemError);
  });
});

describe('server-sent events', () => {
  it('sends CORS headers on the hijacked stream, then events and heartbeats', async () => {
    const { app, events } = await testApp({ heartbeatMs: 20 });
    const base = await listening(app);
    const controller = new AbortController();
    const res = await fetch(`${base}/api/v1/events`, {
      headers: { authorization: `Bearer ${TOKEN}`, origin: VITE_ORIGINS[0] },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(VITE_ORIGINS[0]);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    events.publish({
      type: 'job.progress',
      jobId: VIDEO_ID,
      jobType: 'backup-db',
      step: 'backup',
      progress: 0.5,
    });
    const reader = res.body?.getReader();
    if (!reader) throw new Error('expected a body');
    let text = '';
    const decoder = new TextDecoder();
    while (!(text.includes('event: job.progress') && text.includes(': ping'))) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value);
    }
    controller.abort();
    expect(text).toMatch(/id: \d+-1\nevent: job.progress\ndata: \{/);
    expect(text).toContain(': ping');
  });
});

describe('HTTP conformance', () => {
  it('matches the in-process CoachApi suite', async () => {
    const { app } = await testApp();
    await runCoachApiConformance(
      createHttpCoachApi({ baseUrl: await listening(app), token: TOKEN }),
    );
  });
});
