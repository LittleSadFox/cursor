import type { DerivedLabel, DraftItem } from './types.js';

function sameClimb(a: DraftItem, b: DraftItem): boolean {
  return a.climb.startUs === b.climb.startUs && a.climb.endUs === b.climb.endUs;
}

/** Compare the detector draft with the user's final draft. Padding is not included. */
export function deriveLabels(
  detector: readonly DraftItem[],
  finalItems: readonly DraftItem[],
): DerivedLabel[] {
  const labels: DerivedLabel[] = [];
  const finalById = new Map(finalItems.map((item) => [item.id, item]));
  const detectorIds = new Set(detector.map((item) => item.id));

  for (const original of detector) {
    const finalItem = finalById.get(original.id);
    if (!finalItem || finalItem.rejected) {
      const splitChildren = finalItems.filter(
        (item) => item.source === 'split' && item.parentIds.includes(original.id),
      );
      const mergedChild = finalItems.find(
        (item) => item.source === 'merge' && item.parentIds.includes(original.id),
      );
      if (splitChildren.length >= 2) {
        labels.push({
          kind: 'split',
          fromId: original.id,
          intoIds: splitChildren.map((item) => item.id),
        });
      } else if (!mergedChild) {
        labels.push({ kind: 'rejected', itemId: original.id });
      }
      continue;
    }
    if (!sameClimb(original, finalItem)) {
      labels.push({
        kind: 'adjusted',
        itemId: original.id,
        startDeltaUs: finalItem.climb.startUs - original.climb.startUs,
        endDeltaUs: finalItem.climb.endUs - original.climb.endUs,
      });
    }
  }

  const mergeEmitted = new Set<string>();
  for (const item of finalItems) {
    if (item.source === 'manual' && !detectorIds.has(item.id)) {
      labels.push({ kind: 'manual', itemId: item.id });
    }
    if (item.source === 'merge' && !mergeEmitted.has(item.id)) {
      mergeEmitted.add(item.id);
      labels.push({ kind: 'merged', fromIds: [...item.parentIds], intoId: item.id });
    }
  }
  return labels;
}
