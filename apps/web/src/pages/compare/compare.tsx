import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { CompareView } from './compare-view.js';
import { compareSearch, type CompareSearch } from './search.js';

/** Attempt ID entry until the attempt library (P2-B/P2-C) offers "Compare with…". */
function ComparePicker(props: CompareSearch) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const [a, setA] = useState(props.a ?? '');
  const [b, setB] = useState(props.b ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void navigate({ to: '/compare', search: compareSearch({ a, b }) });
  };
  return (
    <form className="compare-picker" onSubmit={submit}>
      <p className="lede">{i18n._('compare.pickLede')}</p>
      <label>
        {i18n._('compare.attemptA')}
        <input value={a} onChange={(event) => setA(event.target.value)} />
      </label>
      <label>
        {i18n._('compare.attemptB')}
        <input value={b} onChange={(event) => setB(event.target.value)} />
      </label>
      <button type="submit" disabled={a.trim() === '' || b.trim() === ''}>
        {i18n._('compare.start')}
      </button>
    </form>
  );
}

export function ComparePage(props: CompareSearch) {
  const { i18n } = useLingui();
  return (
    <section className="compare-page">
      <h1>{i18n._('compare.title')}</h1>
      {props.a && props.b ? (
        <CompareView key={`${props.a}:${props.b}`} attemptAId={props.a} attemptBId={props.b} />
      ) : (
        <ComparePicker {...props} />
      )}
    </section>
  );
}
