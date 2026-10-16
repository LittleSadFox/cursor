import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { libraryBlobs, openSqliteLibrary } from '@climbing-coach/adapters-node';
import { createHttpCoachApi, ProblemError } from '@climbing-coach/api';
import {
  createCoreApi,
  createEventBus,
  createIdGen,
  sequentialRandomBytes,
  silentLogger,
  systemClock,
  type BlobStore,
  type SqlExecutor,
} from '@climbing-coach/core';
import { LANDMARK_COUNT, readPosebin, writePosebin } from '@climbing-coach/schema';
import { PoseBuilder, REACH, STAND } from '@climbing-coach/test-fixtures';

import { createApp } from './create-app.js';

const TOKEN = 'secret-token';
const apps: FastifyInstance[] = [];
const temps: string[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function climbPosebin(videoId: string, trackId: string): { bytes: Uint8Array; endUs: number } {
  const builder = new PoseBuilder();
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 1);
  builder.hold(REACH, 1);
  builder.ramp(REACH, { ...REACH, wristY: -0.2 }, 0.6);
  const frames = builder.samples;
  const buffer = new Float32Array(frames.length * LANDMARK_COUNT * 4);
  frames.forEach((sample, frame) =>
    sample.landmarks.forEach((point, i) => buffer.set(point, (frame * LANDMARK_COUNT + i) * 4)),
  );
  const bytes = writePosebin({
    header: {
      videoId,
      kind: 'hq',
      runtime: 'test',
      model: 'rtmpose-m-body26',
      modelVersion: '1',
      sampleFps: 15,
      windows: [],
      coordinateSpace: 'display',
      displayWidth: 1920,
      displayHeight: 1080,
      rotation: 0,
      tracks: [{ trackId, firstFrame: 0, lastFrame: frames.length - 1 }],
      selectedTrackId: trackId,
      frameCount: frames.length,
    },
    tUs: Float64Array.from(frames, (sample) => sample.tUs),
    landmarksByTrack: new Map([[trackId, buffer]]),
  });
  return { bytes, endUs: (frames[frames.length - 1]?.tUs ?? 0) + 1 };
}

/** The rows P2-B's commit pipeline writes: clip video, HQ pose track, attempt. */
async function seedAttempt(
  sql: SqlExecutor,
  blobs: BlobStore,
  ids: { ulid(): string },
  now: string,
): Promise<{ attemptId: string; videoId: string }> {
  const [videoId, trackId, attemptId] = [ids.ulid(), ids.ulid(), ids.ulid()];
  const path = `pose/${videoId}.hq.posebin`;
  const { bytes, endUs } = climbPosebin(videoId, trackId);
  await blobs.write(path, bytes);
  sql.run('INSERT INTO videos (id, kind, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    videoId,
    'clip',
    `clips/${videoId}.mov`,
    now,
    now,
  ]);
  sql.run(
    `INSERT INTO pose_tracks (id, video_id, kind, runtime, model, model_version, sample_fps, path,
      created_at, updated_at) VALUES (?, ?, 'hq', 'test', 'rtmpose-m-body26', '1', 15, ?, ?, ?)`,
    [trackId, videoId, path, now, now],
  );
  sql.run(
    `INSERT INTO attempts (id, clip_video_id, session_id, climb_start_us, climb_end_us, outcome,
      recorded_at, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 'top', ?, ?, ?)`,
    [attemptId, videoId, ids.ulid(), endUs, now, now, now],
  );
  return { attemptId, videoId };
}

async function comparisonApp() {
  const root = mkdtempSync(join(tmpdir(), 'coach-compare-'));
  temps.push(root);
  const clock = systemClock();
  const opened = openSqliteLibrary(':memory:', clock.nowIso());
  const events = createEventBus(() => clock.nowMs());
  const blobs = libraryBlobs(root);
  const ids = createIdGen(clock, sequentialRandomBytes(5));
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids,
    events,
    logger: silentLogger(),
    blobs,
  });
  const app = await createApp({
    api,
    events,
    token: TOKEN,
    allowedOrigins: [],
    mediaSecret: 'media-secret',
    libraryRoot: root,
  });
  apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const seed = () =>
    seedAttempt(opened.sql, blobs, createIdGen(clock, sequentialRandomBytes(9)), clock.nowIso());
  return { app, api, base, seed, client: createHttpCoachApi({ baseUrl: base, token: TOKEN }) };
}

describe('comparison routes', () => {
  it('202 while computing, 200 from cache, binary warp and divergence', async () => {
    const { api, base, seed, client } = await comparisonApp();
    const a = await seed();
    const b = await seed();
    const post = () =>
      fetch(`${base}/api/v1/comparisons`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ attemptAId: a.attemptId, attemptBId: b.attemptId }),
      });
    const first = await post();
    expect(first.status).toBe(202);
    const pending = (await first.json()) as { id: string; jobId: string };
    expect(pending.jobId).toBeTruthy();

    for (let i = 0; i < 6; i += 1) await api.jobsRunner.tick();
    expect((await post()).status).toBe(200);

    const ready = await client.comparisons.get(pending.id);
    expect(ready.status).toBe('ready');
    expect(ready.warpUrl).toBe(`/api/v1/comparisons/${ready.id}/warp`);
    const warp = await client.comparisons.warp(ready.id);
    const divergence = await client.comparisons.divergence(ready.id);
    expect(warp).toHaveLength(ready.steps * 2);
    expect(Array.from(warp.slice(0, 2))).toEqual([0, 0]);
    expect(divergence).toHaveLength(ready.steps * ready.channels.length);
    // Same climb on both sides: every delta is 0; COM support is NaN while no limb is planted.
    expect(Array.from(divergence).every((value) => value === 0 || Number.isNaN(value))).toBe(true);
    expect(Array.from(divergence).some((value) => value === 0)).toBe(true);

    const move = ready.perMove[0]?.moveIndexA ?? 0;
    await client.comparisons.feedback(ready.id, { moveIndexA: move, verdict: 'misaligned' });
    const exported = await client.comparisons
      .export(ready.id, { layout: 'side_by_side' })
      .catch((error: unknown) => error);
    expect(exported instanceof ProblemError && exported.problem.status).toBe(503);

    const pose = readPosebin(await client.videos.pose(a.videoId, { fromUs: 0, toUs: 500_000 }));
    expect(pose.header.frameCount).toBeGreaterThan(0);
    expect(pose.tUs[pose.tUs.length - 1]).toBeLessThan(500_000);
  });

  it('maps validation and missing rows to problem responses', async () => {
    const { client, seed } = await comparisonApp();
    const a = await seed();
    const missing = await client.comparisons
      .create({ attemptAId: a.attemptId, attemptBId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })
      .catch((error: unknown) => error);
    expect(missing instanceof ProblemError && missing.problem.code).toBe('NOT_FOUND');
    const same = await client.comparisons
      .create({ attemptAId: a.attemptId, attemptBId: a.attemptId })
      .catch((error: unknown) => error);
    expect(same instanceof ProblemError && same.problem.code).toBe('VALIDATION_FAILED');
  });
});
