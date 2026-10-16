import { TrainingLogInputSchema, type CoachApi } from '@climbing-coach/api';
import { prefillTrainingLog } from '@climbing-coach/engine';

import { createFocusTag, listFocusTags } from '../db/repos/focus-tags.js';
import {
  deleteTrainingLog,
  getTrainingLog,
  listTrainingLogs,
  upsertTrainingLog,
} from '../db/repos/training-logs.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';
import { parseInput } from './validate.js';

type Training = Pick<CoachApi, 'trainingLogs' | 'focusTags'>;

export function createTrainingService(db: AppDatabase, clock: Clock): Training {
  return {
    trainingLogs: {
      list: async (range) => listTrainingLogs(db, range.from, range.to),
      // Attempts (and so the prefill basis) arrive with the commit pipeline in P2-B.
      get: async (date) => ({
        entry: getTrainingLog(db, date),
        prefill: prefillTrainingLog(date, []),
      }),
      put: async (date, input) =>
        upsertTrainingLog(db, clock, date, parseInput(TrainingLogInputSchema, input)),
      remove: async (date) => deleteTrainingLog(db, clock, date),
    },
    focusTags: {
      list: async () => listFocusTags(db),
      create: async (input) => createFocusTag(db, clock, input.label),
    },
  };
}
