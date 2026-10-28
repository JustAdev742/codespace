import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { drawFind, goldRush } from '../src/modes/gold-rush/index.ts';
import { CAVE_IN, EVENT_TIMING, GEAR_INFO, JUMP_SHARE, MAX_DIGS, PAN_BONUS, variants } from '../src/modes/gold-rush/meta.ts';
import { caveInPercent, digOdds, goldRange, type DigMoment } from '../src/modes/gold-rush/odds.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Gold Rush rules, driven through a real GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true. Digs are random, so
 * tests that need a particular find dig until it turns up, reading what
 * happened from the game state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;
const M: DigMoment = { ground: 'standard', risk: 'normal', claimJumping: true, level: 1, props: 0, event: null, vein: false };

function field(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number } = {}) {
  return drive(goldRush, { players: o.players ?? ['a', 'b'], questions: TRUE_SET, teams: o.teams ?? 0, seed: o.seed ?? 42, common: o.common ?? {}, settings: { events: false, ...o.settings } });
}
const miner = (h: Driven, id: string) => h.state().miners[id];
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) h.answer(id, 'right');
};

describe('Gold Rush: digs', () => {
  it('gives a dig for a right answer, none for a wrong one, and a bonus every third in a row', () => {
    const h = field();
    h.answer('a', 'wrong');
    expect(miner(h, 'a').digs).toBe(0);
    h.answer('a', 'right');
    h.answer('a', 'right');
    expect(miner(h, 'a').digs).toBe(2);
    h.answer('a', 'right');
    expect(miner(h, 'a').digs).toBe(4);
    expect(h.view('a').you.last.text).toContain('streak bonus');
  });

  it(`holds at most ${MAX_DIGS} digs`, () => {
    const h = field();
    earn(h, 'a', 12);
    expect(miner(h, 'a').digs).toBe(MAX_DIGS);
    expect(h.view('a').you.last.text).toContain('full');
  });

  it('refuses a dig with none to spend, and a dig goes one level deeper', () => {
    const h = field();
    expect(h.rt.act('a', { type: 'dig' }).ok).toBe(false);
    earn(h, 'a', 1);
    expect(h.rt.act('a', { type: 'dig' }).ok).toBe(true);
    const m = miner(h, 'a');
    // Level 1 never caves in, so the first dig always lands at level 1.
    expect(m.depth).toBe(1);
    expect(m.digs).toBe(0);
    expect(m.last.level).toBe(1);
  });

  it('keeps questions coming while digging: answering and digging do not wait on each other', () => {
    const h = field();
    earn(h, 'a', 2);
    h.rt.act('a', { type: 'dig' });
    expect(h.view('a').you.question).not.toBeNull();
  });
});

describe('Gold Rush: the odds', () => {
  it('adds up to 100% at every level, with no cave-in at level 1', () => {
    for (const ground of ['standard', 'deep', 'creek'] as const) {
      for (let level = 1; level <= 18; level++) {
        const rows = digOdds({ ...M, ground, level });
        expect(rows.reduce((n, r) => n + r.percent, 0)).toBeCloseTo(100, 6);
      }
    }
    expect(caveInPercent({ ...M, level: 1 })).toBe(0);
  });

  it('caves in more often the deeper you go, and stops climbing at the bottom', () => {
    const table = CAVE_IN.standard;
    for (let level = 2; level <= table.length; level++) expect(caveInPercent({ ...M, level })).toBeGreaterThanOrEqual(caveInPercent({ ...M, level: level - 1 }));
    expect(caveInPercent({ ...M, level: 30 })).toBe(table[table.length - 1]);
  });

  it('cuts cave-ins with props, scales them with the risk setting, and has none on Steady Ground or in a creek', () => {
    const at8 = { ...M, level: 8 };
    expect(caveInPercent({ ...at8, props: 1 })).toBeCloseTo(caveInPercent(at8) * 0.85);
    expect(caveInPercent({ ...at8, props: 3 })).toBeCloseTo(caveInPercent(at8) * 0.55);
    expect(caveInPercent({ ...at8, risk: 'gentle' })).toBeCloseTo(caveInPercent(at8) * 0.6);
    expect(caveInPercent({ ...at8, risk: 'wild' })).toBeCloseTo(caveInPercent(at8) * 1.4);
    expect(caveInPercent({ ...at8, event: 'steady' })).toBe(0);
    expect(caveInPercent({ ...at8, ground: 'creek' })).toBe(0);
  });

  it('pays more deeper down, doubles under Gold Fever and after a vein, and halves in a creek', () => {
    expect(goldRange('dust', { ...M, level: 8 })![0]).toBeGreaterThan(goldRange('dust', { ...M, level: 2 })![1] - 1);
    const base = goldRange('nugget', { ...M, level: 5 })!;
    const fever = goldRange('nugget', { ...M, level: 5, event: 'fever' })!;
    expect(Math.abs(fever[0] - base[0] * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(fever[1] - base[1] * 2)).toBeLessThanOrEqual(1);
    expect(goldRange('nugget', { ...M, level: 5, vein: true })![1]).toBeGreaterThanOrEqual(base[1] * 2 - 1);
    expect(goldRange('dust', { ...M, level: 5, ground: 'creek' })![1]).toBeLessThan(base[1]);
  });

  it('only finds Bonanzas deep down, and no maps with claim jumping off', () => {
    expect(digOdds({ ...M, level: 6 }).some((r) => r.kind === 'bonanza')).toBe(false);
    expect(digOdds({ ...M, level: 7 }).some((r) => r.kind === 'bonanza')).toBe(true);
    expect(digOdds({ ...M, level: 8, claimJumping: false }).some((r) => r.kind === 'map')).toBe(false);
  });

  it('draws finds with the chances it shows', () => {
    const m: DigMoment = { ...M, level: 9 };
    const rows = digOdds(m);
    const rng = createRng(7);
    const n = 40_000;
    const seen: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const f = drawFind(m, rng);
      seen[f.kind] = (seen[f.kind] ?? 0) + 1;
      const range = goldRange(f.kind, m);
      if (range) {
        expect(f.gold).toBeGreaterThanOrEqual(range[0]);
        expect(f.gold).toBeLessThanOrEqual(range[1]);
      }
    }
    for (const r of rows) expect(((seen[r.kind] ?? 0) / n) * 100).toBeCloseTo(r.percent, 0);
  });
});

describe('Gold Rush: carts, cave-ins and the bank', () => {
  it('loses the cart and goes back to the top on a cave-in', () => {
    const h = field({ settings: { risk: 'wild' } });
    let caved = false;
    for (let i = 0; i < 600 && !caved; i++) {
      earn(h, 'a', 1);
      while (miner(h, 'a').digs > 0 && !caved) {
        const before = miner(h, 'a').cart;
        h.rt.act('a', { type: 'dig' });
        if (miner(h, 'a').last.kind === 'cavein') {
          caved = true;
          expect(miner(h, 'a').last.gold).toBe(-before);
          expect(miner(h, 'a').cart).toBe(0);
          expect(miner(h, 'a').depth).toBe(0);
        }
      }
    }
    expect(caved).toBe(true);
  });

  it('banks the cart for good and starts the shaft again, and refuses an empty cart', () => {
    const h = field();
    expect(h.rt.act('a', { type: 'bank' }).ok).toBe(false);
    earn(h, 'a', 2);
    h.rt.act('a', { type: 'dig' });
    while (miner(h, 'a').cart === 0) {
      earn(h, 'a', 1);
      h.rt.act('a', { type: 'dig' });
    }
    const cart = miner(h, 'a').cart;
    expect(h.rt.act('a', { type: 'bank' }).ok).toBe(true);
    expect(miner(h, 'a').banked).toBe(cart);
    expect(miner(h, 'a').cart).toBe(0);
    expect(miner(h, 'a').depth).toBe(0);
  });

  it('counts only banked gold when the whistle blows', () => {
    const h = field({ common: { timeLimitSec: 60 } });
    earn(h, 'a', 3);
    h.rt.act('a', { type: 'dig' });
    while (miner(h, 'a').cart === 0) {
      earn(h, 'a', 1);
      h.rt.act('a', { type: 'dig' });
    }
    expect(miner(h, 'a').cart).toBeGreaterThan(0);
    h.tick(400_000);
    const row = h.rt.results!.standings.find((r: any) => r.playerId === 'a')!;
    expect(row.score).toBe(0);
  });
});

/** Dig and bank until `id` has at least `gold` banked. */
function bankAtLeast(h: Driven, id: string, gold: number) {
  for (let i = 0; i < 2000 && miner(h, id).banked < gold; i++) {
    earn(h, id, 1);
    while (miner(h, id).digs > 0) h.rt.act(id, { type: 'dig' });
    if (miner(h, id).depth >= 4 && miner(h, id).cart > 0) h.rt.act(id, { type: 'bank' });
  }
  if (miner(h, id).cart > 0) h.rt.act(id, { type: 'bank' });
}

describe('Gold Rush: gear', () => {
  it('sells gear for banked gold, refuses what you cannot afford, and stops at the top level', () => {
    const h = field({ settings: { risk: 'gentle' } });
    expect(h.rt.act('a', { type: 'buy', gear: 'props' }).ok).toBe(false);
    bankAtLeast(h, 'a', 900);
    const before = miner(h, 'a').banked;
    const caveBefore = h.view('a').you.next.caveIn;
    expect(h.rt.act('a', { type: 'buy', gear: 'props' }).ok).toBe(true);
    expect(miner(h, 'a').banked).toBe(before - GEAR_INFO.props.levels[0]!.cost);
    expect(h.view('a').you.next.caveIn).toBeLessThanOrEqual(caveBefore);
    expect(h.rt.act('a', { type: 'buy', gear: 'pan' }).ok).toBe(true);
    expect(h.rt.act('a', { type: 'buy', gear: 'pan' }).ok).toBe(false);
  });

  it('adds 10% when banking with a gold pan', () => {
    const h = field({ settings: { risk: 'gentle' } });
    bankAtLeast(h, 'a', GEAR_INFO.pan.levels[0]!.cost);
    h.rt.act('a', { type: 'buy', gear: 'pan' });
    while (miner(h, 'a').cart === 0) {
      earn(h, 'a', 1);
      h.rt.act('a', { type: 'dig' });
    }
    const cart = miner(h, 'a').cart;
    const banked = miner(h, 'a').banked;
    h.rt.act('a', { type: 'bank' });
    expect(miner(h, 'a').banked).toBe(banked + cart + Math.round(cart * PAN_BONUS));
  });

  it('gives 2 digs per right answer with the best pick', () => {
    const h = field({ settings: { risk: 'gentle' } });
    bankAtLeast(h, 'a', GEAR_INFO.pick.levels[0]!.cost + GEAR_INFO.pick.levels[1]!.cost);
    h.rt.act('a', { type: 'buy', gear: 'pick' });
    h.rt.act('a', { type: 'buy', gear: 'pick' });
    while (miner(h, 'a').digs > 0) h.rt.act('a', { type: 'dig' });
    if (miner(h, 'a').cart > 0) h.rt.act('a', { type: 'bank' });
    h.answer('a', 'wrong');
    h.answer('a', 'right');
    expect(miner(h, 'a').digs).toBe(2);
  });
});

describe('Gold Rush: claim jumping', () => {
  function digUntilMap(h: Driven, jumper: string, victim: string) {
    for (let i = 0; i < 4000; i++) {
      if (miner(h, victim).cart === 0) {
        earn(h, victim, 1);
        h.rt.act(victim, { type: 'dig' });
        continue;
      }
      earn(h, jumper, 1);
      const before = miner(h, victim).cart;
      h.rt.act(jumper, { type: 'dig' });
      const last = miner(h, jumper).last;
      if (last.kind === 'map' && last.from) return { before, last };
      if (miner(h, jumper).depth >= 5 && miner(h, jumper).cart > 0) h.rt.act(jumper, { type: 'bank' });
    }
    throw new Error('no map turned up');
  }

  it('takes a quarter of the fullest rival cart, and tells the victim', () => {
    const h = field({ settings: { risk: 'gentle' } });
    const { before, last } = digUntilMap(h, 'a', 'b');
    expect(last.gold).toBe(Math.max(1, Math.floor(before * JUMP_SHARE)));
    expect(miner(h, 'b').cart).toBe(before - last.gold);
    expect(miner(h, 'b').notes[0].text).toContain('jumped your claim');
  });

  it('never jumps a teammate', () => {
    const h = field({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], teams: 2, settings: { risk: 'gentle' } });
    const { last } = digUntilMap(h, 'a', 'c');
    expect(last.from).toBe('C');
    expect(h.rt.results).toBeNull();
  });
});

describe('Gold Rush: game end, events and teams', () => {
  it('ends the moment someone banks the goal in Race to 1,000', () => {
    const h = drive(goldRush, { players: ['a', 'b'], questions: TRUE_SET, variant: variant('gold-rush-race'), settings: { events: false } });
    bankAtLeast(h, 'a', 1000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.summary).toContain('banked 1,000 gold first');
  });

  it('runs a goldfield event a minute in, shown to everyone', () => {
    const h = drive(goldRush, { players: ['a', 'b'], questions: TRUE_SET, settings: { events: true } });
    expect(h.view('a').event).toBeNull();
    h.tick(EVENT_TIMING.firstSec * 1000 + 10);
    expect(h.view('a').event).not.toBeNull();
    expect(h.host().event).toEqual(h.view('a').event);
  });

  it('never caves in on a creek and has no claim jumping there', () => {
    const h = drive(goldRush, { players: ['a', 'b'], questions: TRUE_SET, variant: variant('gold-rush-creek'), settings: { events: false } });
    for (let i = 0; i < 120; i++) {
      earn(h, 'a', 1);
      while (miner(h, 'a').digs > 0) h.rt.act('a', { type: 'dig' });
    }
    expect(miner(h, 'a').caveIns).toBe(0);
    expect(h.view('a').you.next.odds.some((r: any) => r.kind === 'map' || r.kind === 'cavein')).toBe(false);
  });

  it('scores teams by their average bank', () => {
    const h = field({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 2 }], teams: 2, settings: { risk: 'gentle' } });
    bankAtLeast(h, 'a', 200);
    h.rt.end('host');
    const teams = h.rt.results!.teamStandings!;
    expect(teams.find((t: any) => t.teamId === 't1')!.score).toBe(miner(h, 'a').banked);
  });

  it('keeps a player view small with 40 miners', () => {
    const players = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const h = field({ players });
    for (const p of players) earn(h, p, 1);
    expect(JSON.stringify(h.view('p0')).length).toBeLessThan(8000);
    expect(JSON.stringify(h.host()).length).toBeLessThan(16000);
  });

  it('gives a late joiner a shaft of their own', () => {
    const h = field();
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: null, isBot: false });
    expect(miner(h, 'z')).toBeDefined();
    earn(h, 'z', 1);
    expect(h.rt.act('z', { type: 'dig' }).ok).toBe(true);
  });
});
