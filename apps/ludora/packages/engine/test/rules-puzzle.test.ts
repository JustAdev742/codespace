import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { lanternMatch } from '../src/modes/lantern-match/index.ts';
import { variants as matchVariants } from '../src/modes/lantern-match/meta.ts';
import { streakMultiplier, wordScramble } from '../src/modes/word-scramble/index.ts';
import { variants as scrambleVariants } from '../src/modes/word-scramble/meta.ts';
import { multiplierFor, overdriveMultiplier, timeAttack } from '../src/modes/time-attack/index.ts';
import { variants as timeVariants } from '../src/modes/time-attack/meta.ts';
import { RETURN_AFTER, survivalRun } from '../src/modes/survival-run/index.ts';
import { variants as survivalVariants } from '../src/modes/survival-run/meta.ts';
import { flashcardStudy, reversible } from '../src/modes/flashcard-study/index.ts';
import { variants as studyVariants } from '../src/modes/flashcard-study/meta.ts';
import { findAnswerLeaks } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven } from './rule-helpers.ts';

/* Rule options of the puzzle and solo modes: Lantern Match, Word Scramble, Time Attack, Survival Run and Flashcard Study. */

const pick = <T extends { meta: { id: string } }>(list: readonly T[], id: string) => list.find((v) => v.meta.id === id)!;

/** Typed answers that are all different, so memory boards and scrambles behave predictably. */
const WORDS: Question[] = ['Paris', 'Jupiter', 'Lion', 'Green', 'Violin', 'Copper', 'Maple', 'Falcon'].map((w, i) => ({ id: `s${i + 1}`, type: 'short' as const, prompt: `Clue number ${i + 1}?`, accepted: [w] }));

/* ------------------------------ Lantern Match ---------------------------- */

describe('Careful Match: every third miss costs a pair', () => {
  it('takes a found pair away on every third miss, never below none', () => {
    const h = drive(lanternMatch, { players: ['a'], questions: WORDS, settings: pick(matchVariants, 'lantern-match-careful').settings });
    const cards = () => h.state().players.a.board.cards as { qid: string; side: string }[];
    const flip = (i: number) => expect(h.rt.act('a', { type: 'flip', index: i }).ok).toBe(true);
    const pairOf = (qid: string) => cards().flatMap((c, i) => (c.qid === qid ? [i] : []));
    const miss = () => {
      const all = cards();
      const matched = h.state().players.a.board.matched as boolean[];
      const q = all.findIndex((c, i) => c.side === 'question' && !matched[i]);
      const a = all.findIndex((c, i) => c.side === 'answer' && !matched[i] && c.qid !== all[q]!.qid);
      flip(q);
      flip(a);
    };
    for (const i of pairOf(cards()[0]!.qid)) flip(i);
    expect(h.view('a').you.pairs).toBe(1);
    miss();
    miss();
    expect(h.view('a').you).toMatchObject({ pairs: 1, misses: 2 });
    miss();
    expect(h.view('a').you).toMatchObject({ pairs: 0, misses: 3 });
    expect(h.feedTo('a')).toContain('That was miss number 3: it cost you a pair.');
    for (let i = 0; i < 3; i++) miss();
    expect(h.view('a').you).toMatchObject({ pairs: 0, misses: 6 });
    expect(h.rt.end('host')!.standings[0]!.label).toBe('0 pairs, 6 misses (1 pair lost)');
  });
});

/* ------------------------------ Word Scramble ---------------------------- */

describe('Word Scramble rule options', () => {
  const scramble = (settings: Record<string, unknown>, questions = WORDS.slice(0, 3)) => drive(wordScramble, { players: ['a'], questions, settings });
  const word = (h: Driven) => h.view('a').you.word;
  const answerOf = (h: Driven) => (WORDS.find((q) => q.prompt === word(h).q.prompt) as Extract<Question, { type: 'short' }>).accepted[0]!;
  const solve = (h: Driven, text = answerOf(h)) => expect(h.rt.act('a', { type: 'solve', iid: word(h).iid, text }).ok).toBe(true);
  const next = (h: Driven) => expect(h.rt.act('a', { type: 'next' }).ok).toBe(true);

  it('First Spell: a wrong spelling ends the word', () => {
    const h = scramble(pick(scrambleVariants, 'word-scramble-first-spell').settings!);
    solve(h, 'not the answer');
    expect(word(h)).toBeNull();
    expect(h.view('a').you).toMatchObject({ points: 0, last: { correct: false, text: 'Not quite, and there is only one try' }, answerText: 'Paris' });
    expect(h.rt.answerLog()).toMatchObject([{ qid: 's1', correct: false }]);
  });

  it('Second Chances: skipped words come back after the last one, for half points, as attempts', () => {
    const h = scramble(pick(scrambleVariants, 'word-scramble-second-chances').settings!);
    expect(h.view('a').total).toBe(3);
    h.rt.act('a', { type: 'skip', iid: word(h).iid });
    expect(h.view('a').total).toBe(4);
    expect(h.feedTo('a')).toContain('That word comes back once after your last word, for half points.');
    next(h);
    solve(h);
    next(h);
    solve(h);
    next(h);
    // The fourth word is the first one again, now worth half.
    expect(answerOf(h)).toBe('Paris');
    expect(word(h).value).toBe(25);
    solve(h);
    // Jupiter (70) and Lion (40) first time, then Paris for half of 50.
    expect(h.view('a').you).toMatchObject({ points: 70 + 40 + 25, solved: 3, finished: true });
    expect(h.rt.answerLog().map((x) => [x.qid, x.correct, x.kind ?? 'answer'])).toEqual([
      ['s1', false, 'answer'],
      ['s2', true, 'answer'],
      ['s3', true, 'answer'],
      ['s1', true, 'attempt'],
    ]);
    expect(h.rt.status).toBe('ended');
  });

  it('Spelling Streak: words solved in a row score double, then triple', () => {
    expect([0, 1, 2, 5].map(streakMultiplier)).toEqual([1, 2, 3, 3]);
    const h = scramble(pick(scrambleVariants, 'word-scramble-spelling-streak').settings!, WORDS.slice(0, 4));
    const gained: number[] = [];
    for (const go of ['solve', 'solve', 'solve', 'skip'] as const) {
      const before = h.view('a').you.points;
      if (go === 'solve') {
        const shown = word(h).value;
        solve(h);
        expect(h.view('a').you.points - before).toBe(shown);
      } else h.rt.act('a', { type: 'skip', iid: word(h).iid });
      gained.push(h.view('a').you.points - before);
      if (h.rt.status === 'running') next(h);
    }
    // Paris (50), Jupiter (70 × 2), Lion (40 × 3), then a skip.
    expect(gained).toEqual([50, 140, 120, 0]);
  });
});

/* ------------------------------- Time Attack ----------------------------- */

describe('Time Attack rule options', () => {
  it('Keep It Lit: a correct answer adds seconds back, never above the starting clock', () => {
    const h = drive(timeAttack, { players: ['a'], questions: TRUE_SET, settings: pick(timeVariants, 'time-attack-keep-it-lit').settings });
    const start = h.view('a').you.startedAt;
    expect(h.view('a').you.endsAt - start).toBe(30_000);
    h.answer('a', 'right');
    expect(h.view('a').you.endsAt - start).toBe(30_000);
    h.wait(5_000);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ endsAt: start + 32_000, last: { text: '+2 s' } });
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ endsAt: start + 29_000, last: { text: '−3 s' } });
    h.wait(20_000);
    h.answer('a', 'right');
    expect(h.view('a').you.endsAt).toBe(start + 31_000);
    // Past where the clock would have run out without the bonus.
    h.tick(5_000);
    expect(h.rt.status).toBe('running');
  });

  it('Supernova: the multiplier has no top, and a slip costs the penalty times the multiplier', () => {
    expect([0, 4, 5, 15, 40].map(overdriveMultiplier)).toEqual([1, 1, 2, 4, 9]);
    expect(multiplierFor(40)).toBe(3);
    const h = drive(timeAttack, { players: ['a'], questions: TRUE_SET, settings: pick(timeVariants, 'time-attack-supernova').settings });
    for (let i = 0; i < 15; i++) h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ multiplier: 4, nextBoostIn: 5, score: 500 + 1000 + 1500 });
    expect(h.view('a').penaltyMs).toBe(12_000);
    const before = h.view('a').you.endsAt;
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ multiplier: 1, endsAt: before - 12_000, last: { text: '−12 s' } });
    expect(h.view('a').penaltyMs).toBe(3_000);
  });
});

/* ------------------------------ Survival Run ----------------------------- */

describe('Survival Run rule options', () => {
  const answerAndMoveOn = (h: Driven, which: 'right' | 'wrong') => {
    expect(h.answer('a', which).ok).toBe(true);
    if (h.view('a').you.phase === 'result') expect(h.rt.act('a', { type: 'next' }).ok).toBe(true);
  };

  it('Second Wind: a missed question comes back, and answering it right wins the heart back', () => {
    const h = drive(survivalRun, { players: ['a'], questions: TRUE_SET, settings: pick(survivalVariants, 'survival-run-second-wind').settings });
    const missed = h.view('a').you.question.q.prompt;
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ hearts: 2, heartChange: -1, last: { text: `It comes back in ${RETURN_AFTER} questions` } });
    h.rt.act('a', { type: 'next' });
    for (let i = 0; i < RETURN_AFTER; i++) {
      expect(h.view('a').you.question.q.prompt).not.toBe(missed);
      answerAndMoveOn(h, 'right');
    }
    expect(h.view('a').you.question.q.prompt).toBe(missed);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ hearts: 3, heartChange: 1, last: { text: 'Second wind: heart won back' } });
    expect(h.rt.answerLog().at(-1)).toMatchObject({ correct: true, kind: 'attempt' });
  });

  it('Second Wind: a question missed again on its return does not come back a third time', () => {
    const h = drive(survivalRun, { players: ['a'], questions: TRUE_SET, settings: { secondWind: true, restores: false, hearts: 5 } });
    const missed = h.view('a').you.question.q.prompt;
    answerAndMoveOn(h, 'wrong');
    for (let i = 0; i < RETURN_AFTER; i++) answerAndMoveOn(h, 'right');
    expect(h.view('a').you.question.q.prompt).toBe(missed);
    answerAndMoveOn(h, 'wrong');
    expect(h.state().runners.a.returns).toEqual([]);
    // The rest of the deck comes next, not the missed statement.
    const following: string[] = [];
    for (let i = 0; i < 4; i++) {
      following.push(h.view('a').you.question.q.prompt);
      answerAndMoveOn(h, 'right');
    }
    expect(following).toEqual(TRUE_SET.slice(4, 8).map((q) => q.prompt));
    expect(h.view('a').you.hearts).toBe(3);
  });

  it('Phoenix Run: one heart to start, and every 10 correct answers add one, up to five', () => {
    const h = drive(survivalRun, { players: ['a'], questions: TRUE_SET, settings: pick(survivalVariants, 'survival-run-phoenix').settings });
    expect(h.view('a')).toMatchObject({ maxHearts: 5, you: { hearts: 1 } });
    for (let i = 0; i < 10; i++) answerAndMoveOn(h, 'right');
    expect(h.view('a').you.hearts).toBe(2);
    for (let i = 0; i < 40; i++) answerAndMoveOn(h, 'right');
    expect(h.view('a').you.hearts).toBe(5);
    answerAndMoveOn(h, 'wrong');
    expect(h.view('a').you.hearts).toBe(4);
  });
});

/* ----------------------------- Flashcard Study --------------------------- */

describe('Back to Front: reversed flashcards', () => {
  it('reverses only cards with a single written answer', () => {
    const byType = (t: Question['type']) => MIXED_SET.find((q) => q.type === t)!;
    expect(reversible(FLASHCARD_SET[0]!)).toBe(true);
    expect(reversible(byType('short'))).toBe(true);
    expect(reversible(byType('mcq'))).toBe(true);
    for (const t of ['truefalse', 'numeric', 'order', 'match', 'multi'] as const) expect(reversible(byType(t)), t).toBe(false);
    expect(reversible({ ...FLASHCARD_SET[0]!, media: { kind: 'image', url: '/art/leaf.png', alt: 'A leaf' } })).toBe(false);
    const pictureAnswer: Question = { id: 'p', type: 'mcq', prompt: 'Which is a fox?', choices: [{ id: 'a', text: 'Fox', media: { kind: 'image', url: '/art/fox.png', alt: 'A fox' } }, { id: 'b', text: 'Badger' }], correct: 'a' };
    expect(reversible(pictureAnswer)).toBe(false);
  });

  it('shows the answer on the front and the term on the back', () => {
    const h = drive(flashcardStudy, { players: ['a'], questions: FLASHCARD_SET, settings: pick(studyVariants, 'flashcard-study-back-to-front').settings });
    const card = h.view('a').you.card;
    expect(card.q).toEqual({ type: 'flashcard', prompt: 'An animal that eats only plants' });
    expect(card).not.toHaveProperty('back');
    expect(JSON.stringify(h.view('a'))).not.toContain('Herbivore');
    h.rt.act('a', { type: 'flip', iid: card.iid });
    expect(h.view('a').you.card).toMatchObject({ flipped: true, back: 'Herbivore' });
    expect(findAnswerLeaks(h.view('a'))).toEqual([]);
  });

  it('keeps true-or-false cards the usual way round', () => {
    const h = drive(flashcardStudy, { players: ['a'], questions: [MIXED_SET[1]!], settings: { reverse: true } });
    expect(h.view('a').you.card.q).toEqual({ type: 'truefalse', prompt: MIXED_SET[1]!.prompt });
  });
});
