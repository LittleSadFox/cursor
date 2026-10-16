import { eq } from 'drizzle-orm';

import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@climbing-coach/api';

import type { Clock } from '../../ports/clock.js';
import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { settings } from '../schema.js';
import { inTransaction } from '../tx.js';
import { assertVersion, nextVersion } from '../version.js';

const SETTINGS_KEY = 'app';

export type StoredSettings = Omit<Settings, 'libraryReady'>;
type Stored = StoredSettings;

function asStored(value: unknown): Stored {
  const rec = value as Partial<Stored>;
  return {
    libraryRoot: rec.libraryRoot ?? null,
    prePadUs: rec.prePadUs ?? DEFAULT_SETTINGS.prePadUs,
    postPadUs: rec.postPadUs ?? DEFAULT_SETTINGS.postPadUs,
    originalRetentionDays: rec.originalRetentionDays ?? DEFAULT_SETTINGS.originalRetentionDays,
    trashRetentionDays: rec.trashRetentionDays ?? DEFAULT_SETTINGS.trashRetentionDays,
    defaultDiscipline: rec.defaultDiscipline ?? DEFAULT_SETTINGS.defaultDiscipline,
    gradeSystem: rec.gradeSystem ?? DEFAULT_SETTINGS.gradeSystem,
    poseModel: rec.poseModel ?? null,
    loadMethod: rec.loadMethod ?? DEFAULT_SETTINGS.loadMethod,
    version: rec.version ?? 1,
  };
}

export function readSettings(db: AppDatabase): Stored {
  const row = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  if (!row) {
    return { ...DEFAULT_SETTINGS, libraryRoot: null, version: 1 };
  }
  return asStored(parseJson(row.valueJson, {}));
}

export function writeSettings(db: AppDatabase, clock: Clock, patch: SettingsPatch): Stored {
  return inTransaction(db, (tx) => writeSettingsIn(tx, clock, patch));
}

function writeSettingsIn(db: AppDatabase, clock: Clock, patch: SettingsPatch): Stored {
  const current = readSettings(db);
  assertVersion(current.version, patch.expectedVersion, 'settings');
  const next: Stored = {
    libraryRoot: patch.libraryRoot === undefined ? current.libraryRoot : patch.libraryRoot,
    prePadUs: patch.prePadUs ?? current.prePadUs,
    postPadUs: patch.postPadUs ?? current.postPadUs,
    originalRetentionDays: patch.originalRetentionDays ?? current.originalRetentionDays,
    trashRetentionDays: patch.trashRetentionDays ?? current.trashRetentionDays,
    defaultDiscipline: patch.defaultDiscipline ?? current.defaultDiscipline,
    gradeSystem: patch.gradeSystem ?? current.gradeSystem,
    poseModel: patch.poseModel === undefined ? current.poseModel : patch.poseModel,
    loadMethod: patch.loadMethod ?? current.loadMethod,
    version: nextVersion(current.version),
  };
  const now = clock.nowIso();
  db.insert(settings)
    .values({ key: SETTINGS_KEY, valueJson: stringifyJson(next), updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { valueJson: stringifyJson(next), updatedAt: now },
    })
    .run();
  return next;
}
