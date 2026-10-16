import type { FastifyInstance } from 'fastify';

import { SettingsPatchSchema, type CoachApi } from '@climbing-coach/api';

export function registerSystemRoutes(app: FastifyInstance, api: CoachApi): void {
  app.get('/api/v1/health', async () => api.system.health());
  app.get('/api/v1/settings', async () => api.system.getSettings());
  app.patch('/api/v1/settings', async (request) =>
    api.system.updateSettings(SettingsPatchSchema.parse(request.body)),
  );
}
