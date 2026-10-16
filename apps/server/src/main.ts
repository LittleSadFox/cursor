import { randomBytes } from 'node:crypto';

import { API_VERSION } from '@climbing-coach/api';
import { defaultLibraryRoot, libraryDbPath, nodeRandomBytes, openSqliteLibrary } from '@climbing-coach/adapters-node';
import { createCoreApi, createEventBus, createIdGen, systemClock } from '@climbing-coach/core';

import { createApp, DEV_ORIGINS } from './create-app.js';

async function main(): Promise<void> {
  const clock = systemClock();
  const libraryRoot = process.env.COACH_LIBRARY ?? defaultLibraryRoot();
  const opened = openSqliteLibrary(libraryDbPath(libraryRoot), clock.nowIso());
  const events = createEventBus(() => clock.nowMs());
  const api = createCoreApi({
    db: opened.db,
    sql: opened.sql,
    clock,
    ids: createIdGen(clock, nodeRandomBytes),
    events,
    logger: {
      info: (fields, message) => {
        console.log(JSON.stringify({ level: 'info', message, ...fields }));
      },
      warn: (fields, message) => {
        console.warn(JSON.stringify({ level: 'warn', message, ...fields }));
      },
      error: (fields, message) => {
        console.error(JSON.stringify({ level: 'error', message, ...fields }));
      },
    },
    backup: opened.backup,
    ffmpegAvailable: false,
    poseAvailable: false,
  });

  const current = await api.system.getSettings();
  if (current.libraryRoot === null) {
    await api.system.updateSettings({ libraryRoot });
  }

  const token = process.env.COACH_TOKEN ?? 'dev-token';
  const mediaSecret = process.env.COACH_MEDIA_SECRET ?? randomBytes(32).toString('hex');
  const extraOrigin = process.env.COACH_DEV_ORIGIN;
  const origins = extraOrigin ? [...DEV_ORIGINS, extraOrigin] : [...DEV_ORIGINS];

  const app = await createApp({
    api,
    events,
    token,
    allowedOrigins: origins,
    mediaSecret,
    libraryRoot,
    logger: true,
  });

  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ host: '127.0.0.1', port });
  app.log.info(
    { apiVersion: API_VERSION, port, libraryRoot, tokenSet: Boolean(process.env.COACH_TOKEN) },
    'climbing-coach server listening',
  );
  if (!process.env.COACH_TOKEN) {
    app.log.info('using default launch token "dev-token" (set COACH_TOKEN to override)');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
