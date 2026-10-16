import { useLingui } from '@lingui/react';

export function PlaceholderPage({ messageId }: { messageId: string }) {
  const { i18n } = useLingui();
  return (
    <section className="panel">
      <p>{i18n._(messageId)}</p>
    </section>
  );
}
