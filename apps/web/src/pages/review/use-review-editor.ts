import { useCallback, useRef, useState } from 'react';

import type { ReviewState } from '@climbing-coach/api';
import type { AttemptOutcome } from '@climbing-coach/schema';

import type { DraftRow } from './draft.js';
import {
  addAt,
  addRange,
  canSplitAt,
  clampEdge,
  itemAt,
  mergePartner,
  mergeWithNext,
  moveEdge,
  rejectItem,
  restoreItem,
  setOutcome,
  splitAt,
  stepItem,
  type Edge,
  type NewId,
} from './draft-ops.js';
import type { ReviewKeyAction } from './keymap.js';
import type { EdgeDrag } from './review-timeline.js';
import { frameUs, JUMP_US } from './timeline-math.js';
import type { Player } from './use-player.js';
import { useReviewDraft, type ReviewDraft } from './use-review-draft.js';

/** Seeks while dragging a handle at most this often, so the decoder keeps up. */
const DRAG_SEEK_MS = 100;

type Drag = { id: string; edge: Edge; tUs: number };

/** Hands out pre-made ids in order; a fresh copy per call keeps a reducer re-run pure. */
function idsFrom(ids: readonly string[]): NewId {
  let next = 0;
  return () => ids[next++] ?? ids[ids.length - 1] ?? 'new-0';
}

export type ReviewEditor = {
  draft: ReviewDraft;
  /** Draft rows with any in-progress handle drag applied. */
  rows: readonly DraftRow[];
  selected: DraftRow | null;
  edge: Edge;
  canSplit: boolean;
  canAdd: boolean;
  setEdge: (edge: Edge) => void;
  select: (row: DraftRow) => void;
  dragEdge: EdgeDrag;
  pickFrame: (tUs: number) => void;
  split: () => void;
  add: () => void;
  reject: (id: string) => void;
  restore: (id: string) => void;
  merge: (id: string) => void;
  outcome: (id: string, outcome: AttemptOutcome) => void;
  onKey: (action: ReviewKeyAction) => void;
};

type EditorInput = {
  recordingId: string;
  server: ReviewState | undefined;
  durationUs: number;
  fps: number | null;
  player: Player;
};

/** Review page controller: draft edits, handle drags, and keyboard actions in one place. */
export function useReviewEditor({
  recordingId,
  server,
  durationUs,
  fps,
  player,
}: EditorInput): ReviewEditor {
  const draft = useReviewDraft(recordingId, server);
  const { state, dispatch, newId } = draft;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [edge, setEdge] = useState<Edge>('start');
  const lastSeek = useRef(0);
  const present = state.present;
  const rows = drag ? moveEdge(present, drag.id, drag.edge, drag.tUs, durationUs) : present;
  const selected = rows.find((row) => row.id === state.selectedId) ?? null;
  const at = player.currentUs;

  const edit = useCallback(
    (apply: (rows: readonly DraftRow[]) => readonly DraftRow[]) =>
      dispatch({ type: 'edit', apply }),
    [dispatch],
  );
  const selectId = useCallback((id: string | null) => dispatch({ type: 'select', id }), [dispatch]);

  const select = (row: DraftRow) => {
    selectId(row.id);
    player.seek(row.climb.startUs);
  };

  const dragEdge: EdgeDrag = (id, which, tUs, done) => {
    setEdge(which);
    const clamped = clampEdge(present, id, which, tUs, durationUs);
    if (done) {
      setDrag(null);
      edit((current) => moveEdge(current, id, which, clamped, durationUs));
      player.seek(clamped);
      return;
    }
    setDrag({ id, edge: which, tUs: clamped });
    const now = performance.now();
    if (now - lastSeek.current >= DRAG_SEEK_MS) {
      lastSeek.current = now;
      player.seek(clamped);
    }
  };

  const pickFrame = (tUs: number) => {
    if (!selected) return;
    edit((current) => moveEdge(current, selected.id, edge, tUs, durationUs));
    player.seek(tUs);
  };

  const mark = (which: Edge) => {
    const target = selected ?? itemAt(present, at);
    if (!target) return;
    setEdge(which);
    selectId(target.id);
    edit((current) => moveEdge(current, target.id, which, at, durationUs));
  };

  const split = () => {
    if (!canSplitAt(present, at)) return;
    const ids = [newId(), newId()];
    edit((current) => splitAt(current, at, idsFrom(ids)));
    selectId(ids[1] ?? null);
  };

  const add = () => {
    if (!addRange(present, at, durationUs)) return;
    const id = newId();
    edit((current) => addAt(current, at, durationUs, idsFrom([id])));
    selectId(id);
  };

  const merge = (id: string) => {
    if (!mergePartner(present, id)) return;
    const merged = newId();
    edit((current) => mergeWithNext(current, id, idsFrom([merged])));
    selectId(merged);
  };

  const reject = (id: string) => edit((current) => rejectItem(current, id));
  const restore = (id: string) => edit((current) => restoreItem(current, id));
  const outcome = (id: string, value: AttemptOutcome) =>
    edit((current) => setOutcome(current, id, value));

  const next = (direction: 1 | -1) => {
    const id = stepItem(present, state.selectedId, direction);
    const row = present.find((candidate) => candidate.id === id);
    if (row) select(row);
  };

  const onKey = (action: ReviewKeyAction) => {
    switch (action.type) {
      case 'play':
        return player.toggle();
      case 'frame':
        return player.seek(at + action.step * frameUs(fps));
      case 'jump':
        return player.seek(at + action.step * JUMP_US);
      case 'mark':
        return mark(action.edge);
      case 'split':
        return split();
      case 'reject':
        return state.selectedId ? reject(state.selectedId) : undefined;
      case 'next':
        return next(action.direction);
      case 'undo':
      case 'redo':
        return dispatch({ type: action.type });
    }
  };

  return {
    draft,
    rows,
    selected,
    edge,
    canSplit: canSplitAt(present, at),
    canAdd: addRange(present, at, durationUs) !== null,
    setEdge,
    select,
    dragEdge,
    pickFrame,
    split,
    add,
    reject,
    restore,
    merge,
    outcome,
    onKey,
  };
}
