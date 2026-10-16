import { ProblemError, type CoachApi, type TrashItem, type TrashKind } from '@climbing-coach/api';

import { listDeletedBoulders, purgeBoulder, restoreBoulder } from '../db/repos/boulders.js';
import { listDeletedGyms, purgeGym, restoreGym } from '../db/repos/gyms.js';
import { listDeletedSessions, purgeSession, restoreSession } from '../db/repos/sessions.js';
import {
  listDeletedTrainingLogs,
  purgeTrainingLog,
  restoreTrainingLog,
} from '../db/repos/training-logs.js';
import type { TrashEntry } from '../db/repos/trash-entry.js';
import { addDaysIso } from '../library/retention.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';

type TrashHandler = {
  listDeleted(db: AppDatabase): TrashEntry[];
  restore(db: AppDatabase, clock: Clock, id: string): void;
  purge(db: AppDatabase, id: string): void;
};

/** Purge order matters only for speed: purging a gym also removes its trashed boulders. */
const HANDLERS: ReadonlyArray<readonly [TrashKind, TrashHandler]> = [
  [
    'training_log',
    { listDeleted: listDeletedTrainingLogs, restore: restoreTrainingLog, purge: purgeTrainingLog },
  ],
  ['session', { listDeleted: listDeletedSessions, restore: restoreSession, purge: purgeSession }],
  ['gym', { listDeleted: listDeletedGyms, restore: restoreGym, purge: purgeGym }],
  ['boulder', { listDeleted: listDeletedBoulders, restore: restoreBoulder, purge: purgeBoulder }],
];

function handlerFor(kind: TrashKind): TrashHandler {
  const entry = HANDLERS.find(([candidate]) => candidate === kind);
  if (!entry)
    throw new ProblemError('NOT_IMPLEMENTED', `trash for ${kind} arrives in a later phase`);
  return entry[1];
}

export type TrashService = CoachApi['trash'] & {
  /** Hard-deletes everything trashed at least `retentionDays` before now. Returns the count. */
  purgeExpired(): number;
};

export function createTrashService(
  db: AppDatabase,
  clock: Clock,
  retentionDays: () => number,
): TrashService {
  return {
    async list(): Promise<TrashItem[]> {
      const days = retentionDays();
      return HANDLERS.flatMap(([kind, handler]) =>
        handler.listDeleted(db).map((entry) => ({
          kind,
          id: entry.id,
          title: entry.title,
          deletedAt: entry.deletedAt,
          purgeAfterAt: addDaysIso(entry.deletedAt, days),
        })),
      );
    },
    async restore(kind, id) {
      handlerFor(kind).restore(db, clock, id);
    },
    async purge(kind, id) {
      handlerFor(kind).purge(db, id);
    },
    purgeExpired() {
      const cutoff = addDaysIso(clock.nowIso(), -retentionDays());
      let purged = 0;
      for (const [, handler] of HANDLERS) {
        for (const entry of handler.listDeleted(db)) {
          if (entry.deletedAt > cutoff) continue;
          handler.purge(db, entry.id);
          purged += 1;
        }
      }
      return purged;
    },
  };
}
