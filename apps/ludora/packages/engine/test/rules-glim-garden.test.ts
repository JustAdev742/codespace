import { describe, expect, it } from 'vitest';
import { glimGarden, FULL_PAUSE_MS } from '../src/modes/glim-garden/index.ts';
import { DAY_SEC, DROOP_SEC, GIFT_FIREFLIES, GIFT_POINTS, GIFT_POINTS_TO, LIGHT_SEC, MAX_DROPS, NIGHT_SEC, PLANTS, PLOT_FIREFLIES, goalFor, meta, variants } from '../src/modes/glim-garden/meta.ts';
import { columnsFor, neighboursOf } from '../src/modes/glim-garden/layout.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';
import { simulateGarden } from './glim-garden-sim.ts';

/*
 * Glim Garden rules, driven through a real GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true. Players a, b, c...
 * stand in one row of the garden, so a's neighbour is b, b's are a and c.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

function garden(o: { players?: Seat[]; settings?: Record<string, unknown>; teams?: number; seed?: number; variant?: string; timeLimitSec?: number } = {}) {
  return drive(glimGarden, {
    players: o.players ?? ['a', 'b', 'c'],
    questions: TRUE_SET,
    teams: o.teams ?? 0,
    seed: o.seed ?? 42,
    settings: o.settings ?? {},
    ...(o.timeLimitSec ? { common: { timeLimitSec: o.timeLimitSec } } : {}),
    ...(o.variant ? { variant: variant(o.variant) } : {}),
  });
}
const folk = (h: Driven, id: string) => h.state().folk[id];
const plot = (h: Driven, id: string) => h.state().plots[id];
const yard = (h: Driven, i = 0) => h.state().gardens[i];
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) h.answer(id, 'right');
};
const act = (h: Driven, id: string, a: any) => h.rt.act(id, a);
/** Earn a drop and spend it. */
const spend = (h: Driven, id: string, a: any) => {
  earn(h, id, 1);
  const r = act(h, id, a);
  expect(r.ok, JSON.stringify(r)).toBe(true);
};
/** Plant a kind and water it until it blooms. */
function grow(h: Driven, id: string, kind: 'flower' | 'bush' | 'tree') {
  spend(h, id, { type: 'plant', kind });
  for (let i = 0; i < PLANTS[kind].need; i++) spend(h, id, { type: 'water' });
}
const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

describe('Glim Garden: conformance', () => {
  const sim = (o: Partial<Parameters<typeof simulateGame>[0]>) => simulateGame({ modeId: 'glim-garden', mode: glimGarden, questions: MIXED_SET, players: 4, ...o });

  it('has the catalogue metadata, settings and variants the registry needs', () => {
    expect(meta.pacing).toBe('self');
    expect(meta.stage).toBe('3d');
    expect(meta.status).toBe('playable');
    expect(meta.players.max).toBe(200);
    expect(meta.questionTypes).toEqual(expect.arrayContaining(['blanks', 'sort']));
    expect(meta.questionTypes).not.toContain('poll');
    expect(variants.length).toBeGreaterThanOrEqual(3);
    const keys = new Set(glimGarden.settings.map((f) => f.key));
    for (const v of variants) {
      expect(v.meta.id.startsWith('glim-garden-')).toBe(true);
      for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id}: ${k}`).toBe(true);
      expect(parseSettings(glimGarden.settings, v.settings)).toMatchObject(v.settings ?? {});
    }
  });

  for (const players of [1, 4, 12]) {
    it(`plays to the end with ${players} player${players === 1 ? '' : 's'}`, () => {
      const r = sim({ players, seed: players * 13 });
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
      expect(r.results?.endedBy).toBe('mode');
      expect(r.results?.standings).toHaveLength(players);
    });
  }

  it('survives churn, a pause, teams and a flashcard-only set, and replays from a seed', () => {
    for (const r of [sim({ players: 6, seed: 77, churn: true, pauseAt: 15_000 }), sim({ players: 6, common: { teamCount: 2 }, seed: 11 }), sim({ players: 3, questions: FLASHCARD_SET, seed: 5 })]) {
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    }
    const a = sim({ players: 5, seed: 99 });
    const b = sim({ players: 5, seed: 99 });
    expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
    expect(a.gameMs).toBe(b.gameMs);
  });

  for (const v of variants) {
    it(`variant ${v.meta.title} plays to the end with bots, alone and with churn`, () => {
      const alone = v.common?.teamCount ? 2 : 1;
      for (const r of [sim({ variantId: v.meta.id, variant: v, players: alone, seed: 23 }), sim({ variantId: v.meta.id, variant: v, players: 6, seed: 41, churn: true, pauseAt: 15_000 })]) {
        expect(problems(r)).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.leaks).toEqual([]);
      }
    });
  }

  it('keeps a player view under 8 KB with 40 in the room', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `0b6a8d2e-4c1f-4e8a-9d7b-${String(i).padStart(12, '0')}`);
    const h = garden({ players: ids });
    for (const id of ids) {
      spend(h, id, { type: 'plant', kind: 'bush' });
      spend(h, id, { type: 'water' });
    }
    spend(h, ids[0]!, { type: 'give', to: ids[1]! });
    expect(JSON.stringify(h.view(ids[7]!)).length).toBeLessThan(8 * 1024);
  });

  it('works with 200 players: every plot has a place and neighbours go both ways', () => {
    for (const n of [1, 2, 3, 5, 7, 12, 30, 41, 60, 200]) {
      for (let i = 0; i < n; i++) for (const j of neighboursOf(i, n)) expect(neighboursOf(j, n), `${n}: ${i}-${j}`).toContain(i);
      expect(columnsFor(n)).toBeLessThanOrEqual(12);
    }
    expect(neighboursOf(0, 1)).toEqual([]);
    // A room of 200: everyone plants and gives, and the game runs to morning with no errors.
    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const h = garden({ players: ids });
    expect(h.state().gardens[0].goal).toBe(160);
    for (const id of ids) spend(h, id, { type: 'plant', kind: 'flower' });
    for (const id of ids) {
      const to = h.view(id).you.giftTo[0];
      if (to) spend(h, id, { type: 'give', to: to.id });
    }
    expect(h.state().gardens[0].fireflies).toBeGreaterThanOrEqual(200);
    h.tick(360_000);
    expect(h.errors).toEqual([]);
    expect(h.rt.status).toBe('ended');
  });
});

describe('Glim Garden: drops', () => {
  it('gives a drop for a right answer, none for a wrong one, and holds 3', () => {
    const h = garden();
    h.answer('a', 'wrong');
    expect(folk(h, 'a').drops).toBe(0);
    expect(h.view('a').you.last.text).toMatch(/No drop/);
    expect(h.view('a').you.last.reveal).toBeTruthy();
    // The next question comes straight away.
    expect(h.view('a').you.question).toBeTruthy();
    earn(h, 'a', 5);
    expect(folk(h, 'a').drops).toBe(MAX_DROPS);
    expect(h.view('a').you.last.text).toMatch(/can is full/);
  });

  it('pours a right answer on your own plant when the can is full, so nothing is wasted', () => {
    const h = garden();
    spend(h, 'a', { type: 'plant', kind: 'bush' });
    earn(h, 'a', MAX_DROPS + 1);
    expect(folk(h, 'a').drops).toBe(MAX_DROPS);
    expect(plot(h, 'a').growth).toBe(1);
    expect(h.view('a').you.last.text).toMatch(/went to your plant/);
  });

  it('refuses to spend a drop you do not have', () => {
    const h = garden();
    expect(act(h, 'a', { type: 'plant', kind: 'flower' }).ok).toBe(false);
    expect(plot(h, 'a').kind).toBe(null);
  });
});

describe('Glim Garden: planting and growing', () => {
  it('plants a seed for a drop, and will not plant over something growing', () => {
    const h = garden();
    spend(h, 'a', { type: 'plant', kind: 'flower' });
    expect(plot(h, 'a')).toMatchObject({ kind: 'flower', growth: 0, bloomed: false });
    expect(folk(h, 'a').drops).toBe(0);
    earn(h, 'a', 1);
    expect(act(h, 'a', { type: 'plant', kind: 'bush' }).ok).toBe(false);
    expect(folk(h, 'a').drops).toBe(1);
  });

  for (const kind of ['flower', 'bush', 'tree'] as const) {
    it(`grows a ${kind}: it blooms after ${PLANTS[kind].need} drops and brings ${PLANTS[kind].fireflies} fireflies to its plot`, () => {
      const h = garden();
      spend(h, 'a', { type: 'plant', kind });
      for (let i = 0; i < PLANTS[kind].need - 1; i++) spend(h, 'a', { type: 'water' });
      expect(plot(h, 'a').bloomed).toBe(false);
      expect(plot(h, 'a').jar).toBe(0);
      spend(h, 'a', { type: 'water' });
      expect(plot(h, 'a').bloomed).toBe(true);
      expect(plot(h, 'a').jar).toBe(PLANTS[kind].fireflies);
      expect(yard(h).fireflies).toBe(PLANTS[kind].fireflies);
      expect(folk(h, 'a')).toMatchObject({ points: PLANTS[kind].fireflies, blooms: 1 });
      expect(h.view('a').you.notes[0].text).toMatch(/opened/);
      // A bloom cannot be watered; planting again moves it into the ring round the bed.
      earn(h, 'a', 1);
      expect(act(h, 'a', { type: 'water' }).ok).toBe(false);
      expect(act(h, 'a', { type: 'plant', kind: 'flower' }).ok).toBe(true);
      expect(plot(h, 'a').border).toEqual([kind === 'flower' ? 1 : 0, kind === 'bush' ? 1 : 0, kind === 'tree' ? 1 : 0]);
    });
  }

  it('makes a plot glow once it has enough fireflies, and says so', () => {
    const h = garden();
    const need = PLOT_FIREFLIES.usual;
    grow(h, 'a', 'bush');
    grow(h, 'a', 'bush');
    expect(plot(h, 'a').jar).toBe(6);
    expect(plot(h, 'a').jar).toBeGreaterThanOrEqual(need);
    expect(yard(h).glowing).toBe(1);
    expect(h.view('a').you.notes.some((n: any) => /glowing/.test(n.text))).toBe(true);
  });
});

describe('Glim Garden: the lantern tree', () => {
  it('lights the plots next to it: their plants grow on their own and never droop', () => {
    const h = garden();
    spend(h, 'b', { type: 'plant', kind: 'bush' });
    grow(h, 'a', 'tree');
    expect(h.view('b').gardens[0].plots.find((p: any) => p.id === 'b').l).toBe(1);
    // c is not next to a: no light there.
    spend(h, 'c', { type: 'plant', kind: 'bush' });
    expect(h.view('c').gardens[0].plots.find((p: any) => p.id === 'c').l).toBeUndefined();
    h.tick(LIGHT_SEC * 1000);
    expect(plot(h, 'b').growth).toBe(1);
    expect(plot(h, 'c').growth).toBe(0);
    for (let i = 0; i < PLANTS.bush.need - 1; i++) h.tick(LIGHT_SEC * 1000);
    expect(plot(h, 'b').bloomed).toBe(true);
    expect(plot(h, 'b').drooping).toBe(false);
    // c had no water and no light for that long: it drooped.
    expect(plot(h, 'c').drooping).toBe(true);
  });

  it('stops lighting when its owner plants something else', () => {
    const h = garden();
    grow(h, 'a', 'tree');
    spend(h, 'b', { type: 'plant', kind: 'bush' });
    expect(plot(h, 'b').lightAt).not.toBe(null);
    spend(h, 'a', { type: 'plant', kind: 'flower' });
    expect(plot(h, 'b').lightAt).toBe(null);
  });
});

describe('Glim Garden: gifts', () => {
  it('gives a drop to a neighbour: their plant grows, a firefly comes to their plot, the giver gets 2 points and they get 1', () => {
    const h = garden();
    spend(h, 'b', { type: 'plant', kind: 'bush' });
    spend(h, 'a', { type: 'give', to: 'b' });
    expect(plot(h, 'b').growth).toBe(1);
    expect(plot(h, 'b').jar).toBe(GIFT_FIREFLIES);
    expect(yard(h).fireflies).toBe(GIFT_FIREFLIES);
    expect(folk(h, 'a')).toMatchObject({ points: GIFT_POINTS, gifts: 1, helped: ['b'] });
    expect(folk(h, 'b')).toMatchObject({ points: GIFT_POINTS_TO, received: 1 });
    expect(h.view('b').you.notes[0].text).toBe('A gave your plant a drop.');
    const view = h.view('b').gardens[0].plots.find((p: any) => p.id === 'b');
    expect(view).toMatchObject({ e: 'gift', by: 'a' });
  });

  it('only gives to plots next to yours, with something growing', () => {
    const h = garden();
    spend(h, 'c', { type: 'plant', kind: 'bush' });
    earn(h, 'a', 2);
    expect(act(h, 'a', { type: 'give', to: 'c' }).ok).toBe(false);
    expect(act(h, 'a', { type: 'give', to: 'b' }).ok).toBe(false);
    expect(act(h, 'a', { type: 'give', to: 'a' }).ok).toBe(false);
    expect(act(h, 'a', { type: 'give', to: 'nobody' }).ok).toBe(false);
    expect(folk(h, 'a').drops).toBe(2);
  });

  it('suggests the neighbour who needs it most: a plot not glowing yet, then a drooping plant, then the nearest bloom', () => {
    const h = garden();
    spend(h, 'a', { type: 'plant', kind: 'bush' });
    spend(h, 'c', { type: 'plant', kind: 'bush' });
    for (let i = 0; i < 3; i++) spend(h, 'c', { type: 'water' });
    // c is one drop from opening; a is just a seed.
    expect(h.view('b').you.giftTo.map((g: any) => [g.id, g.why])).toEqual([
      ['c', 'nearly'],
      ['a', 'growing'],
    ]);
    h.tick(DROOP_SEC * 1000);
    expect(h.view('b').you.giftTo[0].why).toBe('drooping');
  });
});

describe('Glim Garden: drooping', () => {
  it(`droops a plant left ${DROOP_SEC} seconds without water; the next drop perks it up; it never dies`, () => {
    const h = garden({ timeLimitSec: 3600 });
    spend(h, 'a', { type: 'plant', kind: 'bush' });
    spend(h, 'a', { type: 'water' });
    h.tick(DROOP_SEC * 1000 - 100);
    expect(plot(h, 'a').drooping).toBe(false);
    h.tick(200);
    expect(plot(h, 'a').drooping).toBe(true);
    expect(h.view('a').you.notes[0].text).toMatch(/drooping/);
    h.tick(10 * 60 * 1000);
    expect(plot(h, 'a')).toMatchObject({ kind: 'bush', growth: 1, drooping: true });
    spend(h, 'a', { type: 'water' });
    expect(plot(h, 'a')).toMatchObject({ growth: 1, drooping: false });
    spend(h, 'a', { type: 'water' });
    expect(plot(h, 'a').growth).toBe(2);
  });

  it('never droops with drooping turned off', () => {
    const h = garden({ settings: { droop: false } });
    spend(h, 'a', { type: 'plant', kind: 'bush' });
    h.tick(DROOP_SEC * 1000 * 3);
    expect(plot(h, 'a').drooping).toBe(false);
  });
});

describe('Glim Garden: the class goal', () => {
  it('needs most of the plots to glow, so the numbers stay as small as the class', () => {
    expect([1, 2, 5, 30, 60, 200].map(goalFor)).toEqual([1, 2, 4, 24, 48, 160]);
    const h = garden({ players: ['a', 'b', 'c', 'd', 'e'] });
    expect(yard(h).goal).toBe(4);
    expect(h.view('a').plotFireflies).toBe(PLOT_FIREFLIES.usual);
    expect(garden({ settings: { size: 'small' } }).view('a').plotFireflies).toBe(PLOT_FIREFLIES.small);
  });

  it('fills the garden when enough plots glow, celebrates, and keeps growing until morning', () => {
    const h = garden({ players: ['a', 'b'], timeLimitSec: 600 });
    for (const id of ['a', 'b']) {
      grow(h, id, 'bush');
      grow(h, id, 'bush');
    }
    expect(yard(h).metAt).not.toBe(null);
    expect(h.feed.some((f) => /full of fireflies/.test(f.text))).toBe(true);
    h.tick(FULL_PAUSE_MS * 2);
    expect(h.rt.status).toBe('running');
    h.tick(600_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.outcome).toBe('coop-win');
  });

  it('ends at morning with the garden as it is, and nobody loses anything', () => {
    const h = garden({ timeLimitSec: 120 });
    grow(h, 'a', 'flower');
    h.tick(120_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.outcome).toBe('coop-loss');
    expect(h.rt.results?.summary).toMatch(/lovely garden/);
    expect(h.rt.results?.standings.find((s) => s.playerId === 'a')?.label).toBe('1 point: 1 bloom, 0 gifts');
  });

  it('uses no chance at all: the same moves give the same garden whatever the seed', () => {
    const play = (seed: number) => {
      const h = garden({ seed });
      grow(h, 'a', 'tree');
      spend(h, 'b', { type: 'plant', kind: 'flower' });
      spend(h, 'c', { type: 'give', to: 'b' });
      h.tick(LIGHT_SEC * 1000 * 2 + DROOP_SEC * 1000);
      const s = h.state();
      return JSON.stringify([s.plots, s.gardens, Object.fromEntries(Object.entries(s.folk).map(([id, f]: [string, any]) => [id, [f.points, f.drops, f.blooms, f.gifts]]))]);
    };
    expect(play(1)).toBe(play(987));
  });
});

describe('Glim Garden: each plant is the best choice somewhere', () => {
  it('with few drops left before morning, only a flower blooms; with five, a bush brings the most', () => {
    // Fireflies from spending D drops on one plot, with no gifts or light.
    const best = (d: number) => {
      const out: Record<string, number> = {};
      for (const kind of ['flower', 'bush', 'tree'] as const) {
        const per = PLANTS[kind].need + 1;
        const whole = Math.floor(d / per) * PLANTS[kind].fireflies;
        // What is left over goes on flowers.
        out[kind] = whole + Math.floor((d % per) / (PLANTS.flower.need + 1)) * PLANTS.flower.fireflies;
      }
      return out;
    };
    expect(best(3)).toMatchObject({ flower: 1, bush: 1, tree: 1 });
    expect(best(4).flower).toBeGreaterThan(0);
    expect(best(5).bush).toBeGreaterThan(best(5).flower);
    expect(best(5).bush).toBeGreaterThan(best(5).tree);
    // Alone, a bush gives more for each drop than a lantern tree: the tree's worth is its light.
    expect(PLANTS.bush.fireflies / (PLANTS.bush.need + 1)).toBeGreaterThan(PLANTS.tree.fireflies / (PLANTS.tree.need + 1));
  });

  it('a lantern tree among growing neighbours brings the class more than a bush in the same place', () => {
    const run = (kind: 'tree' | 'bush') => {
      const h = garden({ settings: { droop: false } });
      grow(h, 'b', kind);
      spend(h, 'a', { type: 'plant', kind: 'bush' });
      spend(h, 'c', { type: 'plant', kind: 'bush' });
      h.tick(LIGHT_SEC * 1000 * 4);
      return yard(h).fireflies;
    };
    expect(run('tree')).toBeGreaterThan(run('bush'));
  });
});

describe('Glim Garden: variants', () => {
  it('Calm Garden has no clock and no drooping, and ends once the garden is full', () => {
    const h = garden({ variant: 'glim-garden-calm', players: ['a'] });
    expect(h.view('a').endsAt).toBe(null);
    spend(h, 'a', { type: 'plant', kind: 'bush' });
    h.tick(60 * 60 * 1000);
    expect(h.rt.status).toBe('running');
    expect(plot(h, 'a').drooping).toBe(false);
    for (let i = 0; i < PLANTS.bush.need; i++) spend(h, 'a', { type: 'water' });
    grow(h, 'a', 'flower');
    expect(plot(h, 'a').jar).toBeGreaterThanOrEqual(PLOT_FIREFLIES.small);
    h.tick(FULL_PAUSE_MS);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.outcome).toBe('coop-win');
  });

  it('Team Gardens gives each team its own garden and goal; neighbours are teammates', () => {
    const seats: Seat[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, team: (i % 2) + 1 }));
    const h = garden({ variant: 'glim-garden-teams', players: seats, teams: 2 });
    const gardens = h.state().gardens;
    expect(gardens).toHaveLength(2);
    expect(gardens.map((g: any) => g.plots)).toEqual([
      ['a', 'c', 'e'],
      ['b', 'd', 'f'],
    ]);
    expect(gardens.map((g: any) => g.goal)).toEqual([3, 3]);
    expect(h.view('a').you.neighbours).toEqual(['c']);
    spend(h, 'b', { type: 'plant', kind: 'bush' });
    earn(h, 'a', 1);
    expect(act(h, 'a', { type: 'give', to: 'b' }).ok).toBe(false);
    grow(h, 'a', 'bush');
    expect(h.state().gardens[0].fireflies).toBe(3);
    expect(h.state().gardens[1].fireflies).toBe(0);
    h.tick(400_000);
    const teams = h.rt.results?.teamStandings;
    expect(teams?.map((t) => t.label)).toEqual(expect.arrayContaining(['0 of 3 plots glowing']));
  });

  it(`Night Bloom: day comes after ${NIGHT_SEC} seconds; flowers sleep and trees go dark by day; bushes still grow`, () => {
    const h = garden({ variant: 'glim-garden-night-bloom' });
    grow(h, 'a', 'tree');
    h.tick(NIGHT_SEC * 1000);
    // A flower can be planted by day; it waits for the dark to grow.
    spend(h, 'b', { type: 'plant', kind: 'flower' });
    spend(h, 'c', { type: 'plant', kind: 'bush' });
    expect(h.view('a').dark).toBe(false);
    expect(h.feed.some((f) => /Day comes/.test(f.text))).toBe(true);
    earn(h, 'b', 1);
    expect(act(h, 'b', { type: 'water' }).ok).toBe(false);
    expect(h.view('b').you.asleep).toBe(true);
    expect(plot(h, 'b').lightAt).toBe(null);
    spend(h, 'c', { type: 'water' });
    expect(plot(h, 'c').growth).toBe(1);
    // A sleeping flower does not droop, even with a long day.
    h.tick(DAY_SEC * 1000 - 10);
    expect(plot(h, 'b').drooping).toBe(false);
    h.tick(20);
    expect(h.view('b').dark).toBe(true);
    expect(act(h, 'b', { type: 'water' }).ok).toBe(true);
    expect(plot(h, 'b').lightAt).not.toBe(null);
  });
});

describe('Glim Garden: bots and measured play', () => {
  it('bots grow a garden to the end, alone and in a class', () => {
    for (const players of [1, 12]) {
      const r = simulateGame({ modeId: 'glim-garden', mode: glimGarden, questions: MIXED_SET, players, seed: 5 });
      expect(problems(r)).toEqual([]);
      expect(r.results?.standings.some((s) => s.score > 0)).toBe(true);
    }
  });

  it('a sensible class fills the garden; a class that never gives a drop fills less of it', () => {
    const sensible = [1, 2].map((seed) => simulateGarden({ players: 12, pace: 'young', seed }));
    const selfish = [1, 2].map((seed) => simulateGarden({ players: 12, pace: 'young', seed, strategy: 'selfish' }));
    const older = [1, 2].map((seed) => simulateGarden({ players: 12, pace: 'older', seed }));
    expect(older.every((r) => r.full)).toBe(true);
    const glow = (rs: { glowing: number }[]) => rs.reduce((n, r) => n + r.glowing, 0);
    expect(glow(sensible)).toBeGreaterThan(glow(selfish));
    // Giving is worth doing, but a sensible class still spends most drops on its own plots.
    const d = sensible.reduce((a, r) => ({ give: a.give + r.drops.give, all: a.all + r.drops.give + r.drops.water + r.drops.plant.flower + r.drops.plant.bush + r.drops.plant.tree }), { give: 0, all: 0 });
    expect(d.give / d.all).toBeGreaterThan(0.2);
    expect(d.give / d.all).toBeLessThan(0.6);
  }, 60_000);
});
