import { describe, expect, it } from 'vitest';

import type { Settings } from '@climbing-coach/api';

import { settingsDraft, settingsPatch } from './settings-draft.js';

const SETTINGS: Settings = {
  libraryRoot: '/Users/me/Movies/Climbing Coach Library',
  libraryReady: true,
  prePadUs: 2_000_000,
  postPadUs: 1_500_000,
  originalRetentionDays: 30,
  trashRetentionDays: 30,
  defaultDiscipline: 'boulder',
  gradeSystem: 'v',
  poseModel: null,
  loadMethod: 'rolling',
  version: 4,
};

describe('settings draft', () => {
  it('sends only changed fields, so the library root is not rewritten by a padding change', () => {
    const draft = { ...settingsDraft(SETTINGS), preSec: '2.5', loadMethod: 'ewma' as const };
    expect(settingsPatch(draft, SETTINGS)).toEqual({
      expectedVersion: 4,
      prePadUs: 2_500_000,
      loadMethod: 'ewma',
    });
  });

  it('reports a moved library', () => {
    const draft = { ...settingsDraft(SETTINGS), libraryRoot: ' /Volumes/Ext/Coach ' };
    expect(settingsPatch(draft, SETTINGS)).toEqual({
      expectedVersion: 4,
      libraryRoot: '/Volumes/Ext/Coach',
    });
  });

  it('rejects negative padding and zero retention', () => {
    expect(settingsPatch({ ...settingsDraft(SETTINGS), preSec: '-1' }, SETTINGS)).toBeNull();
    expect(settingsPatch({ ...settingsDraft(SETTINGS), postSec: '' }, SETTINGS)).toBeNull();
    expect(settingsPatch({ ...settingsDraft(SETTINGS), retentionDays: '0' }, SETTINGS)).toBeNull();
  });
});
