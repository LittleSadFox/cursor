import { z } from 'zod';

import { SCHEMA_VERSION } from '@climbing-coach/schema';

import { API_VERSION } from './version.js';

export const RuntimeStatusSchema = z.object({
  available: z.boolean(),
  version: z.string().nullable(),
  note: z.string(),
});
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

export const HealthResponseSchema = z.object({
  app: z.string(),
  apiVersion: z.literal(API_VERSION),
  schemaVersion: z.string(),
  engineVersion: z.string(),
  status: z.enum(['ok', 'degraded']),
  ffmpeg: RuntimeStatusSchema,
  pose: RuntimeStatusSchema,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

const UNAVAILABLE: RuntimeStatus = {
  available: false,
  version: null,
  note: 'Not bundled yet.',
};

export function defaultHealth(partial?: Partial<HealthResponse>): HealthResponse {
  return HealthResponseSchema.parse({
    app: 'climbing-coach',
    apiVersion: API_VERSION,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: '0.0.0',
    status: 'ok',
    ffmpeg: UNAVAILABLE,
    pose: UNAVAILABLE,
    ...partial,
  });
}
