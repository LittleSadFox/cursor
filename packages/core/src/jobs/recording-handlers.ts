import type { Job } from '@climbing-coach/api';
import { us } from '@climbing-coach/schema';

import { getVideo, probeColumns, updateVideo } from '../db/repos/videos.js';
import type { CutMode, TimeRange } from '../ports/video.js';
import { clipRelative, originalRelative, proxyRelative } from '../recordings/paths.js';
import { ingestHandlers, type IngestHandlerDeps } from './ingest-handlers.js';
import { videoIdOf } from './job-payload.js';
import type { StepHandler } from './types.js';

type ImportPayload = {
  videoId: string;
  sourcePath: string;
  importMode: 'copy' | 'move' | 'reference';
  fileName: string;
};

type CutPayload = ImportPayload & {
  sourceVideoId: string;
  startUs: number;
  endUs: number;
  mode: CutMode;
};

function importPayload(job: Job): ImportPayload {
  const payload = job.payload as Partial<ImportPayload>;
  if (!payload.videoId || !payload.sourcePath || !payload.importMode || !payload.fileName) {
    throw new Error('import job payload is incomplete');
  }
  return payload as ImportPayload;
}

export type RecordingHandlerDeps = IngestHandlerDeps;

export function recordingHandlers(deps: RecordingHandlerDeps): Record<string, StepHandler> {
  const { db, clock, video, files } = deps;

  async function hash(job: Job, kind: 'quick' | 'full', signal?: AbortSignal): Promise<void> {
    const id = videoIdOf(job);
    const row = getVideo(db, id);
    const digest =
      kind === 'quick'
        ? await video.quickHash(files.absolute(row.path))
        : await video.fullHash(files.absolute(row.path), signal);
    updateVideo(
      db,
      id,
      kind === 'quick' ? { quickHash: digest } : { sha256: digest },
      clock.nowIso(),
    );
  }

  async function runProbe(job: Job): Promise<void> {
    const id = videoIdOf(job);
    const row = getVideo(db, id);
    const probe = await video.probe(files.absolute(row.path));
    updateVideo(db, id, probeColumns(probe), clock.nowIso());
  }

  async function runProxy(job: Job, signal?: AbortSignal): Promise<void> {
    const id = videoIdOf(job);
    const row = getVideo(db, id);
    const relative = proxyRelative(id);
    await video.makeProxy(
      files.absolute(row.path),
      files.absolute(relative),
      signal ? { signal } : undefined,
    );
    updateVideo(db, id, { proxyPath: relative }, clock.nowIso());
  }

  return {
    'import-recording.place': async ({ job }) => {
      const payload = importPayload(job);
      const row = getVideo(db, payload.videoId);
      if (payload.importMode === 'reference') {
        updateVideo(db, row.id, { path: payload.sourcePath }, clock.nowIso());
        return;
      }
      const relative = originalRelative(row.id, payload.fileName, row.createdAt);
      if (payload.importMode === 'move') await files.moveInto(payload.sourcePath, relative);
      else await files.copyInto(payload.sourcePath, relative);
      updateVideo(db, row.id, { path: relative }, clock.nowIso());
    },
    'import-recording.quick-hash': async ({ job }) => hash(job, 'quick'),
    'import-recording.probe': async ({ job }) => runProbe(job),
    'import-recording.proxy': async ({ job, signal }) => runProxy(job, signal),
    ...ingestHandlers(deps),
    'import-recording.full-hash': async ({ job, signal }) => hash(job, 'full', signal),
    'cut-recording.cut': async ({ job, signal }) => {
      const payload = job.payload as Partial<CutPayload>;
      if (!payload.videoId || !payload.sourceVideoId || payload.mode === undefined) {
        throw new Error('cut job payload is incomplete');
      }
      const range: TimeRange = {
        startUs: us(payload.startUs ?? 0),
        endUs: us(payload.endUs ?? 0),
      };
      const source = getVideo(db, payload.sourceVideoId);
      const relative = clipRelative(payload.videoId);
      const result = await video.cut(
        files.absolute(source.path),
        files.absolute(relative),
        range,
        payload.mode,
        signal ? { signal } : undefined,
      );
      updateVideo(
        db,
        payload.videoId,
        {
          path: relative,
          sourceStartUs: result.actualRange.startUs,
          sourceEndUs: result.actualRange.endUs,
        },
        clock.nowIso(),
      );
      return result;
    },
    'cut-recording.probe': async ({ job }) => runProbe(job),
    'cut-recording.proxy': async ({ job, signal }) => runProxy(job, signal),
  };
}
