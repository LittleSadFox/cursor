import type { FeatureSpec } from '@climbing-coach/schema';

/**
 * First real frame-feature order.
 * Not `1.0.0`: the schema placeholder reserves that for a spec settled on real data.
 */
export const FEATURE_SPEC_VERSION = '0.1.0';

export const FEATURE_SPEC: FeatureSpec = {
  version: FEATURE_SPEC_VERSION,
  features: [
    { name: 'angleLeftElbow', dtype: 'f32', description: 'Left elbow interior angle (rad)' },
    { name: 'angleRightElbow', dtype: 'f32', description: 'Right elbow interior angle (rad)' },
    { name: 'angleLeftShoulder', dtype: 'f32', description: 'Left shoulder interior angle (rad)' },
    {
      name: 'angleRightShoulder',
      dtype: 'f32',
      description: 'Right shoulder interior angle (rad)',
    },
    { name: 'angleLeftHip', dtype: 'f32', description: 'Left hip interior angle (rad)' },
    { name: 'angleRightHip', dtype: 'f32', description: 'Right hip interior angle (rad)' },
    { name: 'angleLeftKnee', dtype: 'f32', description: 'Left knee interior angle (rad)' },
    { name: 'angleRightKnee', dtype: 'f32', description: 'Right knee interior angle (rad)' },
    { name: 'trunkInclination', dtype: 'f32', description: 'Trunk angle from upright (rad)' },
    { name: 'hipHandOffsetX', dtype: 'f32', description: 'Mid-hip minus hand centroid, x / torso' },
    { name: 'hipHandOffsetY', dtype: 'f32', description: 'Mid-hip minus hand centroid, y / torso' },
    { name: 'velLeftWristX', dtype: 'f32', description: 'Left wrist vx in torso lengths/s' },
    { name: 'velLeftWristY', dtype: 'f32', description: 'Left wrist vy in torso lengths/s' },
    { name: 'velRightWristX', dtype: 'f32', description: 'Right wrist vx in torso lengths/s' },
    { name: 'velRightWristY', dtype: 'f32', description: 'Right wrist vy in torso lengths/s' },
    { name: 'velLeftAnkleX', dtype: 'f32', description: 'Left ankle vx in torso lengths/s' },
    { name: 'velLeftAnkleY', dtype: 'f32', description: 'Left ankle vy in torso lengths/s' },
    { name: 'velRightAnkleX', dtype: 'f32', description: 'Right ankle vx in torso lengths/s' },
    { name: 'velRightAnkleY', dtype: 'f32', description: 'Right ankle vy in torso lengths/s' },
    { name: 'velHipX', dtype: 'f32', description: 'Mid-hip vx in torso lengths/s' },
    { name: 'velHipY', dtype: 'f32', description: 'Mid-hip vy in torso lengths/s' },
  ],
};

export const FEATURE_NAMES = FEATURE_SPEC.features.map((field) => field.name);
