import { defaultHealth, type CoachApi, type HealthResponse } from '@climbing-coach/api';
import { ENGINE_VERSION } from '@climbing-coach/engine';

/**
 * Application services implementing CoachApi (P2-A).
 * Scaffolding stub: health only.
 */
export function createCoreApi(): CoachApi {
  return {
    async health(): Promise<HealthResponse> {
      return defaultHealth({ engineVersion: ENGINE_VERSION });
    },
  };
}
