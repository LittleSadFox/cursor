import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ProblemError } from '@climbing-coach/api';

import { sendProblem } from './errors.js';

export type SecurityOptions = {
  token: string;
  allowedOrigins: readonly string[];
};

/** `<video>` and `<img>` cannot send headers; these routes authenticate with a signed URL instead. */
export const SIGNED_URL_PREFIX = '/api/v1/media/';

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost']);

export const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Last-Event-ID, X-Filename',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
} as const;

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * `Host` must name loopback and, once the server knows its port, that exact port. A rebinding
 * page reaches us with its own hostname, so it fails here even before the token check.
 */
export function isAllowedHost(host: string | undefined, localPort: number | undefined): boolean {
  if (!host) return false;
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host.toLowerCase());
  if (!match) return false;
  const [, name, port] = match;
  if (name === undefined || !LOOPBACK_NAMES.has(name)) return false;
  return localPort === undefined || port === undefined || Number(port) === localPort;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time over the hashed values, so neither content nor length leaks through timing. */
export function bearerMatches(authorization: string | undefined, token: string): boolean {
  const presented = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  return timingSafeEqual(digest(presented), digest(token)) && presented.length > 0;
}

export function corsHeadersFor(
  origin: string | undefined,
  allowed: readonly string[],
): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin', ...CORS_HEADERS };
}

function reject(reply: FastifyReply, error: ProblemError): FastifyReply {
  return sendProblem(reply, error.problem);
}

export function registerSecurity(app: FastifyInstance, options: SecurityOptions): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const host = header(request, 'host');
    if (!isAllowedHost(host, request.raw.socket.localPort)) {
      return reject(
        reply,
        new ProblemError('FORBIDDEN_ORIGIN', `host ${host ?? '<missing>'} is not allowed`),
      );
    }

    const origin = header(request, 'origin');
    if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
      return reject(reply, new ProblemError('FORBIDDEN_ORIGIN', `origin ${origin} is not allowed`));
    }
    reply.headers(corsHeadersFor(origin, options.allowedOrigins));

    if (request.method === 'OPTIONS' || request.url.startsWith(SIGNED_URL_PREFIX)) return;

    if (!bearerMatches(header(request, 'authorization'), options.token)) {
      return reject(reply, new ProblemError('UNAUTHORIZED', 'missing or invalid bearer token'));
    }
  });

  app.options('/*', async (_request, reply) => reply.code(204).send());
}
