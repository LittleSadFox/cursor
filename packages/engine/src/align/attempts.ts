import type { PoseSample } from '../pose/types.js';
import { align, type AlignOptions, type AlignResult } from './align.js';
import { alignFrames } from './frames.js';

export type OpenEndSide = 'none' | 'a' | 'b';

export type AttemptAlignOptions = {
  /** Collapse near-stationary runs before DTW (PLAN 2.7). Default true. */
  collapseRests?: boolean;
  /** Which attempt ended early and aligns to a prefix of the other. Default `none`. */
  openEnd?: OpenEndSide;
} & Pick<AlignOptions, 'bandFraction' | 'pcaComponents'>;

/** The attempt that did not top aligns open-ended against one that did. */
export function openEndSide(outcomeA: string, outcomeB: string): OpenEndSide {
  const toppedA = outcomeA === 'top';
  const toppedB = outcomeB === 'top';
  if (toppedA === toppedB) return 'none';
  return toppedA ? 'b' : 'a';
}

function swapPath(result: AlignResult): AlignResult {
  return {
    cost: result.cost,
    path: result.path.map((step) => ({
      indexA: step.indexB,
      indexB: step.indexA,
      tUsA: step.tUsB,
      tUsB: step.tUsA,
    })),
  };
}

/** `align` on two pose tracks; the path is always A → B, whichever side is open-ended. */
export function alignAttempts(
  a: readonly PoseSample[],
  b: readonly PoseSample[],
  options: AttemptAlignOptions = {},
): AlignResult {
  const { collapseRests = true, openEnd = 'none', ...rest } = options;
  const base: AlignOptions = {
    ...rest,
    ...(collapseRests ? {} : { restMinUs: Number.POSITIVE_INFINITY }),
    openEnd: openEnd !== 'none',
  };
  if (openEnd === 'b') return swapPath(align(alignFrames(b), alignFrames(a), base));
  return align(alignFrames(a), alignFrames(b), base);
}
