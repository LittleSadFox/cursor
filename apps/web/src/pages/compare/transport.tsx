import { useLingui } from '@lingui/react';

import type { SyncMode } from '../../hooks/compare/timeline.js';

import type { CompareLayout } from './scene.js';

export type TransportProps = {
  playing: boolean;
  position: number;
  durationUs: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
};

function seconds(us: number): string {
  return (us / 1_000_000).toFixed(1);
}

export function Transport(props: TransportProps) {
  const { i18n } = useLingui();
  return (
    <div className="transport">
      <button type="button" onClick={props.playing ? props.onPause : props.onPlay}>
        {i18n._(props.playing ? 'compare.pause' : 'compare.play')}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, props.durationUs)}
        step={10_000}
        value={props.position}
        aria-label={i18n._('compare.position')}
        onChange={(event) => props.onSeek(Number(event.target.value))}
      />
      <span className="transport-time">
        {seconds(props.position)} / {seconds(props.durationUs)} s
      </span>
    </div>
  );
}

export function SyncModeToggle(props: { mode: SyncMode; onChange: (mode: SyncMode) => void }) {
  const { i18n } = useLingui();
  return (
    <fieldset className="segmented">
      <legend>{i18n._('compare.mode')}</legend>
      {(['synced', 'realtime'] as const).map((mode) => (
        <label key={mode} className="chip">
          <input
            type="radio"
            name="sync-mode"
            checked={props.mode === mode}
            onChange={() => props.onChange(mode)}
          />
          {i18n._(`compare.mode.${mode}`)}
        </label>
      ))}
    </fieldset>
  );
}

export function LayoutToggle(props: {
  layout: CompareLayout;
  opacity: number;
  onLayout: (layout: CompareLayout) => void;
  onOpacity: (opacity: number) => void;
}) {
  const { i18n } = useLingui();
  return (
    <fieldset className="segmented">
      <legend>{i18n._('compare.layout')}</legend>
      {(['side_by_side', 'ghost'] as const).map((layout) => (
        <label key={layout} className="chip">
          <input
            type="radio"
            name="layout"
            checked={props.layout === layout}
            onChange={() => props.onLayout(layout)}
          />
          {i18n._(`compare.layout.${layout}`)}
        </label>
      ))}
      {props.layout === 'ghost' ? (
        <label className="chip">
          {i18n._('compare.opacity')}
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={props.opacity}
            onChange={(event) => props.onOpacity(Number(event.target.value))}
          />
        </label>
      ) : null}
    </fieldset>
  );
}
