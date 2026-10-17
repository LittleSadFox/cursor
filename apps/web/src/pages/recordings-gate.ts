import type { HealthResponse } from '@climbing-coach/api';

/**
 * Import/probe/proxy/cut need a shipping or env ffmpeg only.
 * Health stays `degraded` until pose ships — that must not hide Recordings.
 */
export function recordingsImportReady(
  health: Pick<HealthResponse, 'ffmpeg' | 'pose' | 'status'>,
): boolean {
  return health.ffmpeg.available;
}
