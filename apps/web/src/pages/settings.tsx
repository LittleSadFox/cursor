import { useLingui } from '@lingui/react';
import { useState } from 'react';

import type { Settings } from '@climbing-coach/api';

import { errorText } from '../format.js';
import { useSaveSettings, useSettings } from '../hooks/queries.js';
import {
  GRADE_SYSTEMS,
  LOAD_METHODS,
  settingsDraft,
  settingsPatch,
  type SettingsDraft,
} from './settings-draft.js';

type SaveSettings = ReturnType<typeof useSaveSettings>;

export function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();
  if (!settings.data) return <section className="panel" aria-busy="true" />;
  // Remount on each saved version so the form shows what the server stored.
  return <SettingsForm key={settings.data.version} settings={settings.data} save={save} />;
}

function SettingsForm({ settings, save }: { settings: Settings; save: SaveSettings }) {
  const { i18n } = useLingui();
  const [draft, setDraft] = useState<SettingsDraft>(() => settingsDraft(settings));
  const [invalid, setInvalid] = useState(false);
  const movedLibrary = save.isSuccess && save.variables.libraryRoot !== undefined;
  const set = (patch: Partial<SettingsDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const patch = settingsPatch(draft, settings);
        setInvalid(patch === null);
        if (!patch) return;
        save.mutate(patch);
      }}
    >
      <h1>{i18n._('settings.title')}</h1>
      <label>
        {i18n._('settings.library')}
        <input value={draft.libraryRoot} onChange={(e) => set({ libraryRoot: e.target.value })} />
      </label>
      <label>
        {i18n._('settings.pre')}
        <input
          inputMode="decimal"
          value={draft.preSec}
          onChange={(e) => set({ preSec: e.target.value })}
        />
      </label>
      <label>
        {i18n._('settings.post')}
        <input
          inputMode="decimal"
          value={draft.postSec}
          onChange={(e) => set({ postSec: e.target.value })}
        />
      </label>
      <label>
        {i18n._('settings.grade')}
        <select
          value={draft.gradeSystem}
          onChange={(e) => set({ gradeSystem: e.target.value as Settings['gradeSystem'] })}
        >
          {GRADE_SYSTEMS.map((system) => (
            <option key={system} value={system}>
              {i18n._(`settings.grade.${system}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {i18n._('settings.load')}
        <select
          value={draft.loadMethod}
          onChange={(e) => set({ loadMethod: e.target.value as Settings['loadMethod'] })}
        >
          {LOAD_METHODS.map((method) => (
            <option key={method} value={method}>
              {i18n._(`settings.load.${method}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {i18n._('settings.retention')}
        <input
          inputMode="numeric"
          value={draft.retentionDays}
          onChange={(e) => set({ retentionDays: e.target.value })}
        />
      </label>
      {invalid ? <p className="error">{i18n._('settings.invalid')}</p> : null}
      {save.error ? (
        <p className="error" role="alert">
          {errorText(save.error, i18n._('error.generic'))}
        </p>
      ) : null}
      <button type="submit" disabled={save.isPending}>
        {i18n._('settings.save')}
      </button>
      {save.isSuccess ? <p className="status">{i18n._('settings.saved')}</p> : null}
      {movedLibrary ? <p className="status">{i18n._('settings.libraryRestart')}</p> : null}
    </form>
  );
}
