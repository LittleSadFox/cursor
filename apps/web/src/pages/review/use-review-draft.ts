import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ProblemError, type ReviewSaved, type ReviewState } from '@climbing-coach/api';

import { api } from '../../api.js';
import { useSetReviewState } from '../../hooks/queries.js';
import { fromServer, toSaveItems } from './draft.js';
import type { NewId } from './draft-ops.js';
import {
  EMPTY_HISTORY,
  isDirty,
  reviewHistory,
  type HistoryAction,
  type ReviewHistory,
} from './history.js';
import { rebaseDraft } from './rebase.js';

/** BUILD_PLAN §6: autosave a second after the last edit. */
export const AUTOSAVE_DELAY_MS = 1_000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type ReviewDraft = {
  state: ReviewHistory;
  dispatch: (action: HistoryAction) => void;
  newId: NewId;
  saveStatus: SaveStatus;
  saveError: unknown;
  /** Saves now. Resolves true when the stored draft matches the editor. */
  flush: () => Promise<boolean>;
};

function isConflict(error: unknown): boolean {
  return error instanceof ProblemError && error.problem.code === 'REVIEW_REVISION_CONFLICT';
}

function withoutIdMap({ idMap: _idMap, ...state }: ReviewSaved): ReviewState {
  return state;
}

function useNewId(): NewId {
  const counter = useRef(0);
  return useCallback(() => {
    counter.current += 1;
    return `new-${Date.now().toString(36)}${counter.current.toString(36)}`;
  }, []);
}

/** Server state wins only while the draft has nothing unsaved; otherwise the next save rebases. */
function useAdoptServer(
  server: ReviewState | undefined,
  stateRef: { current: ReviewHistory },
  saving: { current: boolean },
  dispatch: (action: HistoryAction) => void,
) {
  useEffect(() => {
    if (!server) return;
    const current = stateRef.current;
    const stale = !current.loaded || server.revision > current.revision;
    if (!stale || isDirty(current) || saving.current) return;
    dispatch({ type: 'load', rows: server.items.map(fromServer), revision: server.revision });
  }, [server, stateRef, saving, dispatch]);
}

/**
 * Review draft with undo/redo and autosave (`PUT /recordings/:id/review`). A stale base
 * revision (409) refetches the review, rebases the local edits on it, and saves again.
 */
export function useReviewDraft(recordingId: string, server: ReviewState | undefined): ReviewDraft {
  const [state, dispatch] = useReducer(reviewHistory, EMPTY_HISTORY);
  const stateRef = useRef(state);
  stateRef.current = state;
  const saving = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<unknown>(null);
  const [failedSeq, setFailedSeq] = useState<number | null>(null);
  const setReviewState = useSetReviewState();
  const newId = useNewId();

  useAdoptServer(server, stateRef, saving, dispatch);

  const rebase = useCallback(async () => {
    const fresh = await api.review.get(recordingId);
    setReviewState(fresh);
    dispatch({
      type: 'rebased',
      rows: rebaseDraft(stateRef.current.present, fresh.items),
      revision: fresh.revision,
    });
  }, [recordingId, setReviewState]);

  const flush = useCallback(async () => {
    const current = stateRef.current;
    if (!current.loaded || saving.current) return false;
    if (!isDirty(current)) return true;
    saving.current = true;
    setSaveStatus('saving');
    try {
      const saved = await api.review.save(recordingId, {
        baseRevision: current.revision,
        items: toSaveItems(current.present),
      });
      dispatch({ type: 'saved', seq: current.seq, revision: saved.revision, idMap: saved.idMap });
      setReviewState(withoutIdMap(saved));
      setSaveError(null);
      setFailedSeq(null);
      setSaveStatus('saved');
      return true;
    } catch (error) {
      if (isConflict(error)) {
        await rebase().catch((reload: unknown) => setSaveError(reload));
        setSaveStatus('idle');
      } else {
        setSaveError(error);
        setFailedSeq(current.seq);
        setSaveStatus('error');
      }
      return false;
    } finally {
      saving.current = false;
    }
  }, [recordingId, rebase, setReviewState]);

  const pending = state.loaded && isDirty(state) && failedSeq !== state.seq;
  useEffect(() => {
    if (!pending || saveStatus === 'saving') return undefined;
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, state.seq, saveStatus, flush]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  return { state, dispatch, newId, saveStatus, saveError, flush };
}
