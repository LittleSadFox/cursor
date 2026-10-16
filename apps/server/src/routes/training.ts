import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { DateRangeQuerySchema, TrainingLogInputSchema, type CoachApi } from '@climbing-coach/api';

import { dateParam } from './params.js';

const FocusTagInputSchema = z.object({ label: z.string().trim().min(1).max(40) });

export function registerTrainingRoutes(app: FastifyInstance, api: CoachApi): void {
  app.get('/api/v1/training-logs', async (request) =>
    api.trainingLogs.list(DateRangeQuerySchema.parse(request.query)),
  );
  app.get('/api/v1/training-logs/:date', async (request) =>
    api.trainingLogs.get(dateParam(request)),
  );
  app.put('/api/v1/training-logs/:date', async (request) =>
    api.trainingLogs.put(dateParam(request), TrainingLogInputSchema.parse(request.body)),
  );
  app.delete('/api/v1/training-logs/:date', async (request, reply) => {
    await api.trainingLogs.remove(dateParam(request));
    return reply.code(204).send();
  });

  app.get('/api/v1/focus-tags', async () => api.focusTags.list());
  app.post('/api/v1/focus-tags', async (request, reply) =>
    reply.code(201).send(await api.focusTags.create(FocusTagInputSchema.parse(request.body))),
  );
}
