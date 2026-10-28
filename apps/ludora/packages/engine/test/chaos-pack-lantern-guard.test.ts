import { describe, expect, it } from 'vitest';
import { ChaosSim, type ChaosSimOptions } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { MAPS } from '../src/modes/lantern-guard/maps.ts';
import { TOWERS, towerStats, upgradeCost } from '../src/modes/lantern-guard/units.ts';
import { allCheats } from '../src/chaos/registry.ts';

/* Exact behaviour of the Lantern Guard pack: amounts, limits, refusals and expiry. */

const ID = (slug: string) => `lantern-guard.${slug}`;

function game(opts: Partial<ChaosSimOptions> = {}) {
  return new ChaosSim({ modeId: 'lantern-guard', questions: MIXED_SET, players: 4, seed: 5, ...opts });
}

const S = (sim: ChaosSim) => sim.state();
const G = (sim: ChaosSim, id: string) => S(sim).guards[id];
const live = (sim: ChaosSim) => S(sim).gloom.filter((g: any) => g.hp > 0);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 200_000, step = 250) {
  for (let t = 0; t < maxMs && !pred(); t += step) sim.run(step);
  expect(pred(), 'the situation the test needs never came up').toBe(true);
}

function cast(sim: ChaosSim, caster: string, cheat: string, target?: string, params?: Record<string, unknown>) {
  return sim.cast(caster, { cheatId: ID(cheat), target: target ?? null, ...(params ? { params } : {}) });
}

function freeze(sim: ChaosSim) {
  for (const id of sim.ids) sim.idle.add(id);
}

const build = (sim: ChaosSim, id: string, spot: number, tower = 'spark') => sim.rt.act(id, { type: 'build', spot, tower });
const freeSpot = (sim: ChaosSim) => MAPS.river.spots.findIndex((_, i) => !S(sim).towers.some((t: any) => t.spot === i));

describe('lantern-guard pack', () => {
  it('registers its cheats, each only for Lantern Guard', () => {
    const mine = allCheats().filter((c) => c.id.startsWith('lantern-guard.'));
    expect(mine.length).toBeGreaterThanOrEqual(34);
    for (const c of mine) expect(c.modes).toEqual(['lantern-guard']);
  });

  it('Gold Loan lends 40 and takes back what it can when time is up; undo never charges twice', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'gold-loan').ok).toBe(true);
    expect(G(sim, 'p1').gold).toBe(90);
    expect(build(sim, 'p1', 0, 'beam').ok).toBe(true); // spends 75
    sim.run(46_000);
    expect(G(sim, 'p1').gold).toBe(0);

    const b = game();
    freeze(b);
    const r = b.cast('p2', { cheatId: ID('gold-loan') });
    expect(r.ok).toBe(true);
    expect(b.rt.undoCast('p2', (r as { castId: string }).castId).ok).toBe(true);
    expect(G(b, 'p2').gold).toBe(50);
    expect(b.chaos().effects).toHaveLength(0);
  });

  it('Builder’s Discount hands back half a tower’s price and counts only half as spent', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'builders-discount').ok).toBe(true);
    expect(build(sim, 'p1', 0).ok).toBe(true);
    expect(G(sim, 'p1').gold).toBe(50 - TOWERS.spark.cost / 2);
    expect(G(sim, 'p1').spent).toBe(TOWERS.spark.cost / 2);
  });

  it('Tower Buyback refunds 75% to whoever paid and takes it off what they spent; never the last tower', () => {
    const sim = game();
    freeze(sim);
    build(sim, 'p1', 0);
    expect(cast(sim, 'p1', 'tower-buyback').ok).toBe(false);
    build(sim, 'p2', 1);
    sim.cast('p3', { cheatId: ID('gold-loan') });
    expect(sim.rt.act('p3', { type: 'upgrade', spot: 0, level: 2 }).ok).toBe(true);
    const up = upgradeCost('spark', 1)!;
    expect(cast(sim, 'p1', 'tower-buyback').ok).toBe(true);
    expect(S(sim).towers.map((t: any) => t.spot)).toEqual([1]);
    expect(G(sim, 'p1').gold).toBe(10 + Math.floor(40 * 0.75));
    expect(G(sim, 'p1').spent).toBe(40 - 30);
    expect(G(sim, 'p3').spent).toBe(up - Math.floor(up * 0.75));
  });

  it('Lantern Smith upgrades your lowest tower for free; Lantern Sprout plants a free Spark', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'lantern-smith').ok).toBe(false);
    build(sim, 'p1', 0);
    expect(cast(sim, 'p1', 'lantern-smith').ok).toBe(true);
    expect(S(sim).towers[0]).toMatchObject({ level: 2, ups: ['p1'] });
    expect(G(sim, 'p1').gold).toBe(10);
    expect(cast(sim, 'p2', 'lantern-sprout').ok).toBe(true);
    const sprout = S(sim).towers.find((t: any) => t.by === 'p2');
    expect(sprout).toMatchObject({ kind: 'spark', level: 1 });
    expect(G(sim, 'p2')).toMatchObject({ gold: 50, spent: 0, built: 1 });
  });

  it('Retool charges the difference in build price, and gives it back for a cheaper kind', () => {
    const sim = game();
    freeze(sim);
    build(sim, 'p1', 0);
    // A Beam costs 35 more than a Spark; p1 has 10 gold left.
    expect(cast(sim, 'p1', 'retool', undefined, { kind: 'beam' }).ok).toBe(false);
    sim.cast('p1', { cheatId: ID('gold-loan') });
    expect(cast(sim, 'p1', 'retool', undefined, { kind: 'beam' }).ok).toBe(true);
    expect(S(sim).towers[0]).toMatchObject({ kind: 'beam', level: 1 });
    expect(G(sim, 'p1')).toMatchObject({ gold: 15, spent: 75 });
    sim.run(61_000);
    expect(cast(sim, 'p1', 'retool', undefined, { kind: 'spark' }).ok).toBe(true);
    expect(G(sim, 'p1').spent).toBe(40);
  });

  it('Claim Jump lends you a rival’s best tower for 30 seconds, then gives it back', () => {
    const sim = game();
    freeze(sim);
    build(sim, 'p2', 3);
    expect(cast(sim, 'p1', 'claim-jump', 'p2').ok).toBe(true);
    expect(S(sim).towers[0].by).toBe('p1');
    // A claimed tower is not the claimer's to sell.
    expect(cast(sim, 'p1', 'tower-buyback').ok).toBe(false);
    sim.run(31_000);
    expect(S(sim).towers[0].by).toBe('p2');
  });

  it('Hand-Me-Down moves one level from a rival’s tower to yours', () => {
    const sim = game();
    freeze(sim);
    build(sim, 'p1', 0);
    build(sim, 'p2', 1);
    sim.cast('p2', { cheatId: ID('lantern-smith') });
    expect(cast(sim, 'p1', 'hand-me-down', 'p2').ok).toBe(true);
    expect(S(sim).towers.map((t: any) => [t.by, t.level])).toEqual([['p1', 2], ['p2', 1]]);
    expect(cast(sim, 'p3', 'hand-me-down', 'p2').ok).toBe(false);
  });

  it('Overclock adds half a beat of reload every beat; Rusted Turrets takes 40% of one away', () => {
    // Before the first wave the battle does not step, so only the cheats move a tower's reload.
    const every = towerStats('spark', 1).every;
    const a = game();
    freeze(a);
    build(a, 'p1', 0);
    expect(S(a).towers[0].charge).toBe(every - 250);
    expect(a.cast('p3', { cheatId: ID('overclock') }).ok).toBe(false); // no towers
    expect(a.cast('p1', { cheatId: ID('overclock') }).ok).toBe(true);
    a.run(1000);
    expect(S(a).towers[0].charge).toBe(Math.min(2 * every, every - 250 + 4 * 125));
    const b = game();
    freeze(b);
    build(b, 'p1', 0);
    expect(b.cast('p2', { cheatId: ID('jammed-gears'), target: 'p1' }).ok).toBe(true);
    b.run(1000);
    expect(S(b).towers[0].charge).toBe(Math.max(0, every - 250 - 4 * 100));
  });

  it('Ember Rain scorches a tenth of full health but never finishes a gloomling', () => {
    const sim = game();
    until(sim, () => live(sim).length >= 3);
    const before = new Map(live(sim).map((g: any) => [g.id, g]));
    expect(cast(sim, 'p1', 'ember-rain').ok).toBe(true);
    for (const g of live(sim)) {
      const was: any = before.get(g.id);
      if (!was || was.hp <= 1) continue;
      expect(g.hp).toBe(Math.max(1, was.hp - Math.round(was.maxHp / 10)));
    }
  });

  it('Banish takes a gloomling off the road and off its wave’s count; Gloom Lure adds one to it', () => {
    const sim = game();
    until(sim, () => live(sim).length >= 2);
    const wave = String(S(sim).wave);
    const open = S(sim).open[wave];
    expect(cast(sim, 'p1', 'gloom-lure').ok).toBe(true);
    expect(S(sim).open[wave]).toBe(open + 1);
    expect(S(sim).gloom.at(-1)).toMatchObject({ kind: 'shade', p: 0, wave: S(sim).wave });
    const n = S(sim).gloom.length;
    expect(cast(sim, 'p2', 'banish').ok).toBe(true);
    expect(S(sim).gloom.length).toBe(n - 1);
    expect(S(sim).open[wave]).toBe(open);
  });

  it('Banish never takes the last gloomling of the night', () => {
    const sim = game({ settings: { waves: 5, bossEvery: '0' } });
    until(sim, () => S(sim).nextWaveAt === null && S(sim).spawns.length === 0 && live(sim).length === 1, 400_000, 50);
    const r = cast(sim, 'p1', 'banish');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('last gloomling of the night');
  });

  it('Lantern Lull delays the next wave by 10 seconds, but not when time could run out first', () => {
    const sim = game();
    const at = S(sim).nextWaveAt;
    expect(cast(sim, 'p1', 'lantern-lull').ok).toBe(true);
    expect(S(sim).nextWaveAt).toBe(at + 10_000);
    sim.run(26_000);
    expect(S(sim).wave).toBe(1);
    const short = game({ common: { timeLimitSec: 120 } });
    expect(short.cast('p1', { cheatId: ID('lantern-lull') }).ok).toBe(false);
  });

  it('Sealed Gate holds back every waiting gloomling for 6 seconds', () => {
    const sim = game();
    until(sim, () => S(sim).spawns.length > 2);
    const before = S(sim).spawns.map((s: any) => s.at);
    expect(cast(sim, 'p1', 'sealed-gate').ok).toBe(true);
    expect(S(sim).spawns.map((s: any) => s.at)).toEqual(before.map((t: number) => t + 6000));
  });

  it('flare gold: Kindling adds a fifth, Collection Plate takes up to 10 each, Pilfer takes a quarter', () => {
    const sim = game();
    freeze(sim);
    const cost = S(sim).flare.cost;
    expect(cast(sim, 'p1', 'kindling').ok).toBe(true);
    expect(S(sim).flare.pot).toBe(Math.round(cost / 5));
    expect(cast(sim, 'p2', 'collection-plate').ok).toBe(true);
    expect(S(sim).flare.pot).toBe(Math.round(cost / 5) + 40);
    expect(sim.ids.map((id) => G(sim, id).gold)).toEqual([40, 40, 40, 40]);
    expect(S(sim).flare.givers).toEqual(['p1', 'p2', 'p3', 'p4']);
    const pot = S(sim).flare.pot;
    expect(cast(sim, 'p3', 'lantern-pilfer').ok).toBe(true);
    expect(S(sim).flare.pot).toBe(pot - Math.round(pot / 4));
    expect(G(sim, 'p3').gold).toBe(40 + Math.round(pot / 4));
  });

  it('Kindling that fills the lantern charges it; Ignite flares it and empties the pot', () => {
    const sim = game();
    // Four fifths now; the last fifth once p1 may cast again and gloomlings are on the road.
    for (const id of sim.ids) expect(cast(sim, id, 'kindling').ok).toBe(true);
    expect(S(sim).flare.charged).toBe(false);
    sim.run(60_000);
    until(sim, () => live(sim).length > 0);
    expect(cast(sim, 'p1', 'kindling').ok).toBe(true);
    expect(S(sim).flare.charged).toBe(true);
    expect(S(sim).flare.pot).toBe(S(sim).flare.cost);
    const count = S(sim).flare.count;
    expect(cast(sim, 'p2', 'ignite').ok).toBe(true);
    expect(S(sim).flare).toMatchObject({ pot: 0, charged: false, count: count + 1 });
    expect(live(sim).every((g: any) => g.slowUntil >= sim.now + 2999)).toBe(true);
  });

  it('Matching Funds matches a feed; Gold Fumble drops half a right answer’s gold into the lantern', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'matching-funds').ok).toBe(true);
    expect(sim.rt.act('p1', { type: 'feed' }).ok).toBe(true);
    expect(S(sim).flare.pot).toBe(50);

    const b = game({ skill: 1 });
    expect(b.cast('p1', { cheatId: ID('butterfingers'), target: 'p2' }).ok).toBe(true);
    const correct = G(b, 'p2').stream.correct;
    until(b, () => G(b, 'p2').stream.correct > correct, 20_000, 50);
    expect(S(b).flare.pot).toBeGreaterThanOrEqual(10);
    expect(S(b).flare.givers).toContain('p2');
  });

  it('War Chest triples your gold for the next wave held', () => {
    const sim = game();
    freeze(sim);
    sim.cast('p2', { cheatId: ID('lantern-sprout') });
    sim.cast('p3', { cheatId: ID('lantern-sprout') });
    expect(cast(sim, 'p1', 'war-chest').ok).toBe(true);
    const gold = G(sim, 'p1').gold;
    until(sim, () => S(sim).held > 0, 90_000);
    expect(G(sim, 'p1').gold - gold).toBe(30);
    expect(G(sim, 'p4').gold).toBe(60);
  });

  it('Surveyor’s Flag keeps the best spot for you; Red Tape stops a rival building at all', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'surveyors-flag').ok).toBe(true);
    const spot = sim.chaos().effects.find((e) => e.cheatId === ID('surveyors-flag'))!.data.spot as number;
    expect(build(sim, 'p2', spot).ok).toBe(false);
    expect(build(sim, 'p1', spot).ok).toBe(true);
    expect(cast(sim, 'p1', 'red-tape', 'p3').ok).toBe(true);
    expect(build(sim, 'p3', freeSpot(sim)).ok).toBe(false);
    sim.run(21_000);
    expect(build(sim, 'p3', freeSpot(sim)).ok).toBe(true);
  });

  it('Lord’s Chains needs a Gloom Lord on the road', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'lords-chains').ok).toBe(false);
  });

  it('the random cheat states its odds', () => {
    expect(allCheats().find((c) => c.id === ID('will-o-wisp'))!.description).toMatch(/30%.*25%.*25%.*20%/);
  });
});
