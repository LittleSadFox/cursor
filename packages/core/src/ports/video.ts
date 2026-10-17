import type { Us } from '@climbing-coach/schema';

/** Media time range. `endUs` is exclusive of the following frame and inclusive of the last requested instant. */
export type TimeRange = { startUs: Us; endUs: Us };

export type HdrTransfer = 'smpte2084' | 'arib-std-b67';

export type PacketFrame = {
  tUs: Us;
  durationUs: Us;
  keyframe: boolean;
};

/** Packet probe (no decode). BUILD_PLAN `VideoTools.probe`. */
export type ProbeResult = {
  durationUs: Us;
  codec: string;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  fps: number;
  isHdr: boolean;
  isVfr: boolean;
  colorTransfer: string | null;
  hdrTransfer: HdrTransfer | null;
  dolbyVision: string | null;
  hasAudio: boolean;
  frames: PacketFrame[];
};

export type VideoFrame = {
  tUs: Us;
  width: number;
  height: number;
  data: Uint8Array;
  format: 'rgb' | 'gray';
};

export type CutMode = 'lossless' | 'reencode' | 'auto';

export type CutResult = {
  actualRange: TimeRange;
  modeUsed: 'lossless' | 'reencode';
  frameCount: number;
};

export type SpriteTile = { tUs: Us; x: number; y: number; w: number; h: number };

export type SpriteLayout = {
  width: number;
  height: number;
  columns: number;
  rows: number;
  tiles: SpriteTile[];
};

export type FrameWindowOptions = {
  windows: TimeRange[];
  sampleFps: number;
  maxSide: number;
  toSdr: boolean;
  signal?: AbortSignal;
};

export type TaskOpts = { signal?: AbortSignal };

/**
 * Failure from a video tool. Job handlers surface `message`. HTTP import maps `code`
 * through `ProblemError` when the call is still on the request path.
 */
export class VideoToolError extends Error {
  readonly code: 'UNSUPPORTED_MEDIA' | 'FFMPEG_UNAVAILABLE' | 'VALIDATION_FAILED';

  constructor(
    code: 'UNSUPPORTED_MEDIA' | 'FFMPEG_UNAVAILABLE' | 'VALIDATION_FAILED',
    detail: string,
  ) {
    super(detail);
    this.name = 'VideoToolError';
    this.code = code;
  }
}

/** Desktop ffmpeg tools (BUILD_PLAN §4.6). Mobile implements the same shape later. */
export interface VideoTools {
  ready(): boolean;
  probe(path: string): Promise<ProbeResult>;
  quickHash(path: string): Promise<string>;
  fullHash(path: string, signal?: AbortSignal): Promise<string>;
  makeProxy(src: string, dst: string, opts?: TaskOpts): Promise<void>;
  cut(
    src: string,
    dst: string,
    range: TimeRange,
    mode: CutMode,
    opts?: TaskOpts,
  ): Promise<CutResult>;
  thumbnail(src: string, atUs: Us, dst: string, width: number, opts?: TaskOpts): Promise<void>;
  filmstrip(
    src: string,
    range: TimeRange,
    count: number,
    dst: string,
    tileWidth: number,
    opts?: TaskOpts,
  ): Promise<SpriteLayout>;
  loupe(
    src: string,
    centerUs: Us,
    halfWindowUs: Us,
    dst: string,
    tileWidth: number,
    opts?: TaskOpts,
  ): Promise<SpriteLayout>;
  keyframes(
    videoPath: string,
    opts: { maxSide: number; signal?: AbortSignal },
  ): AsyncIterable<VideoFrame>;
  frames(videoPath: string, opts: FrameWindowOptions): AsyncIterable<VideoFrame>;
}
