import type { FastifyInstance } from 'fastify';

import {
  BoulderInputSchema,
  BoulderListQuerySchema,
  BoulderPatchSchema,
  DateRangeQuerySchema,
  FocusDistributionQuerySchema,
  GradePyramidQuerySchema,
  GymInputSchema,
  GymListQuerySchema,
  GymPatchSchema,
  JobQuerySchema,
  ProblemError,
  SessionInputSchema,
  SessionListQuerySchema,
  SessionPatchSchema,
  SettingsPatchSchema,
  TrainingLoadQuerySchema,
  TrainingLogInputSchema,
  TrashKindSchema,
  type CoachApi,
} from '@climbing-coach/api';
import { LocalDateSchema } from '@climbing-coach/schema';
import { verifyMedia, resolveUnderRoot } from '@climbing-coach/adapters-node';
import type { EventBus } from '@climbing-coach/core';
import { z } from 'zod';

function q<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function registerRoutes(
  app: FastifyInstance,
  api: CoachApi,
  opts: { mediaSecret: string; libraryRoot: string | null; events: EventBus },
): void {
  app.get('/api/v1/health', async () => api.system.health());

  app.get('/api/v1/settings', async () => api.system.getSettings());
  app.patch('/api/v1/settings', async (request) =>
    api.system.updateSettings(SettingsPatchSchema.parse(request.body)),
  );

  app.get('/api/v1/gyms', async (request) => api.gyms.list(q(GymListQuerySchema, request.query)));
  app.post('/api/v1/gyms', async (request, reply) =>
    reply.code(201).send(await api.gyms.create(GymInputSchema.parse(request.body))),
  );
  app.get('/api/v1/gyms/:id', async (request) => api.gyms.get((request.params as { id: string }).id));
  app.patch('/api/v1/gyms/:id', async (request) =>
    api.gyms.update((request.params as { id: string }).id, GymPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/gyms/:id', async (request, reply) => {
    await api.gyms.remove((request.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get('/api/v1/boulders', async (request) => api.boulders.list(q(BoulderListQuerySchema, request.query)));
  app.post('/api/v1/boulders', async (request, reply) =>
    reply.code(201).send(await api.boulders.create(BoulderInputSchema.parse(request.body))),
  );
  app.get('/api/v1/boulders/:id', async (request) => api.boulders.get((request.params as { id: string }).id));
  app.patch('/api/v1/boulders/:id', async (request) =>
    api.boulders.update((request.params as { id: string }).id, BoulderPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/boulders/:id', async (request, reply) => {
    await api.boulders.remove((request.params as { id: string }).id);
    return reply.code(204).send();
  });
  app.get('/api/v1/boulders/:id/progress', async (request) =>
    api.boulders.progress((request.params as { id: string }).id),
  );

  app.get('/api/v1/sessions', async (request) => api.sessions.list(q(SessionListQuerySchema, request.query)));
  app.post('/api/v1/sessions', async (request, reply) =>
    reply.code(201).send(await api.sessions.create(SessionInputSchema.parse(request.body))),
  );
  app.get('/api/v1/sessions/:id', async (request) => api.sessions.get((request.params as { id: string }).id));
  app.patch('/api/v1/sessions/:id', async (request) =>
    api.sessions.update((request.params as { id: string }).id, SessionPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/sessions/:id', async (request, reply) => {
    await api.sessions.remove((request.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get('/api/v1/training-logs', async (request) => {
    const range = DateRangeQuerySchema.parse(request.query);
    return api.trainingLogs.list(range);
  });
  app.get('/api/v1/training-logs/:date', async (request) => {
    const date = LocalDateSchema.parse((request.params as { date: string }).date);
    return api.trainingLogs.get(date);
  });
  app.put('/api/v1/training-logs/:date', async (request) => {
    const date = LocalDateSchema.parse((request.params as { date: string }).date);
    return api.trainingLogs.put(date, TrainingLogInputSchema.parse(request.body));
  });
  app.delete('/api/v1/training-logs/:date', async (request, reply) => {
    const date = LocalDateSchema.parse((request.params as { date: string }).date);
    await api.trainingLogs.remove(date);
    return reply.code(204).send();
  });

  app.get('/api/v1/focus-tags', async () => api.focusTags.list());
  app.post('/api/v1/focus-tags', async (request, reply) => {
    const body = z.object({ label: z.string().min(1) }).parse(request.body);
    return reply.code(201).send(await api.focusTags.create(body));
  });

  app.get('/api/v1/stats/training-load', async (request) => {
    const query = TrainingLoadQuerySchema.parse(request.query);
    return api.stats.trainingLoad({ from: query.from, to: query.to }, query.method);
  });
  app.get('/api/v1/stats/exertion-volume', async (request) => {
    const range = DateRangeQuerySchema.parse(request.query);
    return api.stats.exertionVolume(range);
  });
  app.get('/api/v1/stats/focus-distribution', async (request) => {
    const query = FocusDistributionQuerySchema.parse(request.query);
    return api.stats.focusDistribution({ from: query.from, to: query.to }, query.bucket);
  });
  app.get('/api/v1/stats/grade-pyramid', async (request) => {
    const query = GradePyramidQuerySchema.parse(request.query);
    return api.stats.gradePyramid({ from: query.from, to: query.to }, query.discipline);
  });
  app.get('/api/v1/stats/weekly-summary', async (request) => {
    const week = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/) }).parse(request.query).week;
    return api.stats.weeklySummary(week);
  });

  app.get('/api/v1/trash', async () => api.trash.list());
  app.post('/api/v1/trash/:kind/:id/restore', async (request) => {
    const params = request.params as { kind: string; id: string };
    await api.trash.restore(TrashKindSchema.parse(params.kind), params.id);
    return { ok: true };
  });
  app.delete('/api/v1/trash/:kind/:id', async (request, reply) => {
    const params = request.params as { kind: string; id: string };
    await api.trash.purge(TrashKindSchema.parse(params.kind), params.id);
    return reply.code(204).send();
  });

  app.get('/api/v1/jobs', async (request) => api.jobs.list(q(JobQuerySchema, request.query)));
  app.get('/api/v1/jobs/:id', async (request) => api.jobs.get((request.params as { id: string }).id));
  app.post('/api/v1/jobs/:id/cancel', async (request) => {
    await api.jobs.cancel((request.params as { id: string }).id);
    return { ok: true };
  });
  app.post('/api/v1/jobs/:id/retry', async (request) => api.jobs.retry((request.params as { id: string }).id));

  app.get('/api/v1/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const lastId = request.headers['last-event-id'];
    const resumeId = Array.isArray(lastId) ? lastId[0] : lastId;
    const replay = resumeId ? opts.events.resumeFrom(resumeId) : [];
    for (const event of replay) {
      const id = 'id' in event && typeof event.id === 'string' ? event.id : undefined;
      reply.raw.write(`${id ? `id: ${id}\n` : ''}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    const unsubscribe = opts.events.subscribe((event) => {
      const id = 'id' in event && typeof event.id === 'string' ? event.id : undefined;
      reply.raw.write(`${id ? `id: ${id}\n` : ''}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    request.raw.on('close', () => {
      unsubscribe();
    });
  });

  app.get('/api/v1/media/videos/:videoId', async (request) => {
    const params = request.params as { videoId: string };
    const query = z.object({ variant: z.enum(['original', 'proxy']).default('proxy'), sig: z.string() }).parse(
      request.query,
    );
    if (!verifyMedia(opts.mediaSecret, params.videoId, query.variant, query.sig)) {
      throw new ProblemError('INVALID_SIGNATURE', 'stale or invalid media signature');
    }
    if (!opts.libraryRoot) throw new ProblemError('NOT_FOUND', 'library is not configured');
    const relative = `${query.variant === 'proxy' ? 'proxies' : 'originals'}/${params.videoId}`;
    const resolved = resolveUnderRoot(opts.libraryRoot, relative);
    if (!resolved) throw new ProblemError('NOT_FOUND', 'invalid media path');
    throw new ProblemError('FFMPEG_UNAVAILABLE', 'media files arrive with the ingest pipeline (P2-B)');
  });
}
