export type Clock = {
  nowMs(): number;
  nowIso(): string;
};

export function systemClock(): Clock {
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
  };
}

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}
