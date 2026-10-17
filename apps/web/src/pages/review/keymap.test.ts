import { describe, expect, it } from 'vitest';

import { isTypingTarget, reviewKeyAction, type KeyInput } from './keymap.js';

function key(value: string, mods: Partial<KeyInput> = {}): KeyInput {
  return { key: value, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods };
}

describe('reviewKeyAction', () => {
  it('maps the review keys', () => {
    expect(reviewKeyAction(key(' '))).toEqual({ type: 'play' });
    expect(reviewKeyAction(key('ArrowRight'))).toEqual({ type: 'frame', step: 1 });
    expect(reviewKeyAction(key('ArrowLeft', { shiftKey: true }))).toEqual({
      type: 'jump',
      step: -1,
    });
    expect(reviewKeyAction(key('i'))).toEqual({ type: 'mark', edge: 'start' });
    expect(reviewKeyAction(key('O'))).toEqual({ type: 'mark', edge: 'end' });
    expect(reviewKeyAction(key('s'))).toEqual({ type: 'split' });
    expect(reviewKeyAction(key('Delete'))).toEqual({ type: 'reject' });
    expect(reviewKeyAction(key('Backspace'))).toEqual({ type: 'reject' });
    expect(reviewKeyAction(key('Tab', { shiftKey: true }))).toEqual({
      type: 'next',
      direction: -1,
    });
    expect(reviewKeyAction(key('1'))).toEqual({ type: 'proximity', value: 1 });
    expect(reviewKeyAction(key('5'))).toEqual({ type: 'proximity', value: 5 });
  });

  it('maps undo and redo on Cmd or Ctrl', () => {
    expect(reviewKeyAction(key('z', { metaKey: true }))).toEqual({ type: 'undo' });
    expect(reviewKeyAction(key('Z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
    expect(reviewKeyAction(key('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
    expect(reviewKeyAction(key('y', { ctrlKey: true }))).toEqual({ type: 'redo' });
  });

  it('leaves other shortcuts to the browser', () => {
    expect(reviewKeyAction(key('s', { metaKey: true }))).toBeNull();
    expect(reviewKeyAction(key('S', { shiftKey: true }))).toBeNull();
    expect(reviewKeyAction(key('i', { altKey: true }))).toBeNull();
    expect(reviewKeyAction(key('x'))).toBeNull();
    expect(reviewKeyAction(key('1', { shiftKey: true }))).toBeNull();
    expect(reviewKeyAction(key('Enter'))).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('treats form fields and editable content as typing', () => {
    expect(isTypingTarget('input')).toBe(true);
    expect(isTypingTarget('SELECT')).toBe(true);
    expect(isTypingTarget('DIV', true)).toBe(true);
    expect(isTypingTarget('BUTTON')).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});
