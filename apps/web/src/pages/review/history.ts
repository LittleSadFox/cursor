import type { DraftRow } from './draft.js';

/** Undo steps kept; older ones fall off the front. */
export const HISTORY_LIMIT = 100;

type Rows = readonly DraftRow[];

/**
 * Review editor state: an undo stack of whole-draft snapshots plus autosave bookkeeping.
 * `seq` counts changes to `present`; the draft is saved when `savedSeq` catches up.
 */
export type ReviewHistory = {
  past: readonly Rows[];
  present: Rows;
  future: readonly Rows[];
  seq: number;
  savedSeq: number;
  /** Server revision the next save is based on. */
  revision: number;
  loaded: boolean;
  selectedId: string | null;
};

export type HistoryAction =
  | { type: 'load'; rows: Rows; revision: number }
  | { type: 'edit'; apply: (rows: Rows) => Rows }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; seq: number; revision: number; idMap: Readonly<Record<string, string>> }
  | { type: 'rebased'; rows: Rows; revision: number }
  | { type: 'select'; id: string | null };

export const EMPTY_HISTORY: ReviewHistory = {
  past: [],
  present: [],
  future: [],
  seq: 0,
  savedSeq: 0,
  revision: 0,
  loaded: false,
  selectedId: null,
};

export function isDirty(state: ReviewHistory): boolean {
  return state.seq !== state.savedSeq;
}

export function canUndo(state: ReviewHistory): boolean {
  return state.past.length > 0;
}

export function canRedo(state: ReviewHistory): boolean {
  return state.future.length > 0;
}

function keepSelection(rows: Rows, id: string | null): string | null {
  return id !== null && rows.some((row) => row.id === id) ? id : null;
}

/** Server state replaces the draft and the undo stack; nothing is left to save. */
function load(state: ReviewHistory, rows: Rows, revision: number): ReviewHistory {
  const seq = state.seq + 1;
  return {
    ...EMPTY_HISTORY,
    present: rows,
    seq,
    savedSeq: seq,
    revision,
    loaded: true,
    selectedId: keepSelection(rows, state.selectedId),
  };
}

function edit(state: ReviewHistory, apply: (rows: Rows) => Rows): ReviewHistory {
  const next = apply(state.present);
  if (next === state.present) return state;
  return {
    ...state,
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    seq: state.seq + 1,
    selectedId: keepSelection(next, state.selectedId),
  };
}

function step(state: ReviewHistory, direction: 'undo' | 'redo'): ReviewHistory {
  const from = direction === 'undo' ? state.past : state.future;
  const target = from[from.length - 1];
  if (!target) return state;
  const rest = from.slice(0, -1);
  const pushed = direction === 'undo' ? state.future : state.past;
  const moved = [...pushed, state.present];
  return {
    ...state,
    past: direction === 'undo' ? rest : moved,
    future: direction === 'undo' ? moved : rest,
    present: target,
    seq: state.seq + 1,
    selectedId: keepSelection(target, state.selectedId),
  };
}

function remapRows(rows: Rows, idMap: Readonly<Record<string, string>>): Rows {
  if (!rows.some((row) => idMap[row.id])) return rows;
  return rows.map((row) => {
    const id = idMap[row.id];
    return id ? { ...row, id } : row;
  });
}

/** Stored ids replace temporary ones everywhere, so undo keeps naming the saved rows. */
function saved(
  state: ReviewHistory,
  seq: number,
  revision: number,
  idMap: Readonly<Record<string, string>>,
): ReviewHistory {
  const selected = state.selectedId === null ? null : (idMap[state.selectedId] ?? state.selectedId);
  return {
    ...state,
    past: state.past.map((rows) => remapRows(rows, idMap)),
    present: remapRows(state.present, idMap),
    future: state.future.map((rows) => remapRows(rows, idMap)),
    savedSeq: Math.max(state.savedSeq, seq),
    revision,
    selectedId: selected,
  };
}

/** A rebased draft must still be saved, but its old undo steps no longer apply. */
function rebased(state: ReviewHistory, rows: Rows, revision: number): ReviewHistory {
  return {
    ...state,
    past: [],
    present: rows,
    future: [],
    seq: state.seq + 1,
    revision,
    loaded: true,
    selectedId: keepSelection(rows, state.selectedId),
  };
}

export function reviewHistory(state: ReviewHistory, action: HistoryAction): ReviewHistory {
  switch (action.type) {
    case 'load':
      return load(state, action.rows, action.revision);
    case 'edit':
      return edit(state, action.apply);
    case 'undo':
    case 'redo':
      return step(state, action.type);
    case 'saved':
      return saved(state, action.seq, action.revision, action.idMap);
    case 'rebased':
      return rebased(state, action.rows, action.revision);
    case 'select':
      return { ...state, selectedId: keepSelection(state.present, action.id) };
  }
}
