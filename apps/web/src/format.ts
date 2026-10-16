import { problemFromUnknown } from '@climbing-coach/api';

export type MessageValues = Readonly<Record<string, string | number | null | undefined>>;

/** Fills `{name}` placeholders in a catalog string; missing values render as an em dash. */
export function formatMessage(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    return value === null || value === undefined ? '—' : String(value);
  });
}

/** The server's problem detail when there is one, otherwise the generic copy. */
export function errorText(error: unknown, generic: string): string {
  return problemFromUnknown(error)?.detail ?? generic;
}
