export type ClockState = {
  /** Timeline position, µs. */
  position: number;
  playing: boolean;
};

/** Advances a playing clock by `elapsedMs` of wall time; stops at the end. */
export function advanceClock(state: ClockState, elapsedMs: number, durationUs: number): ClockState {
  if (!state.playing) return state;
  const position = Math.min(durationUs, state.position + Math.max(0, elapsedMs) * 1000);
  return { position, playing: position < durationUs };
}

/** Play from the start when the clock already sits at the end. */
export function startClock(state: ClockState, durationUs: number): ClockState {
  return { position: state.position >= durationUs ? 0 : state.position, playing: durationUs > 0 };
}

export function seekClock(state: ClockState, position: number, durationUs: number): ClockState {
  return { ...state, position: Math.min(durationUs, Math.max(0, position)) };
}
