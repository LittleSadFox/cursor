import Fastify, { type FastifyInstance } from 'fastify';

import type { CoachApi } from '@climbing-coach/api';
import type { EventBus } from '@climbing-coach/core';

import { registerErrorHandler } from './errors.js';
import { registerRoutes } from './routes.js';
import { registerSecurity } from './security.js';

export type CreateAppOptions = {
  api: CoachApi;
  events: EventBus;
  token: string;
  allowedOrigins: readonly string[];
  mediaSecret: string;
  libraryRoot: string | null;
  logger?: boolean;
};

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  registerErrorHandler(app);
  registerSecurity(app, {
    token: options.token,
    allowedOrigins: options.allowedOrigins,
    allowedHosts: ['127.0.0.1', 'localhost'],
  });
  registerRoutes(app, options.api, {
    mediaSecret: options.mediaSecret,
    libraryRoot: options.libraryRoot,
    events: options.events,
  });
  await app.ready();
  return app;
}

export const DEV_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173', 'app://-'] as const;
