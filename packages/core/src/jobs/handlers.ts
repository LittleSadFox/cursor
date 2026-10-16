import type { SqliteBackup } from '../ports/sql.js';
import type { TrashService } from '../services/trash.js';
import type { StepHandler } from './types.js';

export type MaintenanceDeps = {
  backup?: SqliteBackup | undefined;
  trash: TrashService;
};

/** Step handlers for the P2-A maintenance pipelines (`backup-db`, `purge-trash`). */
export function maintenanceHandlers(deps: MaintenanceDeps): Record<string, StepHandler> {
  return {
    'backup-db.backup': async () => {
      if (!deps.backup) throw new Error('backup adapter missing');
      return deps.backup.backup('daily');
    },
    'purge-trash.purge': async () => ({ purged: deps.trash.purgeExpired() }),
  };
}
