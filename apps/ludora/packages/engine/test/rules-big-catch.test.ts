import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { bigCatch, drawCatch } from '../src/modes/big-catch/index.ts';
import { BITE_MS, DECIDE_SEC, EVENT_TIMING, LURES, PERFECT_MS, REEL_WINDOW_MS, SET_BONUS, TANK_SIZE, TROPHY_COUNT, WATER_ROTATE_SEC, meta, variants } from '../src/modes/big-catch/meta.ts';
import { RARITIES, SPECIES, WATERS, speciesById, speciesOf, type Rarity, type SpeciesId, type WaterId } from '../src/modes/big-catch/species.ts';
import { biteRangeMs, gramsFor, medianKg, oddsTable, pointsFor, rarityPercents, sizeCm, tankValue, weightRange, type OddsMoment } from '../src/modes/big-catch/odds.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Big Catch rules, driven through a real GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true. Catches are random,
 * so a test that needs a particular fish casts until one is on the hook
 * (reading the hidden catch from the game state, never from a view), and
 * scares off the ones it does not want by reeling before the bite.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const pickVariant = (id: string) => variants.find((v) => v.meta.id === id)!;
const BASE: OddsMoment = { water: 'river', lure: 0, event: null, deepSea: false, frenzy: false };
const rarityOf = (id: SpeciesId): Rarity => speciesById(id)!.rarity;

/** A game on the river with no events unless a test asks, so nothing random changes the odds under a test. */
function game(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number; variant?: string } = {}) {
  return drive(bigCatch, {
    players: o.players ?? ['a', 'b'],
    questions: TRUE_SET,
    teams: o.teams ?? 0,
    seed: o.seed ?? 42,
    common: o.common ?? {},
    ...(o.variant ? { variant: pickVariant(o.variant) } : {}),
    settings: o.variant ? (o.settings ?? {}) : { events: false, water: 'river', ...o.settings },
  });
}

const fisher = (h: Driven, id: string) => h.state().fishers[id];
const line = (h: Driven, id: string) => fisher(h, id).line;
const castLine = (h: Driven, id: string) => h.rt.act(id, { type: 'cast' });
const reel = (h: Driven, id: string) => h.rt.act(id, { type: 'reel' });
const sell = (h: Driven, id: string) => h.rt.act(id, { type: 'sell', seq: line(h, id).seq });
const tank = (h: Driven, id: string) => h.rt.act(id, { type: 'tank', seq: line(h, id).seq });
const now = (h: Driven) => h.rt.gameNow();

/** Answer right until a player holds at least `n` casts. */
function earn(h: Driven, id: string, n = 1) {
  for (let guard = 0; fisher(h, id).casts < n; guard++) {
    expect(h.answer(id, 'right').ok).toBe(true);
    if (guard > 5000) throw new Error('could not earn casts');
  }
}

/** Cast until the hidden catch matches, scaring off the others. */
function hook(h: Driven, id: string, match: (c: { species: SpeciesId; grams: number }) => boolean = () => true, tries = 800) {
  for (let i = 0; i < tries; i++) {
    earn(h, id);
    expect(castLine(h, id).ok).toBe(true);
    const hooked = line(h, id).hooked;
    if (match(hooked)) return hooked as { species: SpeciesId; grams: number };
    expect(reel(h, id).ok).toBe(true); // too soon: the fish swims off
  }
  throw new Error(`nothing matching turned up for ${id}`);
}

/** Move the clock to the bite, firing its timer. */
function toBite(h: Driven, id: string) {
  h.tick(line(h, id).biteAt - now(h));
  expect(line(h, id).phase).toBe('biting');
}

/** Hook a fish (matching, if asked), wait for the bite and reel `after` ms later. Returns the landed fish. */
function catchFish(h: Driven, id: string, match?: (c: { species: SpeciesId; grams: number }) => boolean, after = 1000) {
  hook(h, id, match);
  toBite(h, id);
  h.wait(after);
  expect(reel(h, id).ok).toBe(true);
  return line(h, id).landed ?? fisher(h, id).outcome.fish;
}

/* ---------------------------------- odds ---------------------------------- */

describe('Big Catch odds', () => {
  it('every water holds its own fish, each table adds up to 100, and every chance shown adds up to 100%', () => {
    for (const water of WATERS) {
      const fish = speciesOf(water);
      expect(fish.length).toBeGreaterThanOrEqual(6);
      expect(fish.reduce((n, s) => n + s.weight, 0)).toBeCloseTo(100, 9);
      for (const r of RARITIES) expect(fish.some((s) => s.rarity === r), `${water} has a ${r} fish`).toBe(true);
    }
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.kg[0]).toBeLessThan(s.kg[1]);
      expect(s.blurb.length).toBeGreaterThan(10);
    }
    for (const water of WATERS)
      for (let lure = 0; lure < LURES.length; lure++)
        for (const event of [null, 'feeding', 'golden', 'school'] as const)
          for (const deepSea of [false, true]) {
            const rows = oddsTable({ water, lure, event, deepSea, frenzy: false });
            expect(rows.reduce((n, r) => n + r.percent, 0)).toBeCloseTo(100, 9);
            expect(rows.map((r) => r.species)).toEqual(speciesOf(water).map((s) => s.id));
          }
    // With no lure and no event the chances are the table's own.
    expect(oddsTable(BASE).map((r) => r.percent)).toEqual(speciesOf('river').map((s) => s.weight));
  });

  it('lures and Golden Hour make rarer fish more likely; Passing School and Deep Sea change weights; Feeding Time, Frenzy and Deep Sea change bites', () => {
    const rare = (m: OddsMoment) => rarityPercents(m).rare + rarityPercents(m).legend;
    for (const water of WATERS) {
      const levels = LURES.map((_, lure) => rare({ ...BASE, water, lure }));
      for (let i = 1; i < levels.length; i++) expect(levels[i]!, `${water} lure ${i}`).toBeGreaterThan(levels[i - 1]!);
      expect(rare({ ...BASE, water, event: 'golden' })).toBeGreaterThan(rare({ ...BASE, water }) * 1.4);
      expect(rarityPercents({ ...BASE, water, deepSea: true }).common).toBeLessThan(rarityPercents({ ...BASE, water }).common);
    }
    // Lures also make a heavier fish of the same species more likely.
    const cod = speciesById('murrayCod')!;
    const medians = LURES.map((_, lure) => medianKg(cod, { ...BASE, lure }));
    for (let i = 1; i < medians.length; i++) expect(medians[i]!).toBeGreaterThan(medians[i - 1]!);
    expect(medianKg(cod, { ...BASE, deepSea: true })).toBeGreaterThan(medians[0]!);

    // Passing School: common fish half as heavy again; others unchanged.
    const carp = speciesById('carp')!;
    expect(weightRange(carp, { event: 'school' })).toEqual([carp.kg[0] * 1.5, carp.kg[1] * 1.5]);
    expect(weightRange(cod, { event: 'school' })).toEqual(cod.kg);
    const school = oddsTable({ ...BASE, event: 'school' }).find((r) => r.species === 'carp')!;
    expect([school.minKg, school.maxKg]).toEqual([0.75, 7.5]);

    expect(biteRangeMs(BASE)).toEqual(BITE_MS.normal);
    expect(biteRangeMs({ ...BASE, event: 'feeding' })).toEqual([750, 2000]);
    expect(biteRangeMs({ ...BASE, frenzy: true })).toEqual([900, 2400]);
    expect(biteRangeMs({ ...BASE, deepSea: true })).toEqual(BITE_MS.deepSea);

    // Weights stay in range, and most fish are lighter than the middle of it.
    expect(gramsFor(carp, 0, BASE)).toBe(500);
    expect(gramsFor(carp, 0.999999, BASE)).toBe(5000);
    expect(medianKg(carp, BASE)).toBeLessThan((carp.kg[0] + carp.kg[1]) / 2);
    expect(pointsFor(2345)).toBe(23);
    expect(pointsFor(40)).toBe(0);
    expect(sizeCm(carp, 500)).toBe(carp.cm[0]);
    expect(sizeCm(carp, 5000)).toBe(carp.cm[1]);
  });

  it('seeded draws land on the published odds, with weights inside each range', () => {
    const n = 40_000;
    for (const m of [BASE, { ...BASE, water: 'reef' as WaterId, lure: 3, event: 'golden' as const }, { ...BASE, water: 'estuary' as WaterId, event: 'school' as const }, { ...BASE, water: 'reef' as WaterId, deepSea: true }]) {
      const rng = createRng(2024);
      const seen: Record<string, number> = {};
      const rows = oddsTable(m);
      for (let i = 0; i < n; i++) {
        const c = drawCatch(m, rng);
        seen[c.species] = (seen[c.species] ?? 0) + 1;
        const row = rows.find((r) => r.species === c.species)!;
        expect(c.grams).toBeGreaterThanOrEqual(Math.round(row.minKg * 1000));
        expect(c.grams).toBeLessThanOrEqual(Math.round(row.maxKg * 1000));
      }
      for (const r of rows) expect(Math.abs((seen[r.species] ?? 0) / n - r.percent / 100), `${m.water} ${r.species}`).toBeLessThan(0.01);
    }
  });

  it('casts in real games land on the odds the player is shown, over many seeds', () => {
    const seen: Record<string, number> = {};
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const h = game({ players: ['a'], seed });
      earn(h, 'a', 100);
      const shown = h.view('a').you.odds.rows;
      expect(shown.map((r: any) => r.percent)).toEqual(speciesOf('river').map((s) => s.weight));
      for (let i = 0; i < 100; i++) {
        expect(castLine(h, 'a').ok).toBe(true);
        const c = line(h, 'a').hooked;
        seen[c.species] = (seen[c.species] ?? 0) + 1;
        total++;
        expect(reel(h, 'a').ok).toBe(true);
      }
    }
    for (const r of oddsTable(BASE)) expect(Math.abs((seen[r.species] ?? 0) / total - r.percent / 100), r.species).toBeLessThan(0.03);
  });
});

/* ---------------------------------- casts --------------------------------- */

describe('Big Catch casting', () => {
  it('a right answer gives a cast and every third in a row a bonus cast; a wrong answer gives none and breaks the run', () => {
    const h = game({ players: ['a'] });
    expect(h.view('a').you).toMatchObject({ casts: 0, toBonus: 3, line: { phase: 'idle' } });
    expect(castLine(h, 'a')).toMatchObject({ ok: false, message: 'You have no casts left. Answer a question to earn one.' });
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ casts: 1, toBonus: 2, feedback: { correct: true, text: '+1 cast' } });
    h.answer('a', 'right');
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ casts: 4, toBonus: 3, feedback: { text: '+2 casts: 3 in a row!' } });
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ casts: 4, streak: 0, feedback: { correct: false, text: 'No cast this time' } });
    h.answer('a', 'right');
    h.answer('a', 'right');
    expect(fisher(h, 'a').casts).toBe(6);
    h.answer('a', 'right');
    expect(fisher(h, 'a').casts).toBe(8);

    // A cast spends one; the line must come back before the next.
    expect(castLine(h, 'a').ok).toBe(true);
    expect(fisher(h, 'a').casts).toBe(7);
    expect(castLine(h, 'a')).toMatchObject({ ok: false, message: 'Your line is already in the water.' });
    // Questions stay open while the line is out.
    expect(h.view('a').you.question).not.toBeNull();
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(h.errors).toEqual([]);
  });

  it('the catch is decided at the cast and kept out of every view until it is landed', () => {
    const h = game({ players: ['a', 'b'] });
    earn(h, 'a');
    expect(castLine(h, 'a').ok).toBe(true);
    const hooked = line(h, 'a').hooked;
    const leak = (v: any) => {
      const json = JSON.stringify(v);
      expect(json).not.toContain('hooked');
      expect(json).not.toContain(`"grams":${String(hooked.grams)}`);
      expect(json).not.toContain(`"biteAt":${String(line(h, 'a').biteAt)}`);
    };
    // Waiting: not the fish, and not when it will bite.
    expect(Object.keys(h.view('a').you.line).sort()).toEqual(['castAt', 'phase', 'seq', 'water']);
    expect(h.host().lines.find((l: any) => l.playerId === 'a')).toEqual({ playerId: 'a', name: 'A', teamId: null, phase: 'waiting', castAt: line(h, 'a').castAt });
    for (const v of [h.view('a'), h.view('b'), h.host()]) leak(v);
    // Biting: the bite time shows, the fish still does not.
    toBite(h, 'a');
    const biting = h.view('a').you.line;
    expect(biting).toMatchObject({ phase: 'biting', biteAt: line(h, 'a').biteAt, perfectBy: line(h, 'a').biteAt + PERFECT_MS, reelBy: line(h, 'a').biteAt + REEL_WINDOW_MS });
    expect(biting.fish).toBeUndefined();
    expect(JSON.stringify([h.view('a'), h.view('b'), h.host()])).not.toContain(`"grams":${String(hooked.grams)}`);
    // Landed: now everyone may see it.
    h.wait(1000);
    expect(reel(h, 'a').ok).toBe(true);
    expect(h.view('a').you.line).toMatchObject({ phase: 'landed', fish: { species: hooked.species, grams: hooked.grams, perfect: false } });
    expect(h.host().lines.find((l: any) => l.playerId === 'a')).toMatchObject({ phase: 'landed', species: hooked.species, grams: hooked.grams });
    for (const v of [h.view('a'), h.view('b'), h.host()]) expect(findAnswerLeaks(v)).toEqual([]);
  });

  it('the bite comes 1.5 to 4 seconds after the cast, and the reel window is 3 seconds', () => {
    const h = game({ players: ['a'] });
    const waits: number[] = [];
    for (let i = 0; i < 40; i++) {
      earn(h, 'a');
      castLine(h, 'a');
      const l = line(h, 'a');
      waits.push(l.biteAt - l.castAt);
      expect(reel(h, 'a').ok).toBe(true);
    }
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(1500);
    expect(Math.max(...waits)).toBeLessThanOrEqual(4000);
    expect(Math.max(...waits) - Math.min(...waits)).toBeGreaterThan(1500);

    // The bite timer fires at the bite and not a moment before.
    earn(h, 'a');
    castLine(h, 'a');
    h.tick(line(h, 'a').biteAt - now(h) - 1);
    expect(h.view('a').you.line.phase).toBe('waiting');
    h.tick(1);
    expect(h.view('a').you.line.phase).toBe('biting');
  });

  it('reeling before the bite scares the fish away: the cast is lost, with a friendly word', () => {
    const h = game({ players: ['a'] });
    earn(h, 'a', 2);
    castLine(h, 'a');
    h.wait(line(h, 'a').biteAt - now(h) - 1);
    expect(reel(h, 'a').ok).toBe(true);
    expect(h.view('a').you).toMatchObject({
      casts: 1,
      line: { phase: 'idle' },
      outcome: { kind: 'spooked', fish: null, escaped: null, title: 'Too soon! You scared the fish away.', detail: 'Wait for the bobber to dip, then reel.' },
      stats: { casts: 1, landed: 0, spooked: 1 },
    });
    // The bite timer was cleared with it.
    h.tick(10_000);
    expect(h.view('a').you.line.phase).toBe('idle');
    expect(reel(h, 'a')).toMatchObject({ ok: false, message: 'Your line is not in the water.' });
    expect(h.errors).toEqual([]);
  });

  it('a fish nobody reels in within 3 seconds gets away, and the player learns what it was', () => {
    const h = game({ players: ['a'] });
    const hooked = hook(h, 'a');
    toBite(h, 'a');
    h.tick(REEL_WINDOW_MS - 1);
    expect(line(h, 'a').phase).toBe('biting');
    h.tick(1);
    const out = h.view('a').you.outcome;
    expect(out).toMatchObject({ kind: 'escaped', escaped: hooked.species, fish: null, detail: 'Reel within 3 seconds of the bite.' });
    expect(out.title).toMatch(/got away!$/);
    expect(fisher(h, 'a')).toMatchObject({ escaped: 1, landed: 0, wallet: 0 });

    // A reel that arrives after the window, before the timer fires, is too late as well.
    hook(h, 'a');
    toBite(h, 'a');
    h.wait(REEL_WINDOW_MS + 1);
    expect(reel(h, 'a').ok).toBe(true);
    expect(fisher(h, 'a').outcome.kind).toBe('escaped');
  });

  it('a reel within half a second of the bite is perfect (10% heavier); after that the weight is as caught', () => {
    const h = game({ players: ['a'] });
    const first = hook(h, 'a');
    toBite(h, 'a');
    h.wait(PERFECT_MS);
    expect(reel(h, 'a').ok).toBe(true);
    expect(line(h, 'a').landed).toMatchObject({ species: first.species, grams: Math.round(first.grams * 1.1), perfect: true });
    expect(sell(h, 'a').ok).toBe(true);

    const second = hook(h, 'a');
    toBite(h, 'a');
    h.wait(PERFECT_MS + 1);
    expect(reel(h, 'a').ok).toBe(true);
    expect(line(h, 'a').landed).toMatchObject({ species: second.species, grams: second.grams, perfect: false });

    // A reel the moment the bite is due counts, even if its timer has not fired yet.
    expect(sell(h, 'a').ok).toBe(true);
    const third = hook(h, 'a');
    h.wait(line(h, 'a').biteAt - now(h));
    expect(line(h, 'a').phase).toBe('waiting');
    expect(reel(h, 'a').ok).toBe(true);
    expect(line(h, 'a').landed).toMatchObject({ species: third.species, perfect: true });
    expect(fisher(h, 'a').perfect).toBe(2);
  });
});

/* ------------------------------- sell or tank ------------------------------ */

describe('Big Catch sell or tank', () => {
  it('selling adds 10 points a kilogram to your wallet and score', () => {
    const h = game({ players: ['a'] });
    const fish = catchFish(h, 'a');
    expect(castLine(h, 'a')).toMatchObject({ ok: false, message: 'Sell your catch or put it in your tank first.' });
    expect(reel(h, 'a')).toMatchObject({ ok: false, message: 'Sell your catch or put it in your tank first.' });
    expect(h.view('a').you.line).toMatchObject({ phase: 'landed', canTank: true, fish: { points: pointsFor(fish.grams), cm: sizeCm(speciesById(fish.species)!, fish.grams) } });
    expect(h.rt.act('a', { type: 'sell', seq: line(h, 'a').seq + 1 })).toMatchObject({ ok: false, message: 'That catch has already gone.' });
    expect(sell(h, 'a').ok).toBe(true);
    const points = pointsFor(fish.grams);
    expect(h.view('a').you).toMatchObject({ wallet: points, score: points, line: { phase: 'idle' }, outcome: { kind: 'sold', points, auto: false, title: `Sold for ${String(points)} ${points === 1 ? 'point' : 'points'}` } });
    expect(sell(h, 'a')).toMatchObject({ ok: false, message: 'There is no catch waiting for you.' });
    expect(h.view('a').you.catches).toMatchObject({ count: 1, grams: fish.grams, top: [{ species: fish.species, grams: fish.grams }] });
  });

  it('tanked fish count for their points, every 3 of one rarity earn a set bonus, and the tank holds 6', () => {
    const h = game({ players: ['a'] });
    const commons: number[] = [];
    for (let i = 0; i < 3; i++) {
      const fish = catchFish(h, 'a', (c) => rarityOf(c.species) === 'common');
      commons.push(pointsFor(fish.grams));
      expect(tank(h, 'a').ok).toBe(true);
    }
    const sum = commons.reduce((n, x) => n + x, 0);
    expect(h.view('a').you).toMatchObject({
      wallet: 0,
      score: sum + SET_BONUS.common,
      tank: { points: sum, bonus: SET_BONUS.common, value: sum + SET_BONUS.common, sets: [{ rarity: 'common', count: 3, sets: 1 }] },
      outcome: { kind: 'tanked', set: 'common', detail: `A set of 3 common fish: +${String(SET_BONUS.common)} bonus!` },
    });
    // Three more fill the tank; then only selling is allowed.
    for (let i = 0; i < 3; i++) {
      catchFish(h, 'a');
      expect(tank(h, 'a').ok).toBe(true);
    }
    expect(fisher(h, 'a').tank).toHaveLength(TANK_SIZE);
    catchFish(h, 'a');
    expect(h.view('a').you.line.canTank).toBe(false);
    expect(tank(h, 'a')).toMatchObject({ ok: false, message: 'Your tank is full. Sell this one instead.' });
    expect(sell(h, 'a').ok).toBe(true);
    const you = h.view('a').you;
    expect(you.score).toBe(you.wallet + tankValue(fisher(h, 'a').tank, rarityOf).total);
  });

  it('a catch nobody decides on is sold after 10 seconds', () => {
    const h = game({ players: ['a'] });
    const fish = catchFish(h, 'a');
    expect(h.view('a').you.line.decideBy).toBe(now(h) + DECIDE_SEC * 1000);
    h.tick(DECIDE_SEC * 1000 - 1);
    expect(line(h, 'a').phase).toBe('landed');
    h.tick(1);
    expect(h.view('a').you).toMatchObject({ wallet: pointsFor(fish.grams), line: { phase: 'idle' }, outcome: { kind: 'sold', auto: true, detail: 'Sold for you after 10 seconds.' } });
  });
});

/* ---------------------------------- lures --------------------------------- */

describe('Big Catch lures', () => {
  it('lures cost points from your wallet, come in order and shift the odds you are shown', () => {
    const h = game({ players: ['a'] });
    expect(h.view('a').you.lure).toEqual({ level: 0, name: 'Bare hook', next: { level: 1, name: 'Soft plastic', price: LURES[1]!.price } });
    expect(h.rt.act('a', { type: 'lure', level: 2 })).toMatchObject({ ok: false, message: 'Buy the lures in order.' });
    expect(h.rt.act('a', { type: 'lure', level: 1 })).toMatchObject({ ok: false, message: `The soft plastic costs ${String(LURES[1]!.price)} points. You have 0.` });
    for (let guard = 0; fisher(h, 'a').wallet < LURES[1]!.price; guard++) {
      catchFish(h, 'a');
      expect(sell(h, 'a').ok).toBe(true);
      if (guard > 200) throw new Error('could not earn points');
    }
    const before = h.view('a').you;
    const rareBefore = before.odds.rows.filter((r: any) => rarityOf(r.species) !== 'common' && rarityOf(r.species) !== 'uncommon').reduce((n: number, r: any) => n + r.percent, 0);
    expect(h.rt.act('a', { type: 'lure', level: 1 }).ok).toBe(true);
    const after = h.view('a').you;
    expect(after).toMatchObject({ wallet: before.wallet - LURES[1]!.price, score: before.score - LURES[1]!.price, lure: { level: 1, name: 'Soft plastic', next: { level: 2 } } });
    expect(after.odds.lure).toBe(1);
    const rareAfter = after.odds.rows.filter((r: any) => rarityOf(r.species) !== 'common' && rarityOf(r.species) !== 'uncommon').reduce((n: number, r: any) => n + r.percent, 0);
    expect(rareAfter).toBeGreaterThan(rareBefore);
    expect(after.odds.rows.map((r: any) => r.percent)).toEqual(oddsTable({ ...BASE, lure: 1 }).map((r) => Math.round(r.percent * 10) / 10));
    expect(h.rt.act('a', { type: 'lure', level: 1 })).toMatchObject({ ok: false, message: 'You already have that lure.' });
  });

  it('a better lure brings in rarer fish', () => {
    const count = (lure: number) => {
      const h = game({ players: ['a'], seed: 9 });
      if (lure) {
        // Hand the player the lure without fishing for the points, through the same action.
        let guard = 0;
        while (fisher(h, 'a').lure < lure && guard++ < 400) {
          if (fisher(h, 'a').wallet >= LURES[fisher(h, 'a').lure + 1]!.price) expect(h.rt.act('a', { type: 'lure', level: fisher(h, 'a').lure + 1 }).ok).toBe(true);
          else {
            catchFish(h, 'a');
            sell(h, 'a');
          }
        }
      }
      earn(h, 'a', 400);
      let rare = 0;
      for (let i = 0; i < 400; i++) {
        castLine(h, 'a');
        if (['rare', 'legend'].includes(rarityOf(line(h, 'a').hooked.species))) rare++;
        reel(h, 'a');
      }
      return rare;
    };
    expect(count(3)).toBeGreaterThan(count(0) * 1.5);
  });
});

/* ------------------------------ waters and events ----------------------------- */

describe('Big Catch waters and events', () => {
  it('the water rotates river, estuary, reef every 2 minutes, and a cast fishes the water it went into', () => {
    const h = game({ players: ['a'], settings: { water: 'rotate' } });
    expect(h.view('a').water).toEqual({ id: 'river', nextAt: WATER_ROTATE_SEC * 1000, next: 'estuary' });
    // A line cast just before the change keeps its river fish.
    hook(h, 'a');
    const hooked = line(h, 'a').hooked;
    h.tick(WATER_ROTATE_SEC * 1000 - now(h) - 1);
    expect(speciesById(hooked.species)!.water).toBe('river');
    if (fisher(h, 'a').line.phase === 'landed') sell(h, 'a');
    h.tick(1);
    expect(h.view('a').water).toEqual({ id: 'estuary', nextAt: 2 * WATER_ROTATE_SEC * 1000, next: 'reef' });
    expect(h.feed.map((f) => f.text)).toContain('The boat moves to the estuary.');
    expect(h.view('a').you.odds.rows.map((r: any) => r.species)).toEqual(speciesOf('estuary').map((s) => s.id));
    const fish = hook(h, 'a');
    expect(speciesById(fish.species)!.water).toBe('estuary');
    h.tick(WATER_ROTATE_SEC * 1000);
    expect(h.view('a').water.id).toBe('reef');
    // The last change would come with the game nearly over, so the reef stays.
    expect(h.view('a').water).toEqual({ id: 'reef', nextAt: null, next: null });

    const still = game({ players: ['a'], settings: { water: 'estuary' } });
    expect(still.view('a').water).toEqual({ id: 'estuary', nextAt: null, next: null });
    still.tick(5 * 60_000);
    expect(still.view('a').water.id).toBe('estuary');
  });

  it('runs a 20-second event every 70 to 90 seconds, never the same twice in a row, and shows no event before it starts', () => {
    const starts: number[] = [];
    const ids: string[] = [];
    const h = game({ players: ['a'], settings: { events: true, water: 'river' } });
    expect(h.view('a').event).toBeNull();
    const first = h.view('a').nextEventAt;
    expect(first).toBeGreaterThanOrEqual(EVENT_TIMING.gapMinSec * 1000);
    expect(first).toBeLessThanOrEqual(EVENT_TIMING.gapMaxSec * 1000);
    let last = 0;
    for (let guard = 0; h.rt.status === 'running' && guard < 400; guard++) {
      h.tick(1000);
      const e = h.state().event;
      if (e && e.startedAt !== last) {
        last = e.startedAt;
        starts.push(e.startedAt);
        ids.push(e.id);
        expect(e.endsAt - e.startedAt).toBe(EVENT_TIMING.lastsSec * 1000);
        expect(h.view('a').event).toEqual({ id: e.id, endsAt: e.endsAt });
      }
      if (e && now(h) >= e.endsAt) throw new Error('an event outlived its 20 seconds');
    }
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(EVENT_TIMING.gapMinSec * 1000);
      expect(starts[i]! - starts[i - 1]!).toBeLessThanOrEqual(EVENT_TIMING.gapMaxSec * 1000);
      expect(ids[i]).not.toBe(ids[i - 1]);
    }
    expect(game({ players: ['a'] }).view('a').nextEventAt).toBeNull();
  });

  /** A game whose first event is `id`, ticked to the moment it starts. */
  function eventGame(id: string) {
    for (let seed = 1; seed < 200; seed++) {
      const h = game({ players: ['a'], seed, settings: { events: true, water: 'river' } });
      h.tick(h.state().nextEventAt - now(h));
      if (h.state().event?.id === id) return h;
    }
    throw new Error(`no seed started with ${id}`);
  }

  it('Feeding Time: bites come twice as fast', () => {
    const h = eventGame('feeding');
    expect(h.view('a').you.odds.biteMs).toEqual([750, 2000]);
    expect(h.feed.map((f) => f.text)).toContain('Feeding Time: bites come twice as fast for 20 seconds.');
    for (let i = 0; i < 30; i++) {
      earn(h, 'a');
      castLine(h, 'a');
      const l = line(h, 'a');
      expect(l.biteAt - l.castAt).toBeGreaterThanOrEqual(750);
      expect(l.biteAt - l.castAt).toBeLessThanOrEqual(2000);
      reel(h, 'a');
    }
    h.tick(EVENT_TIMING.lastsSec * 1000);
    expect(h.view('a').event).toBeNull();
    expect(h.view('a').you.odds.biteMs).toEqual(BITE_MS.normal);
  });

  it('Golden Hour: rarer fish are more likely, in the odds shown and on the hook', () => {
    const h = eventGame('golden');
    const shown = h.view('a').you.odds;
    expect(shown.event).toBe('golden');
    expect(shown.rows.map((r: any) => r.percent)).toEqual(oddsTable({ ...BASE, event: 'golden' }).map((r) => Math.round(r.percent * 10) / 10));
    const rareShare = (hh: Driven) => {
      earn(hh, 'a', 400);
      let rare = 0;
      for (let i = 0; i < 400; i++) {
        castLine(hh, 'a');
        if (rarityOf(line(hh, 'a').hooked.species) !== 'common') rare++;
        reel(hh, 'a');
      }
      return rare / 400;
    };
    const golden = rareShare(h);
    const plain = rareShare(game({ players: ['a'], seed: 3 }));
    expect(golden).toBeGreaterThan(plain + 0.05);
  });

  it('Passing School: common fish are half as heavy again', () => {
    const h = eventGame('school');
    const carpRow = h.view('a').you.odds.rows.find((r: any) => r.species === 'carp');
    expect(carpRow).toMatchObject({ minKg: 0.75, maxKg: 7.5 });
    const commons: number[] = [];
    for (let i = 0; i < 60; i++) {
      const c = hook(h, 'a', (x) => x.species === 'carp');
      commons.push(c.grams);
      reel(h, 'a');
    }
    expect(Math.min(...commons)).toBeGreaterThanOrEqual(750);
    expect(Math.max(...commons)).toBeGreaterThan(5000 * 0.9);
  });
});

/* ---------------------------------- games --------------------------------- */

describe('Big Catch games', () => {
  it('ends after 6 minutes when no limit is set; a catch still on the table is sold; results rank by score and name the biggest catch', () => {
    const h = game({ players: ['a', 'b'], common: { timeLimitSec: 0 } });
    expect(h.state().endsAt).toBe(360_000);
    const big = catchFish(h, 'a', (c) => c.grams >= 1500);
    sell(h, 'a');
    // B lands a smaller fish in the last few seconds and has not chosen when time runs out.
    h.tick(350_000 - now(h));
    catchFish(h, 'b', (c) => c.grams < big.grams);
    expect(line(h, 'b').phase).toBe('landed');
    h.tick(360_000 - now(h));
    const r = h.rt.results!;
    expect(r.endedBy).toBe('mode');
    expect(fisher(h, 'b').outcome).toMatchObject({ kind: 'sold', auto: true, detail: 'Time is up, so it was sold for you.' });
    expect(r.standings[0]).toMatchObject({ playerId: 'a', score: pointsFor(big.grams), label: `${String(pointsFor(big.grams))} points`, rank: 1 });
    expect(r.summary).toMatch(new RegExp(`^A won with ${String(pointsFor(big.grams))} points\\. Biggest catch: A’s \\d+\\.\\d kg [a-zA-Z ]+\\.$`));
  });

  it('teams are ranked by their average score', () => {
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], teams: 2 });
    catchFish(h, 'a');
    sell(h, 'a');
    catchFish(h, 'c');
    sell(h, 'c');
    h.tick(400_000);
    const t1 = Math.round(fisher(h, 'a').wallet / 2);
    expect(h.rt.results!.teamStandings!.find((t) => t.teamId === 't1')).toMatchObject({ score: t1, label: `${String(t1)} ${t1 === 1 ? 'point' : 'points'} on average` });
  });

  it('the host sees every line, the biggest catches, species records and the rare-fish tank', () => {
    const h = game({ players: ['a', 'b', 'c'] });
    const rare = catchFish(h, 'a', (c) => rarityOf(c.species) === 'rare');
    sell(h, 'a');
    const small = catchFish(h, 'b', (c) => c.species === 'carp');
    hook(h, 'c');
    const host = h.host();
    expect(host.lines.map((l: any) => [l.playerId, l.phase])).toEqual([
      ['a', 'idle'],
      ['b', 'landed'],
      ['c', 'waiting'],
    ]);
    expect(host.biggest.map((b: any) => b.grams)).toEqual([rare.grams, small.grams].sort((x, y) => y - x));
    expect(host.records).toEqual(expect.arrayContaining([expect.objectContaining({ species: rare.species, playerId: 'a', name: 'A', grams: rare.grams })]));
    expect(host.rareTank).toEqual([expect.objectContaining({ species: rare.species, playerId: 'a', grams: rare.grams })]);
    expect(host.totals).toMatchObject({ landed: 2, casts: fisher(h, 'a').casted + fisher(h, 'b').casted + fisher(h, 'c').casted });
    expect(host.board).toHaveLength(3);
  });

  it('late joiners get a line and a question; a leaver’s catch on the table is sold', () => {
    const h = game({ players: ['a', 'b'] });
    expect(h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false }).ok).toBe(true);
    expect(h.view('late').you).toMatchObject({ casts: 0, score: 0, line: { phase: 'idle' } });
    expect(h.view('late').you.question).not.toBeNull();
    const fish = catchFish(h, 'b');
    h.rt.removePlayer('b');
    expect(fisher(h, 'b')).toMatchObject({ wallet: pointsFor(fish.grams), line: { phase: 'idle' } });
    h.tick(400_000);
    expect(h.rt.results!.standings.find((s) => s.playerId === 'b')!.score).toBe(pointsFor(fish.grams));
    expect(h.errors).toEqual([]);
  });

  it('a player view stays under 8 KB with 40 players in the room', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
    const h = game({ players: ids, settings: { events: true, water: 'rotate' } });
    for (const id of ids.slice(0, 12)) {
      for (let k = 0; k < 4; k++) {
        catchFish(h, id);
        if (k % 2) tank(h, id);
        else sell(h, id);
      }
    }
    // The fullest player: a full tank and ten fish in the top list.
    for (let k = 0; k < 10; k++) {
      catchFish(h, 'p40');
      if (fisher(h, 'p40').tank.length < TANK_SIZE) tank(h, 'p40');
      else sell(h, 'p40');
    }
    catchFish(h, 'p40');
    const sizes = ids.map((id) => JSON.stringify(h.view(id)).length);
    const host = JSON.stringify(h.host()).length;
    expect(Math.max(...sizes)).toBeLessThan(8000);
    expect(host).toBeLessThan(16_000);
  });
});

/* -------------------------------- variants -------------------------------- */

describe('Big Catch variants', () => {
  it('every variant presets a rule that is off in the base game, and locks it', () => {
    const defaults = Object.fromEntries(bigCatch.settings.map((f) => [f.key, f.default]));
    expect(defaults).toEqual({ water: 'rotate', events: true, trophyHunt: false, frenzy: false, deepSea: false });
    expect(variants.map((v) => v.meta.id)).toEqual(['big-catch-trophy-hunt', 'big-catch-frenzy', 'big-catch-deep-sea']);
    for (const v of variants) for (const key of v.locked ?? []) expect(v.settings?.[key]).not.toBe(defaults[key]);
    expect(meta).toMatchObject({ stage: '3d', status: 'playable' });
  });

  it('Trophy Hunt: every fish is sold for lure money, and only your 3 heaviest fish count', () => {
    const h = game({ players: ['a'], variant: 'big-catch-trophy-hunt' });
    expect(h.view('a').rules).toMatchObject({ trophyHunt: true, tankSize: TROPHY_COUNT });
    const weights: number[] = [];
    for (let i = 0; i < 6; i++) {
      const fish = catchFish(h, 'a');
      weights.push(fish.grams);
      // No decision: the line is free again straight away.
      expect(line(h, 'a').phase).toBe('idle');
      expect(fisher(h, 'a').outcome).toMatchObject({ kind: 'sold', points: pointsFor(fish.grams) });
    }
    const sold = weights.reduce((n, g) => n + pointsFor(g), 0);
    const top3 = weights
      .slice()
      .sort((x, y) => y - x)
      .slice(0, 3)
      .reduce((n, g) => n + pointsFor(g), 0);
    expect(h.view('a').you).toMatchObject({ wallet: sold, score: top3, tank: { bonus: 0, value: top3 } });
    expect(h.view('a').you.tank.fish.map((f: any) => f.grams)).toEqual(weights.slice().sort((x, y) => y - x).slice(0, 3));
    // Spending lure money leaves the score alone.
    if (sold >= LURES[1]!.price) {
      expect(h.rt.act('a', { type: 'lure', level: 1 }).ok).toBe(true);
      expect(h.view('a').you.score).toBe(top3);
    }
    h.tick(400_000);
    expect(h.rt.results!.standings[0]!.label).toBe(`${String(top3)} points from 3 trophies`);
  });

  it('Fishing Frenzy: an event is always running, a new one every 20 seconds, and bites come sooner', () => {
    const h = game({ players: ['a'], variant: 'big-catch-frenzy' });
    const seen: string[] = [];
    for (let t = 0; t < 300_000; t += 20_000) {
      const e = h.state().event;
      expect(e, `an event at ${String(t)}`).not.toBeNull();
      expect(e.startedAt).toBe(t);
      seen.push(e.id);
      h.tick(20_000);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    const g = game({ players: ['a'], variant: 'big-catch-frenzy' });
    for (let i = 0; i < 30; i++) {
      earn(g, 'a');
      castLine(g, 'a');
      const l = line(g, 'a');
      const [lo, hi] = biteRangeMs({ ...BASE, frenzy: true, event: g.state().event.id });
      expect(l.biteAt - l.castAt).toBeGreaterThanOrEqual(lo);
      expect(l.biteAt - l.castAt).toBeLessThanOrEqual(hi);
      expect(hi).toBeLessThanOrEqual(2400);
      reel(g, 'a');
    }
  });

  it('Deep Sea: the reef only, fewer common fish, heavier fish and longer waits for a bite', () => {
    const h = game({ players: ['a'], variant: 'big-catch-deep-sea' });
    expect(h.view('a').water).toEqual({ id: 'reef', nextAt: null, next: null });
    expect(h.view('a').you.odds).toMatchObject({ water: 'reef', biteMs: [3000, 6000] });
    expect(h.view('a').you.odds.rows.map((r: any) => r.percent)).toEqual(oddsTable({ ...BASE, water: 'reef', deepSea: true }).map((r) => Math.round(r.percent * 10) / 10));
    const waits: number[] = [];
    for (let i = 0; i < 30; i++) {
      earn(h, 'a');
      castLine(h, 'a');
      const l = line(h, 'a');
      expect(speciesById(l.hooked.species)!.water).toBe('reef');
      waits.push(l.biteAt - l.castAt);
      reel(h, 'a');
    }
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(3000);
    expect(Math.max(...waits)).toBeLessThanOrEqual(6000);
    h.tick(5 * 60_000);
    expect(h.view('a').water.id).toBe('reef');
  });
});

/* ---------------------------------- bots ---------------------------------- */

describe('Big Catch bots', () => {
  const ctxAt = (now: number, roll = 0) => ({ playerId: 'me', rng: { ...createRng(1), next: () => roll }, skill: 0.7, now, settings: {}, answer: () => ({ type: 'truefalse', value: true }) }) as any;
  const view = (you: Record<string, unknown>, rules: Record<string, unknown> = {}) => ({
    endsAt: 360_000,
    rules: { trophyHunt: false, frenzy: false, deepSea: false, tankSize: TANK_SIZE, ...rules },
    you: { casts: 0, wallet: 0, lure: { level: 0, next: { level: 1, price: LURES[1]!.price } }, tank: { fish: [] }, question: { iid: 'q1' }, line: { phase: 'idle', seq: 0 }, ...you },
  });

  it('answer, cast, wait, reel, then sell or tank sensibly', () => {
    expect(bigCatch.bot!(view({}), ctxAt(1000))).toEqual({ type: 'answer', iid: 'q1', answer: { type: 'truefalse', value: true } });
    expect(bigCatch.bot!(view({ casts: 2 }), ctxAt(1000))).toEqual({ type: 'cast' });
    // Buys a lure while there is time for it to pay off, not near the end.
    expect(bigCatch.bot!(view({ casts: 2, wallet: 80 }), ctxAt(1000))).toEqual({ type: 'lure', level: 1 });
    expect(bigCatch.bot!(view({ casts: 2, wallet: 80 }), ctxAt(300_000))).toEqual({ type: 'cast' });
    // Watches the bobber, then reels once it dips (sooner or later).
    expect(bigCatch.bot!(view({ line: { phase: 'waiting', seq: 1 } }), ctxAt(1000, 0.5))).toBeNull();
    expect(bigCatch.bot!(view({ line: { phase: 'biting', seq: 1, biteAt: 1000 } }), ctxAt(2000, 0.5))).toEqual({ type: 'reel' });
    // A rare fish goes in the tank; a common one is sold while saving for a lure.
    const landed = (species: string) => ({ phase: 'landed', seq: 4, canTank: true, fish: { species, grams: 1000 } });
    expect(bigCatch.bot!(view({ line: landed('murrayCod') }), ctxAt(1000, 0.9))).toEqual({ type: 'tank', seq: 4 });
    expect(bigCatch.bot!(view({ line: landed('carp') }), ctxAt(1000, 0.9))).toEqual({ type: 'sell', seq: 4 });
    expect(bigCatch.bot!(view({ line: { ...landed('murrayCod'), canTank: false } }), ctxAt(1000, 0.9))).toEqual({ type: 'sell', seq: 4 });
  });

  it('play whole games: every player casts, lands fish and scores', () => {
    const r = simulateGame({ modeId: 'big-catch', mode: bigCatch, questions: MIXED_SET, players: 6, seed: 12 });
    expect(r.errors).toEqual([]);
    expect(r.stalled).toBe(false);
    expect(r.leaks).toEqual([]);
    expect(r.results!.standings.every((s) => s.stats.answered > 0 && s.score > 0)).toBe(true);
  });
});
