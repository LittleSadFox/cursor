import { describe, expect, it } from 'vitest';

import { signMedia } from '@climbing-coach/adapters-node';
import { createHttpCoachApi, ProblemError, runCoachApiConformance } from '@climbing-coach/api';
import {
  createCoreApi,
  createEventBus,
  createIdGen,
  sequentialRandomBytes,
  silentLogger,
  systemClock,
} from '@climbing-coach/core';
import { openSqliteLibrary } from '@climbing-coach/adapters-node';

import { createApp, DEV_ORIGINS } from './create-app.js';

function testServer() {
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
  return { api, events, opened };
}

describe('HTTP security', () => {
  it('rejects missing tokens, bad origins, and traversal', async () => {
    const { api, events } = testServer();
    const app = await createApp({
      api,
      events,
      token: 'secret-token',
      allowedOrigins: DEV_ORIGINS,
      mediaSecret: 'media-secret',
      libraryRoot: '/tmp/coach-lib',
    });

    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { host: '127.0.0.1:8787' } });
    expect(noAuth.statusCode).toBe(401);

    const badOrigin = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        host: '127.0.0.1:8787',
        origin: 'https://evil.example',
        authorization: 'Bearer secret-token',
      },
    });
    expect(badOrigin.statusCode).toBe(403);

    const nullOrigin = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        host: '127.0.0.1:8787',
        origin: 'null',
        authorization: 'Bearer secret-token',
      },
    });
    expect(nullOrigin.statusCode).toBe(403);

    const badHost = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { host: 'evil.example', authorization: 'Bearer secret-token' },
    });
    expect(badHost.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        host: '127.0.0.1:8787',
        origin: 'app://-',
        authorization: 'Bearer secret-token',
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('degraded');

    const videoId = '../../etc/passwd';
    const sig = signMedia('media-secret', videoId, 'proxy');
    const traversal = await app.inject({
      method: 'GET',
      url: `/api/v1/media/videos/${encodeURIComponent(videoId)}?variant=proxy&sig=${sig}`,
      headers: { host: '127.0.0.1:8787', authorization: 'Bearer secret-token' },
    });
    expect(traversal.statusCode).toBe(404);

    await app.close();
  });
});

describe('HTTP conformance', () => {
  it('matches the in-process CoachApi suite', async () => {
    const { api, events } = testServer();
    const app = await createApp({
      api,
      events,
      token: 'conformance-token',
      allowedOrigins: DEV_ORIGINS,
      mediaSecret: 'media-secret',
      libraryRoot: '/tmp/coach-lib',
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP address');
    const client = createHttpCoachApi({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: 'conformance-token',
    });
    try {
      await runCoachApiConformance(client);
    } finally {
      await app.close();
    }
  });
});

describe('problem errors', () => {
  it('are instanceof ProblemError on the client', async () => {
    const { api, events } = testServer();
    const app = await createApp({
      api,
      events,
      token: 't',
      allowedOrigins: DEV_ORIGINS,
      mediaSecret: 'm',
      libraryRoot: '/tmp/coach-lib',
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP address');
    const client = createHttpCoachApi({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: 't',
    });
    await expect(client.gyms.get('01ARZ3NDEKTSV4RRFFQ69G5FAV')).rejects.toBeInstanceOf(ProblemError);
    await app.close();
  });
});
