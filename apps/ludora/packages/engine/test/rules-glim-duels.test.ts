import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { DEADLINE_GRACE_MS } from '../src/mechanics/syncRounds.ts';
import { botPower, botThinkMs, decideOnTime, glimDuels, hitDamage, pairFighters, type PairEntry } from '../src/modes/glim-duels/index.ts';
import { BASE_HIT, BIG_HITS, CHARGE_CAP, DUEL_POINTS, MEND_HEAL, POWER_COST, SHADOW_ACCURACY, SHADOW_TIME, SPEED_BONUS, STRIKE_MULT, meta, settings, variants } from '../src/modes/glim-duels/meta.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, MCQ, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Glim Duels, driven through a runtime on a fake clock. Questions are not
 * shuffled, every question allows 15 seconds, and an answer sent the moment a
 * question opens is the fastest possible: a right one hits for 18 + 14 = 32.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;
const LIMIT = 15_000;
const INTRO = 5000;
const REVEAL = 6000;
const STANDINGS = 8000;

function start(settings: Record<string, unknown> = {}, players: Seat[] = ['a', 'b'], extra: Partial<Parameters<typeof drive>[1]> = {}) {
  const h = drive(glimDuels, { players, settings, ...extra });
  h.tick(INTRO);
  const first = typeof players[0] === 'string' ? players[0] : players[0]!.id;
  expect(h.view(first).sync.phase).toBe('question');
  return h;
}
/** From a reveal to the next question of the same duel round. */
const next = (h: Driven) => h.tick(REVEAL);
/** From the reveal of a round's last question, through the standings, to the next round's first question. */
const nextRound = (h: Driven) => {
  h.tick(REVEAL);
  expect(h.view(h.rt.playerList()[0]!.id).sync.phase).toBe('leaderboard');
  h.tick(STANDINGS);
};
const closeByTime = (h: Driven) => h.tick(LIMIT + DEADLINE_GRACE_MS);
const power = (h: Driven, id: string, p: 'shield' | 'strike' | 'mend') => h.rt.act(id, { type: 'power', iid: h.view(id).sync.question.iid, power: p });
const duel = (h: Driven, id: string) => h.view(id).duel;
const texts = (h: Driven) => h.feed.map((f) => f.text);
/** Both players answer: `a` first, then `b` after `wait` ms. */
function exchange(h: Driven, a: [string, 'right' | 'wrong'], b: [string, 'right' | 'wrong'], wait = 0) {
  expect(h.answer(a[0], a[1]).ok).toBe(true);
  if (wait) h.wait(wait);
  expect(h.answer(b[0], b[1]).ok).toBe(true);
}

describe('hits', () => {
  it('hit for 18 plus up to 14 for speed, scaled by partial credit, big hits and power strikes', () => {
    const r = (responseMs: number, credit = 1) => ({ credit, responseMs, limitMs: LIMIT });
    expect([0, 7500, 15_000, 30_000].map((ms) => hitDamage(r(ms)))).toEqual([BASE_HIT + SPEED_BONUS, 25, BASE_HIT, BASE_HIT]);
    expect(hitDamage(r(0, 0.5))).toBe(16);
    expect(hitDamage(r(0, 0))).toBe(0);
    expect(hitDamage(r(0), { big: true })).toBe(48);
    expect(hitDamage(r(LIMIT), { big: true })).toBe(27);
    expect(hitDamage(r(0), { strike: true })).toBe(64);
    expect(hitDamage(r(0), { big: true, strike: true })).toBe(32 * BIG_HITS * STRIKE_MULT);
  });

  it('land both hits together at the reveal, harder the faster they come', () => {
    const h = start();
    expect(h.answer('a', 'right').ok).toBe(true);
    // B sees that A has locked in, but nothing has landed yet.
    expect(duel(h, 'b').rival).toMatchObject({ id: 'a', answered: true, health: 100 });
    expect(duel(h, 'b').me.health).toBe(100);
    expect(duel(h, 'b').hits).toBeNull();
    h.wait(7500);
    expect(h.answer('b', 'right').ok).toBe(true);
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(duel(h, 'a').me.health).toBe(75);
    expect(duel(h, 'a').rival.health).toBe(68);
    expect(duel(h, 'a').hits).toEqual({ mine: { dmg: 32 }, theirs: { dmg: 25 } });
    expect(duel(h, 'b').hits).toEqual({ mine: { dmg: 25 }, theirs: { dmg: 32 } });
    const card = h.host().duels[0];
    expect(card.sides.map((s: any) => s.health).sort()).toEqual([68, 75]);
    expect(card.hits).toHaveLength(2);
    expect(h.errors).toEqual([]);
  });

  it('miss on a wrong answer, and hit for part on a partly right one', () => {
    const multi: Question = { id: 'mu', type: 'multi', prompt: 'Pick the even numbers.', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }, { id: 'd', text: '8' }], correct: ['a', 'b', 'd'] };
    const h = start({}, ['a', 'b'], { questions: [multi, ...MCQ] });
    const iid = h.view('a').sync.question.iid;
    // Two of the three even numbers: two thirds of a hit. One of three: not enough to hit.
    expect(h.rt.act('a', { type: 'answer', iid, answer: { type: 'multi', choiceIds: ['c0', 'c1'] } }).ok).toBe(true);
    expect(h.rt.act('b', { type: 'answer', iid, answer: { type: 'multi', choiceIds: ['c0'] } }).ok).toBe(true);
    expect(duel(h, 'a').hits).toEqual({ mine: { dmg: 21, partial: true }, theirs: null });
    expect(duel(h, 'b').me.health).toBe(79);
    expect(h.view('a').you.charge).toBe(1);
    expect(h.view('b').you.charge).toBe(0);
  });
});

describe('knockouts', () => {
  it('end the duel early for 3 points, and the round once every duel is over', () => {
    const h = start(variant('glim-duels-glass').settings);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'b').me.health).toBe(28);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'ko', endedNow: true });
    expect(duel(h, 'b')).toMatchObject({ result: 'loss', how: 'ko' });
    expect(duel(h, 'b').me.health).toBe(0);
    expect(h.view('a').you.points).toBe(DUEL_POINTS.win);
    expect(h.view('b').you.points).toBe(0);
    expect(texts(h)).toContain('A knocked out B.');
    expect(h.host().kos).toBe(1);
    // The only duel is over, so the standings come next, with the next pairing.
    next(h);
    expect(h.view('a').sync.phase).toBe('leaderboard');
    expect(h.view('a').next).toEqual({ rival: { id: 'b', name: 'B' }, shadow: false });
    expect(h.host().next).toEqual([['a', 'b']]);
    h.tick(STANDINGS);
    expect(h.view('a')).toMatchObject({ round: 1, q: 0 });
    expect(duel(h, 'a').me.health).toBe(60);
    expect(duel(h, 'a').rival.health).toBe(60);
  });

  it('go to the faster right answer when both Glims go down together', () => {
    const h = start(variant('glim-duels-glass').settings);
    exchange(h, ['a', 'right'], ['b', 'right'], 1000);
    expect([duel(h, 'a').me.health, duel(h, 'b').me.health]).toEqual([29, 28]);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'right'], 1000);
    expect(duel(h, 'a').me.health).toBe(0);
    expect(duel(h, 'b').me.health).toBe(0);
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'ko' });
    expect(texts(h)).toContain('A and B knocked each other out. A was faster.');
  });

  it('make a dead heat a draw when both go down at the same moment', () => {
    const h = start(variant('glim-duels-glass').settings);
    exchange(h, ['a', 'right'], ['b', 'right']);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'right']);
    expect(duel(h, 'a')).toMatchObject({ result: 'draw', how: 'ko' });
    expect([h.view('a').you.points, h.view('b').you.points]).toEqual([DUEL_POINTS.draw, DUEL_POINTS.draw]);
    // Named in the order the pair was drawn up.
    expect(texts(h).filter((t) => /^(A and B|B and A) knocked each other out\.$/.test(t))).toHaveLength(1);
  });

  it('leave a round going until every duel is over; players whose duel ended keep answering for charge', () => {
    const h = start({ health: '60', rounds: 2 }, ['a', 'b', 'c', 'd']);
    const pairs = h.host().duels.map((d: any) => [d.sides[0].id, d.sides[1].id]);
    const [[w, l], [x, y]] = pairs;
    exchange(h, [w, 'right'], [l, 'wrong']);
    exchange(h, [x, 'wrong'], [y, 'wrong']);
    next(h);
    exchange(h, [w, 'right'], [l, 'wrong']);
    exchange(h, [x, 'wrong'], [y, 'wrong']);
    expect(duel(h, w).result).toBe('win');
    expect(duel(h, x).result).toBeNull();
    next(h);
    // Question 3: the first duel is over, the second goes on, and everyone answers.
    expect(h.view(w).sync.phase).toBe('question');
    expect(h.view(w)).toMatchObject({ q: 2 });
    expect(power(h, w, 'shield')).toMatchObject({ ok: false, message: 'Your duel is over. Save your charge for the next round.' });
    expect(h.view(w).you.charge).toBe(2);
    exchange(h, [w, 'right'], [l, 'right']);
    exchange(h, [x, 'wrong'], [y, 'wrong']);
    expect(h.view(w).you.charge).toBe(CHARGE_CAP);
    expect(h.view(l).you.charge).toBe(1);
    // Their answers do nothing to the finished duel.
    expect(duel(h, l).me.health).toBe(0);
    expect(duel(h, w).me.health).toBe(60);
  });
});

describe('the end of a duel on time', () => {
  it('goes to more health after the last question', () => {
    const h = start({ duelLength: 3, health: '150' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    exchange(h, ['a', 'wrong'], ['b', 'wrong']);
    expect(duel(h, 'a').result).toBeNull();
    next(h);
    exchange(h, ['a', 'wrong'], ['b', 'wrong']);
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'time', endedNow: true });
    next(h);
    expect(h.view('a').sync.phase).toBe('leaderboard');
  });

  it('goes to more damage dealt when health is level', () => {
    const h = start({ duelLength: 3, health: '150' });
    exchange(h, ['b', 'right'], ['a', 'right']);
    next(h);
    exchange(h, ['b', 'right'], ['a', 'right']);
    next(h);
    // B mends 30; A lands a hit of exactly 30. Level on 86 health, but A has dealt 30 more.
    expect(power(h, 'b', 'mend').ok).toBe(true);
    expect(duel(h, 'a').rival.health).toBe(116);
    h.wait(2143);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'a').hits.mine).toEqual({ dmg: 30 });
    expect([duel(h, 'a').me.health, duel(h, 'a').rival.health]).toEqual([86, 86]);
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'time' });
  });

  it('is a draw when health and damage are both level', () => {
    const h = start({ duelLength: 3 });
    for (let i = 0; i < 3; i++) {
      exchange(h, ['a', 'wrong'], ['b', 'wrong']);
      if (i < 2) next(h);
    }
    expect(duel(h, 'a')).toMatchObject({ result: 'draw', how: 'time' });
    expect(h.view('b').you).toMatchObject({ points: 1, draws: 1 });
  });

  it('decides on health, then damage dealt', () => {
    expect(decideOnTime([{ health: 40, dealt: 10 }, { health: 30, dealt: 90 }])).toBe(0);
    expect(decideOnTime([{ health: 30, dealt: 10 }, { health: 30, dealt: 40 }])).toBe(1);
    expect(decideOnTime([{ health: 30, dealt: 40 }, { health: 30, dealt: 40 }])).toBe('draw');
  });
});

describe('powers', () => {
  it('build 1 charge for every hit, at the reveal, up to 3', () => {
    const h = start({ health: '150' });
    const charges: number[] = [];
    for (let i = 0; i < 4; i++) {
      expect(h.answer('a', 'right').ok).toBe(true);
      // Nothing before the reveal, so nobody can tell a right answer early.
      expect(h.view('a').you.charge).toBe(Math.min(i, CHARGE_CAP));
      expect(h.answer('b', 'wrong').ok).toBe(true);
      charges.push(h.view('a').you.charge);
      next(h);
    }
    expect(charges).toEqual([1, 2, 3, 3]);
    expect(duel(h, 'b').rival.charge).toBe(3);
    expect(duel(h, 'b').me.health).toBe(150 - 4 * 32);
  });

  it('shield: costs 1, shows to the rival at once and stops the next hit', () => {
    const h = start();
    exchange(h, ['b', 'right'], ['a', 'wrong']);
    next(h);
    expect(power(h, 'b', 'shield').ok).toBe(true);
    expect(h.view('b').you).toMatchObject({ charge: 0, used: 'shield' });
    expect(duel(h, 'a').rival.shield).toBe(true);
    expect(h.host().duels[0].sides.some((s: any) => s.shield)).toBe(true);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'a').hits.mine).toEqual({ dmg: 32, blocked: true });
    expect(duel(h, 'b').me.health).toBe(100);
    expect(duel(h, 'b').me.shield).toBeUndefined();
  });

  it('power strike: costs 2, shows to the rival and doubles the next hit', () => {
    const h = start({ health: '150' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'strike').ok).toBe(true);
    expect(duel(h, 'b').rival).toMatchObject({ strike: true, charge: 0 });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'a').hits.mine).toEqual({ dmg: 64, strike: true });
    expect(duel(h, 'b').me.health).toBe(150 - 32 - 32 - 64);
    expect(duel(h, 'a').me.strike).toBeUndefined();
  });

  it('a shield stops a power strike completely, and both are spent', () => {
    const h = start({ health: '150' });
    exchange(h, ['a', 'right'], ['b', 'right']);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'strike').ok).toBe(true);
    expect(power(h, 'b', 'shield').ok).toBe(true);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(duel(h, 'a').hits.mine).toEqual({ dmg: 64, blocked: true, strike: true });
    expect(duel(h, 'b').me).toMatchObject({ health: 86, charge: 0 });
    expect(duel(h, 'b').me.shield).toBeUndefined();
    expect(duel(h, 'a').me.strike).toBeUndefined();
  });

  it('mend: costs 2 and gives back 30 health at once, never above full', () => {
    const h = start();
    expect(h.answer('a', 'right').ok).toBe(true);
    h.wait(14_000);
    expect(h.answer('b', 'right').ok).toBe(true);
    expect(duel(h, 'a').me.health).toBe(81);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'mend').ok).toBe(true);
    expect(duel(h, 'a').me.health).toBe(100);
    expect(duel(h, 'b').rival.health).toBe(100);
    expect(h.view('a').you.charge).toBe(0);
    expect(MEND_HEAL).toBe(30);
  });

  it('refuse a mend at full health', () => {
    const h = start();
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'mend')).toMatchObject({ ok: false, message: 'You are already at full health.' });
    expect(h.view('a').you.charge).toBe(2);
  });

  it('one power per question, used before answering, with the charge for it', () => {
    const h = start();
    expect(power(h, 'a', 'shield')).toMatchObject({ ok: false, message: 'A shield needs 1 charge.' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'strike')).toMatchObject({ ok: false, message: 'A power strike needs 2 charges.' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(power(h, 'a', 'shield').ok).toBe(true);
    expect(power(h, 'a', 'shield')).toMatchObject({ ok: false, message: 'One power per question.' });
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(power(h, 'a', 'mend')).toMatchObject({ ok: false, message: 'Use a power before you answer.' });
    expect(h.answer('b', 'wrong').ok).toBe(true);
    next(h);
    // The shield stays up until a hit meets it.
    expect(power(h, 'a', 'shield')).toMatchObject({ ok: false, message: 'Your shield is already up.' });
    expect(h.rt.act('a', { type: 'power', iid: 'q999', power: 'strike' })).toMatchObject({ ok: false, message: 'Powers can only be used while a question is open.' });
    expect(POWER_COST).toEqual({ shield: 1, strike: 2, mend: 2 });
  });

  it('are off in Pure Duels: no charge builds and powers are refused', () => {
    const h = start(variant('glim-duels-pure').settings);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(h.view('a').you.charge).toBe(0);
    expect(h.view('a').rules.powers).toBe(false);
    next(h);
    expect(power(h, 'a', 'shield')).toMatchObject({ ok: false, message: 'Powers are off in this game.' });
  });
});

describe('pairing', () => {
  const e = (id: string, points: number, more: Partial<PairEntry> = {}): PairEntry => ({ id, points, dealt: 0, tie: 0, team: null, shadowDuels: 0, faced: [], ...more });

  it('ranks by points, then damage dealt, pairs neighbours, and gives the odd one out the Shadow Glim', () => {
    const entries = [e('e', 0), e('b', 3, { dealt: 80 }), e('a', 6), e('d', 3, { dealt: 40 }), e('c', 3, { dealt: 120 })];
    expect(pairFighters(entries, false)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
      ['e', null],
    ]);
  });

  it('gives the Shadow Glim to the lowest-ranked of those who have met it the fewest times', () => {
    const entries = [e('a', 6), e('c', 3, { dealt: 120 }), e('b', 3, { dealt: 80 }), e('d', 3, { dealt: 40 }), e('e', 0, { shadowDuels: 1 })];
    expect(pairFighters(entries, false)).toEqual([
      ['a', 'c'],
      ['b', 'e'],
      ['d', null],
    ]);
  });

  it('uses the random tiebreak only when points and damage are level', () => {
    const entries = [e('a', 3, { tie: 0.9 }), e('b', 3, { tie: 0.1 }), e('c', 3, { tie: 0.5 }), e('d', 3, { tie: 0.3 })];
    expect(pairFighters(entries, false)).toEqual([
      ['b', 'd'],
      ['c', 'a'],
    ]);
  });

  it('avoids rematches, swapping partners when the greedy pass is stuck', () => {
    const ranked = (ids: string[], faced: Record<string, string[]>) => ids.map((id, i) => e(id, 10 - i, { faced: faced[id] ?? [] }));
    expect(pairFighters(ranked(['a', 'b', 'c', 'd'], { a: ['b'] }), false)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
    // a-b and c-d pair first, which leaves e and f, who have met: swap with the nearest pair.
    expect(pairFighters(ranked(['a', 'b', 'c', 'd', 'e', 'f'], { e: ['f'], f: ['e'] }), false)).toEqual([
      ['a', 'b'],
      ['c', 'e'],
      ['d', 'f'],
    ]);
    // Only two players: a rematch is the only duel there is.
    expect(pairFighters(ranked(['a', 'b'], { a: ['b'] }), false)).toEqual([['a', 'b']]);
  });

  it('pairs across teams in Team Clash, and sends a team’s extra players to the Shadow Glim', () => {
    const entries = [e('a', 9, { team: 't1' }), e('d', 6, { team: 't2' }), e('b', 3, { team: 't1', dealt: 50 }), e('e', 3, { team: 't2' }), e('c', 0, { team: 't1' })];
    expect(pairFighters(entries, true)).toEqual([
      ['a', 'd'],
      ['b', 'e'],
      ['c', null],
    ]);
    const lopsided = [e('a', 3, { team: 't1' }), e('b', 2, { team: 't1' }), e('c', 1, { team: 't1' }), e('d', 0, { team: 't2' })];
    expect(pairFighters(lopsided, true)).toEqual([
      ['a', 'd'],
      ['b', null],
      ['c', null],
    ]);
  });

  it('puts winners against winners after a round (Swiss)', () => {
    const h = start({ health: '60' }, ['a', 'b', 'c', 'd']);
    const pairs: string[][] = h.host().duels.map((d: any) => [d.sides[0].id, d.sides[1].id]);
    for (let q = 0; q < 2; q++) {
      for (const [w, l] of pairs) exchange(h, [w!, 'right'], [l!, 'wrong']);
      next(h);
    }
    expect(h.view('a').sync.phase).toBe('leaderboard');
    const winners = pairs.map((p) => p[0]).sort();
    const losers = pairs.map((p) => p[1]).sort();
    const planned = (h.host().next as string[][]).map((p) => [...p].sort());
    expect(planned).toEqual(expect.arrayContaining([winners, losers]));
    h.tick(STANDINGS);
    expect(h.host().duels.map((d: any) => [d.sides[0].id, d.sides[1].id].sort())).toEqual(expect.arrayContaining([winners, losers]));
  });
});

describe('the Shadow Glim', () => {
  it('duels the odd player out: it locks in at its moment, and its answer waits for the reveal', () => {
    const h = start({}, ['a', 'b', 'c']);
    const shadowDuel = h.host().duels.find((d: any) => d.sides[1].id === null);
    const x = shadowDuel.sides[0].id as string;
    expect(duel(h, x).rival).toEqual({ id: null, health: 100 });
    const roll = h.state().duels.find((d: any) => d.sides[1].id === null).shadow;
    expect(roll.ms).toBeGreaterThanOrEqual(LIMIT * SHADOW_TIME[0]);
    expect(roll.ms).toBeLessThanOrEqual(LIMIT * SHADOW_TIME[1]);
    // Nothing about its answer is in any view, not even its timing.
    for (const id of ['a', 'b', 'c']) expect(JSON.stringify(h.view(id))).not.toMatch(/"ms"|"correct":(true|false)/);
    expect(JSON.stringify(h.host())).not.toMatch(/"ms"|"correct":(true|false)/);
    h.tick(roll.ms - 1);
    expect(duel(h, x).rival.answered).toBeUndefined();
    h.tick(1);
    expect(duel(h, x).rival.answered).toBe(true);
    for (const id of ['a', 'b', 'c']) expect(h.answer(id, 'wrong').ok).toBe(true);
    const hit = roll.correct ? hitDamage({ credit: 1, responseMs: roll.ms, limitMs: LIMIT }) : 0;
    expect(duel(h, x).me.health).toBe(100 - hit);
    expect(duel(h, x).hits.theirs).toEqual(roll.correct ? { dmg: hit } : null);
    expect(h.view(x).rules.shadow).toEqual({ accuracy: 60, from: 35, to: 85 });
  });

  it('gets 60% right and answers between 35% and 85% of the time limit (seeded sampling)', () => {
    let right = 0;
    let shares = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const h = drive(glimDuels, { players: ['solo'], seed });
      h.tick(INTRO);
      const roll = h.state().duels[0].shadow;
      if (roll.correct) right++;
      const share = roll.ms / LIMIT;
      expect(share).toBeGreaterThanOrEqual(SHADOW_TIME[0]);
      expect(share).toBeLessThanOrEqual(SHADOW_TIME[1]);
      shares += share;
    }
    expect(SHADOW_ACCURACY).toBe(0.6);
    expect(Math.abs(right / n - SHADOW_ACCURACY)).toBeLessThan(0.06);
    expect(Math.abs(shares / n - (SHADOW_TIME[0] + SHADOW_TIME[1]) / 2)).toBeLessThan(0.03);
  });

  it('is every round’s rival for a player on their own, and the game ends', () => {
    const h = start({ rounds: 2, duelLength: 3, health: '150' }, ['solo']);
    for (let round = 0; round < 2; round++) {
      for (let q = 0; q < 3; q++) {
        expect(duel(h, 'solo').rival.id).toBeNull();
        expect(h.answer('solo', 'right').ok).toBe(true);
        if (q < 2) next(h);
      }
      if (round === 0) nextRound(h);
    }
    next(h);
    expect(h.rt.status).toBe('ended');
    const r = h.rt.results!;
    expect(r.endedBy).toBe('mode');
    expect(r.standings).toHaveLength(1);
    // Three fastest hits (96) never knock out 150 health, so health decides: the Shadow lands at most 3 × 27.
    expect(r.standings[0]!.label).toBe('2 wins');
    expect(r.summary).toBe('SOLO is the duel champion with 2 wins.');
  });
});

describe('joining and leaving', () => {
  it('a late joiner waits for the next round, answers meanwhile for charge, then gets a rival', () => {
    const h = start({ health: '60' });
    expect(h.rt.addPlayer({ id: 'c', name: 'C', teamId: null, isBot: false }).ok).toBe(true);
    expect(h.view('c').duel).toBeNull();
    expect(h.feedTo('c')).toContain('You join the next round. Answer now to build charge for your first duel.');
    expect(h.feedTo('a')).not.toContain('You join the next round. Answer now to build charge for your first duel.');
    expect(power(h, 'c', 'shield')).toMatchObject({ ok: false, message: 'You join the next round. Powers are for duels.' });
    expect(h.host().waiting).toBe(1);
    expect(h.answer('c', 'right').ok).toBe(true);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(h.view('c').you.charge).toBe(1);
    next(h);
    expect(h.answer('c', 'right').ok).toBe(true);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    expect(h.view('c').sync.phase).toBe('leaderboard');
    expect(h.view('c').next).not.toBeNull();
    h.tick(STANDINGS);
    expect(h.view('c').duel).not.toBeNull();
    expect(h.view('c').you.charge).toBe(2);
    // Three players: two duel each other and one meets the Shadow Glim.
    expect(h.host().duels).toHaveLength(2);
    expect(h.host().duels.filter((d: any) => d.sides[1].id === null)).toHaveLength(1);
  });

  it('a player who leaves forfeits: the rival wins, and the leaver stays in the results', () => {
    const h = start();
    expect(h.rt.removePlayer('b').ok).toBe(true);
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'forfeit' });
    expect(duel(h, 'a').rival).toMatchObject({ id: 'b', name: 'B' });
    expect(h.view('a').you.points).toBe(DUEL_POINTS.win);
    expect(h.feedTo('a')).toContain('B left, so you win your duel.');
    expect(h.answer('a', 'right').ok).toBe(true);
    next(h);
    expect(h.view('a').sync.phase).toBe('leaderboard');
    expect(h.view('a').next).toEqual({ rival: null, shadow: true });
    h.rt.end('host');
    const b = h.rt.results!.standings.find((s) => s.playerId === 'b')!;
    expect(b).toMatchObject({ left: true, label: '0 wins', rank: 2 });
  });

  it('a leaver between questions sends a finished round straight to the standings', () => {
    const h = start();
    exchange(h, ['a', 'wrong'], ['b', 'wrong']);
    h.rt.removePlayer('b');
    expect(duel(h, 'a')).toMatchObject({ result: 'win', how: 'forfeit' });
    next(h);
    expect(h.view('a').sync.phase).toBe('leaderboard');
  });

  it('a disconnected player does not answer and deals no damage, and nobody waits for them', () => {
    const h = start();
    h.rt.setConnected('b', false);
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(duel(h, 'a').hits).toEqual({ mine: { dmg: 32 }, theirs: null });
    expect(duel(h, 'a').me.health).toBe(100);
  });
});

describe('teams', () => {
  it('Team Clash pairs across teams and totals duel points, leaving out wins over the Shadow Glim', () => {
    const v = variant('glim-duels-team-clash');
    const h = start({ health: '60' }, [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], { variant: v });
    const cards = h.host().duels;
    const shadowCard = cards.find((d: any) => d.sides[1].id === null);
    const clashCard = cards.find((d: any) => d.sides[1].id !== null);
    const x = shadowCard.sides[0].id as string;
    const y = [clashCard.sides[0].id, clashCard.sides[1].id].find((id: string) => id !== 'c') as string;
    expect(['a', 'b']).toContain(x);
    expect(['a', 'b']).toContain(y);
    for (let q = 0; q < 2; q++) {
      expect(h.answer(x, 'right').ok).toBe(true);
      exchange(h, ['c', 'right'], [y, 'wrong']);
      if (q === 0) next(h);
    }
    expect(duel(h, x).result).toBe('win');
    expect(duel(h, 'c').result).toBe('win');
    expect(h.view(x).you.points).toBe(3);
    const teams = Object.fromEntries(h.host().teams.map((t: any) => [t.teamId, t.score]));
    expect(teams).toEqual({ t1: 0, t2: 3 });
    expect(h.host().rules.clash).toBe(true);
    h.rt.end('host');
    expect(h.rt.results!.teamStandings.map((t) => [t.teamId, t.rank, t.label])).toEqual([
      ['t2', 1, '3 points in total'],
      ['t1', 2, '0 points in total'],
    ]);
  });

  it('otherwise, a team scores the average points of its players', () => {
    const h = start({ health: '60' }, [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], { teams: 2 });
    const pairs: string[][] = h.host().duels.map((d: any) => [d.sides[0].id, d.sides[1].id]);
    for (let q = 0; q < 2; q++) {
      for (const [w, l] of pairs) exchange(h, [w!, 'right'], [l!, 'wrong']);
      next(h);
    }
    const pts = (id: string) => h.view(id).you.points as number;
    const teams = Object.fromEntries(h.host().teams.map((t: any) => [t.teamId, t.score]));
    expect(teams).toEqual({ t1: (pts('a') + pts('b')) / 2, t2: (pts('c') + pts('d')) / 2 });
    h.rt.end('host');
    expect(h.rt.results!.teamStandings.map((t) => t.label).every((l) => l.endsWith(' per player'))).toBe(true);
  });
});

describe('questions', () => {
  function playAllWrong(h: Driven, rounds: number, length: number) {
    const prompts: string[] = [];
    for (let r = 0; r < rounds; r++) {
      for (let q = 0; q < length; q++) {
        prompts.push(h.view('a').sync.question.q.prompt);
        exchange(h, ['a', 'wrong'], ['b', 'wrong']);
        if (q < length - 1) next(h);
      }
      if (r < rounds - 1) nextRound(h);
    }
    next(h);
    return prompts;
  }

  it('come round again rather than the game ending early, and a repeat counts as an attempt', () => {
    const h = start({ rounds: 2, duelLength: 3 }, ['a', 'b'], { questions: MCQ.slice(0, 2) });
    const prompts = playAllWrong(h, 2, 3);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.endedBy).toBe('mode');
    expect(prompts.map((p) => p.match(/\d+/)![0])).toEqual(['1', '2', '1', '2', '1', '2']);
    const kinds = h.rt.answerLog().map((a) => a.kind ?? 'answer');
    expect(kinds).toEqual(['answer', 'answer', 'answer', 'answer', ...Array(8).fill('attempt')]);
  });

  it('take the question limit as the pool, never as the length of the game', () => {
    const h = start({ rounds: 2, duelLength: 3 }, ['a', 'b'], { common: { questionLimit: 2 } });
    const prompts = playAllWrong(h, 2, 3);
    expect(h.rt.status).toBe('ended');
    expect(new Set(prompts)).toEqual(new Set([MCQ[0]!.prompt, MCQ[1]!.prompt]));
    expect(prompts).toHaveLength(6);
  });
});

describe('views', () => {
  it('never hold an unrevealed answer, and show hits only at the reveal', () => {
    const h = start({}, ['a', 'b', 'c']);
    const all = () => [h.host(), ...['a', 'b', 'c'].map((id) => h.view(id))];
    for (const v of all()) expect(findAnswerLeaks(v)).toEqual([]);
    expect(h.answer('a', 'right').ok).toBe(true);
    for (const v of all()) {
      expect(findAnswerLeaks(v)).toEqual([]);
      expect(v.sync.reveal).toBeNull();
    }
    for (const id of ['a', 'b', 'c']) expect(h.view(id).duel.hits).toBeNull();
    expect(h.host().duels.every((d: any) => d.hits === undefined)).toBe(true);
    // Correctness stays hidden until the reveal, for the player too.
    expect(h.view('a').sync.you.correct).toBeNull();
    expect(h.answer('b', 'wrong').ok).toBe(true);
    expect(h.answer('c', 'wrong').ok).toBe(true);
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.view('a').sync.reveal).not.toBeNull();
    for (const v of all()) expect(findAnswerLeaks(v)).toEqual([]);
  });

  it('stay small with 40 players', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i + 1}`);
    const h = start({}, ids);
    ids.slice(0, 30).forEach((id, i) => expect(h.answer(id, i % 3 ? 'right' : 'wrong').ok).toBe(true));
    expect(JSON.stringify(h.host()).length).toBeLessThan(8000);
    expect(JSON.stringify(h.view('p1')).length).toBeLessThan(3000);
    closeByTime(h);
    expect(h.host().sync.phase).toBe('reveal');
    expect(JSON.stringify(h.host()).length).toBeLessThan(8000);
    expect(JSON.stringify(h.view('p1')).length).toBeLessThan(3000);
  });
});

describe('results', () => {
  it('rank everyone by points, then damage, then right answers, with wins and draws as labels', () => {
    const h = start({ rounds: 2, duelLength: 3, health: '60' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    next(h);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    nextRound(h);
    for (let q = 0; q < 3; q++) {
      exchange(h, ['a', 'wrong'], ['b', 'wrong']);
      if (q < 2) next(h);
    }
    next(h);
    const r = h.rt.results!;
    expect(r.standings.map((s) => [s.playerId, s.rank, s.label])).toEqual([
      ['a', 1, '1 win, 1 draw'],
      ['b', 2, '0 wins, 1 draw'],
    ]);
    expect(r.summary).toBe('A is the duel champion with 1 win.');
  });

  it('share the top spot when everything is level', () => {
    const h = start({ rounds: 2, duelLength: 3 });
    for (let round = 0; round < 2; round++) {
      for (let q = 0; q < 3; q++) {
        exchange(h, ['a', 'wrong'], ['b', 'wrong']);
        if (q < 2) next(h);
      }
      if (round === 0) nextRound(h);
    }
    next(h);
    const r = h.rt.results!;
    expect(r.standings.map((s) => s.rank)).toEqual([1, 1]);
    expect(r.summary).toBe('A and B share the top spot with 2 draws each.');
  });

  it('break a tie on points with damage dealt', () => {
    const h = start({ duelLength: 3, health: '150' }, ['a', 'b', 'c', 'd']);
    const [[w1, l1], [w2, l2]] = h.host().duels.map((d: any) => [d.sides[0].id, d.sides[1].id]);
    // Both winners win on health; the second lands two hits to the first one's one.
    for (let q = 0; q < 3; q++) {
      exchange(h, [w1, q === 0 ? 'right' : 'wrong'], [l1, 'wrong']);
      exchange(h, [w2, q < 2 ? 'right' : 'wrong'], [l2, 'wrong']);
      if (q < 2) next(h);
    }
    h.rt.end('host');
    const r = h.rt.results!;
    expect(r.standings.slice(0, 2).map((s) => [s.playerId, s.rank, s.label])).toEqual([
      [w2, 1, '1 win'],
      [w1, 2, '1 win'],
    ]);
  });
});

describe('practice bots', () => {
  const side = (health: number, more: Partial<{ shield: boolean; strike: boolean; charge: number | null; answered: boolean }> = {}) => ({ health, shield: false, strike: false, charge: 0, answered: false, ...more });
  const base = { used: null, max: 100, ready: true };

  it('mend when low, shield against a ready strike, and strike only when the rival cannot shield in reply', () => {
    expect(botPower({ ...base, charge: 2, me: side(45), rival: side(80) })).toBe('mend');
    expect(botPower({ ...base, charge: 2, me: side(46), rival: side(80, { answered: true }) })).toBe('strike');
    expect(botPower({ ...base, charge: 1, me: side(90), rival: side(80, { strike: true }) })).toBe('shield');
    expect(botPower({ ...base, charge: 1, me: side(90, { shield: true }), rival: side(80, { strike: true }) })).toBeNull();
    // The rival could still raise a shield: hold the strike.
    expect(botPower({ ...base, charge: 2, me: side(90), rival: side(80, { charge: 1 }) })).toBeNull();
    expect(botPower({ ...base, charge: 2, me: side(90), rival: side(80, { charge: 0 }) })).toBe('strike');
    expect(botPower({ ...base, charge: 2, me: side(90), rival: side(80, { charge: null }) })).toBe('strike');
    expect(botPower({ ...base, charge: 2, me: side(90), rival: side(40, { answered: true }) })).toBeNull();
    expect(botPower({ ...base, charge: 2, me: side(90), rival: side(80, { answered: true, shield: true }) })).toBeNull();
    expect(botPower({ ...base, ready: false, charge: 2, me: side(90), rival: side(80, { answered: true }) })).toBeNull();
    expect(botPower({ ...base, used: 'shield', charge: 3, me: side(10), rival: side(80) })).toBeNull();
    // Thresholds follow the starting health.
    expect(botPower({ ...base, max: 150, charge: 2, me: side(67), rival: side(140) })).toBe('mend');
  });

  it('think for 12% to 70% of the time limit, the same each time for a bot and a question', () => {
    const times = Array.from({ length: 300 }, (_, i) => botThinkMs(`b${i}`, `q${i % 7}`, LIMIT));
    expect(Math.min(...times)).toBeGreaterThanOrEqual(LIMIT * 0.12);
    expect(Math.max(...times)).toBeLessThanOrEqual(LIMIT * 0.7);
    expect(botThinkMs('b1', 'q3', LIMIT)).toBe(botThinkMs('b1', 'q3', LIMIT));
    expect(new Set(times.map((t) => Math.floor(t / 1000))).size).toBeGreaterThan(6);
  });

  it('answer every question, whether their duel is on, over or has not started', () => {
    for (const settings of [{}, { health: '60' }, { powers: false }]) {
      const r = simulateGame({ modeId: meta.id, questions: MIXED_SET, players: 7, seed: 3, skill: 0.7, settings });
      expect(r.errors).toEqual([]);
      const answered = r.results!.standings.map((s) => s.stats.answered);
      expect(Math.min(...answered), JSON.stringify(settings)).toBe(Math.max(...answered));
    }
  });

  it('duel to the end, perfect or hopeless, and use powers along the way', () => {
    for (const skill of [1, 0.6, 0]) {
      const r = simulateGame({ modeId: meta.id, questions: MIXED_SET, players: 5, seed: 8, skill });
      expect(r.errors).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
      expect(r.results?.endedBy).toBe('mode');
      expect(r.results?.standings).toHaveLength(5);
    }
    const r = simulateGame({ modeId: meta.id, questions: FLASHCARD_SET, players: 6, seed: 4, skill: 0.8, churn: true, pauseAt: 20_000 });
    expect(r.errors).toEqual([]);
    expect(r.stalled).toBe(false);
  });
});

describe('host pacing', () => {
  it('waits for the host at each reveal and between rounds when it does not move on by itself', () => {
    const h = start({ autoAdvance: false, health: '60' });
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(h.view('a').sync).toMatchObject({ phase: 'reveal', phaseEndsAt: null });
    h.tick(60_000);
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.rt.hostNext().ok).toBe(true);
    exchange(h, ['a', 'right'], ['b', 'wrong']);
    expect(h.rt.hostNext().ok).toBe(true);
    expect(h.view('a').sync).toMatchObject({ phase: 'leaderboard', phaseEndsAt: null });
    expect(h.rt.hostNext().ok).toBe(true);
    expect(h.view('a').sync.phase).toBe('question');
    expect(h.view('a').round).toBe(1);
  });
});

describe('metadata', () => {
  it('describes five variants, each locking the rule it changes', () => {
    expect(variants.map((v) => v.meta.id)).toEqual(['glim-duels-pure', 'glim-duels-glass', 'glim-duels-marathon', 'glim-duels-big-hits', 'glim-duels-team-clash']);
    for (const v of variants) for (const k of v.locked ?? []) expect(k in (v.settings ?? {})).toBe(true);
    expect(variant('glim-duels-team-clash').common).toEqual({ teamCount: 2 });
    expect(settings.find((f) => f.key === 'autoAdvance')).toMatchObject({ kind: 'toggle', default: true });
    expect(meta.common.defaults).toEqual({ questionTimeSec: 15, questionLimit: 0 });
  });
});
