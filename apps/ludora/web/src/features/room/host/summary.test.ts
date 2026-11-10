import { describe, expect, it } from 'vitest';
import type { HostReportView, RoomView } from '@ludora/shared';
import { hardest, percent, summaryText } from './summary.ts';
import { estimateMinutes, isTyping } from './tools.ts';

const report: HostReportView = {
  answered: 9,
  right: 5,
  threshold: 0.5,
  feelings: { great: 2, okay: 1, tough: 0 },
  needHelp: [{ playerId: 'c', name: 'Cai', right: 1, answered: 3 }],
  questions: [
    { qid: 'q1', prompt: 'Closest planet?', answered: 3, right: 1, commonWrong: { text: 'Venus', count: 2 }, avgMs: 4000 },
    { qid: 'q2', prompt: 'Boiling point?', answered: 3, right: 3, commonWrong: null, avgMs: 3000 },
    { qid: 'q3', prompt: 'Capital of France?', answered: 3, right: 1, commonWrong: null, avgMs: 5000 },
  ],
};

describe('class summary', () => {
  it('picks the hardest questions, leaving out those everybody got right', () => {
    expect(hardest(report, 3).map((q) => q.qid)).toEqual(['q1', 'q3']);
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('–');
  });
  it('writes a summary to copy', () => {
    const room = { room: { title: 'Classic', setTitle: 'Space' }, results: { standings: [{ playerId: 'a', name: 'Ana', rank: 1, label: '900' }] } } as unknown as RoomView;
    const text = summaryText(room, report);
    expect(text).toContain('Class accuracy 56%');
    expect(text).toContain('1. Closest planet? (33% right; most common wrong answer "Venus")');
    expect(text).toContain('May need a hand: Cai.');
    expect(text).toContain('How it felt: 2 great, 1 okay, 0 tough.');
  });
});

describe('host tools', () => {
  it('estimates a game length from its settings', () => {
    const base = { common: { timeLimitSec: 0, questionLimit: 0, questionTimeSec: 20 }, questionCount: 10, pacing: 'host' } as unknown as RoomView['room'];
    expect(estimateMinutes(base)).toBe(4);
    expect(estimateMinutes({ ...base, common: { ...base.common, timeLimitSec: 300 } })).toBe(5);
    expect(estimateMinutes({ ...base, common: { ...base.common, questionLimit: 5 } })).toBe(2);
  });
  it('never treats a missing target as typing', () => {
    expect(isTyping(null)).toBe(false);
  });
});
