import { describe, expect, it } from 'vitest';
import { activeFilterCount, answersCsv, apiQuery, compareGames, fillWeeks, mondayOf, questionsCsv, readFilters, schoolYearStart, termStart, writeFilters, type QuestionRow } from './logic.ts';

const q = (questionId: string, players: number, right: number, wrong: string | null = null): QuestionRow => ({
  questionId,
  prompt: `Prompt ${questionId}`,
  type: 'mcq',
  players,
  right,
  wrong: players - right,
  firstTryRate: players ? right / players : 0,
  attempts: players,
  avgResponseMs: 4000,
  medianResponseMs: 3500,
  commonWrong: wrong ? { text: wrong, count: players - right } : null,
});

describe('comparing two games', () => {
  it('compares the questions both asked, and lists the rest apart', () => {
    // Before: q1 2/10, q2 5/10, q3 9/10, q4 only before. After: q1 8/10 (+60), q2 6/10 (+10), q3 7/10 (-20), q5 only after.
    const r = compareGames([q('q1', 10, 2, 'Sydney'), q('q2', 10, 5), q('q3', 10, 9), q('q4', 10, 1)], [q('q1', 10, 8, 'Sydney'), q('q2', 10, 6), q('q3', 10, 7), q('q5', 10, 10)]);
    expect(r.questions.map((x) => [x.questionId, x.points, x.change])).toEqual([
      ['q1', 60, 'improved'],
      ['q2', 10, 'improved'],
      ['q3', -20, 'declined'],
    ]);
    expect([r.improved, r.declined, r.same]).toEqual([2, 1, 0]);
    // Over shared questions only: before 16/30, after 21/30.
    expect(r.before).toBeCloseTo(16 / 30);
    expect(r.after).toBeCloseTo(21 / 30);
    expect(r.onlyBefore.map((x) => x.questionId)).toEqual(['q4']);
    expect(r.onlyAfter.map((x) => x.questionId)).toEqual(['q5']);
    expect(r.questions[0]!.beforeWrong).toEqual({ text: 'Sydney', count: 8 });
  });

  it('calls a move of under ten points the same', () => {
    const r = compareGames([q('q1', 10, 5)], [q('q1', 11, 6)]); // 50% to 55%
    expect(r.questions[0]).toMatchObject({ points: 5, change: 'same' });
    expect(compareGames([], [q('q1', 1, 1)]).before).toBeNull();
  });
});

describe('filters in the address', () => {
  it('reads, writes and turns filters into an API query', () => {
    const f = readFilters(new URLSearchParams('q=fractions&class=c1&from=2026-09-01&to=bad&sort=accuracy&junk=1'));
    expect(f).toEqual({ q: 'fractions', classId: 'c1', setId: '', modeId: '', from: '2026-09-01', to: '', sort: 'accuracy' });
    expect(writeFilters(f).toString()).toBe('q=fractions&class=c1&from=2026-09-01&sort=accuracy');
    expect(apiQuery(f, 25)).toBe('q=fractions&classId=c1&from=2026-09-01&sort=accuracy&offset=25');
    expect(activeFilterCount(f)).toBe(3);
    expect(readFilters(new URLSearchParams('sort=sideways')).sort).toBe('newest');
    expect(writeFilters(readFilters(new URLSearchParams())).toString()).toBe('');
  });
});

describe('CSV rows', () => {
  it('writes every answer and the question analysis', () => {
    const answers = answersCsv(
      [
        { playerKey: 'p1', player: 'Ada', membership: 'class', team: null, prompt: 'Capital?', type: 'mcq', given: 'Sydney', correct: false, kind: 'answer', tryNumber: 1, responseMs: 3450 },
        { playerKey: 'p2', player: 'Bo', membership: 'guest', team: 'Red', prompt: 'Card', type: 'truefalse', given: null, correct: true, kind: 'self', tryNumber: 1, responseMs: 0 },
      ],
      (t) => (t === 'mcq' ? 'Multiple choice' : null),
    );
    expect(answers[1]).toEqual(['Ada', 'Your student', '', 'Capital?', 'Multiple choice', 'Sydney', 'No', 1, 'Answer', 3.5]);
    // Self-marked answers are neither right nor wrong.
    expect(answers[2]).toEqual(['Bo', 'Guest', 'Red', 'Card', '', '', '', 1, 'Marked by the player', null]);
    const questions = questionsCsv([q('q1', 4, 1, 'Sydney')], () => 'Multiple choice');
    expect(questions[1]).toEqual(['Prompt q1', 'Multiple choice', 4, 1, 3, 25, 'Sydney', 3, 4, 4, 3.5]);
  });
});

describe('term overview weeks', () => {
  it('finds Mondays and fills in empty weeks', () => {
    expect(mondayOf('2026-11-11')).toBe('2026-11-09'); // a Wednesday
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // a Sunday
    const weeks = fillWeeks([{ weekOf: '2026-10-26', games: 2, correct: 5, answered: 10 }], '2026-10-20', '2026-11-11');
    expect(weeks.map((w) => [w.weekOf, w.games])).toEqual([
      ['2026-10-19', 0],
      ['2026-10-26', 2],
      ['2026-11-02', 0],
      ['2026-11-09', 0],
    ]);
  });

  it('knows the start of the term and the school year', () => {
    expect(termStart(new Date(2026, 10, 11))).toBe('2026-09-01');
    expect(termStart(new Date(2026, 1, 3))).toBe('2026-01-01');
    expect(termStart(new Date(2026, 3, 20))).toBe('2026-04-15');
    expect(termStart(new Date(2026, 3, 10))).toBe('2026-01-01');
    expect(schoolYearStart(new Date(2026, 10, 11))).toBe('2026-09-01');
    expect(schoolYearStart(new Date(2026, 5, 1))).toBe('2025-09-01');
  });
});
