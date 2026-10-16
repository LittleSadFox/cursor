import Fastify, { type FastifyInstance } from 'fastify';

import type { CoachApi } from '@climbing-coach/api';
import type { EventBus } from '@climbing-coach/core';

import { registerErrorHandler } from './errors.js';
import { registerRoutes } from './routes/index.js';
import { type MediaOptions } from './routes/media.js';
import { registerSecurity } from './security.js';
import { registerEvents } from './sse.js';

export type CreateAppOptions = {
  api: CoachApi;
  events: EventBus;
  token: string;
  allowedOrigins: readonly string[];
  mediaSecret: string;
  libraryRoot: string | null;
  resolveMedia?: MediaOptions['resolveMedia'];
  logger?: boolean;
  heartbeatMs?: number;
};

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  registerErrorHandler(app);
  registerSecurity(app, { token: options.token, allowedOrigins: options.allowedOrigins });
  registerRoutes(app, options.api, {
    mediaSecret: options.mediaSecret,
    resolveMedia: options.resolveMedia,
  });
  registerEvents(app, {
    events: options.events,
    allowedOrigins: options.allowedOrigins,
    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
  });
  await app.ready();
  return app;
}
