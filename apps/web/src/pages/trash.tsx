import { useLingui } from '@lingui/react';

import { errorText, formatMessage } from '../format.js';
import { useTrash, useTrashActions } from '../hooks/queries.js';

export function TrashPage() {
  const { i18n } = useLingui();
  const trash = useTrash();
  const actions = useTrashActions();
  const items = trash.data ?? [];

  return (
    <section className="panel">
      <h1>{i18n._('trash.title')}</h1>
      {items.length === 0 ? <p>{i18n._('trash.empty')}</p> : null}
      <ul className="trash-list">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <span>
              {i18n._(`trash.kind.${item.kind}`)} — {item.title}
            </span>
            <button type="button" onClick={() => actions.restore.mutate(item)}>
              {i18n._('trash.restore')}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (
                  window.confirm(formatMessage(i18n._('trash.confirmPurge'), { title: item.title }))
                ) {
                  actions.purge.mutate(item);
                }
              }}
            >
              {i18n._('trash.purge')}
            </button>
          </li>
        ))}
      </ul>
      {actions.restore.error || actions.purge.error ? (
        <p className="error" role="alert">
          {errorText(actions.restore.error ?? actions.purge.error, i18n._('error.generic'))}
        </p>
      ) : null}
    </section>
  );
}
