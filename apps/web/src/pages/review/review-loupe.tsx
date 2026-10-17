import { useEffect, useRef } from 'react';
import { useLingui } from '@lingui/react';

import type { Sprite } from '@climbing-coach/api';

import { translate } from '../../format.js';
import type { DraftRow } from './draft.js';
import type { Edge } from './draft-ops.js';
import { formatSeconds, nearestTile, tileStyle } from './timeline-math.js';

/** Loupe tiles render at the server's tile width. */
const LOUPE_DISPLAY_PX = 120;

type LoupeProps = {
  row: DraftRow;
  edge: Edge;
  sprite: Sprite | undefined;
  loading: boolean;
  onEdge: (edge: Edge) => void;
  onPick: (tUs: number) => void;
};

/** Scrolls only the strip, so picking a climb never moves the page. */
function centeredScroll(strip: HTMLElement, tile: HTMLElement): number {
  return tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2;
}

/**
 * HandleLoupe (BUILD_PLAN §6): every frame around the active handle. Picking a frame moves
 * that handle to it exactly.
 */
export function ReviewLoupe({ row, edge, sprite, loading, onEdge, onPick }: LoupeProps) {
  const { i18n } = useLingui();
  const atUs = edge === 'start' ? row.climb.startUs : row.climb.endUs;
  const current = sprite ? nearestTile(sprite.tiles, atUs) : undefined;
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const editable = row.status === 'draft';

  useEffect(() => {
    const strip = stripRef.current;
    const tile = currentRef.current;
    if (strip && tile) strip.scrollLeft = centeredScroll(strip, tile);
  }, [current?.tUs, sprite]);

  return (
    <section className="review-loupe" aria-label={i18n._('review.loupe')}>
      <div className="review-loupe-head">
        <h3>{i18n._('review.loupe')}</h3>
        <div role="group" className="segmented">
          {(['start', 'end'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={edge === value}
              onClick={() => onEdge(value)}
            >
              {translate(i18n, `review.handle.${value}`, {
                time: formatSeconds(value === 'start' ? row.climb.startUs : row.climb.endUs),
              })}
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="lede">{i18n._('review.loupeLoading')}</p> : null}
      {sprite ? (
        <div ref={stripRef} className="review-loupe-strip">
          {sprite.tiles.map((tile) => (
            <button
              key={tile.tUs}
              ref={tile === current ? currentRef : undefined}
              type="button"
              className="review-loupe-tile"
              aria-current={tile === current}
              disabled={!editable}
              title={`${formatSeconds(tile.tUs)} s`}
              onClick={() => onPick(tile.tUs)}
            >
              <span style={tileStyle(sprite, tile, LOUPE_DISPLAY_PX)} />
              <small>{formatSeconds(tile.tUs)}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
