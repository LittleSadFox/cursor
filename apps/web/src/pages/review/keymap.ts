import type { Edge } from './draft-ops.js';

/** BUILD_PLAN §6 review keyboard map. */
export type ReviewKeyAction =
  | { type: 'play' }
  | { type: 'frame'; step: 1 | -1 }
  | { type: 'jump'; step: 1 | -1 }
  | { type: 'mark'; edge: Edge }
  | { type: 'split' }
  | { type: 'reject' }
  | { type: 'next'; direction: 1 | -1 }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'proximity'; value: 1 | 2 | 3 | 4 | 5 };

export type KeyInput = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** Keys typed into a form field belong to the field. */
export function isTypingTarget(tagName: string | undefined, editable = false): boolean {
  return editable || (tagName !== undefined && TYPING_TAGS.has(tagName.toUpperCase()));
}

/** Cmd on macOS; Ctrl too, so browser dev on other systems works. */
function commandKey(event: KeyInput): ReviewKeyAction | null {
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (key === 'y' && !event.shiftKey) return { type: 'redo' };
  return null;
}

function arrowKey(event: KeyInput): ReviewKeyAction | null {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : null;
  if (step === null) return null;
  return event.shiftKey ? { type: 'jump', step } : { type: 'frame', step };
}

function letterKey(key: string): ReviewKeyAction | null {
  switch (key.toLowerCase()) {
    case 'i':
      return { type: 'mark', edge: 'start' };
    case 'o':
      return { type: 'mark', edge: 'end' };
    case 's':
      return { type: 'split' };
    default:
      return null;
  }
}

export function reviewKeyAction(event: KeyInput): ReviewKeyAction | null {
  if (event.altKey) return null;
  if (event.metaKey || event.ctrlKey) return commandKey(event);
  if (event.key === ' ') return { type: 'play' };
  if (event.key === 'Delete' || event.key === 'Backspace') return { type: 'reject' };
  if (event.key === 'Tab') return { type: 'next', direction: event.shiftKey ? -1 : 1 };
  if (event.shiftKey && event.key.length === 1) return null;
  return arrowKey(event) ?? letterKey(event.key) ?? proximityKey(event.key);
}

/** `1`–`5` set proximity on the selected climb. */
function proximityKey(key: string): ReviewKeyAction | null {
  if (key.length !== 1 || key < '1' || key > '5') return null;
  const value = Number(key);
  if (value < 1 || value > 5) return null;
  return { type: 'proximity', value: value as 1 | 2 | 3 | 4 | 5 };
}
