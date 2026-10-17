import { useLingui } from '@lingui/react';

import { useHealth } from '../hooks/queries.js';
import { recordingsGate } from '../pages/recordings-gate.js';

/** Visible when the Vite proxy cannot reach the local API (common Mac miss: server not running). */
export function ApiStatusBanner() {
  const { i18n } = useLingui();
  const health = useHealth();
  const gate = recordingsGate(health);
  if (gate !== 'api-down') return null;
  return (
    <p className="api-down" role="alert">
      {i18n._('api.down')}
    </p>
  );
}
