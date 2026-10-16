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

import { useState } from 'react';

import { type RangeKey } from '../dates.js';
import { formatMessage } from '../format.js';
import { useFocusTags, useSettings, useStats } from '../hooks/queries.js';
import { focusCountsText, formatRatio } from './charts-copy.js';

const RANGES: RangeKey[] = ['week', '4weeks', '3months', 'year', 'all'];

export function HomeCharts() {
  const { i18n } = useLingui();
  const settings = useSettings();
  const tags = useFocusTags().data ?? [];
  const [range, setRange] = useState<RangeKey>('4weeks');
  const stats = useStats(range, settings.data?.loadMethod ?? 'rolling');
  const loadDays = stats.load.data?.days ?? [];
  const volume = stats.volume.data ?? [];
  const focus = stats.focus.data ?? [];
  const pyramid = stats.pyramid.data ?? [];
  const weekly = stats.weekly.data;
  const latest = loadDays.at(-1);

  return (
    <section className="charts">
      <div className="charts-head">
        <h2>{i18n._('home.charts')}</h2>
        <label>
          {i18n._('home.range')}
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)}>
            {RANGES.map((key) => (
              <option key={key} value={key}>
                {i18n._(`range.${key}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="lede">{i18n._('home.guidance')}</p>
      {weekly ? (
        <p>
          {formatMessage(i18n._('home.weeklySummary'), {
            label: i18n._('home.weekly'),
            sessions: weekly.sessions,
            load: weekly.totalLoad === null ? null : Math.round(weekly.totalLoad),
            hardest: weekly.hardestSend,
          })}
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
        {formatMessage(i18n._('home.acwrValue'), {
          label: i18n._('home.acwr'),
          value: formatRatio(latest?.acwr ?? null),
          band: i18n._(`band.${latest?.band ?? 'insufficient_data'}`),
        })}
      </p>
      <h3>{i18n._('home.volume')}</h3>
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="volume" name={i18n._('home.volumeAxis')} />
            <YAxis dataKey="exertion" name={i18n._('home.exertionAxis')} domain={[0, 10]} />
            <Tooltip />
            <Scatter data={volume} fill="var(--accent)" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <h3>{i18n._('home.focusDist')}</h3>
      {focus.length === 0 ? <p className="lede">{i18n._('home.empty')}</p> : null}
      <ul>
        {focus.map((bucket) => (
          <li key={bucket.bucket}>
            {bucket.bucket}: {focusCountsText(bucket.counts, tags)}
          </li>
        ))}
      </ul>
      <h3>{i18n._('home.pyramid')}</h3>
      {pyramid.length === 0 ? <p className="lede">{i18n._('home.empty')}</p> : null}
      <ul>
        {pyramid.map((row) => (
          <li key={`${row.discipline}:${row.grade}`}>
            {formatMessage(i18n._('home.pyramidRow'), row)}
          </li>
        ))}
      </ul>
    </section>
  );
}
