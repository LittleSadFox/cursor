import {
  STARTING_PARAMS,
  align,
  alignAttempts,
  clipRangeOf,
  comparePostures,
  compareSideOf,
  detectAttempts,
  validateDraft,
  type PoseSample,
} from '@climbing-coach/engine';

import { flagValue, hasFlag, usage } from '../args.js';
import {
  draftItems,
  loadAlignFrames,
  loadPoses,
  readJson,
  writeJson,
  type DraftFile,
} from '../io.js';
import { videoBlocked } from './video.js';

export function detectCommand(args: readonly string[]): void {
  const poses = flagValue(args, 'poses');
  if (!poses) return usage('coach detect --poses <path> [--json <out>]');
  const { floor, attempts } = detectAttempts(loadPoses(poses));
  const body = { floor, attempts };
  console.log(JSON.stringify(body));
  writeJson(flagValue(args, 'json'), body);
}

export function alignCommand(args: readonly string[]): void {
  const a = flagValue(args, 'a');
  const b = flagValue(args, 'b');
  if (!a || !b) return usage('coach align --a <path> --b <path> [--open-end] [--json <out>]');
  const result = align(loadAlignFrames(a), loadAlignFrames(b), {
    openEnd: hasFlag(args, 'open-end'),
  });
  console.log(JSON.stringify({ cost: result.cost, steps: result.path.length }));
  writeJson(flagValue(args, 'json'), result);
}

function wholeRange(samples: readonly PoseSample[]): { startUs: number; endUs: number } {
  return {
    startUs: samples[0]?.tUs ?? 0,
    endUs: (samples[samples.length - 1]?.tUs ?? 0) + 1,
  };
}

/**
 * Align two pose tracks, then compare postures (P3.1) the way the compare job does.
 * Each file is one attempt's climb; `--open-end` means A ended early (a fall).
 */
export function compareCommand(args: readonly string[]): void {
  const a = flagValue(args, 'a');
  const b = flagValue(args, 'b');
  if (!a || !b) return usage('coach compare --a <poses> --b <poses> [--open-end] [--json <out>]');
  const samplesA = loadPoses(a);
  const samplesB = loadPoses(b);
  const alignment = alignAttempts(samplesA, samplesB, {
    openEnd: hasFlag(args, 'open-end') ? 'a' : 'none',
  });
  const result = comparePostures(
    compareSideOf(samplesA, wholeRange(samplesA)),
    compareSideOf(samplesB, wholeRange(samplesB)),
    alignment,
  );
  const body = {
    steps: result.score.length,
    moveMatches: result.moveMatches,
    summary: result.summary,
  };
  console.log(JSON.stringify(body));
  writeJson(flagValue(args, 'json'), {
    ...body,
    perMove: result.perMove,
    warp: Array.from(result.warp),
    score: Array.from(result.score),
  });
}

/** `cut --draft` validates a review draft and prints clip ranges. Cutting video needs ffmpeg. */
export function cutCommand(args: readonly string[]): void {
  const draftPath = flagValue(args, 'draft');
  if (!draftPath) return videoBlocked('cut');
  const draft = readJson<DraftFile>(draftPath);
  const items = draftItems(draft);
  const video = draft.video ?? { startUs: 0, endUs: Number.MAX_SAFE_INTEGER };
  const padding = draft.padding ?? STARTING_PARAMS.padding;
  const validation = validateDraft(items);
  const clips = items
    .filter((item) => !item.rejected)
    .map((item) => ({ id: item.id, clip: clipRangeOf(item, padding, video) }));
  const body = { ok: validation.ok, conflicts: validation.conflicts, clips };
  console.log(JSON.stringify(body));
  writeJson(flagValue(args, 'json'), body);
  if (!validation.ok) process.exitCode = 1;
}
