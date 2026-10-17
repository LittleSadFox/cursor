import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useLingui } from '@lingui/react';

import type { Sprite } from '@climbing-coach/api';

import { translate } from '../../format.js';
import { clipOf, type DraftRow } from './draft.js';
import type { Edge } from './draft-ops.js';
import {
  fluidTileStyle,
  formatSeconds,
  percentOf,
  rangeStyle,
  usAtClientX,
} from './timeline-math.js';

export type EdgeDrag = (id: string, edge: Edge, tUs: number, done: boolean) => void;

type TimelineProps = {
  rows: readonly DraftRow[];
  durationUs: number;
  currentUs: number;
  selectedId: string | null;
  filmstrip: Sprite | undefined;
  onSeek: (tUs: number) => void;
  onSelect: (id: string) => void;
  onDragEdge: EdgeDrag;
};

/** Evenly spaced frames across the whole recording, behind the ranges. */
function Filmstrip({ sprite }: { sprite: Sprite }) {
  return (
    <div className="review-filmstrip" aria-hidden="true">
      {sprite.tiles.map((tile) => (
        <div
          key={tile.tUs}
          className="review-filmstrip-tile"
          style={fluidTileStyle(sprite, tile)}
        />
      ))}
    </div>
  );
}

function Handle({
  row,
  edge,
  trackRef,
  durationUs,
  onDragEdge,
}: {
  row: DraftRow;
  edge: Edge;
  trackRef: { current: HTMLDivElement | null };
  durationUs: number;
  onDragEdge: EdgeDrag;
}) {
  const { i18n } = useLingui();
  const atUs = edge === 'start' ? row.climb.startUs : row.climb.endUs;
  const timeAt = (event: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect ? usAtClientX(event.clientX, rect, durationUs) : atUs;
  };
  return (
    <button
      type="button"
      className={`review-handle review-handle-${edge}`}
      style={{ left: percentOf(atUs, durationUs) }}
      aria-label={translate(i18n, `review.handle.${edge}`, { time: formatSeconds(atUs) })}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onDragEdge(row.id, edge, atUs, false);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          onDragEdge(row.id, edge, timeAt(event), false);
        }
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        onDragEdge(row.id, edge, timeAt(event), true);
      }}
    />
  );
}

function RangeBlock({
  row,
  selected,
  ...rest
}: {
  row: DraftRow;
  selected: boolean;
  trackRef: { current: HTMLDivElement | null };
  durationUs: number;
  onSelect: (id: string) => void;
  onDragEdge: EdgeDrag;
}) {
  const { durationUs, onSelect } = rest;
  const editable = row.status === 'draft';
  return (
    <>
      {row.status === 'rejected' ? null : (
        <div className="review-pad" style={rangeStyle(clipOf(row, durationUs), durationUs)} />
      )}
      <div
        className={`review-climb review-climb-${row.status}`}
        data-selected={selected}
        style={rangeStyle(row.climb, durationUs)}
        onPointerDown={() => onSelect(row.id)}
      />
      {selected && editable ? (
        <>
          <Handle row={row} edge="start" {...rest} />
          <Handle row={row} edge="end" {...rest} />
        </>
      ) : null}
    </>
  );
}

/**
 * ProposalTimeline (BUILD_PLAN §6): filmstrip, shaded padding, climb ranges (rejected ones faded
 * underneath), and handles on
 * the selected climb. Click the track to seek (on a climb, also select it); drag a handle to
 * move that edge.
 */
export function ReviewTimeline(props: TimelineProps) {
  const { i18n } = useLingui();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { rows, durationUs, currentUs, selectedId, filmstrip, onSeek, onSelect, onDragEdge } =
    props;
  const ordered = [
    ...rows.filter((row) => row.status === 'rejected'),
    ...rows.filter((row) => row.status !== 'rejected'),
  ];
  return (
    <div
      ref={trackRef}
      className="review-track"
      role="slider"
      tabIndex={-1}
      aria-label={i18n._('review.timeline')}
      aria-valuemin={0}
      aria-valuemax={durationUs}
      aria-valuenow={currentUs}
      aria-valuetext={`${formatSeconds(currentUs)} s`}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(usAtClientX(event.clientX, rect, durationUs));
      }}
    >
      {filmstrip ? <Filmstrip sprite={filmstrip} /> : null}
      {ordered.map((row) => (
        <RangeBlock
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          trackRef={trackRef}
          durationUs={durationUs}
          onSelect={onSelect}
          onDragEdge={onDragEdge}
        />
      ))}
      <div className="review-playhead" style={{ left: percentOf(currentUs, durationUs) }} />
    </div>
  );
}
