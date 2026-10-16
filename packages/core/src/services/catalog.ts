import {
  BoulderListQuerySchema,
  GymListQuerySchema,
  SessionListQuerySchema,
  type CoachApi,
} from '@climbing-coach/api';
import type { GradeSystem } from '@climbing-coach/engine';

import {
  createBoulder,
  deleteBoulder,
  getBoulder,
  listBoulders,
  updateBoulder,
} from '../db/repos/boulders.js';
import { createGym, deleteGym, getGym, listGyms, updateGym } from '../db/repos/gyms.js';
import { readSettings } from '../db/repos/settings.js';
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  updateSession,
} from '../db/repos/sessions.js';
import type { IdGen } from '../ids/ulid.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';
import { parseInput } from './validate.js';

export type CatalogDeps = { db: AppDatabase; clock: Clock; ids: IdGen };

type Catalog = Pick<CoachApi, 'gyms' | 'boulders' | 'sessions'>;

function gradeSystem(db: AppDatabase): GradeSystem {
  return readSettings(db).gradeSystem;
}

/** Gyms, boulders, and sessions. List queries go through the API schemas so in-process and HTTP callers agree. */
export function createCatalogService({ db, clock, ids }: CatalogDeps): Catalog {
  return {
    gyms: {
      list: async (q) => listGyms(db, parseInput(GymListQuerySchema, q ?? {})),
      create: async (input) => createGym(db, clock, ids, input),
      get: async (id) => getGym(db, id),
      update: async (id, patch) => updateGym(db, clock, id, patch),
      remove: async (id) => deleteGym(db, clock, id),
    },
    boulders: {
      list: async (q) =>
        listBoulders(db, parseInput(BoulderListQuerySchema, q ?? {}), gradeSystem(db)),
      create: async (input) => createBoulder(db, clock, ids, input, gradeSystem(db)),
      get: async (id) => getBoulder(db, id),
      update: async (id, patch) => updateBoulder(db, clock, id, patch, gradeSystem(db)),
      remove: async (id) => deleteBoulder(db, clock, id),
      progress: async (id) => {
        getBoulder(db, id);
        return [];
      },
    },
    sessions: {
      list: async (q) => listSessions(db, parseInput(SessionListQuerySchema, q ?? {})),
      create: async (input) => createSession(db, clock, ids, input),
      get: async (id) => getSession(db, id),
      update: async (id, patch) => updateSession(db, clock, id, patch),
      remove: async (id) => deleteSession(db, clock, id),
    },
  };
}
