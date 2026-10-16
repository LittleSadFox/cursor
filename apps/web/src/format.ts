import { problemFromUnknown } from '@climbing-coach/api';

export type MessageValues = Readonly<Record<string, string | number | null | undefined>>;

/** The part of Lingui's `I18n` used for catalog lookups. */
export type Translator = { _(id: string, values?: Record<string, unknown>): string };

const MISSING = '—';

function dashMissing(values: MessageValues): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, value ?? MISSING]),
  );
}

/**
 * Catalog message with its `{name}` placeholders filled; missing values render as an em dash.
 * Values must go through Lingui: `i18n._(id)` alone already blanks every placeholder.
 */
export function translate(i18n: Translator, id: string, values: MessageValues): string {
  return i18n._(id, dashMissing(values));
}

/** The server's problem detail when there is one, otherwise the generic copy. */
export function errorText(error: unknown, generic: string): string {
  return problemFromUnknown(error)?.detail ?? generic;
}
