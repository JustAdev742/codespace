import { describe, expect, it } from 'vitest';
import { fromCode } from '@ludora/shared';
import { syncShown } from '../src/mechanics/syncRounds.ts';
import { classic } from '../src/modes/classic/index.ts';
import { variants as classicVariants } from '../src/modes/classic/meta.ts';
import { MODES, VARIANTS } from '../src/modes/index.ts';
import { blueprintMode } from '../src/modes/made-game/index.ts';
import type { GameMode, ModeVariant } from '../src/sdk/types.ts';
import { drive, type Driven } from './rule-helpers.ts';

/*
 * Nobody is told whether an answer was right until the reveal. In a game of synced rounds the room
 * shares one question, so a score that jumps, a streak that breaks or a leaderboard that reorders
 * the moment one player answers would tell them (and anyone watching a board) the answer while it
 * is still open for everyone else. These tests play the same game twice from one seed, differing
 * only in whether one player's answer to the open question is right, and require every screen and
 * the room's news to be identical until the question closes.
 */

/**
 * Host-paced modes this promise does not cover, each with its reason. A new host-paced mode must be
 * covered below or listed here: the first test fails until someone has decided.
 */
const NOT_COVERED: Record<string, string> = {
  'quick-draw': 'A buzzer: the first right answer ends the round for everyone, and a wrong one locks that player out, at once and by design.',
  glimgo: 'A card game: players mark squares on their own card for a called question; there is no shared answer to hold back.',
};

type Phase = string | undefined;
const phaseOf = (h: Driven): Phase => h.view('a')?.sync?.phase;
/** The round on screen: synced-round modes keep it in `sync`, and Confidence at the top of its view too. */
const roundOf = (h: Driven): number => h.view('a')?.sync?.round ?? -1;

/** Move the game on until `a` has question `round` open, staking the most where a mode asks how sure a player is. */
function toQuestion(h: Driven, round: number): boolean {
  for (let i = 0; i < 120; i++) {
    if (phaseOf(h) === 'question' && roundOf(h) === round) return true;
    if (phaseOf(h) === 'wager') for (const id of ['a', 'b', 'c']) h.rt.act(id, { type: 'wager', level: 3 });
    else if (h.view('a')?.sync?.phaseEndsAt === null) h.rt.hostNext();
    h.tick(500);
  }
  return false;
}

/** Play to the second question with everyone right on the first (so a streak is at stake), then `a` answers. */
function upToAnAnswer(mode: GameMode, variant: ModeVariant | undefined, which: 'right' | 'wrong'): Driven | null {
  const h = drive(mode, { players: ['a', 'b', 'c'], ...(variant ? { variant } : {}) });
  if (!toQuestion(h, 0)) return null;
  // Everyone who can answers right (a variant may close the question before the last of them does).
  for (const id of ['a', 'b', 'c']) if (phaseOf(h) === 'question') expect(h.answer(id, 'right').ok, `${id} answers the first question`).toBe(true);
  if (!toQuestion(h, 1)) return null;
  expect(h.answer('a', which).ok, 'a answers the second question').toBe(true);
  return h;
}

const COVERED = ['classic', 'lantern-out', 'confidence', 'glim-duels'];

const CASES: { name: string; mode: GameMode; variant?: ModeVariant }[] = [
  ...MODES.filter((m) => COVERED.includes(m.meta.id)).flatMap((mode) => [{ name: mode.meta.title, mode }, ...VARIANTS.filter((v) => v.meta.modeId === mode.meta.id).map((variant) => ({ name: `${mode.meta.title}: ${variant.meta.title}`, mode, variant }))]),
  (() => {
    const made = fromCode('game "Rounds"\nrace to 60 steps\nquestions: together, 8 questions, 20 seconds each\nright answer: move 2 steps\nwrong answer: nothing\nstops after 10 minutes\n');
    if (!made.ok) throw new Error(made.problems.map((p) => p.message).join(' / '));
    return { name: 'A made game played in rounds', mode: blueprintMode(made.blueprint) as GameMode };
  })(),
];

describe('an open question tells nobody whether an answer was right', () => {
  it('covers every host-paced mode, or says why not', () => {
    for (const m of MODES.filter((x) => x.meta.pacing === 'host')) {
      expect(COVERED.includes(m.meta.id) || Boolean(NOT_COVERED[m.meta.id]), `${m.meta.id} is host-paced: cover it in this test, or list it in NOT_COVERED with the reason`).toBe(true);
    }
    for (const id of [...COVERED, ...Object.keys(NOT_COVERED)]) expect(MODES.some((m) => m.meta.id === id), id).toBe(true);
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(CASES)('$name', ({ mode, variant }) => {
    const right = upToAnAnswer(mode, variant, 'right');
    const wrong = upToAnAnswer(mode, variant, 'wrong');
    expect(right && wrong, 'the game reached its second question').toBeTruthy();
    if (!right || !wrong) return;
    // Two players have still to answer, so the question is open in both games.
    expect(phaseOf(right)).toBe('question');
    expect(phaseOf(wrong)).toBe('question');
    // The player who answered, another player and the big screen each see the same in both games.
    expect(right.view('a')).toEqual(wrong.view('a'));
    expect(right.view('b')).toEqual(wrong.view('b'));
    expect(right.host()).toEqual(wrong.host());
    expect(right.feed).toEqual(wrong.feed);
    expect(right.errors).toEqual([]);
    expect(wrong.errors).toEqual([]);
    // Once the question closes, the two games do differ: the result arrives with the reveal.
    for (const h of [right, wrong]) {
      for (const id of ['b', 'c']) if (phaseOf(h) === 'question') h.answer(id, 'right');
      expect(phaseOf(h)).not.toBe('question');
    }
    expect(right.view('a')).not.toEqual(wrong.view('a'));
  });
});

describe('scores and streaks wait for the reveal', () => {
  const FLAT = { speedBonus: false, streakBonus: false, leaderboard: false, autoAdvance: false };

  it('holds an answer\'s points and its streak back while the question is open, and lands them when it closes', () => {
    const h = drive(classic, { players: ['a', 'b'], settings: FLAT });
    h.tick(4000);
    h.answer('a', 'right');
    // Scored in the state at once (rules such as a knockout read it), shown only at the reveal.
    expect(h.state().sync.scores.a).toBe(1000);
    expect(h.view('a').score).toBe(0);
    expect(h.view('a').sync.you).toMatchObject({ answered: true, correct: null, points: null, streak: 0 });
    expect(h.view('b').board.rows.map((r: { score: number }) => r.score)).toEqual([0, 0]);
    expect(h.host().board.rows.map((r: { score: number }) => r.score)).toEqual([0, 0]);
    h.answer('b', 'wrong');
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.view('a').score).toBe(1000);
    expect(h.view('a').sync.you).toMatchObject({ correct: true, points: 1000, streak: 1 });
    expect(h.view('b').sync.you).toMatchObject({ correct: false, points: 0, streak: 0 });
    expect(h.host().board.rows.map((r: { score: number }) => r.score)).toEqual([1000, 0]);
  });

  it('keeps a streak on show until the answer that broke it is revealed', () => {
    const h = drive(classic, { players: ['a', 'b'], settings: FLAT });
    h.tick(4000);
    for (let round = 0; round < 2; round++) {
      h.answer('a', 'right');
      h.answer('b', 'right');
      h.rt.hostNext();
    }
    expect(h.view('a').sync.you.streak).toBe(2);
    h.answer('a', 'wrong');
    expect(h.view('a').sync.you.streak).toBe(2);
    h.answer('b', 'right');
    expect(h.view('a').sync.you.streak).toBe(0);
    expect(h.view('b').sync.you.streak).toBe(3);
  });

  it('holds back a wrong answer\'s penalty as well (Mind the Embers)', () => {
    const embers = classicVariants.find((v) => v.meta.id === 'classic-embers')!;
    const h = drive(classic, { players: ['a', 'b'], settings: { ...FLAT, ...embers.settings } });
    h.tick(4000);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.rt.hostNext();
    h.answer('a', 'wrong');
    // 300 points are already gone in the state; the screens still say 1,000 until the reveal.
    expect(h.state().sync.scores.a).toBe(700);
    expect(h.view('a').score).toBe(1000);
    expect(h.view('b').board.rows.find((r: { playerId: string }) => r.playerId === 'a').score).toBe(1000);
    h.answer('b', 'right');
    expect(h.view('a').score).toBe(700);
  });

  it('leaves the state alone, and shows the true scores between questions', () => {
    const h = drive(classic, { players: ['a', 'b'], settings: FLAT });
    h.tick(4000);
    h.answer('a', 'right');
    const state = h.state();
    const before = JSON.stringify(state);
    const shown = syncShown(state);
    expect(shown.scores).toEqual({ a: 0, b: 0 });
    expect(shown.streaks).toEqual({ a: 0, b: 0 });
    expect(JSON.stringify(state)).toBe(before);
    h.answer('b', 'right');
    const closed = h.state();
    expect(syncShown(closed).scores).toBe(closed.sync.scores);
    expect(syncShown(closed).streaks).toBe(closed.sync.streaks);
  });
});
