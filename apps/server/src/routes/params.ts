import type { FastifyRequest } from 'fastify';

import { LocalDateSchema, UlidSchema } from '@climbing-coach/schema';

/** Route ids are ULIDs; anything else is a 400 before it reaches a repository. */
export function idParam(request: FastifyRequest, name = 'id'): string {
  return UlidSchema.parse((request.params as Record<string, string | undefined>)[name]);
}

export function dateParam(request: FastifyRequest, name = 'date'): string {
  return LocalDateSchema.parse((request.params as Record<string, string | undefined>)[name]);
}
