import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, historyReducer, type History } from './history.ts';

const start = (v: number): History<number> => ({ past: [], present: v, future: [], group: null });

describe('undo and redo', () => {
  it('undoes and redoes in order, and a new change clears the redo list', () => {
    let h = start(0);
    for (const v of [1, 2, 3]) h = historyReducer(h, { type: 'set', value: v });
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(1);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(2);
    h = historyReducer(h, { type: 'set', value: 9 });
    expect(h.future).toEqual([]);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
    expect(historyReducer(start(0), { type: 'undo' }).present).toBe(0);
  });

  it('merges a run of changes from one control into one step, until the run ends', () => {
    let h = start(0);
    for (const v of [10, 20, 30]) h = historyReducer(h, { type: 'set', value: v, group: 'slider' });
    expect(h.past).toEqual([0]);
    h = historyReducer(h, { type: 'endGroup' });
    h = historyReducer(h, { type: 'set', value: 40, group: 'slider' });
    expect(h.past).toEqual([0, 30]);
    expect(historyReducer(h, { type: 'undo' }).present).toBe(30);
  });

  it('keeps at most the limit, and ignores a change to the same value', () => {
    let h = start(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: 'set', value: i });
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(historyReducer(h, { type: 'set', value: h.present })).toBe(h);
  });
});
