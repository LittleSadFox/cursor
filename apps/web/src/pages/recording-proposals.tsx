import type { Recording } from '@climbing-coach/api';
import { useLingui } from '@lingui/react';

import { errorText, translate } from '../format.js';
import { useCutRecording, useReviewItems } from '../hooks/queries.js';

function seconds(us: number): string {
  return (us / 1_000_000).toFixed(1);
}

export function RecordingProposals({
  recording,
  canCut,
}: {
  recording: Recording;
  canCut: boolean;
}) {
  const { i18n } = useLingui();
  const review = useReviewItems(recording.id, recording.jobStatus);
  const cut = useCutRecording();
  const busy = recording.jobStatus === 'queued' || recording.jobStatus === 'running';
  const items = review.data ?? [];

  return (
    <section>
      <h3>{i18n._('recordings.proposals')}</h3>
      {recording.warnings.includes('camera_moving') ? (
        <p className="status">{i18n._('recordings.warning.camera_moving')}</p>
      ) : null}
      {busy && items.length === 0 ? <p>{i18n._('recordings.proposalsWait')}</p> : null}
      {!busy && items.length === 0 ? (
        <p>
          {recording.hasPose
            ? i18n._('recordings.proposalsEmpty')
            : i18n._('recordings.proposalsPose')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="proposal-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {translate(i18n, 'recordings.proposalRange', {
                  start: seconds(item.climbStartUs),
                  end: seconds(item.climbEndUs),
                  outcome: i18n._(`recordings.outcome.${item.outcome}`),
                })}
              </span>
              {canCut ? (
                <button
                  type="button"
                  disabled={cut.isPending}
                  onClick={() =>
                    cut.mutate({
                      id: recording.id,
                      startUs: item.clipStartUs,
                      endUs: item.clipEndUs,
                      mode: 'auto',
                    })
                  }
                >
                  {cut.isPending ? i18n._('recordings.cutting') : i18n._('recordings.proposalCut')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {cut.error ? (
        <p className="error" role="alert">
          {errorText(cut.error, i18n._('error.generic'))}
        </p>
      ) : null}
    </section>
  );
}
