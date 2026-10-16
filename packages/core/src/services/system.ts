import { defaultHealth, ProblemError, type CoachApi, type Settings } from '@climbing-coach/api';
import { ENGINE_VERSION } from '@climbing-coach/engine';

import { readSettings, writeSettings, type StoredSettings } from '../db/repos/settings.js';
import { isSyncFolder } from '../library/sync-folder.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';

export type SystemDeps = {
  db: AppDatabase;
  clock: Clock;
  ffmpegAvailable: boolean;
  ffmpegVersion?: string | null;
  ffmpegNote?: string;
  poseAvailable: boolean;
  /** Persists the library location outside the library itself; takes effect on next launch. */
  onLibraryRootChange?: ((root: string | null) => void) | undefined;
};

function toSettings(stored: StoredSettings): Settings {
  return { ...stored, libraryReady: stored.libraryRoot !== null };
}

function healthNote(available: boolean, ready: string, missing: string): string {
  return available ? ready : missing;
}

export function createSystemService(deps: SystemDeps): CoachApi['system'] {
  return {
    async health() {
      return defaultHealth({
        engineVersion: ENGINE_VERSION,
        status: deps.ffmpegAvailable && deps.poseAvailable ? 'ok' : 'degraded',
        ffmpeg: {
          available: deps.ffmpegAvailable,
          version: deps.ffmpegVersion ?? null,
          note:
            deps.ffmpegNote ??
            healthNote(
              deps.ffmpegAvailable,
              'ffmpeg ready',
              'Shipped LGPL ffmpeg is not on this machine (P0.8 locator / ADR-002).',
            ),
        },
        pose: {
          available: deps.poseAvailable,
          version: null,
          note: healthNote(
            deps.poseAvailable,
            'pose runtime ready',
            'Pose adapter arrives with ADR-001; not bundled yet.',
          ),
        },
      });
    },
    async getSettings() {
      return toSettings(readSettings(deps.db));
    },
    async updateSettings(patch) {
      // v1 is macOS-only: a library path is POSIX and absolute (no `~`, nothing CWD-relative).
      if (patch.libraryRoot && !patch.libraryRoot.startsWith('/')) {
        throw new ProblemError('VALIDATION_FAILED', 'Library folder must be an absolute path.');
      }
      if (patch.libraryRoot && isSyncFolder(patch.libraryRoot)) {
        throw new ProblemError(
          'VALIDATION_FAILED',
          'Library folder cannot live inside iCloud Drive, Dropbox, or another sync folder. Use a local folder (default: Movies/Climbing Coach Library) and move data with bundles.',
        );
      }
      const before = readSettings(deps.db).libraryRoot;
      const saved = writeSettings(deps.db, deps.clock, patch);
      if (patch.libraryRoot !== undefined && saved.libraryRoot !== before) {
        deps.onLibraryRootChange?.(saved.libraryRoot);
      }
      return toSettings(saved);
    },
  };
}
