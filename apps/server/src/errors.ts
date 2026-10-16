import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { ProblemError, type Problem } from '@climbing-coach/api';

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply
    .code(problem.status)
    .header('content-type', 'application/problem+json; charset=utf-8')
    .send(problem);
}

function fastifyStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  const status = (error as { statusCode: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Maps anything thrown by a route to problem+json. Client mistakes Fastify detects itself (bad
 * JSON, oversized body) stay 4xx; everything unexpected is a 500, never a misleading 400.
 */
export function toProblem(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  if (error instanceof ZodError) {
    return new ProblemError(
      'VALIDATION_FAILED',
      'invalid request',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    ).problem;
  }
  const status = fastifyStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    const message = error instanceof Error ? error.message : 'invalid request';
    return { ...new ProblemError('VALIDATION_FAILED', message).problem, status };
  }
  return new ProblemError('INTERNAL', 'internal error').problem;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const problem = toProblem(error);
    if (problem.status >= 500) request.log.error({ err: error }, 'unhandled error');
    sendProblem(reply, problem);
  });
  app.setNotFoundHandler((request, reply) => {
    sendProblem(
      reply,
      new ProblemError('NOT_FOUND', `no route for ${request.method} ${request.url}`).problem,
    );
  });
}
