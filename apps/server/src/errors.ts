import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { ProblemError, type Problem } from '@climbing-coach/api';

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply
    .code(problem.status)
    .header('content-type', 'application/problem+json; charset=utf-8')
    .send(problem);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ProblemError) {
      sendProblem(reply, error.problem);
      return;
    }
    if (error instanceof ZodError) {
      sendProblem(
        reply,
        new ProblemError(
          'VALIDATION_FAILED',
          'invalid request',
          error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        ).problem,
      );
      return;
    }
    app.log.error({ err: error }, 'unhandled');
    sendProblem(reply, new ProblemError('VALIDATION_FAILED', 'internal error').problem);
  });
}
