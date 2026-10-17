import { useEffect, useRef } from 'react';

import { isTypingTarget, reviewKeyAction, type ReviewKeyAction } from './keymap.js';

function targetOf(event: KeyboardEvent): { tag: string | undefined; editable: boolean } {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return { tag: target?.tagName, editable: target?.isContentEditable ?? false };
}

/** Window-level review shortcuts; typing in a form field is left alone. */
export function useReviewKeys(onAction: (action: ReviewKeyAction) => void): void {
  const handler = useRef(onAction);
  useEffect(() => {
    handler.current = onAction;
  }, [onAction]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { tag, editable } = targetOf(event);
      if (isTypingTarget(tag, editable)) return;
      const action = reviewKeyAction(event);
      if (!action) return;
      event.preventDefault();
      handler.current(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
