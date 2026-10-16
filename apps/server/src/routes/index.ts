import type { FastifyInstance } from 'fastify';

import type { CoachApi } from '@climbing-coach/api';

import { registerCatalogRoutes } from './catalog.js';
import { registerComparisonRoutes } from './comparisons.js';
import { registerMaintenanceRoutes } from './maintenance.js';
import { registerMediaRoutes, type MediaOptions } from './media.js';
import { registerRecordingRoutes } from './recordings.js';
import { registerStatsRoutes } from './stats.js';
import { registerSystemRoutes } from './system.js';
import { registerTrainingRoutes } from './training.js';

export function registerRoutes(app: FastifyInstance, api: CoachApi, media: MediaOptions): void {
  registerSystemRoutes(app, api);
  registerCatalogRoutes(app, api);
  registerTrainingRoutes(app, api);
  registerStatsRoutes(app, api);
  registerMaintenanceRoutes(app, api);
  registerComparisonRoutes(app, api);
  registerRecordingRoutes(app, api);
  registerMediaRoutes(app, media);
}
