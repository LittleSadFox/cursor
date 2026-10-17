import { useLingui } from '@lingui/react';

import type { ReviewRating } from '@climbing-coach/api';
import { AttemptOutcomeSchema, type AttemptOutcome } from '@climbing-coach/schema';

import { translate } from '../../format.js';
import { isEditable, type DraftRow } from './draft.js';
import { canRestore, mergePartner } from './draft-ops.js';
import { ReviewRatingFields, type BoulderOption } from './review-rating.js';
import { formatSeconds } from './timeline-math.js';

export type ListActions = {
  onSelect: (row: DraftRow) => void;
  onOutcome: (id: string, outcome: AttemptOutcome) => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;
  onMerge: (id: string) => void;
  onRating: (id: string, patch: Partial<ReviewRating>) => void;
  boulders: readonly BoulderOption[];
  onCreateBoulder: (input: { grade: string; name: string }) => Promise<string>;
};

function originLabel(row: DraftRow): string {
  if (row.parentIds.length === 0) return 'review.origin.manual';
  if (row.parentIds.length > 1) return 'review.origin.merged';
  return row.parentIds[0] === row.id ? 'review.origin.detector' : 'review.origin.edited';
}

function ItemActions({
  row,
  rows,
  actions,
}: {
  row: DraftRow;
  rows: readonly DraftRow[];
  actions: ListActions;
}) {
  const { i18n } = useLingui();
  if (row.status === 'rejected') {
    return (
      <button
        type="button"
        disabled={!canRestore(rows, row.id)}
        onClick={() => actions.onRestore(row.id)}
      >
        {i18n._('review.restore')}
      </button>
    );
  }
  return (
    <>
      <label className="review-inline">
        {i18n._('review.outcome')}
        <select
          value={row.outcome}
          onChange={(event) =>
            actions.onOutcome(row.id, AttemptOutcomeSchema.parse(event.target.value))
          }
        >
          {AttemptOutcomeSchema.options.map((outcome) => (
            <option key={outcome} value={outcome}>
              {i18n._(`recordings.outcome.${outcome}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ghost"
        disabled={!mergePartner(rows, row.id)}
        onClick={() => actions.onMerge(row.id)}
      >
        {i18n._('review.mergeNext')}
      </button>
      <button type="button" className="ghost" onClick={() => actions.onReject(row.id)}>
        {i18n._('review.reject')}
      </button>
      <ReviewRatingFields
        row={row}
        boulders={actions.boulders}
        onRating={actions.onRating}
        onCreate={actions.onCreateBoulder}
      />
    </>
  );
}

/** ProposalList (BUILD_PLAN §6): every climb in time order, rejected ones struck through. */
export function ReviewList({
  rows,
  selectedId,
  actions,
}: {
  rows: readonly DraftRow[];
  selectedId: string | null;
  actions: ListActions;
}) {
  const { i18n } = useLingui();
  if (rows.length === 0) return <p className="lede">{i18n._('review.empty')}</p>;
  return (
    <ol className="review-list">
      {rows.map((row, index) => (
        <li key={row.id} data-selected={row.id === selectedId} data-status={row.status}>
          <button type="button" className="review-item-pick" onClick={() => actions.onSelect(row)}>
            {translate(i18n, 'review.item', {
              n: index + 1,
              start: formatSeconds(row.climb.startUs),
              end: formatSeconds(row.climb.endUs),
            })}
          </button>
          <span className="review-tag">{i18n._(originLabel(row))}</span>
          {row.status !== 'draft' ? (
            <span className="review-tag">{i18n._(`review.status.${row.status}`)}</span>
          ) : null}
          {isEditable(row) ? <ItemActions row={row} rows={rows} actions={actions} /> : null}
        </li>
      ))}
    </ol>
  );
}
