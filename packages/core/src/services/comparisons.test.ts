import { describe, expect, it } from 'vitest';

import { ProblemError, type CoachEvent, type Comparison } from '@climbing-coach/api';
import { readPosebin } from '@climbing-coach/schema';

import { alignmentRegressionCases } from '../comparisons/regression.js';
import { listLabels } from '../db/repos/labels.js';
import { attemptSeeder, climbFrames, closeRightKnee } from '../test/attempts.js';
import { createTestApi, memoryBlobs } from '../test/fakes.js';

function setup(options: { ffmpegAvailable?: boolean } = {}) {
  const blobs = memoryBlobs();
  const harness = createTestApi({ blobs, ...options });
  const seed = attemptSeeder(harness.memory.db, harness.clock, blobs);
  const events: CoachEvent[] = [];
  harness.events.subscribe((event) => events.push(event));
  /** Drives the job runner the way the server scheduler does. */
  const drain = async () => {
    for (let i = 0; i < 10; i += 1) await harness.api.jobsRunner.tick();
  };
  return { ...harness, blobs, seed, events, drain };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : 'not-a-problem';
  }
}

describe('comparisons', () => {
  it('computes a pending comparison in the job runner, then serves it from cache', async () => {
    const { api, seed, drain, events } = setup();
    const a = await seed();
    const b = await seed({ frames: climbFrames(3) });
    const pending = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    expect(pending.status).toBe('pending');
    expect(pending.jobId).not.toBeNull();
    expect(pending.a).toMatchObject({ attemptId: a.attemptId, poseTrackId: a.poseTrackId });
    expect(pending.poseModel).toBe('rtmpose-m-body26@1');

    await drain();
    const ready = await api.comparisons.get(pending.id);
    expect(ready.status).toBe('ready');
    expect(ready.jobId).toBeNull();
    expect(ready.steps).toBeGreaterThan(0);
    expect(ready.channels).toHaveLength(11);
    expect(ready.channels.at(-1)).toBe('score');
    expect(ready.perMove.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'comparison.ready' && e.comparisonId === pending.id)).toBe(
      true,
    );
    const job = await api.jobs.get(pending.jobId as string);
    expect(job.steps.map((step) => [step.name, step.status])).toEqual([
      ['load-tracks', 'succeeded'],
      ['align', 'succeeded'],
      ['compare', 'succeeded'],
      ['write-result', 'succeeded'],
    ]);

    const warp = await api.comparisons.warp(ready.id);
    const divergence = await api.comparisons.divergence(ready.id);
    expect(warp).toHaveLength(ready.steps * 2);
    expect(divergence).toHaveLength(ready.steps * ready.channels.length);
    for (let i = 2; i < warp.length; i += 2) {
      expect(warp[i] ?? 0).toBeGreaterThanOrEqual(warp[i - 2] ?? 0);
      expect(warp[i + 1] ?? 0).toBeGreaterThanOrEqual(warp[i - 1] ?? 0);
    }

    const again = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    expect(again.id).toBe(ready.id);
    expect(again.status).toBe('ready');
    expect((await api.jobs.list({ type: 'compare' })).length).toBe(1);
  });

  it('reports zero divergence for the same climb and recovers an injected knee offset', async () => {
    const { api, seed, drain } = setup();
    const base = await seed();
    const twin = await seed();
    const bent = await seed({ frames: closeRightKnee(climbFrames(2), 15) });
    const same = await api.comparisons.create({
      attemptAId: base.attemptId,
      attemptBId: twin.attemptId,
    });
    const offset = await api.comparisons.create({
      attemptAId: base.attemptId,
      attemptBId: bent.attemptId,
    });
    await drain();
    expect((await api.comparisons.get(same.id)).summary).toEqual({
      meanDivergence: 0,
      topDifferences: [],
    });
    const top = (await api.comparisons.get(offset.id)).summary.topDifferences[0];
    expect(top?.joint).toBe('rightKnee');
    expect(top?.metric).toBe('angleDeg');
    expect(Math.abs((top?.meanDelta ?? 0) - 15)).toBeLessThan(1);
    expect(top?.text).toMatch(/^Right knee 15° straighter through move \d+$/);
  });

  it('keeps separate cache entries per options and aligns a fall against a prefix', async () => {
    const { api, seed, drain } = setup();
    const full = climbFrames(1);
    const top = await seed({ frames: full });
    const fall = await seed({
      frames: full.slice(0, Math.floor(full.length * 0.6)),
      outcome: 'fall',
    });
    const collapsed = await api.comparisons.create({
      attemptAId: fall.attemptId,
      attemptBId: top.attemptId,
    });
    const raw = await api.comparisons.create({
      attemptAId: fall.attemptId,
      attemptBId: top.attemptId,
      options: { collapseRests: false },
    });
    expect(raw.id).not.toBe(collapsed.id);
    await drain();
    const result = await api.comparisons.get(collapsed.id);
    expect(result.status).toBe('ready');
    const warp = await api.comparisons.warp(collapsed.id);
    // Open-ended: all of A (the fall) maps onto a prefix of B, so B never reaches its last frame.
    expect(warp.at(-2)).toBe(full[Math.floor(full.length * 0.6) - 1]?.tUs);
    expect(warp.at(-1) ?? 0).toBeLessThan(full[full.length - 1]?.tUs ?? 0);
  });

  it('refuses mismatched pose models, missing HQ tracks, and wall-space mode', async () => {
    const { api, seed } = setup();
    const a = await seed();
    const other = await seed({ model: 'blazepose-full', modelVersion: '2' });
    const noHq = await seed({ hq: false });
    expect(
      await codeOf(
        api.comparisons.create({ attemptAId: a.attemptId, attemptBId: other.attemptId }),
      ),
    ).toBe('POSE_MODEL_MISMATCH');
    expect(
      await codeOf(api.comparisons.create({ attemptAId: a.attemptId, attemptBId: noHq.attemptId })),
    ).toBe('VALIDATION_FAILED');
    expect(
      await codeOf(
        api.comparisons.create({
          attemptAId: a.attemptId,
          attemptBId: other.attemptId,
          options: { spatialMode: 'wall' },
        }),
      ),
    ).toBe('NOT_IMPLEMENTED');
  });

  it('reads as failed when its job fails, and a new request requeues it', async () => {
    const { api, seed, drain, blobs } = setup();
    const a = await seed();
    const b = await seed();
    blobs.files.delete(b.path);
    const first = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    await drain();
    const failed = await api.comparisons.get(first.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('ENOENT');
    expect(await codeOf(api.comparisons.warp(first.id))).toBe('VALIDATION_FAILED');

    const reseed = await seed();
    blobs.files.set(b.path, blobs.files.get(reseed.path) as Uint8Array);
    const retried: Comparison = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    expect(retried.id).toBe(first.id);
    expect(retried.status).toBe('pending');
    expect(retried.jobId).not.toBe(first.jobId);
    await drain();
    expect((await api.comparisons.get(first.id)).status).toBe('ready');
  });

  it('records alignment feedback as a label and a regression case', async () => {
    const { api, seed, drain, memory } = setup();
    const a = await seed();
    const b = await seed({ frames: climbFrames(2) });
    const created = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    expect(
      await codeOf(api.comparisons.feedback(created.id, { moveIndexA: 0, verdict: 'aligned' })),
    ).toBe('VALIDATION_FAILED');
    await drain();
    const ready = await api.comparisons.get(created.id);
    const move = ready.perMove[0]?.moveIndexA ?? 0;
    await api.comparisons.feedback(created.id, { moveIndexA: move, verdict: 'aligned' });
    await api.comparisons.feedback(created.id, {
      moveIndexA: move,
      verdict: 'misaligned',
      note: 'off by one',
    });
    expect(
      await codeOf(api.comparisons.feedback(created.id, { moveIndexA: 99, verdict: 'aligned' })),
    ).toBe('VALIDATION_FAILED');

    const labels = listLabels(memory.db, 'alignment_feedback');
    expect(labels).toHaveLength(2);
    expect(labels[1]?.final).toMatchObject({
      verdict: 'misaligned',
      note: 'off by one',
      moveIndexA: move,
    });
    const cases = alignmentRegressionCases(memory.db);
    expect(cases).toEqual([
      expect.objectContaining({
        comparisonId: created.id,
        attemptAId: a.attemptId,
        poseTrackBId: b.poseTrackId,
        moveIndexA: move,
      }),
    ]);
  });

  it('reports export as blocked on ffmpeg', async () => {
    const { api, seed, drain } = setup();
    const a = await seed();
    const b = await seed();
    const created = await api.comparisons.create({
      attemptAId: a.attemptId,
      attemptBId: b.attemptId,
    });
    await drain();
    expect(await codeOf(api.comparisons.export(created.id, { layout: 'ghost' }))).toBe(
      'FFMPEG_UNAVAILABLE',
    );
    expect(await codeOf(api.comparisons.export(created.id, { layout: 'nope' as 'ghost' }))).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('video pose', () => {
  it('returns the posebin or a time slice of it', async () => {
    const { api, seed } = setup();
    const seeded = await seed();
    const full = readPosebin(await api.videos.pose(seeded.videoId));
    const slice = readPosebin(
      await api.videos.pose(seeded.videoId, { fromUs: 200_000, toUs: 600_000 }),
    );
    expect(slice.header.frameCount).toBeLessThan(full.header.frameCount);
    expect(slice.tUs[0]).toBeGreaterThanOrEqual(200_000);
    expect(await codeOf(api.videos.pose(seeded.videoId, { kind: 'detection' }))).toBe('NOT_FOUND');
    expect(await codeOf(api.videos.pose(seeded.videoId, { fromUs: 9e9, toUs: 9e9 + 1 }))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(api.videos.pose(seeded.videoId, { fromUs: 5, toUs: 1 }))).toBe(
      'VALIDATION_FAILED',
    );
  });
});
