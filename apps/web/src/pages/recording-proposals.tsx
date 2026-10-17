import type { Recording, ReviewItem } from '@climbing-coach/api';
import { useLingui } from '@lingui/react';

import { errorText, translate } from '../format.js';
import { useCutRecording, useReviewItems } from '../hooks/queries.js';
import { proposalNotice, visibleProposals } from './recording-proposals-state.js';

function seconds(us: number): string {
  return (us / 1_000_000).toFixed(1);
}

function ProposalRow({
  item,
  canCut,
  cutting,
  onCut,
}: {
  item: ReviewItem;
  canCut: boolean;
  cutting: boolean;
  onCut: (item: ReviewItem) => void;
}) {
  const { i18n } = useLingui();
  return (
    <li>
      <span>
        {translate(i18n, 'recordings.proposalRange', {
          start: seconds(item.climbStartUs),
          end: seconds(item.climbEndUs),
          outcome: i18n._(`recordings.outcome.${item.outcome}`),
        })}
      </span>
      {canCut ? (
        <button type="button" disabled={cutting} onClick={() => onCut(item)}>
          {cutting ? i18n._('recordings.cutting') : i18n._('recordings.proposalCut')}
        </button>
      ) : null}
    </li>
  );
}

/** Detector proposals for an original recording. Clips never run detection, so they show nothing. */
export function RecordingProposals({
  recording,
  canCut,
}: {
  recording: Recording;
  canCut: boolean;
}) {
  const { i18n } = useLingui();
  const review = useReviewItems(recording);
  const cut = useCutRecording();
  if (recording.kind !== 'original') return null;
  const items = visibleProposals(review.data ?? []);
  const notice = proposalNotice(recording, items.length);

  return (
    <section>
      <h3>{i18n._('recordings.proposals')}</h3>
      {recording.warnings.includes('camera_moving') ? (
        <p className="status">{i18n._('recordings.warning.camera_moving')}</p>
      ) : null}
      {notice ? <p>{i18n._(notice)}</p> : null}
      {items.length > 0 ? (
        <ul className="proposal-list">
          {items.map((item) => (
            <ProposalRow
              key={item.id}
              item={item}
              canCut={canCut}
              cutting={cut.isPending}
              onCut={(picked) =>
                cut.mutate({
                  id: recording.id,
                  startUs: picked.clipStartUs,
                  endUs: picked.clipEndUs,
                  mode: 'auto',
                })
              }
            />
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
