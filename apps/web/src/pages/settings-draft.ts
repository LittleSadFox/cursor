import type { Settings, SettingsPatch } from '@climbing-coach/api';

export type SettingsDraft = {
  libraryRoot: string;
  preSec: string;
  postSec: string;
  gradeSystem: Settings['gradeSystem'];
  loadMethod: Settings['loadMethod'];
  retentionDays: string;
};

export const GRADE_SYSTEMS: readonly Settings['gradeSystem'][] = ['v', 'font', 'yds', 'french'];
export const LOAD_METHODS: readonly Settings['loadMethod'][] = ['rolling', 'ewma'];

const US_PER_SECOND = 1_000_000;

export function settingsDraft(settings: Settings): SettingsDraft {
  return {
    libraryRoot: settings.libraryRoot ?? '',
    preSec: String(settings.prePadUs / US_PER_SECOND),
    postSec: String(settings.postPadUs / US_PER_SECOND),
    gradeSystem: settings.gradeSystem,
    loadMethod: settings.loadMethod,
    retentionDays: String(settings.trashRetentionDays),
  };
}

function seconds(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * US_PER_SECOND)
    : null;
}

/** Only changed fields are sent, so saving padding never rewrites (and relocates) the library. */
export function settingsPatch(draft: SettingsDraft, current: Settings): SettingsPatch | null {
  const prePadUs = seconds(draft.preSec);
  const postPadUs = seconds(draft.postSec);
  const retention = Number(draft.retentionDays.trim());
  if (prePadUs === null || postPadUs === null || !Number.isInteger(retention) || retention < 1)
    return null;
  const libraryRoot = draft.libraryRoot.trim() === '' ? null : draft.libraryRoot.trim();
  const patch: SettingsPatch = { expectedVersion: current.version };
  if (libraryRoot !== current.libraryRoot) patch.libraryRoot = libraryRoot;
  if (prePadUs !== current.prePadUs) patch.prePadUs = prePadUs;
  if (postPadUs !== current.postPadUs) patch.postPadUs = postPadUs;
  if (draft.gradeSystem !== current.gradeSystem) patch.gradeSystem = draft.gradeSystem;
  if (draft.loadMethod !== current.loadMethod) patch.loadMethod = draft.loadMethod;
  if (retention !== current.trashRetentionDays) patch.trashRetentionDays = retention;
  return patch;
}
