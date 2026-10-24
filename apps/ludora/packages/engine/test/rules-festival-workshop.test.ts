import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import {
  botPurchase,
  buildCost,
  drawFavours,
  eventChoices,
  festivalWorkshop,
  helperBonus,
  marketPrice,
  paradeChoices,
  paradeTarget,
  paydayFor,
  upgradeCost,
} from '../src/modes/festival-workshop/index.ts';
import {
  EVENTS,
  FAVOURS,
  FAVOUR_ORDER,
  LEVEL_INCOME,
  MARKET,
  QUARTER_OFF,
  STATION_ORDER,
  STATIONS,
  UPGRADE_COST_GROWTH,
  variants,
  type EventKind,
  type FavourKind,
  type Goods,
} from '../src/modes/festival-workshop/meta.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type DriveOptions, type Driven } from './rule-helpers.ts';

/*
 * Festival Workshop rules, driven through a GameRuntime on a fake clock.
 * Every question is a true statement, so `right` answers true and `wrong`
 * answers false. Unless a test says otherwise there are no events and no
 * favours, and the market first shifts at 90 seconds, so incomes are exact.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const QUIET = { events: false, favours: false, shiftSeconds: '90', startingCoins: '200' };
const fw = (o: DriveOptions = {}) => drive(festivalWorkshop, { questions: TRUE_SET, players: ['a'], ...o, settings: { ...QUIET, ...o.settings } });
const act = (h: Driven, id: string, a: Record<string, unknown>) => h.rt.act(id, a);
const build = (h: Driven, id: string, slot: number, station: string) => act(h, id, { type: 'build', slot, station });
const you = (h: Driven, id = 'a') => h.view(id).you;
const pick = (id: string) => variants.find((v) => v.meta.id === id)!;
/** Right answers in a row, with no time passing: paydays only. */
const grind = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) expect(h.answer(id, 'right').ok).toBe(true);
};
/** Runs the clock to a game time. */
const until = (h: Driven, ms: number) => h.tick(Math.max(0, ms - h.rt.gameNow()));

describe('Festival Workshop: paydays and money', () => {
  it('pays 8 seconds of income for a right answer, at least 10 coins, +10% for each answer in a row after the first, up to +50%', () => {
    const h = fw();
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(you(h)).toMatchObject({ coins: 210, takings: 10, rate: 0, last: { correct: true, text: 'Payday: +10 coins' } });
    expect(build(h, 'a', 0, 'loom').ok).toBe(true);
    expect(you(h)).toMatchObject({ coins: 90, takings: 10, rate: 4 });
    const pays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = you(h).takings;
      h.answer('a', 'right');
      pays.push(you(h).takings - before);
    }
    // 8 × 4 coins a second = 32, then +10% to +50%.
    expect(pays).toEqual([35, 38, 42, 45, 48, 48, 48]);
    expect(you(h).last.text).toBe('Payday: +48 coins (streak +50%)');
    h.answer('a', 'wrong');
    expect(you(h)).toMatchObject({ streak: 0, last: { correct: false, text: 'No payday this time' } });
    const before = you(h).takings;
    h.answer('a', 'right');
    expect(you(h).takings - before).toBe(32);
    expect(paydayFor(4, 1, { rush: true, finale: true })).toEqual({ amount: 96, notes: ['rush hour ×2', 'finale +50%'] });
  });

  it('earns income every second, settled whenever it changes, and spending never lowers takings', () => {
    const h = fw();
    build(h, 'a', 0, 'loom');
    h.tick(10_000);
    const v = you(h);
    expect(v.rate).toBe(4);
    expect(v.coins).toBeCloseTo(120, 6);
    expect(v.takings).toBeCloseTo(40, 6);
    expect(v.asOf).toBe(h.rt.gameNow());
    expect(build(h, 'a', 1, 'folder').ok).toBe(true);
    expect(you(h).coins).toBeCloseTo(100, 6);
    expect(you(h).takings).toBeCloseTo(40, 6);
    expect(you(h).rate).toBe(5);
    h.tick(4_000);
    expect(you(h).takings).toBeCloseTo(60, 6);
    expect(you(h).from).toMatchObject({ paydays: 0, stations: 60 });
  });

  it('prices stations and upgrades from the table, rounded to 5; a level multiplies income by 1.6 up to level 5', () => {
    expect(STATION_ORDER.map((k) => buildCost(k))).toEqual([20, 120, 500, 1400, 300]);
    expect([1, 2, 3, 4].map((l) => upgradeCost('folder', l))).toEqual([60, 180, 540, 1620]);
    expect([1, 2, 3, 4].map((l) => upgradeCost('lab', l))).toEqual([4200, 12600, 37800, 113400]);
    expect(UPGRADE_COST_GROWTH).toBe(3);
    // Small Stalls: a quarter off, still in fives.
    expect(STATION_ORDER.map((k) => buildCost(k, QUARTER_OFF))).toEqual([15, 90, 375, 1050, 225]);
    expect(upgradeCost('press', 1, QUARTER_OFF)).toBe(1125);

    const h = fw({ settings: { startingCoins: '200' } });
    build(h, 'a', 0, 'folder');
    build(h, 'a', 1, 'loom');
    grind(h, 'a', 80);
    // The Kite Loom makes 4 a second; the rest is the Paper Folder.
    const rates = [you(h).rate - 4];
    for (let l = 1; l < 5; l++) {
      expect(act(h, 'a', { type: 'upgrade', slot: 0 }).ok).toBe(true);
      rates.push(you(h).rate - 4);
    }
    expect(rates.map((r) => Math.round(r * 1000) / 1000)).toEqual([1, 1.6, 2.56, 4.096, 6.554]);
    expect(act(h, 'a', { type: 'upgrade', slot: 0 })).toMatchObject({ ok: false, message: 'Your Paper Folder is already at level 5.' });
    expect(you(h).stations[0]).toMatchObject({ kind: 'folder', level: 5, upgrade: null });
  });

  it('refuses what cannot be built, with a reason', () => {
    const h = fw({ settings: { startingCoins: '50' } });
    expect(build(h, 'a', 0, 'loom')).toMatchObject({ ok: false, message: 'You need 120 coins for a Kite Loom.' });
    expect(build(h, 'a', 9, 'folder')).toMatchObject({ ok: false, message: 'Your workshop does not have that slot.' });
    expect(build(h, 'a', 0, 'folder').ok).toBe(true);
    expect(build(h, 'a', 0, 'folder')).toMatchObject({ ok: false, message: 'That slot already has a Paper Folder.' });
    expect(build(h, 'a', 0, 'loom')).toMatchObject({ ok: false, message: 'Build in a free slot first. You can replace a station once every slot is full.' });
    expect(act(h, 'a', { type: 'upgrade', slot: 3 })).toMatchObject({ ok: false, message: 'There is no station in that slot.' });
    expect(act(h, 'a', { type: 'upgrade', slot: 0 })).toMatchObject({ ok: false, message: 'You need 60 coins for that upgrade.' });
    // Nothing was charged for the refusals.
    expect(you(h).coins).toBe(30);
  });

  it('bigger stations pay back more slowly, and each upgrade more slowly than the last', () => {
    const payback = STATION_ORDER.filter((k) => STATIONS[k].goods).map((k) => Math.round(STATIONS[k].cost / STATIONS[k].income));
    expect(payback).toEqual([20, 30, 33, 47]);
    for (const k of ['folder', 'lab'] as const) {
      const ups = [1, 2, 3, 4].map((l) => upgradeCost(k, l) / (STATIONS[k].income * LEVEL_INCOME ** (l - 1) * (LEVEL_INCOME - 1)));
      for (let i = 1; i < ups.length; i++) expect(ups[i]).toBeGreaterThan(ups[i - 1]!);
    }
  });
});

describe('Festival Workshop: stations', () => {
  it('Glim Helpers add 20% to every other station, 10% more per level, and helpers add up', () => {
    expect([1, 2, 5].map(helperBonus).map((b) => Math.round(b * 100))).toEqual([20, 30, 60]);
    const h = fw();
    build(h, 'a', 0, 'loom');
    grind(h, 'a', 50);
    expect(build(h, 'a', 1, 'helpers').ok).toBe(true);
    expect(you(h).rate).toBeCloseTo(4.8, 9);
    expect(you(h).stations[1]).toMatchObject({ kind: 'helpers', income: 0.8 });
    expect(build(h, 'a', 2, 'helpers').ok).toBe(true);
    expect(you(h).rate).toBeCloseTo(5.6, 9);
    expect(act(h, 'a', { type: 'upgrade', slot: 1 }).ok).toBe(true);
    expect(you(h).rate).toBeCloseTo(6, 9);
  });

  it('a full workshop can replace a station: the old one goes, with no coins back', () => {
    const h = fw({ settings: { startingCoins: '200' } });
    for (let i = 0; i < 6; i++) build(h, 'a', i, 'folder');
    expect(you(h)).toMatchObject({ full: true, coins: 80, rate: 6 });
    // What each replacement would add now is in the view.
    expect(you(h).stations[0].replace).toMatchObject({ loom: 3, press: 14, lab: 29, helpers: 0 });
    grind(h, 'a', 4);
    const coins = you(h).coins;
    expect(build(h, 'a', 0, 'loom').ok).toBe(true);
    expect(you(h).stations[0]).toMatchObject({ kind: 'loom', level: 1 });
    expect(you(h).coins).toBe(coins - 120);
    expect(you(h).rate).toBe(9);
  });

  it('Small Stalls: four slots at a quarter off', () => {
    const h = fw({ variant: pick('festival-workshop-small-stalls'), settings: { ...QUIET } });
    expect(you(h).stations).toHaveLength(4);
    expect(you(h).shop.map((s: any) => s.cost)).toEqual([15, 90, 375, 1050, 225]);
    expect(build(h, 'a', 0, 'loom').ok).toBe(true);
    expect(you(h).coins).toBe(110);
  });
});

describe('Festival Workshop: the market', () => {
  it('prices each goods from its share of what the class makes: clamp(1 + 3.2 × (0.25 − share)) then a nudge, kept in range, to 0.1', () => {
    expect([0, 0.1, 0.25, 0.4, 0.5, 1].map((s) => marketPrice(s, 'normal'))).toEqual([1.6, 1.5, 1, 0.6, 0.6, 0.6]);
    expect(marketPrice(0.25, 'normal', 0.1)).toBe(1.1);
    expect(marketPrice(0, 'normal', 0.1)).toBe(1.6);
    expect(marketPrice(1, 'normal', -0.1)).toBe(0.6);
    expect(marketPrice(0.3, 'normal', -0.1)).toBe(0.7);
    // The wide range: ×0.4 to ×2, a steeper slope and bigger nudges.
    expect([0, 0.25, 0.5].map((s) => marketPrice(s, 'wide'))).toEqual([2, 1, 0.4]);
    expect(marketPrice(0.25, 'wide', -0.2)).toBe(0.8);
    expect(MARKET.normal.nudges).toEqual([-0.1, 0, 0.1]);
  });

  it('the goods everyone makes go cheap at the shift and the rest go up, and the view says where prices are heading', () => {
    const h = fw({ players: ['a', 'b'], settings: { shiftSeconds: '60' } });
    build(h, 'a', 0, 'loom');
    build(h, 'b', 0, 'loom');
    const before = h.host().market;
    expect(before.demand).toEqual({ lanterns: 1, kites: 1, candles: 1, fireworks: 1 });
    expect(before.shares).toEqual({ lanterns: 0, kites: 100, candles: 0, fireworks: 0 });
    expect(before.heading).toEqual({ lanterns: 'up', kites: 'down', candles: 'up', fireworks: 'up' });
    expect(before.shiftAt).toBe(60_000);
    until(h, 60_000);
    const after = h.host().market;
    expect(after.demand.kites).toBeLessThanOrEqual(0.7);
    for (const g of ['lanterns', 'candles', 'fireworks'] as Goods[]) expect(after.demand[g]).toBeGreaterThanOrEqual(1.5);
    expect(after.prev).toEqual(before.demand);
    expect(after.shiftAt).toBe(120_000);
    expect(you(h).rate).toBeCloseTo(4 * after.demand.kites, 9);
    expect(h.feed.some((f) => f.text.startsWith('The market shifted: '))).toBe(true);
  });

  it('with nothing made, every price is nudged around ×1: −0.1, steady or +0.1, each about a third of the time', () => {
    const h = fw({ settings: { shiftSeconds: '30', finaleSeconds: '0' }, common: { timeLimitSec: 3600 } });
    const seen: Record<string, number> = {};
    for (let i = 1; i < 119; i++) {
      until(h, i * 30_000);
      for (const p of Object.values(h.host().market.demand) as number[]) seen[p.toFixed(1)] = (seen[p.toFixed(1)] ?? 0) + 1;
    }
    expect(Object.keys(seen).sort()).toEqual(['0.9', '1.0', '1.1']);
    const n = 118 * 4;
    for (const k of ['0.9', '1.0', '1.1']) expect(Math.abs(seen[k]! / n - 1 / 3)).toBeLessThan(0.07);
  });

  it('Market Madness shifts every 30 seconds in the wide range', () => {
    const h = drive(festivalWorkshop, { questions: TRUE_SET, players: ['a', 'b'], variant: pick('festival-workshop-market-madness'), settings: { events: false, favours: false, startingCoins: '200' } });
    build(h, 'a', 0, 'loom');
    expect(h.host().market).toMatchObject({ shiftAt: 30_000, wide: true });
    until(h, 30_000);
    expect(h.host().market.demand.kites).toBeLessThanOrEqual(0.6);
    expect(h.host().market.demand.candles).toBeGreaterThanOrEqual(1.8);
  });
});

/** A game whose first festival event (at 45 seconds) is `kind`, trying seeds in order, so the test is stable. */
function firstEvent(kind: EventKind, o: DriveOptions & { goods?: Goods } = {}, setup: (h: Driven) => void = () => {}) {
  for (let seed = 1; seed < 200; seed++) {
    const h = fw({ ...o, seed, settings: { events: true, ...o.settings } });
    setup(h);
    until(h, 45_000);
    const ev = h.state().event;
    if (ev?.kind === kind && (!o.goods || ev.goods === o.goods)) return h;
  }
  throw new Error(`no seed starts with ${kind}`);
}

describe('Festival Workshop: festival events', () => {
  it('runs an event every 75 seconds from 45 seconds, 30 seconds each, never the same twice in a row, all about equally often', () => {
    expect(Object.values(EVENTS).every((e) => e.weight === 1)).toBe(true);
    expect(eventChoices('rush', false)).toEqual(['parade', 'sparks', 'swing']);
    expect(eventChoices(null, true)).toEqual(['parade', 'rush', 'sparks', 'swing', 'tea']);
    const h = fw({ players: ['a', 'b'], settings: { events: true, finaleSeconds: '0' }, common: { timeLimitSec: 3600 } });
    expect(h.host().nextEventAt).toBe(45_000);
    const kinds: string[] = [];
    for (let i = 0; i < 47; i++) {
      const at = 45_000 + i * 75_000;
      until(h, at);
      expect(h.host().event).toMatchObject({ startedAt: at, endsAt: at + 30_000 });
      kinds.push(h.host().event.kind);
      until(h, at + 30_000);
      expect(h.host().event).toBeNull();
    }
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    // Nobody has Glim Helpers, so no tea break.
    expect(kinds).not.toContain('tea');
    for (const k of ['parade', 'rush', 'sparks', 'swing']) expect(kinds.filter((x) => x === k).length).toBeGreaterThan(6);
  });

  it('events stop before the grand finale, and announce themselves to the room', () => {
    const h = fw({ settings: { events: true } });
    until(h, 419_000);
    // 420 seconds with a 45-second finale: events at 45, 120, 195, 270 and 345 seconds, the last ending as the finale starts.
    expect(h.state().events).toBe(5);
    expect(h.feed.filter((f) => /^(Parade order|Rush hour|Lucky sparks|Market swing|Glim tea break):/.test(f.text))).toHaveLength(5);
  });

  it('Rush hour doubles paydays', () => {
    const h = firstEvent('rush');
    h.answer('a', 'right');
    expect(you(h).last.text).toBe('Payday: +20 coins (rush hour ×2)');
  });

  it('Glim tea break makes Glim Helpers count double', () => {
    const h = firstEvent('tea', {}, (x) => {
      build(x, 'a', 0, 'loom');
      grind(x, 'a', 20);
      build(x, 'a', 1, 'helpers');
    });
    expect(you(h).rate).toBeCloseTo(5.6, 9);
    until(h, 75_000);
    expect(you(h).rate).toBeCloseTo(4.8, 9);
  });

  it('Market swing reprices at once in the wide range, then the next shift after it uses the normal rule', () => {
    const h = firstEvent('swing', { players: ['a', 'b'] }, (x) => build(x, 'a', 0, 'loom'));
    const m = h.host().market;
    expect(m.swingUntil).toBe(75_000);
    expect(m.demand.kites).toBeLessThanOrEqual(0.6);
    expect(m.demand.candles).toBeGreaterThanOrEqual(1.8);
    until(h, 90_000);
    expect(h.host().market.demand.candles).toBeLessThanOrEqual(1.6);
  });

  it('Lucky sparks: each right answer has a 1 in 4 chance to upgrade a random station that is not at level 5', () => {
    const h = firstEvent('sparks', { settings: { slots: '8', startingCoins: '200' } }, (x) => {
      for (let i = 0; i < 8; i++) build(x, 'a', i, 'folder');
    });
    let sparks = 0;
    for (let i = 0; i < 80; i++) {
      h.answer('a', 'right');
      if (you(h).last.text.includes('Lucky spark:')) sparks++;
    }
    const levels = you(h).stations.reduce((n: number, st: any) => n + st.level - 1, 0);
    expect(levels).toBe(sparks);
    expect(sparks).toBeGreaterThanOrEqual(10);
    expect(sparks).toBeLessThanOrEqual(30);
    expect(you(h).stations.every((st: any) => st.level <= 5)).toBe(true);
  });
});

describe('Festival Workshop: parade orders', () => {
  const paradeOf = (goods: Goods, setup: (h: Driven) => void) => firstEvent('parade', { players: ['a', 'b', 'c'], goods }, setup);

  it('sets a class target of 30 seconds of a level-1 station for every player', () => {
    expect(paradeTarget('lanterns', 3)).toBe(90);
    expect(paradeTarget('fireworks', 10)).toBe(9000);
  });

  it('asks for goods someone in the class makes, each equally likely, or any goods while nobody makes anything', () => {
    expect(paradeChoices([])).toEqual(['lanterns', 'kites', 'candles', 'fireworks']);
    expect(paradeChoices(['kites', 'candles'])).toEqual(['kites', 'candles']);
    for (let seed = 1; seed <= 8; seed++) {
      const h = fw({ players: ['a', 'b'], seed, variant: pick('festival-workshop-rush-orders'), settings: { ...QUIET, events: true, rushOrders: true } });
      build(h, 'a', 0, 'loom');
      until(h, 45_000);
      expect(h.host().event).toMatchObject({ kind: 'parade', goods: 'kites', target: 240 });
    }
  });

  it('when the class reaches the target, the top 3 makers earn 20 seconds of income and every maker gets ×1.25 for 30 seconds', () => {
    const h = paradeOf('lanterns', (x) => {
      build(x, 'a', 0, 'folder');
      build(x, 'a', 1, 'folder');
      build(x, 'a', 2, 'folder');
      build(x, 'b', 0, 'folder');
      build(x, 'c', 0, 'loom');
    });
    expect(h.host().event).toMatchObject({ kind: 'parade', goods: 'lanterns', target: 90 });
    until(h, 60_000);
    expect(h.host().event.progress).toBe(60);
    expect(you(h, 'a').contribution).toBe(45);
    until(h, 75_000);
    const p = h.host().parade;
    expect(p).toMatchObject({ goods: 'lanterns', target: 90, total: 120, reached: true, boosted: 2 });
    expect(p.top.map((t: any) => [t.name, t.amount, t.bonus])).toEqual([
      ['A', 90, 60],
      ['B', 30, 20],
    ]);
    expect(you(h, 'a')).toMatchObject({ rate: 3.75, paradeUntil: 105_000, bonus: { amount: 60, place: 1 } });
    // The Kite Loom made no lanterns: no boost for C.
    expect(you(h, 'c')).toMatchObject({ rate: 4, paradeUntil: null });
    until(h, 105_000);
    // The boost is over; the market shifted at 90 seconds.
    expect(you(h, 'a').rate).toBeCloseTo(3 * h.host().market.demand.lanterns, 9);
    expect(h.feed.map((f) => f.text)).toContain('The parade got its paper lanterns. Everyone who made some earns ×1.25 income for 30 seconds.');
    expect(h.feed.map((f) => f.text)).toContain('Top paper lanterns makers: A and B. Each earns 20 seconds of income.');
  });

  it('a parade can fall short: the top makers still earn their bonus, but nobody gets the boost', () => {
    const h = paradeOf('lanterns', (x) => build(x, 'b', 0, 'folder'));
    until(h, 75_000);
    expect(h.host().parade).toMatchObject({ total: 30, target: 90, reached: false, boosted: 0 });
    expect(you(h, 'b')).toMatchObject({ rate: 1, paradeUntil: null, bonus: { amount: 20 } });
    expect(h.feed.map((f) => f.text)).toContain('The parade fell short this time: 30 of 90 coins of paper lanterns.');
  });

  it('Rush Orders: every event is a parade, one every 45 seconds, and the top 3 earn 40 seconds of income', () => {
    const h = fw({ players: ['a', 'b'], variant: pick('festival-workshop-rush-orders'), settings: { events: true, rushOrders: true, favours: false, shiftSeconds: '90', startingCoins: '200' } });
    build(h, 'a', 0, 'folder');
    build(h, 'a', 1, 'loom');
    build(h, 'b', 0, 'folder');
    build(h, 'b', 1, 'loom');
    const starts: number[] = [];
    for (let at = 45_000; at <= 315_000; at += 45_000) {
      until(h, at);
      expect(h.host().event).toMatchObject({ kind: 'parade', startedAt: at });
      starts.push(at);
    }
    expect(starts).toEqual([45_000, 90_000, 135_000, 180_000, 225_000, 270_000, 315_000]);
    // One at 360 seconds would run into the finale.
    expect(h.host().nextEventAt).toBeNull();
    until(h, 345_000);
    const p = h.host().parade;
    // 40 seconds of income each, at the price their goods sold for.
    for (const t of p.top) expect(t.bonus).toBe(Math.round((you(h, t.name.toLowerCase()).rate / (p.reached ? 1.25 : 1)) * 40));
  });
});

describe('Festival Workshop: the grand finale', () => {
  it('in the last 45 seconds fireworks sell at ×2 and paydays are 50% bigger, and the view says it is the final stretch', () => {
    const h = fw();
    build(h, 'a', 0, 'loom');
    grind(h, 'a', 45);
    build(h, 'a', 1, 'lab');
    until(h, 374_000);
    const v = h.view('a');
    expect(v.finalStretch).toBe(false);
    expect(v.finale).toMatchObject({ at: 375_000, on: false, demand: 2 });
    until(h, 375_000);
    expect(h.view('a').finalStretch).toBe(true);
    expect(h.view('a').market.demand.fireworks).toBe(2);
    expect(h.view('a').market.heading.fireworks).toBe('steady');
    const kites = h.view('a').market.demand.kites;
    expect(you(h).rate).toBeCloseTo(4 * kites + 30 * 2, 6);
    h.answer('a', 'right');
    expect(you(h).last.text).toMatch(/finale \+50%/);
    expect(h.feed.map((f) => f.text)).toContain('Grand finale: fireworks sell at ×2 and paydays are 50% bigger.');
  });

  it('Fireworks Finale: 90 seconds, at ×3; no finale leaves the music to the clock', () => {
    const h = fw({ variant: pick('festival-workshop-fireworks-finale'), settings: { ...QUIET } });
    expect(h.view('a').finale).toMatchObject({ at: 330_000, demand: 3 });
    until(h, 330_000);
    expect(h.view('a').market.demand.fireworks).toBe(3);
    const none = fw({ settings: { finaleSeconds: '0' } });
    expect(none.view('a').finale.at).toBeNull();
    expect('finalStretch' in none.view('a')).toBe(false);
  });
});

/** Right answers, taking any favour but a prank when one is offered. */
function climb(h: Driven, id: string, n: number) {
  for (let i = 0; i < n; i++) {
    const o = you(h, id).offer;
    if (o) act(h, id, { type: 'favour', card: o.cards.find((c: FavourKind) => c !== 'prank') });
    else expect(h.answer(id, 'right').ok).toBe(true);
  }
}

/** Answers right until a favour is offered that includes `card`, taking the first other card meanwhile. */
function offerWith(h: Driven, id: string, card: FavourKind) {
  for (let guard = 0; guard < 120; guard++) {
    if (!you(h, id).offer) {
      h.answer(id, 'right');
      continue;
    }
    const o = you(h, id).offer;
    if (o.cards.includes(card)) return o;
    // Never a prank here, so it does not change who was pranked last.
    const other = (o.cards.find((c: FavourKind) => c !== 'prank') ?? o.cards[0]) as FavourKind;
    expect(act(h, id, { type: 'favour', card: other, ...(other === 'prank' ? { target: o.targets[0].playerId } : {}) }).ok).toBe(true);
  }
  throw new Error(`no offer with ${card}`);
}

describe('Festival Workshop: Festival Favours', () => {
  const favours = (o: DriveOptions = {}) => fw({ ...o, settings: { favours: true, ...o.settings } });

  it('every 5th right answer offers two different cards; there is no question until one is taken', () => {
    const h = favours({ players: ['a', 'b'] });
    grind(h, 'a', 4);
    expect(you(h)).toMatchObject({ offer: null, toFavour: 1 });
    h.answer('a', 'right');
    const o = you(h).offer;
    expect(o.cards).toHaveLength(2);
    expect(new Set(o.cards).size).toBe(2);
    expect(o.until).toBe(h.rt.gameNow() + 20_000);
    expect(you(h).question).toBeNull();
    expect(you(h).last.text).toBe('Payday: +14 coins (streak +40%). Festival Favour: pick a card');
    expect(h.rt.act('a', { type: 'answer', iid: 'q1', answer: { type: 'truefalse', value: true } })).toMatchObject({ ok: false, message: 'Pick a Festival Favour first.' });
    expect(act(h, 'a', { type: 'favour', card: FAVOUR_ORDER.find((k) => !o.cards.includes(k)) })).toMatchObject({ ok: false, message: 'That favour is not on offer.' });
  });

  it('one player, or pranks off, means no Prank and no Lock; the offer closes itself with the first card after 20 seconds', () => {
    for (const h of [favours(), favours({ players: ['a', 'b'], variant: pick('festival-workshop-friendly'), settings: { ...QUIET, favours: true } })]) {
      build(h, 'a', 0, 'loom');
      grind(h, 'a', 5);
      const o = you(h).offer;
      expect(o.deck).toEqual(['overtime', 'tipJar']);
      expect([...o.cards].sort()).toEqual(['overtime', 'tipJar']);
      h.tick(20_000);
      expect(you(h)).toMatchObject({ offer: null, favour: { kind: o.cards[0], auto: true } });
      expect(you(h).question).not.toBeNull();
    }
  });

  it('Overtime: income ×1.5 for 30 seconds, ending at exactly the right moment', () => {
    const h = favours();
    build(h, 'a', 0, 'loom');
    grind(h, 'a', 5);
    const start = you(h).takings;
    expect(act(h, 'a', { type: 'favour', card: 'overtime' }).ok).toBe(true);
    expect(you(h)).toMatchObject({ rate: 6, overtimeUntil: h.rt.gameNow() + 30_000 });
    // The clock jumps past the end of Overtime: 30 seconds at 6 and 10 at 4.
    h.tick(40_000);
    expect(you(h).rate).toBe(4);
    expect(you(h).takings - start).toBeCloseTo(220, 6);
  });

  it('Tip jar: +25% of your coins, at least 30', () => {
    const h = favours();
    grind(h, 'a', 5);
    act(h, 'a', { type: 'favour', card: 'tipJar' });
    expect(you(h).favour).toMatchObject({ kind: 'tipJar', amount: 65 });
    const low = favours({ settings: { startingCoins: '0' } });
    grind(low, 'a', 5);
    act(low, 'a', { type: 'favour', card: 'tipJar' });
    expect(low.view('a').you.favour).toMatchObject({ kind: 'tipJar', amount: 30 });
  });

  it('Prank: the target’s best station stops for 15 seconds; not the same player twice in a row; a Lock blocks one prank', () => {
    const h = favours({ players: ['a', 'b', 'c'] });
    build(h, 'b', 0, 'folder');
    build(h, 'b', 1, 'loom');
    build(h, 'c', 0, 'folder');
    // C leads by a mile, so a prank on B stays between A and B.
    build(h, 'c', 1, 'loom');
    climb(h, 'c', 60);
    const o = offerWith(h, 'a', 'prank');
    expect(o.targets.map((t: any) => t.playerId)).toEqual(['c', 'b']);
    expect(o.targets[1]).toMatchObject({ name: 'B', lock: false, best: { kind: 'loom', level: 1 } });
    expect(o.targets[0]).toMatchObject({ name: 'C', rank: 1 });
    expect(act(h, 'a', { type: 'favour', card: 'prank', target: 'b' }).ok).toBe(true);
    const at = h.rt.gameNow();
    expect(you(h, 'b').stations[1]).toMatchObject({ kind: 'loom', stoppedUntil: at + 15_000, stoppedBy: 'A' });
    expect(you(h, 'b')).toMatchObject({ rate: 1, pranked: { by: 'A', station: 'loom', blocked: false } });
    expect(h.feed.find((f) => f.text === "A's prank tangled B's Kite Loom for 15 seconds.")).toMatchObject({ to: ['a', 'b'] });
    h.tick(15_000);
    expect(you(h, 'b').rate).toBe(5);
    expect(you(h, 'b').stations[1].stoppedUntil).toBeNull();
    // B again is not allowed straight away.
    const next = offerWith(h, 'a', 'prank');
    expect(next.targets.map((t: any) => t.playerId)).toEqual(['c']);
    expect(act(h, 'a', { type: 'favour', card: 'prank', target: 'b' })).toMatchObject({ ok: false, message: 'That player cannot be pranked right now. Pick someone else.' });
    // C takes a lock; A's prank on C (the leader) is blocked, and the whole room hears.
    offerWith(h, 'c', 'lock');
    act(h, 'c', { type: 'favour', card: 'lock' });
    expect(you(h, 'c').lock).toBe(true);
    act(h, 'a', { type: 'favour', card: 'prank', target: 'c' });
    expect(you(h, 'c')).toMatchObject({ lock: false, pranked: { by: 'A', blocked: true } });
    expect(you(h, 'c').stations[0].stoppedUntil).toBeNull();
    expect(h.feed.find((f) => f.text === "C's lock stopped A's prank.")?.to).toBeUndefined();
  });

  it('a second Lock gives +40 coins instead, and a prank left untargeted goes to the biggest takings', () => {
    const h = favours({ players: ['a', 'b', 'c'] });
    build(h, 'b', 0, 'folder');
    build(h, 'c', 0, 'folder');
    grind(h, 'b', 2);
    offerWith(h, 'a', 'lock');
    act(h, 'a', { type: 'favour', card: 'lock' });
    offerWith(h, 'a', 'lock');
    act(h, 'a', { type: 'favour', card: 'lock' });
    expect(you(h)).toMatchObject({ lock: true, favour: { kind: 'lock', amount: 40, swapped: true } });
    offerWith(h, 'a', 'prank');
    // Picking Prank without a target, then letting the time run out.
    expect(act(h, 'a', { type: 'favour', card: 'prank' }).ok).toBe(true);
    expect(you(h).offer.prank).toBe(true);
    h.tick(20_000);
    expect(you(h)).toMatchObject({ offer: null, favour: { kind: 'prank', target: 'B', auto: true } });
  });

  it('the favour odds sum to 100, and seeded draws land near them, never the same card twice', () => {
    expect(FAVOUR_ORDER.reduce((n, k) => n + FAVOURS[k].weight, 0)).toBe(100);
    const rng = createRng(7);
    const first: Record<string, number> = {};
    const offered: Record<string, number> = {};
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const cards = drawFavours(FAVOUR_ORDER, () => rng.next());
      expect(cards[0]).not.toBe(cards[1]);
      first[cards[0]!] = (first[cards[0]!] ?? 0) + 1;
      for (const c of cards) offered[c] = (offered[c] ?? 0) + 1;
    }
    for (const k of FAVOUR_ORDER) expect(Math.abs(first[k]! / N - FAVOURS[k].weight / 100)).toBeLessThan(0.015);
    // The chance a card is in an offer of two: first, or second after another card came first.
    const chance = (k: FavourKind) => FAVOURS[k].weight / 100 + FAVOUR_ORDER.filter((j) => j !== k).reduce((n, j) => n + (FAVOURS[j].weight / 100) * (FAVOURS[k].weight / (100 - FAVOURS[j].weight)), 0);
    for (const k of FAVOUR_ORDER) expect(Math.abs(offered[k]! / N - chance(k))).toBeLessThan(0.015);
    // Without pranks the two cards left share everything.
    expect(drawFavours(['overtime', 'tipJar'], () => 0.99).sort()).toEqual(['overtime', 'tipJar']);
  });
});

describe('Festival Workshop: the room', () => {
  it('a late joiner gets the starting coins plus 20 seconds of the class’s average income; a leaver’s workshop freezes until they return', () => {
    const h = fw({ players: ['a', 'b'] });
    build(h, 'a', 0, 'loom');
    h.tick(10_000);
    h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false });
    expect(you(h, 'late')).toMatchObject({ coins: 240, takings: 0, rate: 0 });
    h.rt.removePlayer('a');
    const frozen = h.state().workshops.a.takings;
    h.tick(10_000);
    expect(h.state().workshops.a.takings).toBe(frozen);
    h.rt.addPlayer({ id: 'a', name: 'A', teamId: null, isBot: false });
    h.tick(5_000);
    expect(you(h, 'a').takings).toBeCloseTo(frozen + 20, 6);
    // A disconnected player's workshop keeps running.
    h.rt.setConnected('b', false);
    build(h, 'b', 0, 'folder');
    h.tick(5_000);
    expect(you(h, 'b').takings).toBeCloseTo(5, 6);
  });

  it('ranks by takings, with results that cover everyone, team averages and a summary naming the class’s favourite station', () => {
    const h = fw({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], teams: 2 });
    build(h, 'a', 0, 'loom');
    build(h, 'b', 0, 'folder');
    build(h, 'c', 0, 'folder');
    build(h, 'c', 1, 'folder');
    h.tick(10_000);
    expect(h.host().board.map((r: any) => [r.name, r.takings, r.rank])).toEqual([
      ['A', 40, 1],
      ['C', 20, 2],
      ['B', 10, 3],
    ]);
    h.rt.removePlayer('b');
    until(h, 420_000);
    expect(h.rt.status).toBe('ended');
    const r = h.rt.results!;
    // B left after 10 seconds with 10 coins taken; the others earned at the market's prices all game.
    expect(r.standings.map((s) => s.name)).toEqual(['A', 'C', 'B']);
    const score = (n: string) => r.standings.find((s) => s.name === n)!.score;
    expect(r.standings.find((s) => s.name === 'B')).toMatchObject({ left: true, score: 10, label: '10 coins taken' });
    expect(score('A')).toBeGreaterThan(800);
    for (const s of r.standings) expect(s.label).toBe(`${s.score.toLocaleString('en-GB')} coins taken`);
    const team = (id: string) => r.teamStandings.find((t) => t.teamId === id)!;
    expect(team('t1').score).toBe(Math.floor((score('A') + score('B')) / 2));
    expect(team('t2')).toMatchObject({ score: score('C'), label: `${score('C').toLocaleString('en-GB')} coins taken on average` });
    expect(r.summary).toBe(`A's workshop took ${score('A').toLocaleString('en-GB')} coins. The class built Paper Folders most.`);
  });

  it('the goal ends the game the moment a workshop’s takings reach it, between answers too', () => {
    const h = fw({ settings: { goal: 5000 } });
    build(h, 'a', 0, 'loom');
    grind(h, 'a', 40);
    build(h, 'a', 1, 'loom');
    build(h, 'a', 2, 'loom');
    for (let i = 0; i < 400 && h.rt.status !== 'ended'; i++) h.tick(1_000);
    expect(h.rt.status).toBe('ended');
    // Ended by the goal, within a second of income of it, long before the time limit.
    const top = h.rt.results!.standings[0]!.score;
    expect(top).toBeGreaterThanOrEqual(5000);
    expect(top).toBeLessThan(5000 + 12);
    expect(h.rt.results!.durationMs).toBeLessThan(400_000);
    expect(h.rt.results!.summary).toBe("A's workshop reached 5,000 coins first. The class built Kite Looms most.");
    expect(h.feed.map((f) => f.text)).toContain("A's workshop reached 5,000 coins.");
  });

  it('with no time limit the workshop still closes after 7 minutes', () => {
    const h = fw({ common: { timeLimitSec: 0 } });
    expect(h.view('a').endsAt).toBe(420_000);
    until(h, 420_000);
    expect(h.rt.status).toBe('ended');
  });

  it('never puts an answer in any view: questions, offers, prank targets and the big screen', () => {
    const h = fw({ players: ['a', 'b'], settings: { favours: true, events: true } });
    build(h, 'b', 0, 'folder');
    for (let i = 0; i < 30; i++) {
      if (you(h).offer) act(h, 'a', { type: 'favour', card: you(h).offer.cards[0], ...(you(h).offer.targets[0] ? { target: you(h).offer.targets[0].playerId } : {}) });
      else h.answer('a', i % 3 ? 'right' : 'wrong');
      h.tick(2_000);
      expect([...findAnswerLeaks(h.view('a'), 'a'), ...findAnswerLeaks(h.view('b'), 'b'), ...findAnswerLeaks(h.host(), 'host')]).toEqual([]);
    }
    expect(JSON.stringify(h.host()).length).toBeLessThan(8000);
  });
});

describe('Festival Workshop: bots', () => {
  const botCtx = (h: Driven, id: string) => ({ playerId: id, rng: createRng(1), skill: 1, now: h.rt.gameNow(), settings: h.rt.settings as any, answer: () => ({ type: 'truefalse' as const, value: true }) });

  it('build the best income per coin they can afford, save only for something within 20 seconds of income, then answer', () => {
    const h = fw({ settings: { startingCoins: '200' } });
    // At even prices a Paper Folder is the best value per coin.
    expect(festivalWorkshop.bot!(h.view('a'), botCtx(h, 'a'))).toEqual({ type: 'build', slot: 0, station: 'folder' });
    build(h, 'a', 0, 'loom');
    build(h, 'a', 1, 'folder');
    build(h, 'a', 2, 'folder');
    // 40 coins left and 6 a second: nothing better is within reach, so it buys the next best thing it can afford.
    const plan = botPurchase(h.view('a'), h.rt.gameNow());
    expect(plan?.action).toEqual({ type: 'build', slot: 3, station: 'folder' });
  });

  it('pick favours by the rules: prank the leader when under 70% of them, lock when leading, otherwise Overtime', () => {
    const view = (cards: FavourKind[], takings: number, rank: number) => ({
      board: [{ playerId: 'lead', takings: 1000 }],
      you: { takings, rank, lock: false, coins: 0, rate: 0, asOf: 0, stations: [], shop: [], offer: { cards, targets: [{ playerId: 'x', takings: 500 }, { playerId: 'lead', takings: 1000 }] } },
    });
    const bot = (v: unknown) => festivalWorkshop.bot!(v, { playerId: 'me', rng: createRng(1), skill: 1, now: 0, settings: {} as any, answer: () => ({ type: 'truefalse', value: true }) });
    expect(bot(view(['overtime', 'prank'], 500, 2))).toEqual({ type: 'favour', card: 'prank', target: 'lead' });
    expect(bot(view(['overtime', 'prank'], 800, 2))).toEqual({ type: 'favour', card: 'overtime' });
    expect(bot(view(['lock', 'overtime'], 2000, 1))).toEqual({ type: 'favour', card: 'lock' });
    expect(bot(view(['tipJar', 'lock'], 800, 2))).toEqual({ type: 'favour', card: 'tipJar' });
  });

  it('a room of bots builds, upgrades, takes favours and pranks, and finishes with takings for everyone', () => {
    const r = simulateGame({ modeId: 'festival-workshop', questions: MIXED_SET, players: 8, seed: 12 });
    expect(r.errors).toEqual([]);
    expect(r.results?.standings.every((s) => s.score > 1000)).toBe(true);
    expect(r.results?.summary).toMatch(/workshop took [\d,]+ coins\. The class built .+ most\.$/);
  });
});
