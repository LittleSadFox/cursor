import type { FastifyInstance } from 'fastify';

import {
  BoulderInputSchema,
  BoulderListQuerySchema,
  BoulderPatchSchema,
  GymInputSchema,
  GymListQuerySchema,
  GymPatchSchema,
  SessionInputSchema,
  SessionListQuerySchema,
  SessionPatchSchema,
  type CoachApi,
} from '@climbing-coach/api';

import { idParam } from './params.js';

export function registerCatalogRoutes(app: FastifyInstance, api: CoachApi): void {
  app.get('/api/v1/gyms', async (request) =>
    api.gyms.list(GymListQuerySchema.parse(request.query)),
  );
  app.post('/api/v1/gyms', async (request, reply) =>
    reply.code(201).send(await api.gyms.create(GymInputSchema.parse(request.body))),
  );
  app.get('/api/v1/gyms/:id', async (request) => api.gyms.get(idParam(request)));
  app.patch('/api/v1/gyms/:id', async (request) =>
    api.gyms.update(idParam(request), GymPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/gyms/:id', async (request, reply) => {
    await api.gyms.remove(idParam(request));
    return reply.code(204).send();
  });

  app.get('/api/v1/boulders', async (request) =>
    api.boulders.list(BoulderListQuerySchema.parse(request.query)),
  );
  app.post('/api/v1/boulders', async (request, reply) =>
    reply.code(201).send(await api.boulders.create(BoulderInputSchema.parse(request.body))),
  );
  app.get('/api/v1/boulders/:id', async (request) => api.boulders.get(idParam(request)));
  app.patch('/api/v1/boulders/:id', async (request) =>
    api.boulders.update(idParam(request), BoulderPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/boulders/:id', async (request, reply) => {
    await api.boulders.remove(idParam(request));
    return reply.code(204).send();
  });
  app.get('/api/v1/boulders/:id/progress', async (request) =>
    api.boulders.progress(idParam(request)),
  );

  app.get('/api/v1/sessions', async (request) =>
    api.sessions.list(SessionListQuerySchema.parse(request.query)),
  );
  app.post('/api/v1/sessions', async (request, reply) =>
    reply.code(201).send(await api.sessions.create(SessionInputSchema.parse(request.body))),
  );
  app.get('/api/v1/sessions/:id', async (request) => api.sessions.get(idParam(request)));
  app.patch('/api/v1/sessions/:id', async (request) =>
    api.sessions.update(idParam(request), SessionPatchSchema.parse(request.body)),
  );
  app.delete('/api/v1/sessions/:id', async (request, reply) => {
    await api.sessions.remove(idParam(request));
    return reply.code(204).send();
  });
}
