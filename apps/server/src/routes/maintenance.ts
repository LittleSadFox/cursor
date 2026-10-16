import type { FastifyInstance } from 'fastify';

import { JobQuerySchema, TrashRestoreSchema, type CoachApi } from '@climbing-coach/api';

import { idParam } from './params.js';

export function registerMaintenanceRoutes(app: FastifyInstance, api: CoachApi): void {
  app.get('/api/v1/trash', async () => api.trash.list());
  app.post('/api/v1/trash/:kind/:id/restore', async (request) => {
    const { kind, id } = TrashRestoreSchema.parse(request.params);
    await api.trash.restore(kind, id);
    return { ok: true };
  });
  app.delete('/api/v1/trash/:kind/:id', async (request, reply) => {
    const { kind, id } = TrashRestoreSchema.parse(request.params);
    await api.trash.purge(kind, id);
    return reply.code(204).send();
  });

  app.get('/api/v1/jobs', async (request) => api.jobs.list(JobQuerySchema.parse(request.query)));
  app.get('/api/v1/jobs/:id', async (request) => api.jobs.get(idParam(request)));
  app.post('/api/v1/jobs/:id/cancel', async (request) => {
    await api.jobs.cancel(idParam(request));
    return { ok: true };
  });
  app.post('/api/v1/jobs/:id/retry', async (request) => api.jobs.retry(idParam(request)));
}
