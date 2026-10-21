import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { DEADLINE_GRACE_MS } from '../src/mechanics/syncRounds.ts';
import { quickDraw } from '../src/modes/quick-draw/index.ts';
import { variants as quickVariants } from '../src/modes/quick-draw/meta.ts';
import { lanternOut } from '../src/modes/lantern-out/index.ts';
import { variants as lanternVariants } from '../src/modes/lantern-out/meta.ts';
import { confidence, stakeMultiplier } from '../src/modes/confidence/index.ts';
import { variants as confidenceVariants } from '../src/modes/confidence/meta.ts';
import { glimgo } from '../src/modes/glimgo/index.ts';
import { variants as glimgoVariants } from '../src/modes/glimgo/meta.ts';
import { drive, type Driven } from './rule-helpers.ts';

/* Rule options of the host-paced modes: Quick Draw, Lantern Out, Confidence and Glimgo. */

const pick = <T extends { meta: { id: string } }>(list: readonly T[], id: string) => list.find((v) => v.meta.id === id)!;
const texts = (h: Driven) => h.feed.map((f) => f.text);

/* ------------------------------- Quick Draw ------------------------------ */

describe('One Voice: one try per team', () => {
  const v = pick(quickVariants, 'quick-draw-one-voice');
  const seats = [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }];
  function start(settings = v.settings!) {
    const h = drive(quickDraw, { players: seats, teams: 2, settings });
    h.tick(3000);
    return h;
  }

  it('locks the whole team out when one player answers wrong', () => {
    const h = start();
    h.answer('a', 'wrong');
    expect(h.view('b').you.lockedOut).toBe(true);
    expect(h.view('b').sync.you.eligible).toBe(false);
    expect(h.answer('b', 'right')).toMatchObject({ ok: false, message: 'You are out of this round.' });
    expect(h.view('c').you.lockedOut).toBe(false);
    expect(h.host().lockedOut).toBe(2);
    expect(h.feedTo('b')).toContain('A answered for your team and it was wrong: your team is locked out of this question.');
    expect(h.feedTo('c')).toEqual([]);
    h.answer('c', 'right');
    expect(h.view('a').winner).toMatchObject({ playerId: 'c' });
    expect((h.view('a').teams as { teamId: string; score: number }[]).map((t) => [t.teamId, t.score])).toEqual([
      ['t1', 0],
      ['t2', 1],
    ]);
  });

  it('closes the question once every team has had its try', () => {
    const h = start();
    h.answer('a', 'wrong');
    expect(h.view('a').sync.phase).toBe('question');
    h.answer('d', 'wrong');
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.view('a').winner).toBeNull();
  });

  it('does nothing without teams', () => {
    const h = drive(quickDraw, { players: ['a', 'b'], settings: { teamTry: true } });
    h.tick(3000);
    h.answer('a', 'wrong');
    expect(h.view('b').you.lockedOut).toBe(false);
    expect(h.answer('b', 'right').ok).toBe(true);
  });
});

/* ------------------------------- Lantern Out ----------------------------- */

describe('Lantern Out rule options', () => {
  function start(settings: Record<string, unknown>, players: Parameters<typeof drive>[1]['players'] = ['a', 'b'], extra: Partial<Parameters<typeof drive>[1]> = {}) {
    const h = drive(lanternOut, { players, settings: { reviveEvery: 0, ...settings }, ...extra });
    h.tick(4000);
    return h;
  }
  const next = (h: Driven) => h.tick(5000);

  it('Kindling: three correct answers in a row relight a lantern, up to the start', () => {
    const h = start(pick(lanternVariants, 'lantern-out-kindling').settings!);
    h.answer('a', 'wrong');
    h.answer('b', 'right');
    expect(h.view('a').you.lanterns).toBe(2);
    for (let i = 0; i < 3; i++) {
      next(h);
      h.answer('a', 'right');
      h.answer('b', 'right');
    }
    expect(h.view('a').you.lanterns).toBe(3);
    expect(h.view('a').last.kindled).toEqual(['A']);
    expect(texts(h)).toContain('Three in a row relit a lantern for A.');
    // b has been right six times in a row, but was never short of a lantern.
    expect(h.view('b').you.lanterns).toBe(3);
  });

  it('Flicker Rush: the slowest of two or more correct answers loses a lantern too', () => {
    const h = start(pick(lanternVariants, 'lantern-out-flicker-rush').settings!, ['a', 'b', 'c']);
    h.answer('a', 'right');
    h.wait(3000);
    h.answer('b', 'right');
    h.answer('c', 'wrong');
    expect(h.view('a').you.lanterns).toBe(3);
    expect(h.view('b').you).toMatchObject({ lanterns: 2, lost: true });
    expect(h.view('c').you.lanterns).toBe(2);
    expect(h.view('a').last).toMatchObject({ blown: 2, slow: ['B'] });
    expect(texts(h)).toContain('B answered right but slowest, and lost a lantern.');
    next(h);
    // A lone correct answer is never the slowest; neither is a dead heat.
    h.answer('a', 'right');
    h.answer('b', 'wrong');
    h.answer('c', 'wrong');
    expect(h.view('a').you.lanterns).toBe(3);
    next(h);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'right');
    // a, b and c all answered at the same moment.
    expect(h.view('a').last.slow).toEqual([]);
  });

  it('Last Team Lit: the game ends when only one team still has a lantern', () => {
    const v = pick(lanternVariants, 'lantern-out-last-team');
    const h = start({ ...v.settings, lives: 1 }, [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], { teams: 2 });
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'wrong');
    h.answer('d', 'wrong');
    expect(texts(h)).toContain('The Lanterns have no lanterns left!');
    next(h);
    // Two players are still in, but they are on the same team.
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toBe('The Comets are the last team with a lantern lit.');
    expect(h.rt.results?.teamStandings.map((t) => [t.teamId, t.rank, t.label])).toEqual([
      ['t1', 1, 'Still lit: 100% of lanterns'],
      ['t2', 2, 'Out on question 1'],
    ]);
  });

  it('Night Vigil: the room plays on past one survivor and wins together if half stay lit', () => {
    const v = pick(lanternVariants, 'lantern-out-night-vigil');
    const lost = start({ ...v.settings, lives: 1 }, ['a', 'b', 'c', 'd'], { common: { questionLimit: 2 } });
    lost.answer('a', 'right');
    for (const id of ['b', 'c', 'd']) lost.answer(id, 'wrong');
    next(lost);
    expect(lost.rt.status).toBe('running');
    expect(lost.view('a').sync.phase).toBe('question');
    lost.answer('a', 'right');
    next(lost);
    expect(lost.rt.results).toMatchObject({ outcome: 'coop-loss', summary: 'Only 1 of 4 still have a lantern lit: the room needed half.' });

    const won = start({ ...v.settings, lives: 1 }, ['a', 'b', 'c', 'd'], { common: { questionLimit: 2 } });
    for (let q = 0; q < 2; q++) {
      won.answer('a', 'right');
      won.answer('b', 'right');
      won.answer('c', 'wrong');
      won.answer('d', q === 0 ? 'wrong' : 'right');
      next(won);
    }
    expect(won.rt.results).toMatchObject({ outcome: 'coop-win', summary: '2 of 4 still have a lantern lit: the room wins together!' });
  });
});

/* ------------------------------- Confidence ------------------------------ */

describe('Confidence rule options', () => {
  function start(settings: Record<string, unknown>, players = ['a', 'b'], common: Record<string, number> = {}) {
    const h = drive(confidence, { players, settings: { leaderboard: false, ...settings }, common });
    h.tick(4000);
    expect(h.view('a').phase).toBe('wager');
    return h;
  }
  /** Everyone picks a level (so the question opens), then answers. */
  function round(h: Driven, answers: Record<string, ['right' | 'wrong', 1 | 2 | 3]>) {
    for (const [id, [, level]] of Object.entries(answers)) h.rt.act(id, { type: 'wager', level });
    for (const [id, [which]] of Object.entries(answers)) h.answer(id, which);
    expect(h.view('a').phase).toBe('reveal');
  }
  const next = (h: Driven) => h.tick(6000);

  it('Returning Comets: a question fewer than half got right comes back at the end, as an attempt', () => {
    const h = start(pick(confidenceVariants, 'confidence-returning-comets').settings!, ['a', 'b'], { questionLimit: 2 });
    const first = h.view('a').prompt.prompt;
    round(h, { a: ['wrong', 1], b: ['wrong', 2] });
    expect(h.view('a').total).toBe(3);
    expect(texts(h)).toContain('Fewer than half got that one. It comes back at the end.');
    next(h);
    round(h, { a: ['right', 1], b: ['wrong', 1] });
    expect(h.view('a').total).toBe(3);
    next(h);
    expect(h.view('a').prompt.prompt).toBe(first);
    expect(texts(h)).toContain('Returning questions: the ones most of you missed come round again.');
    round(h, { a: ['right', 3], b: ['right', 3] });
    expect(h.view('a').you.outcome).toMatchObject({ level: 3, correct: true, change: 300 });
    expect(h.rt.answerLog().map((x) => x.kind ?? 'answer')).toEqual(['answer', 'answer', 'answer', 'answer', 'attempt', 'attempt']);
    next(h);
    expect(h.rt.status).toBe('ended');
  });

  it('Rising Stakes: stakes double from question 5 and triple from question 9', () => {
    expect([0, 3, 4, 7, 8, 11].map((r) => stakeMultiplier(r, true))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(stakeMultiplier(9, false)).toBe(1);
    const h = start(pick(confidenceVariants, 'confidence-rising-stakes').settings!, ['a']);
    expect(h.view('a').stakes).toEqual([
      { level: 1, gain: 100, loss: 0 },
      { level: 2, gain: 200, loss: 50 },
      { level: 3, gain: 300, loss: 100 },
    ]);
    for (let i = 0; i < 4; i++) {
      round(h, { a: ['right', 1] });
      next(h);
    }
    expect(h.view('a').round).toBe(4);
    expect(h.view('a').stakes).toEqual([
      { level: 1, gain: 200, loss: 0 },
      { level: 2, gain: 400, loss: 100 },
      { level: 3, gain: 600, loss: 200 },
    ]);
    expect(texts(h)).toContain('The stakes rise: every stake is now ×2.');
    round(h, { a: ['right', 3] });
    expect(h.view('a').you).toMatchObject({ score: 1000, outcome: { change: 600 } });
    next(h);
    round(h, { a: ['wrong', 3] });
    expect(h.view('a').you).toMatchObject({ score: 800, outcome: { change: -200 } });
  });
});

/* --------------------------------- Glimgo -------------------------------- */

/** Eight typed answers: every 3 by 3 card holds all of them around a free middle square. */
const WORDS: Question[] = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'].map((w, i) => ({ id: `w${i + 1}`, type: 'short' as const, prompt: `Code word number ${i + 1}?`, accepted: [w] }));

describe('Glimgo rule options', () => {
  function start(settings: Record<string, unknown>, players: string[]) {
    const h = drive(glimgo, { players, questions: WORDS, settings });
    h.tick(6000);
    expect(h.view(players[0]!).phase).toBe('call');
    return h;
  }
  /** Mark the square that answers the open call. */
  function mark(h: Driven, id: string) {
    const v = h.view(id);
    const want = (WORDS.find((q) => q.prompt === v.call.prompt) as Extract<Question, { type: 'short' }>).accepted[0];
    const square = (v.you.squares as { text: string }[]).findIndex((sq) => sq.text === want);
    return h.rt.act(id, { type: 'mark', iid: v.call.iid, square });
  }

  it('Glimgo Rush: the call closes once three players have found it', () => {
    const h = start(pick(glimgoVariants, 'glimgo-rush').settings!, ['a', 'b', 'c', 'd', 'e']);
    const iid = h.view('d').call.iid;
    expect(mark(h, 'a').ok).toBe(true);
    expect(mark(h, 'b').ok).toBe(true);
    expect(h.view('a').phase).toBe('call');
    expect(mark(h, 'c').ok).toBe(true);
    expect(h.view('d').phase).toBe('reveal');
    expect(h.host().revealed.found).toBe(3);
    expect(h.rt.act('d', { type: 'mark', iid, square: 0 })).toMatchObject({ ok: false, message: 'Wait for the next call.' });
  });

  it('Lucky Stars: after every fifth call the player furthest behind gets a free square', () => {
    const h = start({ ...pick(glimgoVariants, 'glimgo-lucky-stars').settings, win: 'full' }, ['a', 'b']);
    const free = (id: string) => (h.view(id).you.squares as { free: boolean }[]).filter((sq) => sq.free).length;
    for (let call = 1; call <= 5; call++) {
      expect(mark(h, 'a').ok).toBe(true);
      if (call < 5) {
        // b never marks; the call runs out, then the next one comes up.
        h.tick(15_000 + DEADLINE_GRACE_MS);
        h.tick(3000);
      } else h.tick(15_000 + DEADLINE_GRACE_MS);
    }
    expect(h.view('a').phase).toBe('reveal');
    expect(free('a')).toBe(1);
    expect(free('b')).toBe(2);
    expect(h.view('b').you.toGo).toBe(7);
    expect(h.feedTo('b')).toContain('A lucky star! You were furthest from Glimgo, so one of your squares is now free.');
    expect(h.feedTo('a')).toEqual([]);
  });

  it('Lucky Stars: nobody gets a star while everyone is level', () => {
    const h = start({ luckyStars: true, win: 'full' }, ['a', 'b']);
    for (let call = 1; call <= 5; call++) {
      h.tick(15_000 + DEADLINE_GRACE_MS);
      if (call < 5) h.tick(3000);
    }
    expect(h.host().callCount).toBe(5);
    expect(h.feed).toEqual([]);
  });
});
