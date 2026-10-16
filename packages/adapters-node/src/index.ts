/**
 * Node/desktop port implementations (BUILD_PLAN §2).
 * Pose runtime still waits on ADR-001. ffmpeg locator is P0.8; video tools are P1.7.
 */
export const ADAPTERS_NODE_VERSION = '0.0.0';

export {
  bundledFfmpegPrefix,
  locateFfmpeg,
  shippedFfmpegTriple,
  type FfmpegSource,
  type LocateFfmpegOptions,
  type LocatedFfmpeg,
} from './ffmpeg/locate.js';
export { parseFfmpegBanner, readFfmpegBanner, readFfmpegVersion } from './ffmpeg/probe.js';
export { ffmpegStatusFromLocation, probeFfmpegStatus, type FfmpegStatus } from './ffmpeg/status.js';
export {
  FORBIDDEN_FFMPEG_CONFIGURE_FLAGS,
  forbiddenConfigureFlags,
} from './ffmpeg/forbidden-flags.js';

export {
  openSqliteLibrary,
  sqliteExecutor,
  type OpenedLibrary,
  type OpenLibraryOptions,
} from './sqlite.js';
export { backupFileName, pruneBackups, KEEP_BACKUPS } from './backups.js';
export { signMedia, verifyMedia } from './signed-url.js';
export {
  appConfigDir,
  backupsDir,
  defaultLibraryRoot,
  libraryDbPath,
  readLibraryPointer,
  resolveUnderRoot,
  writeLibraryPointer,
} from './paths.js';
export { nodeRandomBytes } from './random.js';
export { libraryBlobs } from './blobs.js';
