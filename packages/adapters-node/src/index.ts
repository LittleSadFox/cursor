/**
 * Node/desktop port implementations (BUILD_PLAN §2).
 * Pose runtime is P1.8 / ADR-001 (`pose/`). Video tools are P1.7 (`video/`).
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
  IPHONE_AUDIO_MAP,
  IPHONE_VIDEO_MAP,
  ffmpegMappedOutputArgs,
  hdrTransferFromProbe,
  isIphoneMediaName,
  tonemapFilter,
  type HdrTransfer,
} from './ffmpeg/iphone.js';

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
export { createNodeVideoTools, assertSafeOutputArgs } from './video/tools.js';
export { libraryMediaFiles } from './media-files.js';
export { nodeRandomBytes } from './random.js';
export { libraryBlobs } from './blobs.js';

export { createNodePoseExtractor } from './pose/extractor.js';
export { locatePoseModels, loadBundledManifest, DETECTOR_ID, POSE_ID } from './pose/models.js';
export { probePoseStatus, type PoseStatus } from './pose/status.js';
