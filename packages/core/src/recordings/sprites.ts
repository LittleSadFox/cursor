import { ProblemError, type FilmstripQuery, type Sprite } from '@climbing-coach/api';
import { us } from '@climbing-coach/schema';

import { getVideo } from '../db/repos/videos.js';
import type { BlobStore } from '../ports/blobs.js';
import type { MediaFiles } from '../ports/media-files.js';
import type { AppDatabase } from '../ports/sql.js';
import type { SpriteLayout, VideoTools } from '../ports/video.js';

/** BUILD_PLAN §3.3 loupes: every frame within ±1.5 s at 120 px. */
export const LOUPE_HALF_WINDOW_US = 1_500_000;
export const LOUPE_TILE_WIDTH = 120;
/** Loupe centres snap to this grid so nearby handle positions share one cached strip. */
export const LOUPE_GRID_US = 1_000_000;

/** File names a signed thumbs URL may serve. */
export const THUMB_NAME = /^(filmstrip|loupe)-[0-9-]+\.jpg$/;

export type SpriteDeps = {
  db: AppDatabase;
  video?: VideoTools | undefined;
  files?: MediaFiles | undefined;
  blobs?: BlobStore | undefined;
  thumbUrl?: ((videoId: string, name: string) => string) | undefined;
};

export function filmstripName(q: FilmstripQuery): string {
  return `filmstrip-${q.startUs}-${q.endUs}-${q.count}-${q.width}.jpg`;
}

export function loupeCenterUs(atUs: number): number {
  return Math.round(atUs / LOUPE_GRID_US) * LOUPE_GRID_US;
}

export function loupeName(centerUs: number): string {
  return `loupe-${centerUs}.jpg`;
}

export function thumbPath(videoId: string, name: string): string {
  return `thumbs/${videoId}/${name}`;
}

function toSprite(layout: SpriteLayout, spriteUrl: string): Sprite {
  return {
    spriteUrl,
    width: Math.max(1, Math.round(layout.width)),
    height: Math.max(1, Math.round(layout.height)),
    tiles: layout.tiles.map((tile) => ({
      tUs: Math.max(0, Math.round(tile.tUs)),
      x: Math.max(0, Math.round(tile.x)),
      y: Math.max(0, Math.round(tile.y)),
      w: Math.max(1, Math.round(tile.w)),
      h: Math.max(1, Math.round(tile.h)),
    })),
  };
}

async function readLayout(blobs: BlobStore, path: string): Promise<SpriteLayout | null> {
  try {
    return JSON.parse(new TextDecoder().decode(await blobs.read(path))) as SpriteLayout;
  } catch {
    return null;
  }
}

/**
 * Filmstrip and loupe sprites from the review proxy (timestamps pass through, so tile times
 * are original times), rendered on first request and cached under `thumbs/<videoId>/`.
 */
export function createSpriteService(deps: SpriteDeps) {
  function tools() {
    const { video, files, blobs, thumbUrl } = deps;
    if (!video?.ready() || !files || !blobs || !thumbUrl) {
      throw new ProblemError('FFMPEG_UNAVAILABLE', 'Frame previews need the local ffmpeg build.');
    }
    return { video, files, blobs, thumbUrl };
  }

  function sourceOf(id: string, files: MediaFiles): string {
    const row = getVideo(deps.db, id);
    const stored = row.proxyPath ?? row.path;
    if (!stored) throw new ProblemError('VALIDATION_FAILED', 'The recording file is not ready.');
    return files.absolute(stored);
  }

  async function cached(
    id: string,
    name: string,
    render: (src: string, dst: string) => Promise<SpriteLayout>,
  ): Promise<Sprite> {
    const { files, blobs, thumbUrl } = tools();
    const layoutPath = `${thumbPath(id, name)}.json`;
    const hit = await readLayout(blobs, layoutPath);
    if (hit) return toSprite(hit, thumbUrl(id, name));
    const layout = await render(sourceOf(id, files), files.absolute(thumbPath(id, name)));
    await blobs.write(layoutPath, new TextEncoder().encode(JSON.stringify(layout)));
    return toSprite(layout, thumbUrl(id, name));
  }

  return {
    filmstrip(id: string, q: FilmstripQuery): Promise<Sprite> {
      const { video } = tools();
      return cached(id, filmstripName(q), (src, dst) =>
        video.filmstrip(src, { startUs: us(q.startUs), endUs: us(q.endUs) }, q.count, dst, q.width),
      );
    },
    loupe(id: string, atUs: number): Promise<Sprite> {
      const { video } = tools();
      const centerUs = loupeCenterUs(atUs);
      return cached(id, loupeName(centerUs), (src, dst) =>
        video.loupe(src, us(centerUs), us(LOUPE_HALF_WINDOW_US), dst, LOUPE_TILE_WIDTH),
      );
    },
    /** Absolute JPEG path for a signed thumbs URL. */
    thumbFile(videoId: string, name: string): { path: string; contentType: string } {
      if (!THUMB_NAME.test(name) || !deps.files) {
        throw new ProblemError('NOT_FOUND', 'no such preview');
      }
      return { path: deps.files.absolute(thumbPath(videoId, name)), contentType: 'image/jpeg' };
    },
  };
}
