import type { DerivedLabel, DraftItem } from './types.js';

function sameClimb(a: DraftItem, b: DraftItem): boolean {
  return a.climb.startUs === b.climb.startUs && a.climb.endUs === b.climb.endUs;
}

function isMerge(item: DraftItem): boolean {
  return item.source === 'merge' && item.parentIds.length >= 2;
}

/**
 * What happened to one detector item, from the live final rows that descend from it.
 * A sole descendant that merged several detector items is reported by its merge label.
 */
function labelForDetectorItem(
  original: DraftItem,
  live: readonly DraftItem[],
): DerivedLabel | null {
  const descendants = live.filter((item) => item.parentIds.includes(original.id));
  const [only] = descendants;
  if (!only) return { kind: 'rejected', itemId: original.id };
  if (descendants.length >= 2) {
    return { kind: 'split', fromId: original.id, intoIds: descendants.map((item) => item.id) };
  }
  if (isMerge(only) || sameClimb(original, only)) return null;
  return {
    kind: 'adjusted',
    itemId: original.id,
    startDeltaUs: only.climb.startUs - original.climb.startUs,
    endDeltaUs: only.climb.endUs - original.climb.endUs,
  };
}

function labelForFinalItem(item: DraftItem): DerivedLabel | null {
  if (item.parentIds.length === 0) return { kind: 'manual', itemId: item.id };
  if (isMerge(item)) return { kind: 'merged', fromIds: [...item.parentIds], intoId: item.id };
  return null;
}

/**
 * Compare the detector draft with the user's final draft. Padding is not included.
 * Rejected final rows count as removed. Lineage comes from `parentIds`.
 */
export function deriveLabels(
  detector: readonly DraftItem[],
  finalItems: readonly DraftItem[],
): DerivedLabel[] {
  const live = finalItems.filter((item) => !item.rejected);
  const labels = [
    ...detector.map((original) => labelForDetectorItem(original, live)),
    ...live.map(labelForFinalItem),
  ];
  return labels.filter((label): label is DerivedLabel => label !== null);
}
