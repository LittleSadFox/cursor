import { useLingui } from '@lingui/react';
import { useEffect, useState } from 'react';

import type { SessionType, TrainingLogInput } from '@climbing-coach/api';

import { useFocusTags, useSaveToday, useToday } from '../hooks/queries.js';
import { formatPrefillBasis } from './prefill-copy.js';

const SESSION_TYPES: SessionType[] = ['climbing', 'board', 'hangboard', 'gym', 'cardio', 'rest'];

export function TodayEntryForm() {
  const { i18n } = useLingui();
  const day = useToday();
  const tags = useFocusTags();
  const save = useSaveToday();
  const [exertion, setExertion] = useState('7');
  const [boulders, setBoulders] = useState('0');
  const [routes, setRoutes] = useState('0');
  const [duration, setDuration] = useState('90');
  const [sessionType, setSessionType] = useState<SessionType>('climbing');
  const [focus, setFocus] = useState('strength');
  const [notes, setNotes] = useState('');
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    const entry = day.data?.entry;
    const prefill = day.data?.prefill;
    if (entry) {
      setExertion(String(entry.sessionExertion ?? ''));
      setBoulders(String(entry.boulderCount));
      setRoutes(String(entry.routeCount));
      setDuration(String(entry.durationMin ?? ''));
      setSessionType(entry.sessionType);
      setFocus(entry.primaryFocusId ?? 'strength');
      setNotes(entry.notes);
      return;
    }
    if (prefill && !overridden) {
      if (prefill.sessionExertion !== null) setExertion(String(prefill.sessionExertion));
      setBoulders(String(prefill.boulderCount));
    }
  }, [day.data, overridden]);

  const basis = day.data?.prefill.basis;
  const input: TrainingLogInput = {
    tzOffsetMin: new Date().getTimezoneOffset() * -1,
    sessionExertion: exertion === '' ? null : Number(exertion),
    exertionSource: overridden ? 'user' : 'prefill',
    boulderCount: Number(boulders),
    routeCount: Number(routes),
    durationMin: duration === '' ? null : Number(duration),
    sessionType,
    primaryFocusId: focus,
    secondaryFocusIds: [],
    grades: day.data?.prefill.grades ?? [],
    notes,
  };

  return (
    <form
      className="today-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save.mutateAsync(input);
      }}
    >
      <h1>{i18n._('home.title')}</h1>
      <p className="lede">
        {formatPrefillBasis(
          basis ?? { attempts: 0, mean: null, max: null },
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
          value={exertion}
          onChange={(event) => {
            setOverridden(true);
            setExertion(event.target.value);
          }}
        />
      </label>
      <label>
        {i18n._('home.boulders')}
        <input type="number" min={0} value={boulders} onChange={(event) => setBoulders(event.target.value)} />
      </label>
      <label>
        {i18n._('home.routes')}
        <input type="number" min={0} value={routes} onChange={(event) => setRoutes(event.target.value)} />
      </label>
      <label>
        {i18n._('home.duration')}
        <input type="number" min={0} value={duration} onChange={(event) => setDuration(event.target.value)} />
      </label>
      <label>
        {i18n._('home.sessionType')}
        <select value={sessionType} onChange={(event) => setSessionType(event.target.value as SessionType)}>
          {SESSION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        {i18n._('home.focus')}
        <select value={focus} onChange={(event) => setFocus(event.target.value)}>
          {(tags.data ?? []).map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {i18n._('home.notes')}
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <button type="submit" disabled={save.isPending}>
        {save.isSuccess ? i18n._('home.saved') : i18n._('home.save')}
      </button>
    </form>
  );
}
