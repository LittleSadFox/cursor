import { midHip, torsoLength } from './access.js';
import type { PoseSample } from './types.js';

/**
 * Comparison frame: origin at mid-hip, scale by torso length.
 * Detection stays in display space. No left/right mirror.
 */
export function normalize(sample: PoseSample): PoseSample {
  const hip = midHip(sample);
  const torso = torsoLength(sample);
  const scale = torso > 1e-6 ? torso : 1;
  return {
    tUs: sample.tUs,
    landmarks: sample.landmarks.map((point) => ({
      x: (point.x - hip.x) / scale,
      y: (point.y - hip.y) / scale,
      z: (point.z - hip.z) / scale,
      visibility: point.visibility,
    })),
  };
}
