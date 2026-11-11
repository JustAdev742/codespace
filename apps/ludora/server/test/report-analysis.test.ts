import { describe, expect, it } from 'vitest';
import { MIXED_SET, simulateGame } from '@ludora/engine/testing';
import { getMode } from '@ludora/engine';
import {
  analyseQuestions,
  firstTries,
  hardestAndEasiest,
  median,
  misconceptions,
  pace,
  participation,
  possiblyGuessing,
  retentionCutoff,
  setPerformance,
  teamReport,
  type AnswerRow,
  type PlayerRow,
} from '../src/modules/analytics/analysis.ts';

/*
 * The report analysis on small games worked out by hand. Each fixture's expected numbers are in
 * the comments next to it, so a reader can check them without running anything.
 */

let id = 0;
const a = (playerKey: string, questionId: string, correct: boolean, responseMs: number, given: string | null = null, kind = 'answer'): AnswerRow => ({ id: ++id, playerKey, questionId, correct, responseMs, kind, given });
const p = (playerKey: string, name: string, extra: Partial<PlayerRow> = {}): PlayerRow => ({ playerKey, name, isBot: false, isGuest: false, teamId: null, answered: 0, correct: 0, leftEarly: false, score: 0, ...extra });

/*
 * Four players, three questions (capital of Australia, 7 x 8, true or false).
 *   q1: Ada Canberra 8s, Bo Sydney 3s, Cy Sydney 5s, Di Melbourne 6s   -> 1 of 4 right, Sydney x2
 *   q2: Ada 56 4s, Bo 54 2s then 56 (retry), Cy 56 6s, Di 56 8s       -> 3 of 4 right first time, 5 attempts
 *   q3: all four right, 2s 2s 4s 4s                                    -> 4 of 4
 */
function classGame(): AnswerRow[] {
  id = 0;
  return [
    a('p1', 'q1', true, 8000, 'Canberra'),
    a('p2', 'q1', false, 3000, 'Sydney'),
    a('p3', 'q1', false, 5000, ' sydney '),
    a('p4', 'q1', false, 6000, 'Melbourne'),
    a('p1', 'q2', true, 4000, '56'),
    a('p2', 'q2', false, 2000, '54'),
    a('p2', 'q2', true, 3000, '56', 'attempt'),
    a('p3', 'q2', true, 6000, '56'),
    a('p4', 'q2', true, 8000, '56'),
    a('p1', 'q3', true, 2000, 'True'),
    a('p2', 'q3', true, 2000, 'True'),
    a('p3', 'q3', true, 4000, 'True'),
    a('p4', 'q3', true, 4000, 'True'),
  ];
}

describe('question analysis', () => {
  it('counts first tries, attempts, times and the most common wrong answer', () => {
    const qs = analyseQuestions(classGame());
    expect(qs.map((q) => q.questionId)).toEqual(['q1', 'q2', 'q3']);
    const [q1, q2, q3] = qs;
    expect(q1).toMatchObject({ players: 4, right: 1, wrong: 3, firstTryRate: 0.25, attempts: 4, avgResponseMs: 5500, medianResponseMs: 5500 });
    // "Sydney" and " sydney " are the same answer; the first spelling is kept.
    expect(q1!.commonWrong).toEqual({ text: 'Sydney', count: 2 });
    expect(q2).toMatchObject({ players: 4, right: 3, firstTryRate: 0.75, attempts: 5, avgResponseMs: 5000, medianResponseMs: 5000 });
    expect(q2!.commonWrong).toEqual({ text: '54', count: 1 });
    expect(q3).toMatchObject({ right: 4, firstTryRate: 1, commonWrong: null, medianResponseMs: 3000 });
  });

  it('leaves self-graded answers out and never shows words the filter blocks', () => {
    id = 0;
    const rows = [a('p1', 'q1', false, 1000, 'shit'), a('p2', 'q1', false, 1000, 'shit'), a('p3', 'q1', true, 1000, null, 'self')];
    const [q] = analyseQuestions(rows);
    expect(q).toMatchObject({ players: 2, right: 0, commonWrong: null });
    expect(firstTries(rows)).toHaveLength(2);
  });

  it('lists misconceptions, and hardest and easiest questions that never overlap', () => {
    const qs = analyseQuestions(classGame());
    // q1: Sydney by 2 players. q2: "54" by 1 of 4 (a quarter) also counts.
    expect(misconceptions(qs).map((q) => q.questionId)).toEqual(['q1', 'q2']);
    // Three questions: one hardest and one easiest (never the same one twice).
    const { hardest, easiest } = hardestAndEasiest(qs);
    expect(hardest.map((q) => q.questionId)).toEqual(['q1']);
    expect(easiest.map((q) => q.questionId)).toEqual(['q3']);
    expect(hardestAndEasiest(qs.slice(0, 1))).toEqual({ hardest: [], easiest: [] });
  });

  it('works out a median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3); // (2 + 3) / 2 rounded
    expect(median([0, -1])).toBe(0);
    expect(median([0, 0, 3], true)).toBe(0);
  });
});

describe('participation and possible guessing', () => {
  it('flags under half of what most players answered, and anyone who left early', () => {
    id = 0;
    // Median of 10, 9, 8, 3, 0 answers is 8; under 4 is flagged: Eve (3) and Fin (0). Gus left early with 9.
    const players = [p('a', 'Ada'), p('b', 'Gus', { leftEarly: true }), p('c', 'Hal'), p('d', 'Eve'), p('e', 'Fin'), p('z', 'Bot', { isBot: true })];
    const rows: AnswerRow[] = [];
    const give = (k: string, n: number) => {
      for (let i = 1; i <= n; i++) rows.push(a(k, `q${i}`, true, 3000));
    };
    give('a', 10);
    give('b', 9);
    give('c', 8);
    give('d', 3);
    give('z', 10);
    const r = participation(players, rows);
    expect(r.expected).toBe(8);
    expect(r.rows.map((x) => [x.name, x.answered, x.fewAnswers, x.leftEarly])).toEqual([
      ['Fin', 0, true, false],
      ['Eve', 3, true, false],
      ['Gus', 9, false, true],
    ]);
  });

  it('finds players with several very fast wrong answers, and nobody else', () => {
    id = 0;
    // Five questions. On q1 the times are 10, 10, 10, 1, 1 and 6 s: median 8 s, so fast means under 3.2 s (40%).
    // Dan: wrong in 1 s on q1-q3, right on q4-q5 -> 3 fast wrong of 5 -> flagged.
    // Eli: wrong in 1 s on q1-q2 only -> 2 -> not flagged. Flo: wrong in 6 s on all -> slow, not flagged.
    const players = ['Ada', 'Bo', 'Cy', 'Dan', 'Eli', 'Flo'].map((n, i) => p(`p${i + 1}`, n));
    const rows: AnswerRow[] = [];
    for (let q = 1; q <= 5; q++) {
      for (const k of ['p1', 'p2', 'p3']) rows.push(a(k, `q${q}`, true, 10_000));
      rows.push(a('p4', `q${q}`, q > 3, 1000));
      rows.push(a('p5', `q${q}`, q > 2, q > 2 ? 10_000 : 1000));
      rows.push(a('p6', `q${q}`, false, 6000));
    }
    const qs = analyseQuestions(rows);
    expect(qs.find((q) => q.questionId === 'q1')!.medianResponseMs).toBe(8000);
    expect(possiblyGuessing(players, rows, qs)).toEqual([{ playerKey: 'p4', name: 'Dan', fastWrong: 3, answered: 5 }]);
  });
});

describe('teams, pace and sets', () => {
  it('reports each team with its members and accuracy', () => {
    const rows = classGame();
    // Red: p1 (3 of 3) and p2 (1 of 3) = 4 of 6. Blue: p3 and p4 (2 of 3 each) = 4 of 6.
    const players = [p('p1', 'Ada', { teamId: 'red' }), p('p2', 'Bo', { teamId: 'red' }), p('p3', 'Cy', { teamId: 'blue' }), p('p4', 'Di', { teamId: 'blue' })];
    const teams = teamReport(players, [{ teamId: 'blue', name: 'Blue', rank: 1, score: 900, label: '900' }, { teamId: 'red', name: 'Red', rank: 2, score: 700, label: '700' }, { teamId: 'green', name: 'Green', rank: 3, score: 0, label: '0' }], rows);
    expect(teams.map((t) => [t.name, t.members, t.correct, t.answered])).toEqual([
      ['Blue', 2, 4, 6],
      ['Red', 2, 4, 6],
    ]);
    expect(teamReport(players, [], rows)).toEqual([]);
  });

  it('works out pace per minute in a self-paced game', () => {
    // A two-minute game: Ada answered 3 (1.5 a minute), Bo 3 with 1 right (q1 and q2 wrong first time).
    const rows = classGame();
    const r = pace([p('p1', 'Ada'), p('p2', 'Bo')], rows, 120_000);
    expect(r).toEqual([
      { playerKey: 'p1', name: 'Ada', answered: 3, correct: 3, perMinute: 1.5 },
      { playerKey: 'p2', name: 'Bo', answered: 3, correct: 1, perMinute: 1.5 },
    ]);
  });

  it('summarises a set across games and says which questions to rewrite and why', () => {
    const play = (gameId: string, endedAt: string, questionId: string, players: number, right: number, avgResponseMs = 5000, wrong: string | null = null, wrongCount = 0) => ({
      gameId,
      endedAt,
      questionId,
      players,
      right,
      avgResponseMs,
      commonWrong: wrong ? { text: wrong, count: wrongCount } : null,
    });
    const s = setPerformance([
      // hard: 1 + 1 of 10 = 20%
      play('g1', '2026-10-01', 'hard', 5, 1),
      play('g2', '2026-10-08', 'hard', 5, 1),
      // easy: 10 of 10 over two games
      play('g1', '2026-10-01', 'easy', 5, 5),
      play('g2', '2026-10-08', 'easy', 5, 5),
      // trap: 4 of 10, and "Pluto" chosen by 6 of 10
      play('g1', '2026-10-01', 'trap', 5, 2, 5000, 'Pluto', 3),
      play('g2', '2026-10-08', 'trap', 5, 2, 5000, 'Pluto', 3),
      // slow: 7 of 10 but 20 s against a typical 5 s
      play('g1', '2026-10-01', 'slow', 5, 4, 20_000),
      play('g2', '2026-10-08', 'slow', 5, 3, 20_000),
      // few: too few answers to judge
      play('g1', '2026-10-01', 'few', 2, 0),
    ]);
    const by = new Map(s.map((x) => [x.questionId, x]));
    expect(by.get('hard')).toMatchObject({ players: 10, rate: 0.2, games: 2, reasons: ['too_hard'] });
    expect(by.get('easy')!.reasons).toEqual(['too_easy']);
    expect(by.get('trap')).toMatchObject({ rate: 0.4, commonWrong: { text: 'Pluto', count: 6 }, reasons: ['one_wrong_answer'] });
    expect(by.get('slow')).toMatchObject({ avgResponseMs: 20_000, reasons: ['slow'] });
    expect(by.get('few')!.reasons).toEqual([]);
    expect(by.get('hard')!.history.map((h) => h.gameId)).toEqual(['g1', 'g2']);
  });

  it('keeps a whole number of months for retention', () => {
    expect(retentionCutoff(12, new Date('2026-11-11T10:00:00Z')).toISOString()).toBe('2025-11-11T10:00:00.000Z');
    expect(retentionCutoff(3, new Date('2026-05-20T00:00:00Z')).toISOString()).toBe('2026-02-20T00:00:00.000Z');
  });
});

/*
 * Mode-aware reports: five modes played to the end by bots (treated as people here, since saved
 * games never keep bots' answers), and the report checked for what reads wrong in each.
 */
describe('reports for five different modes, played with bots', () => {
  const questions = [...MIXED_SET, ...MIXED_SET.map((q) => ({ ...q, id: `${q.id}b` })), ...MIXED_SET.map((q) => ({ ...q, id: `${q.id}c` }))];
  const cases = [
    { modeId: 'classic', common: { questionLimit: 6 } },
    { modeId: 'gold-rush', common: { durationSec: 120 } },
    { modeId: 'lantern-match', common: {} },
    { modeId: 'word-scramble', common: {} },
    { modeId: 'tug-of-war', common: { teamCount: 2 } },
  ];
  for (const c of cases) {
    it(`${c.modeId}: every question and player has sensible numbers`, () => {
      const sim = simulateGame({ modeId: c.modeId, questions, players: 4, seed: 7, common: c.common, maxGameMs: 20 * 60_000 });
      expect(sim.errors, c.modeId).toEqual([]);
      const res = sim.results!;
      expect(res, c.modeId).toBeTruthy();
      let n = 0;
      const rows: AnswerRow[] = res.answers.map((x) => ({ id: ++n, playerKey: x.playerId, questionId: x.qid, correct: x.correct, responseMs: Math.round(x.responseMs), kind: x.kind ?? 'answer', given: x.given ?? null }));
      const players: PlayerRow[] = res.standings.map((s) => ({ playerKey: s.playerId, name: s.name, isBot: false, isGuest: true, teamId: s.teamId, answered: s.stats.answered, correct: s.stats.correct, leftEarly: s.left, score: s.score }));
      const qs = analyseQuestions(rows);
      expect(qs.length, `${c.modeId} has questions in its report`).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q.right).toBeLessThanOrEqual(q.players);
        expect(q.attempts).toBeGreaterThanOrEqual(q.players);
        expect(q.players).toBeLessThanOrEqual(players.length);
        expect(q.firstTryRate).toBeGreaterThanOrEqual(0);
        expect(q.firstTryRate).toBeLessThanOrEqual(1);
      }
      const pacing = getMode(c.modeId)!.meta.pacing;
      if (pacing === 'self') {
        // Self-paced: the pace table is what the report leads with; everyone appears in it.
        const r = pace(players, rows, res.durationMs);
        expect(r).toHaveLength(players.length);
        expect(r.every((x) => x.perMinute >= 0 && x.correct <= x.answered)).toBe(true);
      }
      // Nobody steady is flagged for answering few questions just because others raced ahead.
      const part = participation(players, rows);
      expect(part.rows.filter((x) => x.fewAnswers).length, c.modeId).toBeLessThan(players.length);
      if (c.modeId === 'tug-of-war') {
        const teams = teamReport(players, res.teamStandings.map((t) => ({ teamId: t.teamId, name: t.name, rank: t.rank, score: t.score, label: t.label })), rows);
        expect(teams).toHaveLength(2);
        expect(teams.reduce((n2, t) => n2 + t.members, 0)).toBe(4);
      }
      if (c.modeId === 'lantern-match') {
        // A matching puzzle records many tries per question: attempts must exceed first tries somewhere.
        expect(qs.some((q) => q.attempts > q.players)).toBe(true);
      }
    });
  }
});
