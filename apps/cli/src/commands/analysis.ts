import {
  STARTING_PARAMS,
  align,
  clipRangeOf,
  detectAttempts,
  validateDraft,
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
