import { useLingui } from '@lingui/react';
import { useState } from 'react';

import type { AlignmentVerdict } from '@climbing-coach/api';

import { errorText, translate } from '../../format.js';
import type { MoveSpan } from '../../hooks/compare/moves.js';
import { useAlignmentFeedback } from '../../hooks/compare/use-compare.js';

function AlignmentFeedbackButtons(props: { comparisonId: string; moveIndexA: number }) {
  const { i18n } = useLingui();
  const feedback = useAlignmentFeedback(props.comparisonId);
  const [saved, setSaved] = useState<AlignmentVerdict | null>(null);
  const send = (verdict: AlignmentVerdict) =>
    feedback.mutate(
      { moveIndexA: props.moveIndexA, verdict },
      { onSuccess: () => setSaved(verdict) },
    );
  return (
    <div className="feedback">
      <span>{i18n._('compare.feedback')}</span>
      {(['aligned', 'misaligned'] as const).map((verdict) => (
        <button
          key={verdict}
          type="button"
          className={saved === verdict ? undefined : 'ghost'}
          aria-pressed={saved === verdict}
          disabled={feedback.isPending}
          onClick={() => send(verdict)}
        >
          {i18n._(`compare.${verdict}`)}
        </button>
      ))}
      {saved ? <small>{i18n._('compare.feedbackSaved')}</small> : null}
      {feedback.error ? (
        <small className="error" role="alert">
          {errorText(feedback.error, i18n._('error.generic'))}
        </small>
      ) : null}
    </div>
  );
}

export type MovePanelProps = {
  comparisonId: string;
  spans: readonly MoveSpan[];
  currentMove: number | null;
  onSeek: (position: number) => void;
};

/** Per-move observations, current move first-class, with alignment feedback (PLAN 2.7–2.8). */
export function MoveDifferencePanel(props: MovePanelProps) {
  const { i18n } = useLingui();
  if (props.spans.length === 0) return <p>{i18n._('compare.noMoves')}</p>;
  return (
    <ol className="move-list">
      {props.spans.map(({ move, from }) => (
        <li
          key={move.moveIndexA}
          className={move.moveIndexA === props.currentMove ? 'move current' : 'move'}
        >
          <header>
            <button type="button" className="ghost" onClick={() => props.onSeek(from)}>
              {translate(i18n, 'compare.move', { n: move.moveIndexA + 1 })}
            </button>
            <small>
              {move.moveIndexB === null
                ? i18n._('compare.noCounterpart')
                : translate(i18n, 'compare.matched', { n: move.moveIndexB + 1 })}
            </small>
          </header>
          {move.differences.length === 0 ? (
            <p className="muted">
              {i18n._(move.moveIndexB === null ? 'compare.unmatchedHint' : 'compare.noDifferences')}
            </p>
          ) : (
            <ul>
              {move.differences.map((difference) => (
                <li key={difference.joint}>{difference.text}</li>
              ))}
            </ul>
          )}
          <AlignmentFeedbackButtons
            comparisonId={props.comparisonId}
            moveIndexA={move.moveIndexA}
          />
        </li>
      ))}
    </ol>
  );
}
