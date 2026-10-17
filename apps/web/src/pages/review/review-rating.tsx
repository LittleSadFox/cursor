import { useState } from 'react';
import { useLingui } from '@lingui/react';

import type { ReviewRating } from '@climbing-coach/api';

import { errorText } from '../../format.js';
import type { DraftRow } from './draft.js';
import { formatTags, parseTags } from './tags.js';

export type BoulderOption = { id: string; name: string; grade: string };

const PROXIMITY = [1, 2, 3, 4, 5] as const;
const EXERTION = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function Scale({
  label,
  value,
  options,
  empty,
  onChange,
}: {
  label: string;
  value: number | null;
  options: readonly number[];
  empty: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="review-inline">
      {label}
      <select
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      >
        <option value="">{empty}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function BoulderField({
  row,
  boulders,
  onRating,
  onCreate,
}: {
  row: DraftRow;
  boulders: readonly BoulderOption[];
  onRating: (patch: Partial<ReviewRating>) => void;
  onCreate: (input: { grade: string; name: string }) => Promise<string>;
}) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const known = boulders.some((boulder) => boulder.id === row.boulderId);

  const create = () => {
    const trimmed = grade.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    void onCreate({ grade: trimmed, name: name.trim() })
      .then((id) => {
        onRating({ boulderId: id });
        setOpen(false);
        setGrade('');
        setName('');
      })
      .catch((failure: unknown) => setError(failure))
      .finally(() => setPending(false));
  };

  return (
    <span className="review-boulder">
      <label className="review-inline">
        {i18n._('review.boulder')}
        <select
          value={row.boulderId ?? ''}
          onChange={(event) => onRating({ boulderId: event.target.value || null })}
        >
          <option value="">{i18n._('review.boulder.none')}</option>
          {boulders.map((boulder) => (
            <option key={boulder.id} value={boulder.id}>
              {boulder.grade} {boulder.name}
            </option>
          ))}
          {!known && row.boulderId ? (
            <option value={row.boulderId}>{i18n._('review.boulder.missing')}</option>
          ) : null}
        </select>
      </label>
      <button type="button" className="ghost" onClick={() => setOpen((value) => !value)}>
        {i18n._(open ? 'review.boulder.cancel' : 'review.boulder.new')}
      </button>
      {open ? (
        <span className="review-quick">
          <label className="review-inline">
            {i18n._('review.boulder.grade')}
            <input value={grade} onChange={(event) => setGrade(event.target.value)} />
          </label>
          <label className="review-inline">
            {i18n._('review.boulder.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="button" disabled={pending || grade.trim() === ''} onClick={create}>
            {i18n._('review.boulder.add')}
          </button>
          {error ? (
            <span className="error">{errorText(error, i18n._('error.generic'))}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Boulder, proximity, exertion, and tags for one editable climb. */
export function ReviewRatingFields({
  row,
  boulders,
  onRating,
  onCreate,
}: {
  row: DraftRow;
  boulders: readonly BoulderOption[];
  onRating: (id: string, patch: Partial<ReviewRating>) => void;
  onCreate: (input: { grade: string; name: string }) => Promise<string>;
}) {
  const { i18n } = useLingui();
  const rate = (patch: Partial<ReviewRating>) => onRating(row.id, patch);
  return (
    <>
      <BoulderField row={row} boulders={boulders} onRating={rate} onCreate={onCreate} />
      <Scale
        label={i18n._('review.proximity')}
        value={row.proximity}
        options={PROXIMITY}
        empty={i18n._('review.scale.none')}
        onChange={(proximity) => rate({ proximity })}
      />
      <Scale
        label={i18n._('review.exertion')}
        value={row.exertion}
        options={EXERTION}
        empty={i18n._('review.scale.none')}
        onChange={(exertion) => rate({ exertion })}
      />
      <label className="review-inline">
        {i18n._('review.tags')}
        <input
          key={formatTags(row.tags)}
          className="review-tags"
          defaultValue={formatTags(row.tags)}
          aria-label={i18n._('review.tags')}
          onBlur={(event) => rate({ tags: parseTags(event.target.value) })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>
    </>
  );
}
