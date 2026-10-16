import type { FastifyInstance } from 'fastify';

import type { CoachEvent } from '@climbing-coach/api';
import type { EventBus } from '@climbing-coach/core';

import { corsHeadersFor } from './security.js';

export const HEARTBEAT_MS = 15_000;

export function formatSseEvent(event: CoachEvent): string {
  const id = typeof event.id === 'string' ? `id: ${event.id}\n` : '';
  return `${id}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export type SseOptions = {
  events: EventBus;
  allowedOrigins: readonly string[];
  heartbeatMs?: number;
};

/**
 * fetch-based SSE (BUILD_PLAN §4.4). The reply is hijacked, so CORS headers set by the security
 * hook never reach the socket and are written here. A comment line keeps idle proxies and the
 * client's reconnect timer from dropping the stream.
 */
export function registerEvents(app: FastifyInstance, options: SseOptions): void {
  app.get('/api/v1/events', async (request, reply) => {
    const origin = request.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      ...corsHeadersFor(origin, options.allowedOrigins),
    });
    const lastId = request.headers['last-event-id'];
    const resumeId = Array.isArray(lastId) ? lastId[0] : lastId;
    for (const event of resumeId ? options.events.resumeFrom(resumeId) : []) {
      reply.raw.write(formatSseEvent(event));
    }
    const unsubscribe = options.events.subscribe((event) => reply.raw.write(formatSseEvent(event)));
    const heartbeat = setInterval(
      () => reply.raw.write(': ping\n\n'),
      options.heartbeatMs ?? HEARTBEAT_MS,
    );
    heartbeat.unref();
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
