import { and, desc, eq, isNull } from 'drizzle-orm';

import { ProblemError } from '@climbing-coach/api';
import type { ProbeResult } from '../../ports/video.js';
import type { AppDatabase } from '../../ports/sql.js';
import { videos } from '../schema.js';

export type VideoUpdate = Partial<typeof videos.$inferInsert>;

export function insertVideo(db: AppDatabase, row: typeof videos.$inferInsert): void {
  db.insert(videos).values(row).run();
}

export function updateVideo(db: AppDatabase, id: string, patch: VideoUpdate, nowIso: string): void {
  db.update(videos)
    .set({ ...patch, updatedAt: nowIso })
    .where(eq(videos.id, id))
    .run();
}

export function getVideo(db: AppDatabase, id: string): typeof videos.$inferSelect {
  const row = db
    .select()
    .from(videos)
    .where(and(eq(videos.id, id), isNull(videos.deletedAt)))
    .get();
  if (!row) throw new ProblemError('NOT_FOUND', `recording ${id} not found`);
  return row;
}

export function listVideos(db: AppDatabase): (typeof videos.$inferSelect)[] {
  return db
    .select()
    .from(videos)
    .where(isNull(videos.deletedAt))
    .orderBy(desc(videos.createdAt), desc(videos.id))
    .all();
}

export function probeColumns(probe: ProbeResult): VideoUpdate {
  return {
    durationUs: probe.durationUs,
    displayWidth: probe.displayWidth,
    displayHeight: probe.displayHeight,
    rotation: probe.rotation,
    codec: probe.codec,
    isHdr: probe.isHdr ? 1 : 0,
    isVfr: probe.isVfr ? 1 : 0,
    frameCount: probe.frames.length,
    avgFpsMilli: Math.round(probe.fps * 1000),
    colorTransfer: probe.colorTransfer,
    dvProfile: probe.dolbyVision,
  };
}
