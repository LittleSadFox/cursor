import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ProblemError } from '@climbing-coach/api';

import { sendProblem } from './errors.js';

export type SecurityOptions = {
  token: string;
  allowedOrigins: readonly string[];
  allowedHosts: readonly string[];
};

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isLoopbackHost(host: string, allowed: readonly string[]): boolean {
  if (allowed.includes(host)) return true;
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function registerSecurity(app: FastifyInstance, options: SecurityOptions): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const host = header(request, 'host');
    if (!host || !isLoopbackHost(host, options.allowedHosts)) {
      sendProblem(reply, new ProblemError('FORBIDDEN_ORIGIN', `host ${host ?? '<missing>'} is not allowed`).problem);
      return reply;
    }

    const origin = header(request, 'origin');
    if (origin !== undefined) {
      if (origin === 'null' || !options.allowedOrigins.includes(origin)) {
        sendProblem(reply, new ProblemError('FORBIDDEN_ORIGIN', `origin ${origin} is not allowed`).problem);
        return reply;
      }
    }

    if (request.method === 'OPTIONS') return;

    const auth = header(request, 'authorization');
    if (auth !== `Bearer ${options.token}`) {
      sendProblem(reply, new ProblemError('UNAUTHORIZED', 'missing or invalid bearer token').problem);
      return reply;
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = header(request, 'origin');
    if (origin && options.allowedOrigins.includes(origin) && !reply.sent) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-headers', 'Authorization, Content-Type, Last-Event-ID');
      reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
  });

  app.options('/*', async (_request, reply) => reply.code(204).send());
}
