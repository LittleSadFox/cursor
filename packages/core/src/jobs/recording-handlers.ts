import type { Job } from '@climbing-coach/api';
import { us, writePosebin } from '@climbing-coach/schema';

import { insertPoseTrack } from '../db/repos/attempts.js';
import { getVideo, probeColumns, updateVideo } from '../db/repos/videos.js';
import type { IdGen } from '../ids/ulid.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { PoseExtractor } from '../ports/pose.js';
import type { AppDatabase } from '../ports/sql.js';
import type { CutMode, TimeRange, VideoTools } from '../ports/video.js';
import { clipRelative, originalRelative, proxyRelative } from '../recordings/paths.js';
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

function videoIdOf(job: Job): string {
  const id = (job.payload as { videoId?: unknown }).videoId;
  if (typeof id !== 'string' || id === '') throw new Error('job missing videoId');
  return id;
}

function importPayload(job: Job): ImportPayload {
  const payload = job.payload as Partial<ImportPayload>;
  if (!payload.videoId || !payload.sourcePath || !payload.importMode || !payload.fileName) {
    throw new Error('import job payload is incomplete');
  }
  return payload as ImportPayload;
}

const DETECTION_FPS = 15;
const DETECTION_MAX_SIDE = 640;

export type RecordingHandlerDeps = {
  db: AppDatabase;
  clock: Clock;
  video: VideoTools;
  files: MediaFiles;
  pose?: PoseExtractor | undefined;
  blobs?: BlobStore | undefined;
  ids?: IdGen | undefined;
};

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
    'import-recording.pose-detection': async ({ job, signal }) => {
      if (!deps.pose?.ready() || !deps.blobs || !deps.ids) {
        return { skipped: true, reason: 'pose runtime unavailable' };
      }
      const id = videoIdOf(job);
      const row = getVideo(db, id);
      const durationUs = row.durationUs ?? 0;
      const windows =
        durationUs > 0 ? [{ startUs: us(0), endUs: us(durationUs) }] : [];
      const rotation = ([0, 90, 180, 270] as const).includes(
        Math.abs(row.rotation) as 0 | 90 | 180 | 270,
      )
        ? ((Math.abs(row.rotation) % 360) as 0 | 90 | 180 | 270)
        : 0;
      const summary = await deps.pose.extract(
        video.frames(files.absolute(row.path), {
          windows,
          sampleFps: DETECTION_FPS,
          maxSide: DETECTION_MAX_SIDE,
          toSdr: true,
          ...(signal ? { signal } : {}),
        }),
        {
          videoId: id,
          kind: 'detection',
          sampleFps: DETECTION_FPS,
          displayWidth: row.displayWidth ?? 1,
          displayHeight: row.displayHeight ?? 1,
          rotation,
          windows,
          maxPersons: 2,
          ...(signal ? { signal } : {}),
          nextTrackId: () => deps.ids!.ulid(),
        },
      );
      const poseTrackId = deps.ids.ulid();
      const path = `pose/${id}.${poseTrackId}.detection.posebin`;
      await deps.blobs.write(path, writePosebin(summary.track));
      insertPoseTrack(
        db,
        {
          id: poseTrackId,
          videoId: id,
          kind: 'detection',
          runtime: summary.track.header.runtime,
          model: summary.track.header.model,
          modelVersion: summary.track.header.modelVersion ?? '1',
          sampleFps: DETECTION_FPS,
          path,
          windowsJson: JSON.stringify(summary.track.header.windows),
        },
        clock.nowIso(),
      );
      return {
        poseTrackId,
        framesProcessed: summary.framesProcessed,
        persons: summary.persons,
        path,
      };
    },
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
