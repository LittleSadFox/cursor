import { randomBytes } from 'node:crypto';

import { API_VERSION } from '@climbing-coach/api';
import {
  appConfigDir,
  backupsDir,
  createNodePoseExtractor,
  createNodeVideoTools,
  defaultLibraryRoot,
  libraryBlobs,
  libraryDbPath,
  libraryMediaFiles,
  nodeRandomBytes,
  openSqliteLibrary,
  probeFfmpegStatus,
  probePoseStatus,
  readLibraryPointer,
  signMedia,
  writeLibraryPointer,
} from '@climbing-coach/adapters-node';
import {
  createCoreApi,
  createEventBus,
  createIdGen,
  systemClock,
  type Logger,
} from '@climbing-coach/core';

import { launchConfig, resolveLibraryRoot } from './config.js';
import { createApp } from './create-app.js';
import { thumbVariant } from './routes/media.js';
import { startScheduler } from './scheduler.js';

const consoleLogger: Logger = {
  info: (fields, message) => console.log(JSON.stringify({ level: 'info', message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: 'warn', message, ...fields })),
  error: (fields, message) => console.error(JSON.stringify({ level: 'error', message, ...fields })),
};

function failLoud(label: string, err: unknown): never {
  console.error(`[climbing-coach] ${label}`);
  console.error(err);
  process.exit(1);
}

process.on('uncaughtException', (err) => failLoud('uncaughtException', err));
process.on('unhandledRejection', (err) => failLoud('unhandledRejection', err));

async function main(): Promise<void> {
  console.error(
    `[climbing-coach] starting (COACH_DEV=${process.env.COACH_DEV ?? ''}, cwd=${process.cwd()})…`,
  );
  const config = launchConfig(process.env, (bytes) => randomBytes(bytes).toString('hex'));
  const clock = systemClock();
  const configDir = process.env.COACH_CONFIG_DIR || appConfigDir();
  const libraryRoot = resolveLibraryRoot(
    process.env,
    readLibraryPointer(configDir),
    defaultLibraryRoot(),
  );
  const opened = openSqliteLibrary(libraryDbPath(libraryRoot), clock.nowIso(), {
    backupsDir: backupsDir(libraryRoot),
  });
  if (opened.preMigrationBackup)
    consoleLogger.info({ path: opened.preMigrationBackup }, 'pre-migration backup');

  let persistLibraryRoot = false;
  const events = createEventBus(() => clock.nowMs());
  const ffmpeg = probeFfmpegStatus();
  const poseStatus = probePoseStatus();
  const pose = createNodePoseExtractor();
  const video = createNodeVideoTools();
  const mediaFiles = libraryMediaFiles(libraryRoot);
  const mediaUrl = (videoId: string, variant: 'original' | 'proxy') =>
    `/api/v1/media/videos/${videoId}?variant=${variant}&sig=${signMedia(config.mediaSecret, videoId, variant)}`;
  const thumbUrl = (videoId: string, name: string) =>
    `/api/v1/media/thumbs/${videoId}/${name}?sig=${signMedia(config.mediaSecret, videoId, thumbVariant(name))}`;
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids: createIdGen(clock, nodeRandomBytes),
    events,
    logger: consoleLogger,
    backup: opened.backup,
    blobs: libraryBlobs(libraryRoot),
    ffmpegAvailable: ffmpeg.available,
    ffmpegVersion: ffmpeg.version,
    ffmpegNote: ffmpeg.note,
    poseAvailable: poseStatus.available && pose.ready(),
    poseVersion: poseStatus.version,
    poseNote: poseStatus.note,
    pose,
    video,
    mediaFiles,
    mediaUrl,
    thumbUrl,
    onLibraryRootChange: (root) => {
      if (persistLibraryRoot) writeLibraryPointer(configDir, root);
    },
  });

  // Settings reflect the library actually open; a COACH_LIBRARY override is not persisted.
  if ((await api.system.getSettings()).libraryRoot !== libraryRoot) {
    await api.system.updateSettings({ libraryRoot });
  }
  persistLibraryRoot = true;

  const app = await createApp({
    api,
    events,
    token: config.token,
    allowedOrigins: config.allowedOrigins,
    mediaSecret: config.mediaSecret,
    libraryRoot,
    resolveMedia: api.resolveMedia,
    resolveThumb: api.resolveThumb,
    logger: true,
  });
  const stopScheduler = startScheduler(api.jobsRunner, consoleLogger);
  app.addHook('onClose', async () => {
    stopScheduler();
    opened.close();
  });

  try {
    await app.listen({ host: '127.0.0.1', port: config.port });
  } catch (err) {
    failLoud(
      `listen failed on 127.0.0.1:${config.port} (is another process using it? lsof -nP -iTCP:${config.port} -sTCP:LISTEN)`,
      err,
    );
  }
  // Plain line so a Mac terminal shows the URL even when JSON logs scroll by.
  console.log(`climbing-coach API listening on http://127.0.0.1:${config.port}`);
  app.log.info(
    {
      apiVersion: API_VERSION,
      port: config.port,
      libraryRoot,
      dev: config.dev,
      tokenSource: config.tokenSource,
    },
    'climbing-coach server listening',
  );
  if (config.tokenSource === 'random') {
    app.log.warn(
      'no COACH_TOKEN given: generated a per-launch token; set COACH_DEV=1 for the dev token',
    );
  }
}

main().catch((err: unknown) => failLoud('failed to start', err));
