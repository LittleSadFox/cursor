import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  DateRangeQuerySchema,
  FocusDistributionQuerySchema,
  GradePyramidQuerySchema,
  TrainingLoadQuerySchema,
  type CoachApi,
} from '@climbing-coach/api';

const WeekQuerySchema = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/) });

export function registerStatsRoutes(app: FastifyInstance, api: CoachApi): void {
  app.get('/api/v1/stats/training-load', async (request) => {
    const query = TrainingLoadQuerySchema.parse(request.query);
    return api.stats.trainingLoad({ from: query.from, to: query.to }, query.method);
  });
  app.get('/api/v1/stats/exertion-volume', async (request) =>
    api.stats.exertionVolume(DateRangeQuerySchema.parse(request.query)),
  );
  app.get('/api/v1/stats/focus-distribution', async (request) => {
    const query = FocusDistributionQuerySchema.parse(request.query);
    return api.stats.focusDistribution({ from: query.from, to: query.to }, query.bucket);
  });
  app.get('/api/v1/stats/grade-pyramid', async (request) => {
    const query = GradePyramidQuerySchema.parse(request.query);
    return api.stats.gradePyramid({ from: query.from, to: query.to }, query.discipline);
  });
  app.get('/api/v1/stats/weekly-summary', async (request) =>
    api.stats.weeklySummary(WeekQuerySchema.parse(request.query).week),
  );
}
