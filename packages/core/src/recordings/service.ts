import {
  ProblemError,
  type Job,
  type Recording,
  type RecordingAccepted,
  type RecordingCut,
  type RecordingImport,
} from '@climbing-coach/api';

import { getJob } from '../db/repos/jobs.js';
import { getVideo, insertVideo, listVideos, updateVideo } from '../db/repos/videos.js';
import type { IdGen } from '../ids/ulid.js';
import type { JobRunner } from '../jobs/runner.js';
import type { Clock } from '../ports/clock.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { AppDatabase } from '../ports/sql.js';
import { VideoToolError, type VideoTools } from '../ports/video.js';
import { contentTypeFor, fileBaseName } from './paths.js';
import type { videos } from '../db/schema.js';

export type RecordingDeps = {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  runner: JobRunner;
  video?: VideoTools | undefined;
  files?: MediaFiles | undefined;
  mediaUrl?: ((videoId: string, variant: 'original' | 'proxy') => string) | undefined;
};

function jobOf(db: AppDatabase, id: string | null): Job | null {
  if (!id) return null;
  try {
    return getJob(db, id);
  } catch {
    return null;
  }
}

function toRecording(
  row: typeof videos.$inferSelect,
  job: Job | null,
  mediaUrl: RecordingDeps['mediaUrl'],
): Recording {
  const proxyReady = Boolean(row.proxyPath);
  return {
    id: row.id,
    kind: row.kind === 'clip' ? 'clip' : 'original',
    fileName: row.fileName || row.path.split('/').pop() || 'video',
    proxyReady,
    quickHash: row.quickHash,
    sha256: row.sha256,
    durationUs: row.durationUs,
    displayWidth: row.displayWidth,
    displayHeight: row.displayHeight,
    rotation: row.rotation,
    codec: row.codec,
    fps: row.avgFpsMilli === null ? null : row.avgFpsMilli / 1000,
    isHdr: row.isHdr === 1,
    isVfr: row.isVfr === 1,
    colorTransfer: row.colorTransfer,
    dolbyVision: row.dvProfile,
    frameCount: row.frameCount,
    reviewState:
      row.reviewState === 'in_review' || row.reviewState === 'done'
        ? row.reviewState
        : 'unreviewed',
    sourceVideoId: row.sourceVideoId,
    sourceStartUs: row.sourceStartUs,
    sourceEndUs: row.sourceEndUs,
    jobId: row.importJobId,
    jobStatus: job?.status ?? null,
    error: job?.error ?? null,
    proxyUrl: proxyReady && mediaUrl ? mediaUrl(row.id, 'proxy') : null,
    createdAt: row.createdAt,
  };
}

export function createRecordingService(deps: RecordingDeps) {
  const tools = (): { video: VideoTools; files: MediaFiles } => {
    if (!deps.video?.ready() || !deps.files) {
      throw new ProblemError(
        'FFMPEG_UNAVAILABLE',
        'ffmpeg is not available. On Apple Silicon run ./scripts/ffmpeg/build-macos-arm64.sh, restart the server, or set COACH_FFMPEG and COACH_FFPROBE.',
      );
    }
    return { video: deps.video, files: deps.files };
  };

  const present = (row: typeof videos.$inferSelect): Recording =>
    toRecording(row, jobOf(deps.db, row.importJobId), deps.mediaUrl);

  return {
    async list(): Promise<Recording[]> {
      return listVideos(deps.db).map(present);
    },
    async get(id: string): Promise<Recording> {
      return present(getVideo(deps.db, id));
    },
    async importPath(input: RecordingImport): Promise<RecordingAccepted> {
      const { files } = tools();
      if (!input.sourcePath.startsWith('/')) {
        throw new ProblemError('VALIDATION_FAILED', 'Video path must be absolute.');
      }
      try {
        const info = await files.stat(input.sourcePath);
        if (info.size <= 0) throw new ProblemError('VALIDATION_FAILED', 'Video file is empty.');
      } catch (error) {
        if (error instanceof ProblemError) throw error;
        throw new ProblemError('VALIDATION_FAILED', 'Video file was not found.');
      }
      const importMode = input.importMode ?? 'copy';
      const fileName = fileBaseName(input.fileName ?? input.sourcePath);
      const now = deps.clock.nowIso();
      const id = deps.ids.ulid();
      insertVideo(deps.db, {
        id,
        kind: 'original',
        discipline: 'boulder',
        path: '',
        fileName,
        rotation: 0,
        isHdr: 0,
        isVfr: 0,
        reviewState: 'unreviewed',
        reviewRevision: 0,
        warningsJson: '[]',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      let job;
      try {
        job = deps.runner.enqueue('import-recording', {
          videoId: id,
          sourcePath: input.sourcePath,
          importMode,
          fileName,
        });
      } catch (error) {
        if (error instanceof VideoToolError) {
          throw new ProblemError(error.code, error.message);
        }
        throw error;
      }
      updateVideo(deps.db, id, { importJobId: job.id }, now);
      return { jobId: job.id, recording: present(getVideo(deps.db, id)) };
    },
    async cut(id: string, input: RecordingCut): Promise<RecordingAccepted> {
      tools();
      const source = getVideo(deps.db, id);
      if (!source.path)
        throw new ProblemError('VALIDATION_FAILED', 'The recording file is not ready.');
      if (source.durationUs === null) {
        throw new ProblemError('VALIDATION_FAILED', 'Probe has not finished for this recording.');
      }
      const startUs = Math.round(input.startUs);
      const endUs = Math.round(input.endUs);
      if (
        !Number.isInteger(startUs) ||
        !Number.isInteger(endUs) ||
        startUs < 0 ||
        endUs <= startUs
      ) {
        throw new ProblemError(
          'VALIDATION_FAILED',
          'Cut range must be a positive span of microseconds.',
        );
      }
      if (endUs > source.durationUs) {
        throw new ProblemError('VALIDATION_FAILED', 'Cut end is past the end of the video.');
      }
      const mode = input.mode ?? 'auto';
      const now = deps.clock.nowIso();
      const clipId = deps.ids.ulid();
      const base = fileBaseName(source.fileName).replace(/\.[a-z0-9]+$/i, '');
      insertVideo(deps.db, {
        id: clipId,
        kind: 'clip',
        discipline: source.discipline,
        path: '',
        fileName: `${base}-cut.mp4`,
        rotation: 0,
        isHdr: 0,
        isVfr: 0,
        reviewState: 'unreviewed',
        reviewRevision: 0,
        warningsJson: '[]',
        sourceVideoId: source.id,
        sourceStartUs: startUs,
        sourceEndUs: endUs,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      const job = deps.runner.enqueue('cut-recording', {
        videoId: clipId,
        sourceVideoId: source.id,
        startUs,
        endUs,
        mode,
        sourcePath: source.path,
        importMode: 'copy',
        fileName: `${base}-cut.mp4`,
      });
      updateVideo(deps.db, clipId, { importJobId: job.id }, now);
      return { jobId: job.id, recording: present(getVideo(deps.db, clipId)) };
    },
    async mediaFile(id: string, variant: 'original' | 'proxy') {
      if (!deps.files) throw new ProblemError('NOT_FOUND', 'library files are not configured');
      const row = getVideo(deps.db, id);
      const stored = variant === 'proxy' ? row.proxyPath : row.path;
      if (!stored) throw new ProblemError('NOT_FOUND', 'that media file is not ready');
      return { path: deps.files.absolute(stored), contentType: contentTypeFor(stored) };
    },
  };
}
