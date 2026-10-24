import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { drawLantern, nightMarket, tollPayments } from '../src/modes/night-market/index.ts';
import {
  CHARM_ODDS,
  EVENT_TIMING,
  FORTUNE_ODDS,
  KIND_WEIGHTS,
  SHIELD_REFUND,
  TOLL,
  TRICK_CHOOSE_SEC,
  TRICK_GUARD_SEC,
  TRICK_ODDS,
  WILD_ODDS,
  variants,
  type LanternKind,
} from '../src/modes/night-market/meta.ts';
import { contentLabel, fortuneMultiplier, kindPercents, kindWeights, levelMultiplier, stallLevel, toNextLevel, wildGrowth, type OddsMoment } from '../src/modes/night-market/odds.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Night Market rules, driven through a real GameRuntime on a fake clock.
 * Every question is a true statement, so `right` answers true. Offers are
 * random, so a test that needs a particular lantern answers right until one
 * turns up (reading the hidden contents from the game state, never from a
 * view), then opens it through the ordinary pick action.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type L = { kind: LanternKind; content: string };

const pickVariant = (id: string) => variants.find((v) => v.meta.id === id)!;
const MOMENT: OddsMoment = { settings: { greed: 'normal', trickOdds: 'normal', wildness: 'normal' }, event: null, tricksLive: true, level: 1, lucky: 0 };

/** A market with no events unless a test asks for them, so a random event never changes the odds under a test. */
function market(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number } = {}) {
  return drive(nightMarket, { players: o.players ?? ['a', 'b'], questions: TRUE_SET, teams: o.teams ?? 0, seed: o.seed ?? 42, common: o.common ?? {}, settings: { events: false, ...o.settings } });
}

const stall = (h: Driven, id: string) => h.state().stalls[id];
const coinsOf = (h: Driven, id: string): number => stall(h, id).coins;
const pick = (h: Driven, id: string, index: number) => h.rt.act(id, { type: 'pick', offer: stall(h, id).offer.seq, index });
const target = (h: Driven, id: string, who: string) => h.rt.act(id, { type: 'target', playerId: who });
const content = (c: string) => (l: L) => l.content === c;
const texts = (h: Driven) => h.feed.map((f) => f.text);

/** The lantern least likely to disturb a test: plain coins, then Sight or Lucky, shares of coins, gambles, shields, tricks last. */
function calmIndex(lanterns: L[]) {
  const order = (l: L) =>
    l.kind === 'fortune' ? (l.content === 'quarter' || l.content === 'double' ? 2 : 0) : l.kind === 'charm' ? (l.content === 'shield' ? 4 : 1) : l.kind === 'wild' ? 3 : 5;
  let best = 0;
  lanterns.forEach((l, i) => {
    if (order(l) < order(lanterns[best]!)) best = i;
  });
  return best;
}

/** Finish whatever a player has open (an offer, a trick) until a question shows. Forced tricks go to `sink` when it is there. */
function settle(h: Driven, id: string, sink = 'z') {
  for (let i = 0; i < 40; i++) {
    const st = stall(h, id);
    if (st.pending) {
      const open = (h.view(id).you.choose.targets as any[]).filter((t) => !t.blocked);
      const to = open.find((t) => t.playerId === sink) ?? open[0];
      expect(target(h, id, to.playerId).ok).toBe(true);
      continue;
    }
    if (st.offer) {
      expect(pick(h, id, calmIndex(st.offer.lanterns)).ok).toBe(true);
      continue;
    }
    return;
  }
  throw new Error(`${id} could not settle`);
}

/** Answer right until an offer holds a matching lantern, opening the others calmly. Returns its index. */
function offerWith(h: Driven, id: string, match: (l: L) => boolean, tries = 600): number {
  for (let i = 0; i < tries; i++) {
    settle(h, id);
    expect(h.answer(id, 'right').ok).toBe(true);
    const at = (stall(h, id).offer.lanterns as L[]).findIndex(match);
    if (at >= 0) return at;
  }
  throw new Error(`no matching lantern turned up for ${id}`);
}

/** Give a player at least `n` coins from plain Fortune lanterns. */
function earn(h: Driven, id: string, n: number) {
  for (let guard = 0; coinsOf(h, id) < n && guard < 400; guard++) {
    expect(pick(h, id, offerWith(h, id, (l) => l.kind === 'fortune' && l.content !== 'quarter' && l.content !== 'double')).ok).toBe(true);
    settle(h, id);
  }
  expect(coinsOf(h, id)).toBeGreaterThanOrEqual(n);
}

/** Give a player a shield. */
function shieldUp(h: Driven, id: string) {
  if (stall(h, id).shield) return;
  expect(pick(h, id, offerWith(h, id, content('shield'))).ok).toBe(true);
  settle(h, id);
  expect(stall(h, id).shield).toBe(true);
}

/** Open a trick lantern of `kind` and leave it waiting for its target. */
function openTrick(h: Driven, id: string, kind: string) {
  expect(pick(h, id, offerWith(h, id, content(kind))).ok).toBe(true);
  expect(stall(h, id).pending).not.toBeNull();
}

/** Open a toll, which needs no target. */
function openToll(h: Driven, id: string) {
  expect(pick(h, id, offerWith(h, id, content('toll'))).ok).toBe(true);
  expect(stall(h, id).pending).toBeNull();
}

/** Let any guard on every stall run out. */
const waitOutGuards = (h: Driven) => h.tick(TRICK_GUARD_SEC * 1000 + 1);

/** Break a player's shield with tricks from `breaker`, so the next trick on them lands. */
function breakShield(h: Driven, victim: string, breaker: string) {
  for (let i = 0; i < 4 && stall(h, victim).shield; i++) {
    openTrick(h, breaker, 'swipe1');
    expect(target(h, breaker, victim).ok).toBe(true);
    settle(h, breaker);
  }
  expect(stall(h, victim).shield).toBe(false);
  waitOutGuards(h);
}

/* ---------------------------------- odds ---------------------------------- */

describe('Night Market odds', () => {
  it('every table adds up to 100, and the kinds renormalise when tricks cannot appear', () => {
    const sum = (rows: readonly { weight: number }[]) => rows.reduce((n, r) => n + r.weight, 0);
    expect(Object.values(KIND_WEIGHTS).reduce((n, w) => n + w, 0)).toBe(100);
    for (const rows of [FORTUNE_ODDS, WILD_ODDS, TRICK_ODDS, CHARM_ODDS.normal, CHARM_ODDS.noShields]) expect(sum(rows)).toBe(100);

    expect(kindWeights(MOMENT)).toEqual({ fortune: 50, wild: 14, trick: 22, charm: 14 });
    const alone = kindPercents({ ...MOMENT, tricksLive: false });
    expect(alone.map((k) => k.kind)).toEqual(['fortune', 'wild', 'charm']);
    expect(alone.reduce((n, k) => n + k.percent, 0)).toBeCloseTo(100, 6);
    expect(alone[0]!.percent).toBeCloseTo((50 / 78) * 100, 6);
    for (const event of ['golden', 'trickster', 'rain', 'calm', 'winds', 'lastCall'] as const) expect(kindPercents({ ...MOMENT, event }).reduce((n, k) => n + k.percent, 0)).toBeCloseTo(100, 6);

    // Events and settings move the weights.
    expect(kindWeights({ ...MOMENT, event: 'trickster' }).trick).toBe(44);
    expect(kindWeights({ ...MOMENT, event: 'calm' }).trick).toBe(0);
    expect(kindWeights({ ...MOMENT, event: 'winds' }).wild).toBe(28);
    expect(kindWeights({ ...MOMENT, settings: { greed: 'normal', trickOdds: 'high', wildness: 'wild' } })).toMatchObject({ trick: 36, wild: 25 });
  });

  it('seeded sampling lands near the published odds', () => {
    const rng = createRng(2024);
    const n = 40_000;
    const kinds: Record<string, number> = {};
    const contents: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const l = drawLantern(MOMENT, rng);
      kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
      contents[l.content] = (contents[l.content] ?? 0) + 1;
    }
    for (const [kind, w] of Object.entries(KIND_WEIGHTS)) expect(Math.abs(kinds[kind]! / n - w / 100), kind).toBeLessThan(0.01);
    const within = (rows: readonly { id: string; weight: number }[], kind: string) => {
      for (const r of rows) expect(Math.abs(contents[r.id]! / kinds[kind]! - r.weight / 100), r.id).toBeLessThan(0.02);
    };
    within(FORTUNE_ODDS, 'fortune');
    within(WILD_ODDS, 'wild');
    within(TRICK_ODDS, 'trick');
    within(CHARM_ODDS.normal, 'charm');

    // Nobody to trick: no tricks at all, and charms hold no shields.
    const alone = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const l = drawLantern({ ...MOMENT, tricksLive: false }, alone);
      expect(l.kind).not.toBe('trick');
      expect(l.content).not.toBe('shield');
    }
  });

  it('flat amounts grow with the stall level, and only flat amounts are doubled', () => {
    expect([0, 4, 5, 9, 10, 27].map(stallLevel)).toEqual([1, 1, 2, 2, 3, 6]);
    expect([0, 4, 5, 7].map(toNextLevel)).toEqual([5, 1, 5, 3]);
    expect([1, 2, 5].map(levelMultiplier)).toEqual([1, 1.25, 2]);
    expect([fortuneMultiplier(null, 0), fortuneMultiplier('golden', 0), fortuneMultiplier('lastCall', 1), fortuneMultiplier('rain', 2)]).toEqual([1, 2, 4, 2]);
    expect(contentLabel('coins50', { ...MOMENT, level: 2, event: 'golden' })).toBe('+125 coins');
    expect(contentLabel('jackpot', { ...MOMENT, lucky: 1 })).toBe('Jackpot: +500 coins');
    expect(contentLabel('quarter', { ...MOMENT, event: 'golden', lucky: 2 })).toBe('+25% of your coins');
    expect(contentLabel('double', { ...MOMENT, event: 'lastCall' })).toBe('Double your coins');
    expect([wildGrowth('normal', null), wildGrowth('normal', 'winds'), wildGrowth('wild', null), wildGrowth('wild', 'winds')]).toEqual([1.5, 2, 2, 2.5]);
    expect(contentLabel('swipe4', { ...MOMENT, settings: { ...MOMENT.settings, greed: 'greedy' } })).toBe('Swipe 35%');
    expect(contentLabel('loseBig', { ...MOMENT, settings: { ...MOMENT.settings, wildness: 'wild' } })).toBe('Lose 40%');
  });
});

/* ------------------------------- the core loop ------------------------------ */

describe('Night Market rules', () => {
  it('a wrong answer brings the next question; a right answer offers three lanterns and no question', () => {
    const h = market({ players: ['a'] });
    expect(h.answer('a', 'wrong').ok).toBe(true);
    expect(h.view('a').you).toMatchObject({ offer: null, last: { correct: false, text: 'No lantern' } });
    expect(h.view('a').you.question).not.toBeNull();

    expect(h.answer('a', 'right').ok).toBe(true);
    const you = h.view('a').you;
    expect(you.question).toBeNull();
    expect(you.last).toMatchObject({ correct: true, text: 'Pick a lantern.' });
    expect(you.offer.lanterns).toHaveLength(3);
    for (const l of you.offer.lanterns) {
      // The kind shows; what is inside does not. Alone, there is nobody to trick.
      expect(['fortune', 'wild', 'charm']).toContain(l.kind);
      expect(l.content).toBeNull();
    }
    expect(h.rt.act('a', { type: 'answer', iid: 'q1', answer: { type: 'truefalse', value: true } })).toMatchObject({ ok: false, message: 'Pick a lantern first.' });
    expect(h.rt.act('a', { type: 'pick', offer: you.offer.seq + 1, index: 0 })).toMatchObject({ ok: false, message: 'That lantern has already been opened.' });

    expect(pick(h, 'a', 0).ok).toBe(true);
    const after = h.view('a').you;
    expect(after.offer).toBeNull();
    expect(after.question).not.toBeNull();
    expect(after.opened).toMatchObject({ seq: you.offer.seq, kind: you.offer.lanterns[0].kind });
    expect(h.rt.act('a', { type: 'pick', offer: you.offer.seq, index: 1 })).toMatchObject({ ok: false, message: 'There is no lantern to open right now.' });
    expect(h.errors).toEqual([]);
  });

  it('Fortune lanterns pay coins, and every 5 right answers they are worth more', () => {
    const h = market({ players: ['a'] });
    const first = offerWith(h, 'a', content('coins50'));
    const before = coinsOf(h, 'a');
    const mult = fortuneMultiplier(null, stall(h, 'a').lucky) * levelMultiplier(h.view('a').you.level);
    expect(pick(h, 'a', first).ok).toBe(true);
    expect(coinsOf(h, 'a') - before).toBe(Math.round(50 * mult));

    while (stall(h, 'a').stream.correct < 5) {
      settle(h, 'a');
      h.answer('a', 'right');
    }
    expect(h.view('a').you.level).toBe(2);
    expect(stall(h, 'a').notes[0].text).toMatch(/^Stall level 2: your coin lanterns are worth more\.$/);

    const at = offerWith(h, 'a', content('coins40'));
    const you = h.view('a').you;
    const was = coinsOf(h, 'a');
    expect(pick(h, 'a', at).ok).toBe(true);
    const gain = Math.round(40 * levelMultiplier(you.level) * fortuneMultiplier(null, you.lucky));
    expect(coinsOf(h, 'a') - was).toBe(gain);
    expect(h.view('a').you.opened).toMatchObject({ kind: 'fortune', content: 'coins40', delta: gain, title: `+${gain} coins` });
    expect(h.view('a').you.opened.detail).toContain(`Stall level ${you.level} bonus.`);
  });

  it('a jackpot, a quarter of your coins and a double, with the big ones told to the room', () => {
    const h = market({ players: ['a', 'b'] });
    earn(h, 'a', 300);

    let at = offerWith(h, 'a', content('quarter'));
    let was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a') - was).toBe(Math.max(25, Math.round(was * 0.25)));
    expect(h.view('a').you.opened.detail).toBe('25% of your coins.');

    at = offerWith(h, 'a', content('double'));
    was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a')).toBe(was + Math.max(50, was));
    expect(h.view('a').you.opened).toMatchObject({ title: `Double: +${(Math.max(50, was)).toLocaleString('en-GB')} coins`, big: true });
    expect(h.feedTo('b')).toContain(`A’s coins doubled: +${Math.max(50, was).toLocaleString('en-GB')}.`);

    at = offerWith(h, 'a', content('jackpot'));
    const you = h.view('a').you;
    was = coinsOf(h, 'a');
    pick(h, 'a', at);
    const gain = Math.round(250 * levelMultiplier(you.level) * fortuneMultiplier(null, you.lucky));
    expect(coinsOf(h, 'a') - was).toBe(gain);
    expect(h.feedTo('b')).toContain(`A found a jackpot: +${gain.toLocaleString('en-GB')} coins.`);
    expect(h.host().news[0]).toMatchObject({ kind: 'jackpot', name: 'A', amount: gain });
  });

  it('Last Call and a Lucky Streak double flat coins (×4 together); shares of your coins are never doubled', () => {
    const h = market({ players: ['a'], settings: { events: true } });
    const flatCoins = (l: L) => l.kind === 'fortune' && l.content !== 'quarter' && l.content !== 'double';
    /** Answer right until a matching lantern turns up while a Lucky Streak charge is left, opening only lanterns that do not use one. */
    const luckyOfferWith = (match: (l: L) => boolean) => {
      for (let i = 0; i < 300; i++) {
        if (stall(h, 'a').lucky === 0) {
          pick(h, 'a', offerWith(h, 'a', content('lucky')));
          expect(h.view('a').you.opened.title).toBe('Lucky Streak');
        }
        settle(h, 'a');
        h.answer('a', 'right');
        const lanterns: L[] = stall(h, 'a').offer.lanterns;
        const at = lanterns.findIndex(match);
        if (at >= 0 && stall(h, 'a').lucky > 0) return at;
        const spare = lanterns.findIndex((l) => !flatCoins(l));
        pick(h, 'a', spare >= 0 ? spare : 0);
      }
      throw new Error('no lucky match');
    };

    // A Lucky Streak doubles flat coins and uses a charge.
    let at = luckyOfferWith(content('coins30'));
    let you = h.view('a').you;
    let was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a') - was).toBe(Math.round(30 * levelMultiplier(you.level) * 2));
    expect(stall(h, 'a').lucky).toBe(you.lucky - 1);
    expect(h.view('a').you.opened.detail).toContain('Lucky Streak paid double.');

    // A share of your coins is never doubled, and does not use a charge.
    at = luckyOfferWith(content('quarter'));
    you = h.view('a').you;
    was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a') - was).toBe(Math.max(25, Math.round(was / 4)));
    expect(stall(h, 'a').lucky).toBe(you.lucky);

    // Last Call: the last 45 seconds. Flat coins pay double, and a lucky charge doubles them again.
    settle(h, 'a');
    h.tick(h.view('a').endsAt - EVENT_TIMING.lastCallSec * 1000 - h.rt.gameNow());
    expect(h.view('a').event).toMatchObject({ id: 'lastCall', endsAt: h.view('a').endsAt });
    expect(texts(h)).toContain('Last Call: Fortune lanterns pay double until the market closes.');
    at = luckyOfferWith(content('coins20'));
    you = h.view('a').you;
    was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a') - was).toBe(Math.round(20 * levelMultiplier(you.level) * 4));
    expect(h.view('a').you.opened.detail).toContain('Last Call paid double. Lucky Streak paid double.');

    at = luckyOfferWith(content('quarter'));
    was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a') - was).toBe(Math.max(25, Math.round(was / 4)));
  });

  it('Wild lanterns grow your coins by half (at least 40) or lose 10% or 25%; High Rollers doubles up or loses 15% or 40%', () => {
    for (const [settings, grow, small, big] of [
      [{}, 1.5, 10, 25],
      [pickVariant('night-market-high-rollers').settings!, 2, 15, 40],
    ] as const) {
      const h = market({ players: ['a'], settings });
      let at = offerWith(h, 'a', content('grow'));
      let was = coinsOf(h, 'a');
      pick(h, 'a', at);
      expect(coinsOf(h, 'a') - was).toBe(Math.max(40, Math.round(was * (grow - 1))));
      earn(h, 'a', 200);
      at = offerWith(h, 'a', content('grow'));
      was = coinsOf(h, 'a');
      pick(h, 'a', at);
      expect(coinsOf(h, 'a') - was).toBe(Math.max(40, Math.round(was * (grow - 1))));
      expect(h.view('a').you.opened.title).toMatch(new RegExp(`^Coins ×${grow}: \\+`));
      for (const [id, pct] of [
        ['loseSmall', small],
        ['loseBig', big],
      ] as const) {
        at = offerWith(h, 'a', content(id));
        was = coinsOf(h, 'a');
        pick(h, 'a', at);
        const loss = Math.round((was * pct) / 100);
        expect(coinsOf(h, 'a')).toBe(was - loss);
        expect(h.view('a').you.opened).toMatchObject({ delta: -loss, title: `Lost ${pct}%: −${loss.toLocaleString('en-GB')} ${loss === 1 ? 'coin' : 'coins'}` });
      }
    }
  });

  it('trick lanterns never appear for a player alone, or with tricks off; Friendly Market charms hold no shields', () => {
    const lanternsSeen = (h: Driven, id: string, offers: number) => {
      const seen: L[] = [];
      for (let i = 0; i < offers; i++) {
        settle(h, id);
        h.answer(id, 'right');
        seen.push(...stall(h, id).offer.lanterns);
      }
      return seen;
    };
    expect(lanternsSeen(market({ players: ['a'] }), 'a', 80).some((l) => l.kind === 'trick')).toBe(false);
    const friendly = lanternsSeen(market({ settings: pickVariant('night-market-friendly').settings }), 'a', 120);
    expect(friendly.some((l) => l.kind === 'trick' || l.content === 'shield')).toBe(false);
    expect(friendly.some((l) => l.kind === 'charm')).toBe(true);
    expect(lanternsSeen(market(), 'a', 60).some((l) => l.kind === 'trick')).toBe(true);
  });
});

/* --------------------------------- tricks --------------------------------- */

describe('Night Market tricks', () => {
  it('a swipe takes its share of a chosen player’s coins (at least 5); only big swipes are told to the room', () => {
    const h = market({ players: ['a', 'b', 'c', 'z'] });
    earn(h, 'b', 300);
    breakShield(h, 'b', 'z');
    openTrick(h, 'a', 'swipe2');
    const choose = h.view('a').you.choose;
    expect(choose).toMatchObject({ trick: 'swipe', percent: 15 });
    expect(choose.deadline).toBe(h.rt.gameNow() + TRICK_CHOOSE_SEC * 1000);
    expect(h.view('a').you.question).toBeNull();
    expect(h.view('a').you.opened).toMatchObject({ title: 'Swipe 15%', waiting: true });

    const b = coinsOf(h, 'b');
    const a = coinsOf(h, 'a');
    expect(target(h, 'a', 'b').ok).toBe(true);
    const amount = Math.max(5, Math.round(b * 0.15));
    expect([coinsOf(h, 'a'), coinsOf(h, 'b')]).toEqual([a + amount, b - amount]);
    expect(h.view('a').you).toMatchObject({ choose: null, opened: { waiting: false, delta: amount, title: `Swiped ${amount} coins from B` } });
    expect(h.view('a').you.question).not.toBeNull();
    expect(h.view('b').you.notes[0]).toMatchObject({ text: `A swiped ${amount} coins from you.`, tone: 'bad' });
    const line = `A swiped ${amount} coins from B.`;
    expect(amount).toBeLessThan(100);
    expect(h.feedTo('b')).toContain(line);
    expect(h.feedTo('c')).not.toContain(line);

    // A big swipe is news for everyone.
    earn(h, 'c', 900);
    breakShield(h, 'c', 'z');
    openTrick(h, 'a', 'swipe4');
    const c = coinsOf(h, 'c');
    expect(target(h, 'a', 'c').ok).toBe(true);
    const big = Math.round(c * 0.25);
    expect(big).toBeGreaterThanOrEqual(100);
    expect(h.feedTo('b')).toContain(`A swiped ${big.toLocaleString('en-GB')} coins from C.`);
    expect(h.host().news[0]).toMatchObject({ kind: 'swipe', name: 'A', target: 'C', amount: big });
  });

  it('a swap trades coin totals, and the whole room hears about it', () => {
    const h = market({ players: ['a', 'b', 'c', 'z'] });
    earn(h, 'b', 1500);
    breakShield(h, 'b', 'z');
    openTrick(h, 'a', 'swap');
    expect(h.view('a').you.choose).toMatchObject({ trick: 'swap', percent: null });
    const [a, b] = [coinsOf(h, 'a'), coinsOf(h, 'b')];
    expect(b).toBeGreaterThan(a);
    expect(target(h, 'a', 'b').ok).toBe(true);
    expect([coinsOf(h, 'a'), coinsOf(h, 'b')]).toEqual([b, a]);
    expect(h.feedTo('c')).toContain('A swapped coins with B.');
    expect(h.view('b').you.notes[0].text).toBe(`A swapped coins with you: you lost ${(b - a).toLocaleString('en-GB')} ${b - a === 1 ? 'coin' : 'coins'}.`);
    expect(h.view('a').you.opened.title).toBe(`Swapped with B: +${(b - a).toLocaleString('en-GB')} coins`);
  });

  it('a toll takes 5% from every other player, at most 25 each and 200 in all, and shields do not stop it', () => {
    expect(tollPayments([1000, 200, 7, 0])).toEqual([25, 10, 0, 0]);
    // Twenty rich players would pay 25 each (500): everyone pays less, 200 in all.
    expect(tollPayments(Array(20).fill(900))).toEqual(Array(20).fill(10));
    expect(tollPayments(Array(30).fill(900)).reduce((n, x) => n + x, 0)).toBeLessThanOrEqual(TOLL.total);

    const h = market({ players: ['a', 'b', 'c', 'd'] });
    earn(h, 'b', 700);
    shieldUp(h, 'b');
    earn(h, 'c', 120);
    const [b, c, d] = [coinsOf(h, 'b'), coinsOf(h, 'c'), coinsOf(h, 'd')];
    openToll(h, 'a');
    const pays = tollPayments([b, c, d]);
    expect([coinsOf(h, 'b'), coinsOf(h, 'c'), coinsOf(h, 'd')]).toEqual([b - pays[0]!, c - pays[1]!, d - pays[2]!]);
    expect(pays[0]).toBe(25);
    expect(stall(h, 'b').shield).toBe(true);
    const total = pays.reduce((n, x) => n + x, 0);
    expect(h.view('a').you.opened).toMatchObject({ kind: 'trick', content: 'toll', delta: total, title: `Toll: +${total} coins` });
    // A small toll is news for the player who rang it; each payer gets a note instead.
    expect(total).toBeLessThan(100);
    expect(h.feedTo('a')).toContain(`A rang the toll bell and collected ${total} coins.`);
    expect(h.feedTo('d')).not.toContain(`A rang the toll bell and collected ${total} coins.`);
    expect(h.view('c').you.notes[0].text).toBe(`A’s toll took ${pays[1]} ${pays[1] === 1 ? 'coin' : 'coins'} from you.`);
  });

  it('a shield blocks the next swipe or swap, then breaks, and both players are told', () => {
    const h = market({ players: ['a', 'b'] });
    earn(h, 'b', 200);
    shieldUp(h, 'b');
    openTrick(h, 'a', 'swap');
    expect(h.view('a').you.choose.targets[0]).toMatchObject({ playerId: 'b', shield: true });
    const [a, b] = [coinsOf(h, 'a'), coinsOf(h, 'b')];
    expect(target(h, 'a', 'b').ok).toBe(true);
    expect([coinsOf(h, 'a'), coinsOf(h, 'b')]).toEqual([a, b]);
    expect(stall(h, 'b').shield).toBe(false);
    expect(h.view('a').you.opened).toMatchObject({ blocked: true, delta: 0, title: 'B’s shield blocked your swap', detail: 'Their shield broke.' });
    expect(h.view('b').you.notes[0]).toMatchObject({ text: 'Your shield blocked A’s swap.', tone: 'good' });
    expect(h.feed).toContainEqual({ text: 'B’s shield blocked A’s swap.', to: ['a', 'b'] });

    // The next one lands. B is the only player A can trick, so the usual limits relax.
    openTrick(h, 'a', 'swipe1');
    expect(h.view('a').you.choose.relaxed).toBe(true);
    const before = coinsOf(h, 'b');
    expect(target(h, 'a', 'b').ok).toBe(true);
    expect(coinsOf(h, 'b')).toBe(before - Math.max(5, Math.round(before * 0.1)));
  });

  it('Calm Night: no trick lanterns appear, and a shield blocks without breaking', () => {
    // The first event is drawn from the game's random stream, so find a seed where it is Calm Night.
    for (let seed = 1; seed < 80; seed++) {
      const h = market({ players: ['a', 'b'], seed, settings: { events: true } });
      const at = offerWith(h, 'a', content('swipe2'));
      shieldUp(h, 'b');
      h.tick(EVENT_TIMING.firstSec * 1000 - h.rt.gameNow());
      if (h.view('a').event?.id !== 'calm') continue;
      expect(texts(h)).toContain('Calm Night: no Trick lanterns for 30 seconds, and shields cannot break.');
      pick(h, 'a', at);
      expect(target(h, 'a', 'b').ok).toBe(true);
      expect(stall(h, 'b').shield).toBe(true);
      expect(h.view('a').you.opened).toMatchObject({ blocked: true, detail: 'Calm Night: their shield held.' });
      // While the calm lasts, offers hold no tricks.
      for (let i = 0; i < 30; i++) {
        settle(h, 'a');
        h.answer('a', 'right');
        expect((stall(h, 'a').offer.lanterns as L[]).some((l) => l.kind === 'trick')).toBe(false);
      }
      return;
    }
    throw new Error('no seed started with Calm Night');
  });

  it('you cannot trick the same player twice in a row, unless nobody else is left', () => {
    const h = market({ players: ['a', 'b', 'c'] });
    earn(h, 'b', 100);
    earn(h, 'c', 50);
    openTrick(h, 'a', 'swipe1');
    expect(target(h, 'a', 'b').ok).toBe(true);
    waitOutGuards(h);
    openTrick(h, 'a', 'swipe1');
    const targets = h.view('a').you.choose.targets;
    expect(targets.find((t: any) => t.playerId === 'b')).toMatchObject({ blocked: 'last', guardUntil: null });
    expect(targets.find((t: any) => t.playerId === 'c')).toMatchObject({ blocked: null });
    expect(target(h, 'a', 'b')).toMatchObject({ ok: false, message: 'You tricked that player last time. Choose someone else.' });
    expect(target(h, 'a', 'c').ok).toBe(true);
  });

  it('a stall that was just tricked is watched: nobody can trick it again for 15 seconds', () => {
    const h = market({ players: ['a', 'b', 'c', 'z'] });
    earn(h, 'b', 300);
    openTrick(h, 'a', 'swipe1');
    expect(target(h, 'a', 'b').ok).toBe(true);
    const guardUntil = h.rt.gameNow() + TRICK_GUARD_SEC * 1000;
    openTrick(h, 'c', 'swipe1');
    expect(h.view('c').you.choose.targets.find((t: any) => t.playerId === 'b')).toMatchObject({ blocked: 'guard', guardUntil });
    expect(target(h, 'c', 'b')).toMatchObject({ ok: false, message: 'That stall was just tricked and is being watched. Choose someone else.' });
    h.tick(guardUntil - h.rt.gameNow());
    expect(h.view('c').you.choose.targets.find((t: any) => t.playerId === 'b')).toMatchObject({ blocked: null });
    expect(target(h, 'c', 'b').ok).toBe(true);
  });

  it('lists every rival richest first with their shields, and never a player who left', () => {
    const h = market({ players: ['a', 'b', 'c', 'd'] });
    earn(h, 'b', 300);
    earn(h, 'c', 100);
    shieldUp(h, 'c');
    h.rt.removePlayer('d');
    openTrick(h, 'a', 'swipe3');
    const targets = h.view('a').you.choose.targets as any[];
    expect(targets.map((t) => t.playerId)).toEqual(['b', 'c']);
    expect(targets.map((t) => [t.name, t.coins, t.shield])).toEqual([
      ['B', coinsOf(h, 'b'), stall(h, 'b').shield],
      ['C', coinsOf(h, 'c'), true],
    ]);
    expect(target(h, 'a', 'd')).toMatchObject({ ok: false, message: 'That player has left the market.' });
    expect(target(h, 'a', 'a')).toMatchObject({ ok: false, message: 'You cannot trick yourself.' });
  });

  it('a trick nobody chooses for goes to the richest player after 20 seconds, and a leaver’s trick still lands', () => {
    const h = market({ players: ['a', 'b', 'c'] });
    earn(h, 'b', 100);
    earn(h, 'c', 400);
    openTrick(h, 'a', 'swipe1');
    // The richest player A may trick is first in the list.
    const first = (h.view('a').you.choose.targets as any[]).find((t) => !t.blocked);
    const lands = (who: string, pct: number, was: number, shielded: boolean) => {
      if (shielded) expect(stall(h, who).shield).toBe(false);
      else expect(coinsOf(h, who)).toBe(was - Math.max(5, Math.round((was * pct) / 100)));
    };
    let was = coinsOf(h, first.playerId);
    let shielded = stall(h, first.playerId).shield;
    h.tick(TRICK_CHOOSE_SEC * 1000 - 1);
    expect(stall(h, 'a').pending).not.toBeNull();
    h.tick(1);
    expect(stall(h, 'a').pending).toBeNull();
    lands(first.playerId, 10, was, shielded);
    expect(h.view('a').you.opened.detail).toContain(`Time ran out, so it went to ${first.name}, the richest player you could trick.`);
    expect(h.view('a').you.question).not.toBeNull();

    // A leaves with a trick still waiting: it goes to the richest player A may trick.
    waitOutGuards(h);
    openTrick(h, 'a', 'swipe4');
    const next = (h.view('a').you.choose.targets as any[]).find((t) => !t.blocked);
    expect(next.playerId).not.toBe(first.playerId);
    was = coinsOf(h, next.playerId);
    shielded = stall(h, next.playerId).shield;
    h.rt.removePlayer('a');
    lands(next.playerId, 25, was, shielded);
    expect(stall(h, 'a').pending).toBeNull();
    expect(h.rt.results).toBeNull();
    expect(h.errors).toEqual([]);
  });

  it('in a team game, tricks and tolls only reach the other team', () => {
    const h = market({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], teams: 2 });
    earn(h, 'b', 300);
    earn(h, 'c', 200);
    earn(h, 'd', 100);
    openTrick(h, 'a', 'swipe1');
    expect((h.view('a').you.choose.targets as any[]).map((t) => t.playerId)).toEqual(['c', 'd']);
    expect(target(h, 'a', 'b')).toMatchObject({ ok: false, message: 'You cannot trick a teammate.' });
    expect(target(h, 'a', 'c').ok).toBe(true);
    const b = coinsOf(h, 'b');
    openToll(h, 'a');
    expect(coinsOf(h, 'b')).toBe(b);
    expect(h.view('a').you.opened.detail).toBe('2 players paid you.');
  });
});

/* --------------------------------- charms --------------------------------- */

describe('Night Market charms', () => {
  it('a shield (or 30 coins when you hold one already), and Lantern Sight shows inside your next three lanterns', () => {
    const h = market({ players: ['a', 'b'] });
    shieldUp(h, 'a');
    expect(h.view('a').you.opened).toMatchObject({ title: 'Shield ready', delta: 0 });
    expect(h.view('b').board.find((r: any) => r.playerId === 'a')).toMatchObject({ shield: true });
    const at = offerWith(h, 'a', content('shield'));
    const was = coinsOf(h, 'a');
    pick(h, 'a', at);
    expect(coinsOf(h, 'a')).toBe(was + SHIELD_REFUND);
    expect(h.view('a').you.opened).toMatchObject({ title: `+${SHIELD_REFUND} coins`, detail: 'You already hold a shield, so this one became coins.' });

    settle(h, 'a');
    pick(h, 'a', offerWith(h, 'a', content('sight')));
    expect(h.view('a').you.sight).toBe(true);
    settle(h, 'a');
    h.answer('a', 'right');
    const offer = h.view('a').you.offer;
    expect(offer.sight).toBe(true);
    expect(offer.lanterns.map((l: any) => l.content)).toEqual(stall(h, 'a').offer.lanterns.map((l: L) => l.content));
    expect(h.view('a').you.sight).toBe(false);
    pick(h, 'a', 0);
    settle(h, 'a');
    h.answer('a', 'right');
    expect(h.view('a').you.offer.lanterns.every((l: any) => l.content === null)).toBe(true);
  });
});

/* ------------------------------ market events ----------------------------- */

describe('Night Market events', () => {
  it('runs an event every 90 seconds from the first minute, for 30 seconds, never twice in a row, then Last Call', () => {
    const h = market({ players: ['a', 'b'], settings: { events: true }, common: { timeLimitSec: 600 } });
    const endsAt = h.view('a').endsAt;
    expect(h.view('a')).toMatchObject({ event: null, next: { at: 60_000, lastCall: false } });
    const seen: string[] = [];
    for (const start of [60, 150, 240, 330, 420, 510]) {
      h.tick(start * 1000 - 1 - h.rt.gameNow());
      expect(h.view('a').event).toBeNull();
      h.tick(1);
      const e = h.view('a').event;
      expect(e.endsAt).toBe((start + EVENT_TIMING.lastsSec) * 1000);
      seen.push(e.id);
      h.tick(EVENT_TIMING.lastsSec * 1000);
      expect(h.view('a').event).toBeNull();
    }
    expect(seen.every((id, i) => i === 0 || id !== seen[i - 1])).toBe(true);
    // No event would end after Last Call starts, so the next change is Last Call.
    expect(h.view('a').next).toEqual({ at: endsAt - 45_000, lastCall: true });
    h.tick(endsAt - 45_000 - h.rt.gameNow());
    expect(h.view('a')).toMatchObject({ event: { id: 'lastCall', endsAt }, next: null });
    expect(texts(h).filter((t) => /^(Golden Hour|Trickster Moon|Lantern Rain|Calm Night|Wild Winds|Last Call): /.test(t) && /seconds|closes/.test(t))).toHaveLength(7);
  });

  it('never runs Trickster Moon or Calm Night when nobody can trick anybody, and runs no events when they are off', () => {
    const solo = market({ players: ['a'], settings: { events: true }, common: { timeLimitSec: 3600 } });
    const ids: string[] = [];
    solo.tick(EVENT_TIMING.firstSec * 1000);
    for (let i = 0; i < 38; i++) {
      if (solo.view('a').event) ids.push(solo.view('a').event.id);
      solo.tick(EVENT_TIMING.everySec * 1000);
    }
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id) => id === 'trickster' || id === 'calm')).toEqual([]);

    const off = market({ players: ['a', 'b'] });
    expect(off.view('a')).toMatchObject({ event: null, next: null });
    off.tick(359_000);
    expect(off.view('a').event).toBeNull();
    expect(off.feed).toEqual([]);
  });

  it('Lantern Rain: every right answer gives two picks, one after the other', () => {
    for (let seed = 1; seed < 80; seed++) {
      const h = market({ players: ['a'], seed, settings: { events: true } });
      h.tick(EVENT_TIMING.firstSec * 1000);
      if (h.view('a').event?.id !== 'rain') continue;
      settle(h, 'a');
      h.answer('a', 'right');
      expect(h.view('a').you).toMatchObject({ extraPicks: 1, offer: { bonus: false }, last: { text: 'Lantern Rain: pick 2 lanterns.' } });
      pick(h, 'a', calmIndex(stall(h, 'a').offer.lanterns));
      expect(h.view('a').you).toMatchObject({ extraPicks: 0, offer: { bonus: true }, question: null });
      pick(h, 'a', 0);
      expect(h.view('a').you.question).not.toBeNull();
      // After the rain, one pick again.
      h.tick(EVENT_TIMING.lastsSec * 1000);
      h.answer('a', 'right');
      expect(h.view('a').you.extraPicks).toBe(0);
      return;
    }
    throw new Error('no seed started with Lantern Rain');
  });
});

/* ----------------------------- the whole game ----------------------------- */

describe('Night Market games', () => {
  it('Race to 2,500: the first stall to reach the goal wins on the spot', () => {
    const h = market({ players: ['a', 'b'], settings: { goalCoins: 250 } });
    for (let guard = 0; h.rt.status === 'running' && guard < 400; guard++) {
      settle(h, 'a');
      if (h.rt.status !== 'running') break;
      h.answer('a', 'right');
    }
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results).toMatchObject({ endedBy: 'mode', standings: [{ playerId: 'a', rank: 1 }, { playerId: 'b' }] });
    expect(h.rt.results!.standings[0]!.score).toBeGreaterThanOrEqual(250);
    expect(h.rt.results!.summary).toMatch(/^A reached 250 coins first\./);
    expect(texts(h)).toContain('A reached 250 coins.');
    expect(pickVariant('night-market-race').settings).toEqual({ goalCoins: 2500 });
  });

  it('time ends the game; results list everyone by coins, average the teams and name the biggest swipe', () => {
    const h = market({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'z', team: 2 }], teams: 2 });
    earn(h, 'c', 400);
    breakShield(h, 'c', 'b');
    openTrick(h, 'a', 'swipe4');
    expect(target(h, 'a', 'c').ok).toBe(true);
    settle(h, 'a');
    h.rt.removePlayer('b');
    h.tick(400_000);
    const r = h.rt.results!;
    expect(r.endedBy).toBe('mode');
    expect(r.standings.map((s) => s.playerId).sort()).toEqual(['a', 'b', 'c', 'z']);
    for (const s of r.standings) expect(s.label).toBe(`${s.score.toLocaleString('en-GB')} ${s.score === 1 ? 'coin' : 'coins'}`);
    const team1 = Math.round((coinsOf(h, 'a') + coinsOf(h, 'b')) / 2);
    expect(r.teamStandings.find((t) => t.teamId === 't1')).toMatchObject({ score: team1, label: `${team1.toLocaleString('en-GB')} ${team1 === 1 ? 'coin' : 'coins'} on average` });
    const top = r.standings[0]!;
    const swipe = h.state().biggestSwipe;
    expect(swipe.amount).toBeGreaterThanOrEqual(100);
    expect(r.summary).toBe(`${top.name} ran the richest stall with ${top.score.toLocaleString('en-GB')} coins. Biggest swipe: ${swipe.by.toUpperCase()} took ${swipe.amount.toLocaleString('en-GB')} coins from ${swipe.from.toUpperCase()}.`);
  });

  it('late joiners get a stall and a question; one player can play alone', () => {
    const h = market({ players: ['a'] });
    expect(h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false }).ok).toBe(true);
    expect(h.view('late').you).toMatchObject({ coins: 0, level: 1 });
    expect(h.view('late').you.question).not.toBeNull();
    // Now A has someone to trick.
    settle(h, 'a');
    h.answer('a', 'right');
    expect(h.view('a').you.tricksLive).toBe(true);
  });

  it('views never show what is inside a lantern, the next event or an answer; fog hides the kinds too', () => {
    const h = market({ players: ['a', 'b'], settings: { events: true } });
    for (let i = 0; i < 10; i++) {
      settle(h, 'a');
      h.answer('a', i % 3 ? 'right' : 'wrong');
    }
    h.answer('b', 'right');
    const views = [h.view('a'), h.view('b'), h.host()];
    for (const v of views) expect(findAnswerLeaks(v)).toEqual([]);
    expect(h.view('b').you.offer.lanterns.every((l: any) => l.content === null && l.kind !== null)).toBe(true);
    // The next event is not chosen until it starts, and nothing names it early.
    expect(h.state().event).toBeNull();
    expect(JSON.stringify(views)).not.toMatch(/golden|trickster|rain|calm|winds/);

    const fog = market({ players: ['a', 'b'], settings: pickVariant('night-market-fog').settings });
    fog.answer('a', 'right');
    expect(fog.view('a').you.offer.lanterns.every((l: any) => l.kind === null && l.content === null)).toBe(true);
    expect(fog.view('a').fog).toBe(true);
  });

  it('bots pick lanterns sensibly and play a whole game', () => {
    const board = (rows: [string, number, boolean?][]) => rows.map(([id, coins, isYou], i) => ({ playerId: id, name: id, teamId: null, coins, shield: false, rank: i + 1, isYou: Boolean(isYou) }));
    const ctx = { playerId: 'me', rng: createRng(1), skill: 0.7, now: 0, settings: {}, answer: () => ({ type: 'truefalse', value: true }) } as any;
    const offer = (...kinds: LanternKind[]) => ({ seq: 1, bonus: false, sight: false, lanterns: kinds.map((kind) => ({ kind, content: null })) });
    const bot = (you: Record<string, unknown>, rows: [string, number, boolean?][]) => nightMarket.bot!({ board: board(rows), you: { coins: 0, rank: 1, shield: false, teamId: null, level: 1, ...you } }, ctx);
    // Someone has 1.4 times its coins: a trick.
    expect(bot({ coins: 100, rank: 2, offer: offer('fortune', 'trick', 'wild') }, [['rich', 140], ['me', 100, true]])).toEqual({ type: 'pick', offer: 1, index: 1 });
    // It leads with no shield: a charm.
    expect(bot({ coins: 500, rank: 1, offer: offer('fortune', 'wild', 'charm') }, [['me', 500, true], ['b', 400]])).toEqual({ type: 'pick', offer: 1, index: 2 });
    // Poor: a gamble.
    expect(bot({ coins: 60, rank: 2, offer: offer('fortune', 'wild', 'fortune') }, [['b', 70], ['me', 60, true]])).toEqual({ type: 'pick', offer: 1, index: 1 });
    // Otherwise coins.
    expect(bot({ coins: 300, rank: 2, offer: offer('wild', 'fortune', 'trick') }, [['b', 320], ['me', 300, true]])).toEqual({ type: 'pick', offer: 1, index: 1 });
    // Swipe the richest without a shield; swap with the richest who has more.
    const targets = [
      { playerId: 'r1', coins: 900, shield: true, blocked: null },
      { playerId: 'r2', coins: 700, shield: false, blocked: null },
      { playerId: 'r3', coins: 500, shield: false, blocked: 'last' },
    ];
    expect(bot({ coins: 100, choose: { trick: 'swipe', targets } }, [])).toEqual({ type: 'target', playerId: 'r2' });
    expect(bot({ coins: 800, choose: { trick: 'swap', targets } }, [])).toEqual({ type: 'target', playerId: 'r1' });

    const r = simulateGame({ modeId: 'night-market', mode: nightMarket, questions: MIXED_SET, players: 6, seed: 12 });
    expect(r.errors).toEqual([]);
    expect(r.results!.standings.every((s) => s.stats.answered > 0)).toBe(true);
    expect(r.results!.standings[0]!.score).toBeGreaterThan(0);
  });
});
