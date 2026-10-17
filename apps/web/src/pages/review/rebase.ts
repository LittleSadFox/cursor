import type { ReviewItem } from '@climbing-coach/api';
import { mergeDetectorUpdate, rangesOverlap } from '@climbing-coach/engine';

import { fromServer, isEditable, sortRows, toDraftItem, type DraftRow } from './draft.js';

/** Untouched server proposals that may replace the local untouched ones. */
function incomingOf(server: readonly ReviewItem[], local: readonly DraftRow[]): DraftRow[] {
  const held = local.filter((row) => row.touched || row.status === 'rejected');
  const heldIds = new Set(held.map((row) => row.id));
  const rejected = held.filter((row) => row.status === 'rejected');
  return server
    .filter((item) => item.status === 'draft' && !item.touched && !heldIds.has(item.id))
    .map(fromServer)
    .filter((row) => !rejected.some((gone) => rangesOverlap(gone.climb, row.climb)));
}

/**
 * Local edits on top of a newer server review (after a 409, or a detector update while
 * the draft has unsaved edits). Touched and rejected local rows win, as in engine
 * `mergeDetectorUpdate`; committed rows always come from the server.
 */
export function rebaseDraft(local: readonly DraftRow[], server: readonly ReviewItem[]): DraftRow[] {
  const committed = server.filter((item) => item.status === 'committed').map(fromServer);
  const committedIds = new Set(committed.map((row) => row.id));
  const editable = local.filter((row) => isEditable(row) && !committedIds.has(row.id));
  const held = [...committed, ...editable];
  const incoming = incomingOf(server, editable);
  const byId = new Map([...held, ...incoming].map((row) => [row.id, row]));
  const merged = mergeDetectorUpdate(
    held.map((row) =>
      row.status === 'committed' ? { ...toDraftItem(row), touched: true } : toDraftItem(row),
    ),
    incoming.map(toDraftItem),
  );
  return sortRows(merged.flatMap((item) => byId.get(item.id) ?? []));
}
