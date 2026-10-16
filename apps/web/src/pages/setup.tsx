import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';

import { errorText } from '../format.js';
import { useSaveSettings, useSettings } from '../hooks/queries.js';

export function SetupPage() {
  const { i18n } = useLingui();
  const settings = useSettings();
  const save = useSaveSettings();
  const navigate = useNavigate();
  const suggested =
    settings.data?.libraryRoot ??
    i18n._(navigator.userAgent.includes('Mac') ? 'setup.defaultMac' : 'setup.defaultOther');

  return (
    <section className="panel">
      <h1>{i18n._('setup.title')}</h1>
      <p>{i18n._('setup.lede')}</p>
      <p>{i18n._('setup.privacy')}</p>
      <label>
        {i18n._('setup.path')}
        <input id="library-path" defaultValue={typeof suggested === 'string' ? suggested : ''} />
      </label>
      <button
        type="button"
        onClick={() => {
          const input = document.getElementById('library-path') as HTMLInputElement | null;
          const libraryRoot = input?.value.trim();
          if (!libraryRoot) return;
          void save.mutateAsync({ libraryRoot }).then(() => navigate({ to: '/' }));
        }}
      >
        {i18n._('setup.confirm')}
      </button>
      {save.error ? (
        <p className="error">{errorText(save.error, i18n._('error.generic'))}</p>
      ) : null}
    </section>
  );
}
