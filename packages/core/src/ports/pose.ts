import type { PoseTrack, Us } from '@climbing-coach/schema';

import type { VideoFrame } from './video.js';

/** Runtime identity reported by `/health` and written into posebin headers. */
export type PoseRuntimeInfo = {
  runtime: string;
  model: string;
  modelVersion: string;
  /** Detector + pose keypoint set, e.g. `halpe26`. */
  keypointSet: string;
  executionProvider: 'coreml' | 'cpu';
  inputSize: { width: number; height: number };
};

export type PoseProgress = {
  framesDone: number;
  framesTotal: number | null;
  processedUntilUs: Us | null;
};

export type PoseExtractOptions = {
  videoId: string;
  kind: 'detection' | 'hq';
  sampleFps: number;
  displayWidth: number;
  displayHeight: number;
  rotation: 0 | 90 | 180 | 270;
  /** Active windows; empty means the whole clip. */
  windows: readonly { startUs: Us; endUs: Us }[];
  maxPersons?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PoseProgress) => void;
  /** New ULID for each person track; first call is the selected climber. */
  nextTrackId: () => string;
};

export type PoseExtractSummary = {
  track: PoseTrack;
  framesProcessed: number;
  persons: number;
};

/**
 * Pose extractor port (BUILD_PLAN §4.6). Adapters implement ONNX Runtime per ADR-001.
 * Core never imports the runtime package.
 */
export interface PoseExtractor {
  info(): PoseRuntimeInfo;
  ready(): boolean;
  extract(
    frames: AsyncIterable<VideoFrame>,
    options: PoseExtractOptions,
  ): Promise<PoseExtractSummary>;
}
