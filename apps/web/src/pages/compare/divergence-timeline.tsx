import { useLingui } from '@lingui/react';
import { useMemo, type MouseEvent } from 'react';

import type { MoveSpan } from '../../hooks/compare/moves.js';

import { divergencePath, positionAtX, xOfPosition } from './divergence-path.js';

const BOX = { width: 720, height: 90, pad: 4 };

export type DivergenceTimelineProps = {
  scores: Float32Array;
  /** Timeline position of each warp step in the current sync mode. */
  stepPositions: readonly number[];
  /** Timeline span of each move of A in the current sync mode. */
  moveSpans: readonly MoveSpan[];
  durationUs: number;
  position: number;
  onSeek: (position: number) => void;
};

/** Divergence score over the timeline; click to jump there (PLAN 2.7). */
export function DivergenceTimeline(props: DivergenceTimelineProps) {
  const { i18n } = useLingui();
  const { scores, stepPositions, durationUs } = props;
  const path = useMemo(
    () => divergencePath(scores, stepPositions, durationUs, BOX),
    [scores, stepPositions, durationUs],
  );

  const seek = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * BOX.width;
    props.onSeek(positionAtX(x, BOX.width, durationUs));
  };

  const cursor = xOfPosition(props.position, durationUs, BOX.width);
  return (
    <figure className="divergence">
      <figcaption>
        {i18n._('compare.divergence')} <small>{i18n._('compare.divergenceHint')}</small>
      </figcaption>
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={i18n._('compare.divergence')}
        onClick={seek}
      >
        {props.moveSpans.map(({ move, from, to }) => (
          <rect
            key={move.moveIndexA}
            className={move.moveIndexB === null ? 'move-band unmatched' : 'move-band'}
            x={xOfPosition(from, durationUs, BOX.width)}
            width={Math.max(1, xOfPosition(to - from, durationUs, BOX.width))}
            y={0}
            height={BOX.height}
          />
        ))}
        <path d={path} className="divergence-line" />
        <line className="divergence-cursor" x1={cursor} x2={cursor} y1={0} y2={BOX.height} />
      </svg>
    </figure>
  );
}
