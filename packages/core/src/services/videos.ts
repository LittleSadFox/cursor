import { ProblemError, VideoPoseQuerySchema, type CoachApi } from '@climbing-coach/api';
import { readPosebin, slicePoseTrack, writePosebin } from '@climbing-coach/schema';

import { findPoseTrack } from '../db/repos/attempts.js';
import type { BlobStore } from '../ports/blobs.js';
import type { AppDatabase } from '../ports/sql.js';
import { parseInput } from './validate.js';

export type VideoServiceDeps = {
  db: AppDatabase;
  blobs?: BlobStore | undefined;
};

/** `GET /videos/:id/pose`: the stored posebin, or a time slice of it. */
export function createVideoService(deps: VideoServiceDeps): CoachApi['videos'] {
  return {
    async pose(id, raw) {
      const query = parseInput(VideoPoseQuerySchema, raw ?? {});
      const track = findPoseTrack(deps.db, id, query.kind);
      if (!track)
        throw new ProblemError('NOT_FOUND', `video ${id} has no ${query.kind} pose track`);
      if (!deps.blobs) throw new ProblemError('NOT_FOUND', 'library is not configured');
      const bytes = await deps.blobs.read(track.path);
      if (query.fromUs === undefined && query.toUs === undefined) return bytes;
      const slice = slicePoseTrack(
        readPosebin(bytes),
        query.fromUs ?? 0,
        query.toUs ?? Number.POSITIVE_INFINITY,
      );
      if (!slice) throw new ProblemError('NOT_FOUND', 'no climber frames in that range');
      return writePosebin(slice);
    },
  };
}
