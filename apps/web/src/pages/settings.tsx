import { useLingui } from '@lingui/react';
import { useEffect, useState } from 'react';

import { useSaveSettings, useSettings } from '../hooks/queries.js';

export function SettingsPage() {
  const { i18n } = useLingui();
  const settings = useSettings();
  const save = useSaveSettings();
  const [libraryRoot, setLibraryRoot] = useState('');
  const [preSec, setPreSec] = useState('2');
  const [postSec, setPostSec] = useState('1.5');
  const [gradeSystem, setGradeSystem] = useState('v');
  const [loadMethod, setLoadMethod] = useState('rolling');
  const [retention, setRetention] = useState('30');

  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    setLibraryRoot(data.libraryRoot ?? '');
    setPreSec(String(data.prePadUs / 1_000_000));
    setPostSec(String(data.postPadUs / 1_000_000));
    setGradeSystem(data.gradeSystem);
    setLoadMethod(data.loadMethod);
    setRetention(String(data.trashRetentionDays));
  }, [settings.data]);

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void save.mutateAsync({
          libraryRoot: libraryRoot === '' ? null : libraryRoot,
          prePadUs: Math.round(Number(preSec) * 1_000_000),
          postPadUs: Math.round(Number(postSec) * 1_000_000),
          gradeSystem: gradeSystem as 'v' | 'font' | 'yds' | 'french',
          loadMethod: loadMethod as 'rolling' | 'ewma',
          trashRetentionDays: Number(retention),
          expectedVersion: settings.data?.version,
        });
      }}
    >
      <h1>{i18n._('settings.title')}</h1>
      <label>
        {i18n._('settings.library')}
        <input value={libraryRoot} onChange={(event) => setLibraryRoot(event.target.value)} />
      </label>
      <label>
        {i18n._('settings.pre')}
        <input value={preSec} onChange={(event) => setPreSec(event.target.value)} />
      </label>
      <label>
        {i18n._('settings.post')}
        <input value={postSec} onChange={(event) => setPostSec(event.target.value)} />
      </label>
      <label>
        {i18n._('settings.grade')}
        <select value={gradeSystem} onChange={(event) => setGradeSystem(event.target.value)}>
          <option value="v">V-scale</option>
          <option value="font">Fontainebleau</option>
          <option value="yds">YDS</option>
          <option value="french">French</option>
        </select>
      </label>
      <label>
        {i18n._('settings.load')}
        <select value={loadMethod} onChange={(event) => setLoadMethod(event.target.value)}>
          <option value="rolling">rolling</option>
          <option value="ewma">ewma</option>
        </select>
      </label>
      <label>
        {i18n._('settings.retention')}
        <input value={retention} onChange={(event) => setRetention(event.target.value)} />
      </label>
      <button type="submit">{i18n._('settings.save')}</button>
    </form>
  );
}
