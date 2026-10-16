import { setupI18n, type I18n } from '@lingui/core';
import { describe, expect, it, vi } from 'vitest';

import { loadCatalog } from './catalog.js';
import { translate } from './format.js';
import { messages } from './locales/en.js';

/** `@lingui/core` as bundled for production: no runtime message compiler. */
function productionI18n(): I18n {
  const i18n = setupI18n();
  i18n.setMessagesCompiler(undefined as never);
  return i18n;
}

describe('loadCatalog', () => {
  it('fills placeholders without the runtime compiler a production build strips', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = productionI18n();
    raw.load('en', { pair: '{a} and {b}' });
    raw.activate('en');
    expect(translate(raw, 'pair', { a: 1, b: 2 })).toBe('{a} and {b}');

    const compiled = productionI18n();
    loadCatalog(compiled, 'en', { pair: '{a} and {b}', plain: 'Play' });
    expect(translate(compiled, 'pair', { a: 1, b: null })).toBe('1 and —');
    expect(compiled._('plain')).toBe('Play');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('compiles every English message', () => {
    const i18n = productionI18n();
    loadCatalog(i18n, 'en', messages);
    expect(translate(i18n, 'compare.meanDivergence', { value: '0.21' })).toBe(
      'Mean divergence: 0.21',
    );
    expect(translate(i18n, 'compare.move', { n: 3 })).toBe('Move 3');
    for (const [id, message] of Object.entries(messages)) {
      if (!message.includes('{')) expect(i18n._(id)).toBe(message);
    }
  });
});
