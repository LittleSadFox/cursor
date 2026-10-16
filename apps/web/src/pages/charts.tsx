import { useLingui } from '@lingui/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useSettings, useStats } from '../hooks/queries.js';
import { type RangeKey } from '../dates.js';
import { useState } from 'react';

const RANGES: RangeKey[] = ['week', '4weeks', '3months', 'year', 'all'];

export function HomeCharts() {
  const { i18n } = useLingui();
  const settings = useSettings();
  const [range, setRange] = useState<RangeKey>('4weeks');
  const stats = useStats(range, settings.data?.loadMethod ?? 'rolling');
  const loadDays = stats.load.data?.days ?? [];
  const volume = stats.volume.data ?? [];
  const focus = stats.focus.data ?? [];
  const pyramid = stats.pyramid.data ?? [];
  const weekly = stats.weekly.data;

  return (
    <section className="charts">
      <div className="charts-head">
        <h2>{i18n._('home.charts')}</h2>
        <label>
          {i18n._('home.range')}
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)}>
            {RANGES.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="lede">{i18n._('home.guidance')}</p>
      {weekly ? (
        <p>
          {i18n._('home.weekly')}: {weekly.sessions} sessions, load {weekly.totalLoad ?? '—'}, hardest{' '}
          {weekly.hardestSend ?? '—'}
        </p>
      ) : null}
      <h3>{i18n._('home.load')}</h3>
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={loadDays}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" hide />
            <YAxis />
            <Tooltip />
            <Bar dataKey="load" fill="var(--accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p>
        {i18n._('home.acwr')}: {loadDays.at(-1)?.acwr ?? '—'} ({loadDays.at(-1)?.band ?? 'insufficient_data'})
      </p>
      <h3>{i18n._('home.volume')}</h3>
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="volume" name="volume" />
            <YAxis dataKey="exertion" name="exertion" />
            <Tooltip />
            <Scatter data={volume} fill="var(--accent)" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <h3>{i18n._('home.focusDist')}</h3>
      <ul>
        {focus.map((bucket) => (
          <li key={bucket.bucket}>
            {bucket.bucket}: {JSON.stringify(bucket.counts)}
          </li>
        ))}
      </ul>
      <h3>{i18n._('home.pyramid')}</h3>
      <ul>
        {pyramid.map((row) => (
          <li key={row.grade}>
            {row.grade}: {row.sent} sends / {row.attempted} attempts
          </li>
        ))}
      </ul>
    </section>
  );
}
