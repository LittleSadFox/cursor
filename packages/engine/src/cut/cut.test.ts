import { describe, expect, it } from 'vitest';

import { createMulberry32 } from '../eval/rng.js';
import type { AttemptDetection } from '../detect/types.js';
import {
  clipRangeOf,
  manualItem,
  mergeDetectorUpdate,
  mergeItems,
  proposeItems,
  splitItem,
  validateDraft,
} from './draft.js';
import { deriveLabels } from './labels.js';
import type { DraftItem } from './types.js';

function attempt(startUs: number, endUs: number): AttemptDetection {
  return { startUs, endUs, outcome: 'fall', exitDirection: 'none', startConfidence: 'high' };
}

describe('cut draft', () => {
  it('proposes items, clamps clip padding, and rejects overlapping climbs', () => {
    const items = proposeItems([attempt(2_000_000, 5_000_000)], ['a']);
    expect(items[0]?.touched).toBe(false);
    const clip = clipRangeOf(
      items[0]!,
      { preUs: 2_000_000, postUs: 1_500_000 },
      { startUs: 0, endUs: 6_000_000 },
    );
    expect(clip).toEqual({ startUs: 0, endUs: 6_000_000 });
    const [left, right] = splitItem(items[0]!, 3_000_000, { left: 'l', right: 'r' });
    expect(validateDraft([left, right]).ok).toBe(true);
    expect(left.touched && right.touched).toBe(true);
    const merged = mergeItems(left, right, 'm');
    expect(merged.climb).toEqual({ startUs: 2_000_000, endUs: 5_000_000 });
    expect(
      validateDraft([
        items[0]!,
        { ...items[0]!, id: 'b', climb: { startUs: 4_000_000, endUs: 6_000_000 } },
      ]).ok,
    ).toBe(false);
  });

  it('never changes a touched item when the detector updates', () => {
    const kept = proposeItems([attempt(0, 4_000_000)], ['kept'])[0]!;
    const touched: DraftItem = { ...kept, touched: true };
    const incoming = proposeItems(
      [attempt(1_000_000, 2_000_000), attempt(8_000_000, 9_000_000)],
      ['new', 'later'],
    );
    const merged = mergeDetectorUpdate([touched], incoming);
    expect(merged.find((item) => item.id === 'kept')).toBe(touched);
    expect(merged.some((item) => item.id === 'later')).toBe(true);
    expect(merged.some((item) => item.id === 'new')).toBe(false);
  });

  it('derives adjusted, rejected, manual, split, and merged labels', () => {
    const detector = proposeItems(
      [attempt(0, 1_000), attempt(2_000, 3_000), attempt(5_000, 6_000)],
      ['a', 'b', 'c'],
    );
    const a = detector[0]!;
    const b = detector[1]!;
    const c = detector[2]!;
    const adjusted: DraftItem = { ...a, climb: { startUs: 50, endUs: 1_000 } };
    const [left, right] = splitItem(b, 2_500, { left: 'b1', right: 'b2' });
    const merged = mergeItems(c, manualItem('extra', { startUs: 6_000, endUs: 7_000 }), 'cm');
    const labels = deriveLabels(detector, [adjusted, left, right, merged]);
    expect(labels).toContainEqual({
      kind: 'adjusted',
      itemId: 'a',
      startDeltaUs: 50,
      endDeltaUs: 0,
    });
    expect(labels).toContainEqual({ kind: 'split', fromId: 'b', intoIds: ['b1', 'b2'] });
    expect(labels.some((label) => label.kind === 'merged' && label.intoId === 'cm')).toBe(true);
    const rejected = deriveLabels(detector, [adjusted]);
    expect(rejected).toContainEqual({ kind: 'rejected', itemId: 'b' });
    expect(rejected).toContainEqual({ kind: 'rejected', itemId: 'c' });
    const manual = deriveLabels(detector, [
      ...detector,
      manualItem('hand', { startUs: 9_000, endUs: 10_000 }),
    ]);
    expect(manual).toContainEqual({ kind: 'manual', itemId: 'hand' });
  });

  it('keeps climb ranges disjoint across split, merge, and nudge', () => {
    const rng = createMulberry32(11);
    let items: DraftItem[] = [
      {
        id: 'root',
        climb: { startUs: 0, endUs: 10_000_000 },
        outcome: 'fall',
        touched: false,
        rejected: false,
        source: 'detector',
        parentIds: ['root'],
      },
    ];
    for (let step = 0; step < 1000; step += 1) {
      const roll = rng();
      const live = items.filter(
        (item) => !item.rejected && item.climb.endUs - item.climb.startUs > 2,
      );
      const target = live[Math.floor(rng() * live.length)];
      if (target && roll < 0.4) {
        const span = target.climb.endUs - target.climb.startUs;
        const at = target.climb.startUs + 1 + Math.floor(rng() * (span - 1));
        const [left, right] = splitItem(target, at, {
          left: `${target.id}l${step}`,
          right: `${target.id}r${step}`,
        });
        items = items.flatMap((item) => (item.id === target.id ? [left, right] : [item]));
      } else if (roll < 0.7) {
        const ordered = items
          .filter((item) => !item.rejected)
          .slice()
          .sort((a, b) => a.climb.startUs - b.climb.startUs);
        for (let index = 0; index < ordered.length - 1; index += 1) {
          const left = ordered[index];
          const right = ordered[index + 1];
          if (!left || !right) continue;
          if (left.climb.endUs <= right.climb.startUs) {
            const merged = mergeItems(left, right, `m${step}`);
            const between = ordered.some(
              (item) =>
                item.id !== left.id &&
                item.id !== right.id &&
                item.climb.startUs >= left.climb.startUs &&
                item.climb.endUs <= right.climb.endUs,
            );
            if (!between) {
              items = items
                .filter((item) => item.id !== left.id && item.id !== right.id)
                .concat(merged);
            }
            break;
          }
        }
      } else if (target) {
        const delta = Math.floor(rng() * 5) - 2;
        const startUs = Math.max(0, target.climb.startUs + delta);
        const endUs = Math.max(startUs + 1, target.climb.endUs);
        const nudged: DraftItem = { ...target, touched: true, climb: { startUs, endUs } };
        const others = items.filter((item) => item.id !== target.id && !item.rejected);
        if (!others.some((item) => item.climb.startUs < endUs && startUs < item.climb.endUs)) {
          items = items.map((item) => (item.id === target.id ? nudged : item));
        }
      }
      expect(validateDraft(items).ok).toBe(true);
    }
  });
});
