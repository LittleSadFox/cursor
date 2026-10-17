import type { HealthResponse } from '@climbing-coach/api';

export type HealthQuerySlice = {
  isLoading: boolean;
  isError: boolean;
  data?: Pick<HealthResponse, 'ffmpeg' | 'pose' | 'status'> | undefined;
};

export type RecordingsGate = 'loading' | 'api-down' | 'ffmpeg-missing' | 'ready';

/**
 * Import/probe/proxy/cut need a shipping or env ffmpeg only.
 * Health stays `degraded` until pose ships — that must not hide Recordings.
 * A failed or unreachable /health call is api-down, never a blank page.
 */
export function recordingsGate(query: HealthQuerySlice): RecordingsGate {
  if (query.isLoading) return 'loading';
  if (query.isError || !query.data) return 'api-down';
  if (query.data.ffmpeg?.available === true) return 'ready';
  return 'ffmpeg-missing';
}

/**
 * Import/probe/proxy/cut need a shipping or env ffmpeg only.
 * Health stays `degraded` until pose ships — that must not hide Recordings.
 */
export function recordingsImportReady(
  health: Pick<HealthResponse, 'ffmpeg' | 'pose' | 'status'> | null | undefined,
): boolean {
  return health?.ffmpeg?.available === true;
}
