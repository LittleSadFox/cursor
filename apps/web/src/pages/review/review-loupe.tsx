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

/**
 * HandleLoupe (BUILD_PLAN §6): every frame around the active handle. Picking a frame moves
 * that handle to it exactly.
 */
export function ReviewLoupe({ row, edge, sprite, loading, onEdge, onPick }: LoupeProps) {
  const { i18n } = useLingui();
  const atUs = edge === 'start' ? row.climb.startUs : row.climb.endUs;
  const current = sprite ? nearestTile(sprite.tiles, atUs) : undefined;
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const editable = row.status === 'draft';

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
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
        <div className="review-loupe-strip">
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
