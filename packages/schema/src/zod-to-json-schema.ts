import type { z } from 'zod';
import { zodToJsonSchema as convert } from 'zod-to-json-schema';

/**
 * Thin wrapper so research/Python can consume the same Zod schemas as JSON Schema.
 * Kept inside schema so the dependency stays with the contract package.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny, name: string): Record<string, unknown> {
  return convert(schema, {
    name,
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
}
