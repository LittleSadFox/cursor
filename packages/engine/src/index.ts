/**
 * Pure analysis algorithms (PLAN 2.1–2.9, 2.11).
 * Detection / pose / align land in Phase 1; eval metrics start in P0.7.
 */
export const ENGINE_VERSION = '0.0.1';

export { createMulberry32, type Rng } from './eval/rng.js';
export { wilsonInterval, type ProportionInterval } from './eval/wilson.js';
export { bootstrapMedianCi, type MedianInterval } from './eval/bootstrap.js';
export {
  matchClimbRanges,
  scoreDetection,
  type ClimbRange,
  type BoundaryMatch,
  type DetectionScore,
} from './eval/detection.js';
