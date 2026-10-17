import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';

import type { FilmstripQuery, Recording, ReviewState } from '@climbing-coach/api';

import { errorText } from '../../format.js';
import {
  useActivity,
  useFilmstrip,
  useHealth,
  useLoupe,
  usePoseTracks,
  useRecording,
  useReprocess,
  useReviewState,
  useSelectTrack,
} from '../../hooks/queries.js';
import { ActivityLane } from './activity-lane.js';
import { isLive } from './draft.js';
import { canRedo, canUndo, isDirty } from './history.js';
import { ReviewList } from './review-list.js';
import { ReviewLoupe } from './review-loupe.js';
import { reprocessGate, reviewNotice } from './review-gate.js';
import { ReviewTimeline } from './review-timeline.js';
import { ReprocessPanel, ReviewToolbar } from './review-toolbar.js';
import { TrackPicker } from './track-picker.js';
import { useReviewCatalog } from './use-review-catalog.js';
import { FILMSTRIP_TILE_WIDTH, loupeCenterUs } from './timeline-math.js';
import { usePlayer } from './use-player.js';
import { useReviewEditor } from './use-review-editor.js';
import { useReviewKeys } from './use-review-keys.js';

/** Tiles across the whole recording; the strip scales them to the track width. */
const FILMSTRIP_TILES = 24;

function filmstripQuery(review: ReviewState, durationUs: number): FilmstripQuery | null {
  if (!review.processing.proxyReady || durationUs <= 0) return null;
  return { startUs: 0, endUs: durationUs, count: FILMSTRIP_TILES, width: FILMSTRIP_TILE_WIDTH };
}

function ReviewEditor({ recording, review }: { recording: Recording; review: ReviewState }) {
  const { i18n } = useLingui();
  const durationUs = review.durationUs ?? recording.durationUs ?? 0;
  const player = usePlayer(recording.proxyUrl, durationUs);
  const editor = useReviewEditor({
    recordingId: recording.id,
    server: review,
    durationUs,
    fps: recording.fps,
    player,
  });
  useReviewKeys(editor.onKey);
  const health = useHealth();
  const reprocess = useReprocess(recording.id);
  const ready = review.processing.complete;
  const activity = useActivity(recording.id, ready);
  const tracks = usePoseTracks(recording.id, ready);
  const selectTrack = useSelectTrack(recording.id);
  const catalog = useReviewCatalog();
  const filmstrip = useFilmstrip(recording.id, filmstripQuery(review, durationUs));
  const { selected, edge } = editor;
  const edgeUs = selected
    ? edge === 'start'
      ? selected.climb.startUs
      : selected.climb.endUs
    : null;
  const loupe = useLoupe(
    recording.id,
    edgeUs !== null && review.processing.proxyReady ? loupeCenterUs(edgeUs) : null,
  );
  const { state, saveStatus, saveError, flush } = editor.draft;
  const notice = reviewNotice(review.processing, editor.rows.filter(isLive).length);

  return (
    <>
      {recording.warnings.includes('camera_moving') ? (
        <p className="status">{i18n._('recordings.warning.camera_moving')}</p>
      ) : null}
      {notice ? <p className="status">{i18n._(notice)}</p> : null}
      {recording.proxyUrl ? (
        <div className="player-stage">
          <video ref={player.videoRef} className="player" src={recording.proxyUrl} preload="auto" />
        </div>
      ) : (
        <p>{i18n._('recordings.proxyWait')}</p>
      )}
      <TrackPicker
        tracks={tracks.data?.tracks ?? []}
        pending={selectTrack.isPending}
        error={selectTrack.error}
        onSelect={(trackId) => {
          void flush().then((clean) => {
            if (clean) selectTrack.mutate(trackId);
          });
        }}
      />
      <ReviewToolbar
        currentUs={player.currentUs}
        durationUs={durationUs}
        playing={player.playing}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        canSplit={editor.canSplit}
        canAdd={editor.canAdd}
        dirty={isDirty(state)}
        saveStatus={saveStatus}
        saveError={saveError}
        onPlay={player.toggle}
        onUndo={() => editor.draft.dispatch({ type: 'undo' })}
        onRedo={() => editor.draft.dispatch({ type: 'redo' })}
        onSplit={editor.split}
        onAdd={editor.add}
      />
      <ReviewTimeline
        rows={editor.rows}
        durationUs={durationUs}
        currentUs={player.currentUs}
        selectedId={state.selectedId}
        filmstrip={filmstrip.data}
        onSeek={player.seek}
        onSelect={(id) => editor.draft.dispatch({ type: 'select', id })}
        onDragEdge={editor.dragEdge}
      />
      <ActivityLane track={activity.data} durationUs={durationUs} />
      <p className="lede review-keys">{i18n._('review.keys')}</p>
      {selected ? (
        <ReviewLoupe
          row={selected}
          edge={edge}
          sprite={loupe.data}
          loading={loupe.isFetching && !loupe.data}
          onEdge={editor.setEdge}
          onPick={editor.pickFrame}
        />
      ) : null}
      <ReviewList
        rows={editor.rows}
        selectedId={state.selectedId}
        actions={{
          onSelect: editor.select,
          onOutcome: editor.outcome,
          onReject: editor.reject,
          onRestore: editor.restore,
          onMerge: editor.merge,
          onRating: editor.rating,
          boulders: catalog.boulders,
          onCreateBoulder: (input) =>
            catalog.createBoulder({ ...input, gymName: i18n._('review.defaultGym') }),
        }}
      />
      <ReprocessPanel
        gate={reprocessGate(health.data, review.processing)}
        pending={reprocess.isPending}
        error={reprocess.error}
        onReprocess={() => {
          void flush().then((clean) => {
            if (clean) reprocess.mutate('full');
          });
        }}
      />
    </>
  );
}

/** `/recordings/:id/review` (BUILD_PLAN §6): fix the proposed climbs before committing them. */
export function ReviewPage({ id }: { id: string }) {
  const { i18n } = useLingui();
  const recording = useRecording(id);
  const review = useReviewState(id, recording.data?.kind === 'original');
  const failure = recording.error ?? review.error;

  return (
    <section className="panel review">
      <p>
        <Link to="/recordings">{i18n._('review.back')}</Link>
      </p>
      <h1>
        {i18n._('review.title')}
        {recording.data ? ` — ${recording.data.fileName}` : ''}
      </h1>
      {failure ? (
        <p className="error" role="alert">
          {errorText(failure, i18n._('error.generic'))}
        </p>
      ) : null}
      {recording.data && recording.data.kind !== 'original' ? (
        <p>{i18n._('review.clipOnly')}</p>
      ) : null}
      {!recording.data || (recording.data.kind === 'original' && !review.data) ? (
        failure ? null : (
          <p>{i18n._('review.loading')}</p>
        )
      ) : null}
      {recording.data && review.data ? (
        <ReviewEditor recording={recording.data} review={review.data} />
      ) : null}
    </section>
  );
}
