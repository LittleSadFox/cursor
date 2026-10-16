import type { I18n, Messages } from '@lingui/core';
import { compileMessage } from '@lingui/message-utils/compileMessage';

/**
 * Compiles every catalog string once. Production builds of `@lingui/core` ship without the
 * runtime message compiler, so a raw catalog would render `{name}` placeholders verbatim there.
 */
export function compileCatalog(messages: Readonly<Record<string, string>>): Messages {
  return Object.fromEntries(
    Object.entries(messages).map(([id, message]) => [id, compileMessage(message)]),
  );
}

export function loadCatalog(
  i18n: Pick<I18n, 'load' | 'activate'>,
  locale: string,
  messages: Readonly<Record<string, string>>,
): void {
  i18n.load(locale, compileCatalog(messages));
  i18n.activate(locale);
}
