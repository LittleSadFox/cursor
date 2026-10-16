import { useLingui } from '@lingui/react';
import { useState } from 'react';

import {
  problemFromUnknown,
  type FocusTag,
  type SessionType,
  type TrainingLogDay,
} from '@climbing-coach/api';

import { errorText } from '../format.js';
import { useFocusTags, useSaveToday, useSettings, useToday } from '../hooks/queries.js';
import { GradeBreakdownEditor } from './grade-breakdown.js';
import { formatPrefillBasis } from './prefill-copy.js';
import {
  draftFromDay,
  draftToInput,
  SESSION_TYPES,
  toggleFocus,
  type DraftError,
  type TodayDraft,
} from './today-draft.js';

type SaveToday = ReturnType<typeof useSaveToday>;

export function TodayEntryForm() {
  const day = useToday();
  const save = useSaveToday();
  if (!day.data) return <section className="today-form" aria-busy="true" />;
  // Remount on a new saved version so the draft always starts from what the server holds.
  return <TodayEditor key={day.data.entry?.version ?? 'new'} day={day.data} save={save} />;
}

function TodayEditor({ day, save }: { day: TrainingLogDay; save: SaveToday }) {
  const { i18n } = useLingui();
  const tags = useFocusTags().data ?? [];
  const discipline = useSettings().data?.defaultDiscipline ?? 'boulder';
  const [draft, setDraft] = useState<TodayDraft>(() => draftFromDay(day));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<DraftError[]>([]);
  const set = (patch: Partial<TodayDraft>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const fromPrefill = !day.entry && !draft.exertionEdited && day.prefill.sessionExertion !== null;

  return (
    <form
      className="today-form"
      onSubmit={(event) => {
        event.preventDefault();
        const result = draftToInput(draft, day, -new Date().getTimezoneOffset());
        setErrors(result.ok ? [] : result.errors);
        if (!result.ok) return;
        setDirty(false);
        save.mutate(result.input);
      }}
    >
      <h1>{i18n._('home.title')}</h1>
      <p className="lede">
        {formatPrefillBasis(
          day.prefill.basis,
          i18n._('home.prefillBasis'),
          i18n._('home.noPrefill'),
        )}
      </p>
      <label>
        {i18n._('home.exertion')}
        <input
          type="number"
          min={0}
          max={10}
          value={draft.exertion}
          onChange={(event) => set({ exertion: event.target.value, exertionEdited: true })}
        />
        {fromPrefill ? <small>{i18n._('home.exertionFromPrefill')}</small> : null}
      </label>
      <div className="field-row">
        <label>
          {i18n._('home.boulders')}
          <input
            type="number"
            min={0}
            value={draft.boulders}
            onChange={(e) => set({ boulders: e.target.value })}
          />
        </label>
        <label>
          {i18n._('home.routes')}
          <input
            type="number"
            min={0}
            value={draft.routes}
            onChange={(e) => set({ routes: e.target.value })}
          />
        </label>
        <label>
          {i18n._('home.duration')}
          <input
            type="number"
            min={0}
            value={draft.duration}
            onChange={(e) => set({ duration: e.target.value })}
          />
        </label>
      </div>
      <label>
        {i18n._('home.sessionType')}
        <select
          value={draft.sessionType}
          onChange={(e) => set({ sessionType: e.target.value as SessionType })}
        >
          {SESSION_TYPES.map((type) => (
            <option key={type} value={type}>
              {i18n._(`session.${type}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {i18n._('home.focus')}
        <select
          value={draft.primaryFocusId}
          onChange={(e) => set({ primaryFocusId: e.target.value })}
        >
          <option value="">{i18n._('home.focusNone')}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.label}
            </option>
          ))}
        </select>
      </label>
      <SecondaryFocus
        tags={tags.filter((tag) => tag.id !== draft.primaryFocusId)}
        selected={draft.secondaryFocusIds}
        onToggle={(id) => set({ secondaryFocusIds: toggleFocus(draft.secondaryFocusIds, id) })}
      />
      <GradeBreakdownEditor
        rows={draft.grades}
        defaultDiscipline={discipline}
        onChange={(grades) => set({ grades })}
      />
      <label>
        {i18n._('home.notes')}
        <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {errors.map((key) => (
        <p key={key} className="error">
          {i18n._(`home.invalid.${key}`)}
        </p>
      ))}
      {save.error && !dirty ? (
        <p className="error" role="alert">
          {problemFromUnknown(save.error)?.code === 'VERSION_CONFLICT'
            ? i18n._('home.conflict')
            : errorText(save.error, i18n._('error.generic'))}
        </p>
      ) : null}
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? i18n._('home.saving') : i18n._('home.save')}
      </button>
      {save.isSuccess && !dirty ? <span className="status">{i18n._('home.saved')}</span> : null}
    </form>
  );
}

function SecondaryFocus(props: {
  tags: FocusTag[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { i18n } = useLingui();
  return (
    <fieldset className="focus-picker">
      <legend>{i18n._('home.secondaryFocus')}</legend>
      {props.tags.map((tag) => (
        <label key={tag.id} className="chip">
          <input
            type="checkbox"
            checked={props.selected.includes(tag.id)}
            onChange={() => props.onToggle(tag.id)}
          />
          {tag.label}
        </label>
      ))}
    </fieldset>
  );
}
