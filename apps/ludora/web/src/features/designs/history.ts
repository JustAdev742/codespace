import { useCallback, useReducer } from 'react';

/*
 * Undo and redo for an editor: every change pushes the old value; quick runs of changes from one
 * control (dragging a slider, painting a stroke) can be merged into one step with a `group` key.
 * Pure reducer, so it is unit tested without a DOM.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** The group of the last change, for merging a run of changes into one undo step. */
  group: string | null;
}

export type HistoryAction<T> = { type: 'set'; value: T; group?: string | undefined } | { type: 'undo' } | { type: 'redo' } | { type: 'reset'; value: T } | { type: 'endGroup' };

/** Steps kept; older ones fall away. */
export const HISTORY_LIMIT = 100;

export function historyReducer<T>(h: History<T>, a: HistoryAction<T>): History<T> {
  switch (a.type) {
    case 'set': {
      if (Object.is(a.value, h.present)) return h;
      if (a.group && a.group === h.group) return { ...h, present: a.value, future: [] };
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: a.value, future: [], group: a.group ?? null };
    }
    case 'undo': {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future], group: null };
    }
    case 'redo': {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1), group: null };
    }
    case 'endGroup':
      return h.group ? { ...h, group: null } : h;
    case 'reset':
      return { past: [], present: a.value, future: [], group: null };
  }
}

export function useHistory<T>(initial: T | (() => T)) {
  const [h, dispatch] = useReducer(historyReducer<T>, undefined, () => ({ past: [], present: typeof initial === 'function' ? (initial as () => T)() : initial, future: [], group: null }));
  const set = useCallback((value: T, group?: string) => dispatch({ type: 'set', value, group }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), []);
  const endGroup = useCallback(() => dispatch({ type: 'endGroup' }), []);
  return { value: h.present, set, undo, redo, reset, endGroup, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
