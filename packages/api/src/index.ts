import { z } from 'zod';

import { SCHEMA_VERSION } from '@climbing-coach/schema';

/** API path version. Additive changes only within v1. */
export const API_VERSION = 'v1' as const;

export const HealthResponseSchema = z.object({
  app: z.string(),
  apiVersion: z.literal(API_VERSION),
  schemaVersion: z.string(),
  engineVersion: z.string(),
  status: z.enum(['ok', 'degraded']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function defaultHealth(partial?: Partial<HealthResponse>): HealthResponse {
  return HealthResponseSchema.parse({
    app: 'climbing-coach',
    apiVersion: API_VERSION,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: '0.0.0',
    status: 'ok',
    ...partial,
  });
}

/** Public CoachApi surface will grow in P2-A; placeholder for scaffolding. */
export type CoachApi = {
  health(): Promise<HealthResponse>;
};
