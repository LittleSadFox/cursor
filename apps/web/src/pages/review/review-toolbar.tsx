import { useLingui } from '@lingui/react';

import { errorText } from '../../format.js';
import type { ReprocessGate } from './review-gate.js';
import type { SaveStatus } from './use-review-draft.js';
import { formatSeconds } from './timeline-math.js';

export type ToolbarProps = {
  currentUs: number;
  durationUs: number;
  playing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  canAdd: boolean;
  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: unknown;
  onPlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onAdd: () => void;
};

function saveLabel(status: SaveStatus, dirty: boolean): string {
  if (status === 'saving') return 'review.saving';
  if (status === 'error') return 'review.saveFailed';
  return dirty ? 'review.unsaved' : 'review.saved';
}

/** CommitBar without commit (P2-B.3): playback, undo/redo, split, add, and save state. */
export function ReviewToolbar(props: ToolbarProps) {
  const { i18n } = useLingui();
  return (
    <div className="review-toolbar" role="toolbar" aria-label={i18n._('review.tools')}>
      <button type="button" onClick={props.onPlay}>
        {i18n._(props.playing ? 'review.pause' : 'review.play')}
      </button>
      <span className="review-clock">
        {formatSeconds(props.currentUs)} / {formatSeconds(props.durationUs)} s
      </span>
      <button type="button" className="ghost" disabled={!props.canUndo} onClick={props.onUndo}>
        {i18n._('review.undo')}
      </button>
      <button type="button" className="ghost" disabled={!props.canRedo} onClick={props.onRedo}>
        {i18n._('review.redo')}
      </button>
      <button type="button" className="ghost" disabled={!props.canSplit} onClick={props.onSplit}>
        {i18n._('review.split')}
      </button>
      <button type="button" className="ghost" disabled={!props.canAdd} onClick={props.onAdd}>
        {i18n._('review.add')}
      </button>
      <span className={props.saveStatus === 'error' ? 'error' : 'lede'} role="status">
        {i18n._(saveLabel(props.saveStatus, props.dirty))}
        {props.saveStatus === 'error' ? ` ${errorText(props.saveError, '')}` : ''}
      </span>
    </div>
  );
}

/** The recovery path when the activity gate skipped a slow climb: pose every frame. */
export function ReprocessPanel({
  gate,
  pending,
  error,
  onReprocess,
}: {
  gate: ReprocessGate;
  pending: boolean;
  error: unknown;
  onReprocess: () => void;
}) {
  const { i18n } = useLingui();
  return (
    <section className="review-reprocess">
      <p className="lede">{i18n._('review.reprocessLede')}</p>
      <button type="button" disabled={gate !== 'ready' || pending} onClick={onReprocess}>
        {i18n._(gate === 'busy' || pending ? 'review.reprocessing' : 'review.reprocess')}
      </button>
      {gate === 'ffmpeg-missing' || gate === 'pose-missing' ? (
        <p className="status">{i18n._(`review.reprocessGate.${gate}`)}</p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {errorText(error, i18n._('error.generic'))}
        </p>
      ) : null}
    </section>
  );
}
