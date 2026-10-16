import { z } from 'zod';

/** Versioned feature names and order for ML export (BUILD_PLAN §3.4). */
export const FeatureDtypeSchema = z.enum(['f32', 'f64', 'i32', 'bool']);
export type FeatureDtype = z.infer<typeof FeatureDtypeSchema>;

export const FeatureFieldSchema = z.object({
  name: z.string().min(1),
  dtype: FeatureDtypeSchema,
  description: z.string().min(1).optional(),
});
export type FeatureField = z.infer<typeof FeatureFieldSchema>;

export const FeatureSpecSchema = z.object({
  version: z.string().min(1),
  features: z.array(FeatureFieldSchema),
});
export type FeatureSpec = z.infer<typeof FeatureSpecSchema>;

/**
 * Placeholder frame-level feature order until `engine/features` lands in P1.
 * Version is intentionally not `1.0.0` so the real spec can take that number.
 */
export const FEATURE_SPEC_PLACEHOLDER: FeatureSpec = {
  version: '0.0.0-placeholder',
  features: [
    { name: 'ankleLiftBodyHeights', dtype: 'f32', description: 'Min ankle height above floor / body height' },
    { name: 'hipVerticalSpeedBodyHeights', dtype: 'f32', description: 'Hip vy normalized by body height' },
    { name: 'wristsAboveShoulders', dtype: 'bool', description: 'Both wrists above shoulders' },
    { name: 'onWallScore', dtype: 'f32', description: 'Heuristic on-wall score in [0,1]' },
  ],
};

export function parseFeatureSpec(text: string): FeatureSpec {
  return FeatureSpecSchema.parse(JSON.parse(text));
}

export function stringifyFeatureSpec(spec: FeatureSpec): string {
  return `${JSON.stringify(FeatureSpecSchema.parse(spec), null, 2)}\n`;
}
