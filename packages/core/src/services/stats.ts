import type { CoachApi } from '@climbing-coach/api';
import {
  addDays,
  exertionVolume,
  focusDistribution,
  gradePyramid,
  trainingLoad,
  weeklySummary,
  type DailyLog,
} from '@climbing-coach/engine';

import { readSettings } from '../db/repos/settings.js';
import { listTrainingLogs, toDailyLog } from '../db/repos/training-logs.js';
import type { AppDatabase } from '../ports/sql.js';

/** The 28-day window reaches 27 days before the first charted day. */
const LONG_WINDOW_LOOKBACK_DAYS = 27;

function dailyLogs(db: AppDatabase, from?: string, to?: string): DailyLog[] {
  return listTrainingLogs(db, from, to).map(toDailyLog);
}

export function createStatsService(db: AppDatabase): CoachApi['stats'] {
  return {
    async trainingLoad(range, method = 'rolling') {
      // EWMA carries state from the first entry ever; rolling only needs the long window.
      const from = method === 'ewma' ? undefined : addDays(range.from, -LONG_WINDOW_LOOKBACK_DAYS);
      return trainingLoad(dailyLogs(db, from, range.to), range, method);
    },
    exertionVolume: async (range) => exertionVolume(dailyLogs(db, range.from, range.to), range),
    focusDistribution: async (range, bucket) =>
      focusDistribution(dailyLogs(db, range.from, range.to), range, bucket),
    gradePyramid: async (range, discipline) =>
      gradePyramid(dailyLogs(db, range.from, range.to), range, discipline),
    weeklySummary: async (week) => weeklySummary(dailyLogs(db), week, readSettings(db).gradeSystem),
  };
}
