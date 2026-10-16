import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';

import { useSaveSettings, useSettings } from '../hooks/queries.js';

const LINUX_DEFAULT = 'Climbing Coach Library in your home folder';
const MAC_DEFAULT = '~/Movies/Climbing Coach Library';

export function SetupPage() {
  const { i18n } = useLingui();
  const settings = useSettings();
  const save = useSaveSettings();
  const navigate = useNavigate();
  const suggested =
    settings.data?.libraryRoot ??
    (navigator.userAgent.includes('Mac') ? MAC_DEFAULT : LINUX_DEFAULT);

  return (
    <section className="panel">
      <h1>{i18n._('setup.title')}</h1>
      <p>{i18n._('setup.lede')}</p>
      <p>{i18n._('setup.privacy')}</p>
      <label>
        {i18n._('setup.path')}
        <input
          id="library-path"
          defaultValue={typeof suggested === 'string' ? suggested : ''}
        />
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
      {save.error ? <p className="error">{String(save.error)}</p> : null}
    </section>
  );
}
