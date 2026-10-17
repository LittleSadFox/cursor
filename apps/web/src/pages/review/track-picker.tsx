import { useLingui } from '@lingui/react';

import type { PosePerson } from '@climbing-coach/api';

import { errorText, translate } from '../../format.js';
import { formatSeconds } from './timeline-math.js';

/** "Wrong climber?": pick which person the detector follows. Hidden for a single track. */
export function TrackPicker({
  tracks,
  pending,
  error,
  onSelect,
}: {
  tracks: readonly PosePerson[];
  pending: boolean;
  error: unknown;
  onSelect: (trackId: string) => void;
}) {
  const { i18n } = useLingui();
  if (tracks.length < 2) return null;
  const selected = tracks.find((track) => track.selected)?.trackId ?? '';
  return (
    <div className="review-tracks">
      <label className="review-inline">
        {i18n._('review.track')}
        <select
          value={selected}
          disabled={pending}
          onChange={(event) => {
            if (event.target.value !== selected) onSelect(event.target.value);
          }}
        >
          {tracks.map((track, index) => (
            <option key={track.trackId} value={track.trackId}>
              {translate(i18n, 'review.track.person', {
                n: index + 1,
                start: formatSeconds(track.startUs),
                end: formatSeconds(track.endUs),
              })}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <span className="error" role="alert">
          {errorText(error, i18n._('error.generic'))}
        </span>
      ) : null}
    </div>
  );
}
