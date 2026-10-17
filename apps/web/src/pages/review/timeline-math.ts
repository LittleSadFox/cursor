import type { ReviewRange, Sprite, SpriteTile } from '@climbing-coach/api';

/** Loupe centres snap to this grid, matching the server's sprite cache. */
export const LOUPE_GRID_US = 1_000_000;
/** Frame step when the recording's frame rate is unknown. */
export const FALLBACK_FPS = 30;
export const JUMP_US = 500_000;
export const FILMSTRIP_TILE_WIDTH = 96;

export function clampUs(tUs: number, durationUs: number): number {
  return Math.min(Math.max(Math.round(tUs), 0), Math.max(durationUs, 0));
}

export function fractionOf(tUs: number, durationUs: number): number {
  if (durationUs <= 0) return 0;
  return Math.min(Math.max(tUs / durationUs, 0), 1);
}

export function percentOf(tUs: number, durationUs: number): string {
  return `${(fractionOf(tUs, durationUs) * 100).toFixed(3)}%`;
}

/** CSS `left` / `width` that place a range on the timeline. */
export function rangeStyle(
  range: ReviewRange,
  durationUs: number,
): { left: string; width: string } {
  const start = fractionOf(range.startUs, durationUs);
  const end = fractionOf(range.endUs, durationUs);
  return { left: `${(start * 100).toFixed(3)}%`, width: `${((end - start) * 100).toFixed(3)}%` };
}

/** Time under a pointer at `clientX` on a track spanning `rect`. */
export function usAtClientX(
  clientX: number,
  rect: { left: number; width: number },
  durationUs: number,
): number {
  if (rect.width <= 0) return 0;
  return clampUs(((clientX - rect.left) / rect.width) * durationUs, durationUs);
}

export function frameUs(fps: number | null): number {
  return Math.round(1_000_000 / (fps && fps > 0 ? fps : FALLBACK_FPS));
}

export function formatSeconds(us: number): string {
  return (us / 1_000_000).toFixed(2);
}

export function loupeCenterUs(tUs: number): number {
  return Math.max(0, Math.round(tUs / LOUPE_GRID_US) * LOUPE_GRID_US);
}

export function nearestTile(tiles: readonly SpriteTile[], tUs: number): SpriteTile | undefined {
  let best: SpriteTile | undefined;
  for (const tile of tiles) {
    if (!best || Math.abs(tile.tUs - tUs) < Math.abs(best.tUs - tUs)) best = tile;
  }
  return best;
}

export type TileStyle = {
  width: string;
  height: string;
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
};

/** CSS that shows one sprite tile scaled to `displayWidth` pixels wide. */
export function tileStyle(sprite: Sprite, tile: SpriteTile, displayWidth: number): TileStyle {
  const scale = displayWidth / tile.w;
  const px = (value: number) => `${(value * scale).toFixed(2)}px`;
  return {
    width: px(tile.w),
    height: px(tile.h),
    backgroundImage: `url("${sprite.spriteUrl}")`,
    backgroundPosition: `-${px(tile.x)} -${px(tile.y)}`,
    backgroundSize: `${px(sprite.width)} ${px(sprite.height)}`,
  };
}

function spritePercent(offset: number, tileSize: number, spriteSize: number): string {
  return spriteSize === tileSize
    ? '0%'
    : `${((offset / (spriteSize - tileSize)) * 100).toFixed(3)}%`;
}

/** Like `tileStyle`, but fills a box of any width that keeps the tile's aspect ratio. */
export function fluidTileStyle(
  sprite: Sprite,
  tile: SpriteTile,
): Pick<TileStyle, 'backgroundImage' | 'backgroundPosition' | 'backgroundSize'> & {
  aspectRatio: string;
} {
  return {
    aspectRatio: `${tile.w} / ${tile.h}`,
    backgroundImage: `url("${sprite.spriteUrl}")`,
    backgroundPosition: `${spritePercent(tile.x, tile.w, sprite.width)} ${spritePercent(tile.y, tile.h, sprite.height)}`,
    backgroundSize: `${((sprite.width / tile.w) * 100).toFixed(3)}% ${((sprite.height / tile.h) * 100).toFixed(3)}%`,
  };
}
