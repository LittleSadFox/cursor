/**
 * Node/desktop port implementations (BUILD_PLAN §2).
 * ffmpeg / pose runtime land with ADR-002 / ADR-001 (P0.8 / P0.6).
 */
export const ADAPTERS_NODE_VERSION = '0.0.0';

export type FfmpegStatus = {
  available: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  note: string;
};

/** Placeholder until the LGPL macOS arm64 build from ADR-002 is wired in. */
export function probeFfmpegStatus(): FfmpegStatus {
  return {
    available: false,
    ffmpegPath: null,
    ffprobePath: null,
    note: 'Shipped ffmpeg arrives in P0.8 (ADR-002); not bundled yet.',
  };
}
