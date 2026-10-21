import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { DEADLINE_GRACE_MS } from '../src/mechanics/syncRounds.ts';
import { chainPoints, classic, climbFactor, potShares } from '../src/modes/classic/index.ts';
import { variants } from '../src/modes/classic/meta.ts';
import { bottomHalf } from '../src/modes/rules.ts';
import { drive, MCQ, type Driven } from './rule-helpers.ts';

/*
 * Classic's rule options, one block per option, each driven through a
 * runtime on a fake clock. Speed and streak bonuses are switched off where a
 * test needs exact numbers: every correct answer is then worth 1,000.
 */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;
const FLAT = { speedBonus: false, streakBonus: false, leaderboard: false };

function start(settings: Record<string, unknown>, players: Parameters<typeof drive>[1]['players'] = ['a', 'b', 'c'], extra: Partial<Parameters<typeof drive>[1]> = {}) {
  const h = drive(classic, { players, settings: { ...FLAT, ...settings }, ...extra });
  h.tick(4000); // intro
  expect(h.view(typeof players[0] === 'string' ? players[0] : players[0]!.id).sync.phase).toBe('question');
  return h;
}
/** Close the open question by running out its clock. */
const closeByTime = (h: Driven) => h.tick(20_000 + DEADLINE_GRACE_MS);
/** From the reveal to the next question (leaderboard off). */
const next = (h: Driven) => h.tick(5000);
const scores = (h: Driven, ids: string[]) => ids.map((id) => h.view(id).score);

describe('Mind the Embers: a wrong answer costs points', () => {
  it('takes the penalty off a wrong answer, never below 0, and charges nothing for silence', () => {
    const h = start(variant('classic-embers').settings!, ['a', 'b', 'c']);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'wrong'); // at 0 already: stays at 0
    expect(scores(h, ['a', 'b', 'c'])).toEqual([1000, 1000, 0]);
    next(h);
    h.answer('a', 'wrong');
    h.answer('b', 'right');
    closeByTime(h); // c says nothing
    expect(scores(h, ['a', 'b', 'c'])).toEqual([700, 2000, 0]);
    // The leaderboard shows the loss as a negative gain.
    const rows = h.view('a').board.rows as { playerId: string; gain: number }[];
    expect(rows.find((r) => r.playerId === 'a')!.gain).toBe(-300);
    expect(rows.find((r) => r.playerId === 'c')!.gain).toBe(0);
    expect(h.feed[0]!.text).toMatch(/wrong answer costs 300 points/);
    expect(h.errors).toEqual([]);
  });

  it('charges nothing for a partly right answer that scores, but does for one that scores nothing', () => {
    const multi: Question = { id: 'mu', type: 'multi', prompt: 'Pick the even numbers.', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }, { id: 'd', text: '8' }], correct: ['a', 'b', 'd'] };
    const h = start({ wrongPenalty: 300 }, ['a', 'b'], { questions: [MCQ[0]!, multi, ...MCQ.slice(1)] });
    h.answer('a', 'right');
    h.answer('b', 'right');
    next(h);
    const iid = h.view('a').sync.question.iid;
    // Two of the three even numbers: two thirds of the points. One of three: nothing, so the penalty.
    expect(h.rt.act('a', { type: 'answer', iid, answer: { type: 'multi', choiceIds: ['c0', 'c1'] } }).ok).toBe(true);
    expect(h.rt.act('b', { type: 'answer', iid, answer: { type: 'multi', choiceIds: ['c0'] } }).ok).toBe(true);
    expect(scores(h, ['a', 'b'])).toEqual([1670, 700]);
  });
});

describe('Glim Chain: a streak multiplier', () => {
  it('multiplies by the streak up to ×4, with no separate streak bonus', () => {
    const r = (streak: number, correct = true, partial = correct ? 1 : 0) => ({ correct, partial, responseMs: 0, limitMs: 20_000, streak });
    expect([1, 2, 3, 4, 5, 9].map((s) => chainPoints(r(s), { speedBonus: false, scale: 1 }))).toEqual([1000, 2000, 3000, 4000, 4000, 4000]);
    expect(chainPoints(r(0, false, 0.5), { speedBonus: false, scale: 1 })).toBe(500);
    expect(chainPoints(r(3), { speedBonus: false, scale: 2 })).toBe(6000);
  });

  it('builds the chain in a game and breaks it on a miss', () => {
    const h = start(variant('classic-glim-chain').settings!, ['a', 'b']);
    const gained: number[] = [];
    for (const [a] of [['right'], ['right'], ['right'], ['wrong'], ['right']] as const) {
      const before = h.view('a').score;
      h.answer('a', a);
      h.answer('b', 'wrong');
      gained.push(h.view('a').score - before);
      next(h);
    }
    // With the speed bonus off, each link is worth 1,000 times the length of the chain.
    expect(gained).toEqual([1000, 2000, 3000, 0, 1000]);
  });
});

describe('Comeback Night: the bottom half scores double', () => {
  it('ranks the bottom half with ties sharing the higher rank', () => {
    expect(bottomHalf({ a: 5, b: 3, c: 0 }, ['a', 'b', 'c'])).toEqual(['c']);
    expect(bottomHalf({ a: 5, b: 3, c: 0, d: 0 }, ['a', 'b', 'c', 'd'])).toEqual(['c', 'd']);
    expect(bottomHalf({ a: 0, b: 0 }, ['a', 'b'])).toEqual([]);
    expect(bottomHalf({ a: 9 }, ['a'])).toEqual([]);
  });

  it('doubles a correct answer for players behind when the question opened', () => {
    const h = start({ comeback: true }, ['a', 'b', 'c']);
    // Everyone level at the start: nobody is behind.
    expect(h.view('c').boosted).toBe(false);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'wrong');
    next(h);
    expect(h.view('c').boosted).toBe(true);
    expect(h.view('a').boosted).toBe(false);
    expect(h.feedTo('c')).toContain('You are in the bottom half: double points for this question.');
    expect(h.feedTo('a')).not.toContain('You are in the bottom half: double points for this question.');
    h.answer('a', 'right');
    h.answer('b', 'wrong');
    h.answer('c', 'right');
    expect(scores(h, ['a', 'b', 'c'])).toEqual([2000, 1000, 2000]);
    expect(h.view('c').sync.you.points).toBe(2000);
  });
});

describe('Fading Lights: the lowest score is knocked out', () => {
  it('knocks out the lowest score after each question and ends with the last one standing', () => {
    const v = variant('classic-fading-lights');
    const h = start(v.settings!, ['a', 'b', 'c'], { common: v.common! });
    expect(h.view('a').suddenDeath).toBe(true);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'wrong');
    expect(h.view('c').out).toBe(true);
    expect(h.view('a').alive).toBe(2);
    expect(h.feed.map((f) => f.text)).toContain('C had the lowest score and is out.');
    next(h);
    // Out: watching, not answering.
    expect(h.view('c').sync.you.eligible).toBe(false);
    h.answer('a', 'wrong');
    h.answer('b', 'right');
    expect(h.view('a').out).toBe(true);
    next(h);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toBe('B is the last one standing.');
    expect(h.rt.results?.standings.map((s) => [s.playerId, s.label])).toEqual([
      ['b', 'Survived, 2,000 pts'],
      ['a', 'Out on question 2'],
      ['c', 'Out on question 1'],
    ]);
  });

  it('breaks a tie at the bottom by this question, then by who answered more slowly', () => {
    const h = start({ knockout: true }, ['a', 'b', 'c']);
    h.answer('a', 'wrong');
    h.wait(3000);
    h.answer('c', 'wrong');
    h.answer('b', 'right');
    // a and c are level on 0 points; c answered more slowly.
    expect(h.view('c').out).toBe(true);
    expect(h.view('a').out).toBe(false);
  });

  it('knocks out nobody when everyone is dead level', () => {
    const h = start({ knockout: true }, ['a', 'b']);
    closeByTime(h); // nobody answers
    expect([h.view('a').out, h.view('b').out]).toEqual([false, false]);
    expect(h.view('a').alive).toBe(2);
  });

  it('makes a late joiner watch, and leaves a solo game to run every question', () => {
    const h = start({ knockout: true }, ['a', 'b', 'c']);
    h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false });
    expect(h.view('late').out).toBe(true);
    const solo = start({ knockout: true }, ['a']);
    for (let i = 0; i < 3 && solo.rt.status === 'running'; i++) {
      solo.answer('a', 'wrong');
      next(solo);
    }
    expect(solo.view('a').out).toBe(false);
  });
});

describe('Encore: questions most of the room missed come back', () => {
  it('replays a question fewer than half got right, at the end, for half points, recorded as an attempt', () => {
    const h = start({ encore: true }, ['a', 'b'], { common: { questionLimit: 3 } });
    const first = h.view('a').sync.question.q.prompt;
    expect(h.view('a').sync.total).toBe(3);
    h.answer('a', 'wrong');
    h.answer('b', 'right'); // one of two: not fewer than half, no encore
    expect(h.view('a').sync.total).toBe(3);
    next(h);
    const second = h.view('a').sync.question.q.prompt;
    h.answer('a', 'wrong');
    h.answer('b', 'wrong');
    expect(h.view('a').sync.total).toBe(4);
    expect(h.feed.map((f) => f.text)).toContain('Fewer than half got that one. It comes back at the end.');
    next(h);
    h.answer('a', 'right');
    h.answer('b', 'right');
    next(h);
    // Question 4 is the encore of question 2.
    expect(h.view('a').sync.question.q.prompt).toBe(second);
    expect(h.view('a').sync.question.q.prompt).not.toBe(first);
    expect(h.view('a').encore).toBe(true);
    expect(h.feed.map((f) => f.text)).toContain('Encore: the questions most of you missed, for half points.');
    const before = h.view('a').score;
    h.answer('a', 'right');
    h.answer('b', 'right');
    expect(h.view('a').score - before).toBe(500);
    const log = h.rt.answerLog();
    expect(log.slice(-2).map((x) => x.kind)).toEqual(['attempt', 'attempt']);
    expect(log.slice(0, -2).every((x) => x.kind === undefined)).toBe(true);
    next(h);
    expect(h.rt.status).toBe('ended');
  });

  it('never brings back an encore a second time', () => {
    const h = start({ encore: true }, ['a'], { common: { questionLimit: 2 } });
    for (let i = 0; i < 6 && h.rt.status === 'running'; i++) {
      h.answer('a', 'wrong');
      next(h);
    }
    // Two questions, each missed once and replayed once.
    expect(h.rt.status).toBe('ended');
    expect(h.rt.answerLog()).toHaveLength(4);
  });
});

describe('Rare Light: split the pot', () => {
  it('shares a pot in proportion to credit, rounded to 10', () => {
    expect(potShares(4000, { a: 1, b: 1, c: 0 })).toEqual({ a: 2000, b: 2000 });
    expect(potShares(3000, { a: 1, b: 0.5 })).toEqual({ a: 2000, b: 1000 });
    expect(potShares(3000, { a: 0 })).toEqual({});
  });

  it('gives each question a pot of 1,000 per player, shared by everyone who got it right', () => {
    const h = start(variant('classic-rare-light').settings!, ['a', 'b', 'c', 'd']);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'wrong');
    closeByTime(h);
    expect(scores(h, ['a', 'b', 'c', 'd'])).toEqual([2000, 2000, 0, 0]);
    expect(h.view('a').sync.you.points).toBe(2000);
    expect(h.feed.map((f) => f.text)).toContain('2 players shared the pot of 4,000 points.');
    next(h);
    h.answer('a', 'wrong');
    h.answer('b', 'wrong');
    h.answer('c', 'right');
    h.answer('d', 'wrong');
    expect(h.view('c').score).toBe(4000);
    expect(h.feed.map((f) => f.text)).toContain('C took the whole pot of 4,000 points!');
    next(h);
    h.answer('a', 'wrong');
    h.answer('b', 'wrong');
    h.answer('c', 'wrong');
    h.answer('d', 'wrong');
    expect(h.feed.map((f) => f.text)).toContain('Nobody got that one, so nobody shares the pot.');
  });
});

describe('Ladder of Lights: easy to hard, harder scores more', () => {
  const graded: Question[] = (['hard', 'easy', undefined, 'easy', 'medium'] as const).map((difficulty, i) => ({ ...MCQ[i]!, ...(difficulty ? { difficulty } : {}) }));

  it('weighs difficulty: easy ×1, medium ×1.5, hard ×2, none counts as medium', () => {
    expect([climbFactor('easy'), climbFactor('medium'), climbFactor('hard'), climbFactor(undefined)]).toEqual([1, 1.5, 2, 1.5]);
  });

  it('plays the easiest questions first and scores the harder ones higher', () => {
    const h = start(variant('classic-ladder').settings!, ['a'], { questions: graded });
    const prompts: string[] = [];
    const gained: number[] = [];
    while (h.rt.status === 'running' && h.view('a').sync.phase === 'question') {
      prompts.push(h.view('a').sync.question.q.prompt);
      const before = h.view('a').score;
      h.answer('a', 'right');
      gained.push(h.view('a').score - before);
      next(h);
    }
    // Easy (2nd, 4th), then medium and no difficulty (3rd, 5th) in set order, then hard (1st).
    expect(prompts).toEqual([graded[1], graded[3], graded[2], graded[4], graded[0]].map((q) => q!.prompt));
    expect(gained).toEqual([1000, 1000, 1500, 1500, 2000]);
    const lines = h.feed.map((f) => f.text);
    expect(lines).toContain('Medium questions now: one and a half times the points.');
    expect(lines).toContain('Hard questions now: double points!');
  });
});

describe('Half Moon: answers close at half the room', () => {
  it('closes the question once half the players have answered', () => {
    const h = start(variant('classic-half-moon').settings!, ['a', 'b', 'c', 'd']);
    h.answer('a', 'right');
    expect(h.view('a').sync.phase).toBe('question');
    h.answer('b', 'wrong');
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.answer('c', 'right')).toMatchObject({ ok: false, message: 'Answers are closed.' });
    // Three players: two answers close it. One player: their own answer does.
    const three = start({ halfClose: true }, ['a', 'b', 'c']);
    three.answer('a', 'right');
    expect(three.view('a').sync.phase).toBe('question');
    three.answer('b', 'right');
    expect(three.view('a').sync.phase).toBe('reveal');
    const solo = start({ halfClose: true }, ['a']);
    solo.answer('a', 'right');
    expect(solo.view('a').sync.phase).toBe('reveal');
  });
});

describe('In Unison: a team bonus when every player is right', () => {
  it('adds the bonus to a team whose players all answered correctly', () => {
    const v = variant('classic-in-unison');
    const h = start(v.settings!, [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], { teams: 2 });
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'right');
    h.answer('d', 'wrong');
    const teams = h.view('a').teams as { teamId: string; score: number; bonus: number }[];
    expect(teams.map((t) => [t.teamId, t.score, t.bonus])).toEqual([
      ['t1', 1500, 500],
      ['t2', 500, 0],
    ]);
    expect(h.feed.map((f) => f.text)).toContain('In unison! +500 for the Comets.');
    const res = h.rt.end('host')!;
    expect(res.teamStandings.map((t) => [t.teamId, t.score, t.label])).toEqual([
      ['t1', 1500, '1,000 avg + 500 bonus'],
      ['t2', 500, '500 avg'],
    ]);
  });
});
