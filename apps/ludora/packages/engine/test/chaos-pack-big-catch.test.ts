import { describe, expect, it } from 'vitest';
import '../src/chaos/cheats/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { getCheat } from '../src/chaos/registry.ts';
import { capabilitiesOf } from '../src/chaos/engine.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { resolveGameConfig } from '../src/registry.ts';
import { BIG_CATCH_CHAOS } from '../src/chaos/packs/big-catch.ts';
import { LURES, PERFECT_BONUS, REEL_WINDOW_MS, SET_SIZE, WATER_ROTATE_SEC } from '../src/modes/big-catch/meta.ts';
import { pointsFor, tankValue, weightRange } from '../src/modes/big-catch/odds.ts';
import { speciesById, speciesOf, type SpeciesId } from '../src/modes/big-catch/species.ts';

/* Exact behaviour of the Big Catch cheat pack and adapter: amounts, limits, refusals, expiry, draws from the mode's tables. */

/* eslint-disable @typescript-eslint/no-explicit-any */

function pond(settings: Record<string, unknown> = {}, warm = 20_000, players = 4) {
  const sim = new ChaosSim({ modeId: 'big-catch', questions: MIXED_SET, players, seed: 11, settings: { events: false, ...settings } });
  sim.run(warm);
  return sim;
}

const f = (sim: ChaosSim, id: string): any => sim.state().fishers[id];
const line = (sim: ChaosSim, id: string): any => f(sim, id).line;
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string, params?: Record<string, unknown>) => sim.cast(by, { cheatId: `big-catch.${cheat}`, target: target ?? null, params });
const act = (sim: ChaosSim, id: string, a: Record<string, unknown>) => sim.rt.act(id, a);
const rarityOf = (id: SpeciesId) => speciesById(id)!.rarity;
const fx = (sim: ChaosSim, cheat: string) => sim.chaos().effects.find((e) => e.cheatId === `big-catch.${cheat}`);
const scoreOf = (sim: ChaosSim, id: string) => f(sim, id).wallet + tankValue(f(sim, id).tank, rarityOf).total;

function until(sim: ChaosSim, pred: () => boolean, maxMs = 240_000, step = 250) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += step) sim.run(step);
  if (!pred()) throw new Error('the situation never came up');
}

/** Stop a player's bot and leave their line idle with casts in hand (at least `need`), so the test fishes for them. */
function handFished(sim: ChaosSim, id: string, need = 1) {
  sim.idle.add(id);
  until(sim, () => {
    const l = line(sim, id);
    if (l.phase === 'landed') act(sim, id, { type: 'sell', seq: l.seq });
    return line(sim, id).phase === 'idle';
  });
  if (f(sim, id).casts < need) expect(cast(sim, id, 'bait-bucket').ok).toBe(true);
}

/** Cast for a hand-fished player and wait for the bite (to within 50 ms). */
function castAndBite(sim: ChaosSim, id: string) {
  expect(act(sim, id, { type: 'cast' }).ok).toBe(true);
  until(sim, () => line(sim, id).phase === 'biting', 20_000, 50);
}

function percentsIn(cheat: string): number[] {
  return [...getCheat(`big-catch.${cheat}`)!.description.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
}

describe('big-catch adapter', () => {
  const adapter = chaosAdapterFor('big-catch')!;
  const caps = (settings: Record<string, unknown>) => {
    const r = resolveGameConfig({ modeId: 'big-catch', variantId: null, settings, common: {} });
    if (!r.ok) throw new Error(r.message);
    return capabilitiesOf(adapter, [], r.value.settings);
  };

  it('offers the score, the wallet and the features each game has', () => {
    const normal = caps({});
    for (const c of ['meter:score', 'meter:currency', 'meter:casts', 'meter:lure', 'stream', 'question', 'tank', 'rotation', 'events', 'event-gaps']) expect(normal).toContain(c);
    expect(normal).not.toContain('trophy-hunt');
    const trophy = caps({ trophyHunt: true });
    expect(trophy).not.toContain('meter:score');
    expect(trophy).toContain('meter:currency');
    expect(trophy).toContain('trophy-hunt');
    expect(trophy).not.toContain('tank');
    const frenzy = caps({ frenzy: true, events: false });
    expect(frenzy).toContain('events');
    expect(frenzy).not.toContain('event-gaps');
    const deep = caps({ deepSea: true, water: 'reef' });
    expect(deep).toContain('deep-sea');
    expect(deep).not.toContain('rotation');
    expect(caps({ water: 'river' })).not.toContain('rotation');
  });

  it('reads the score as the wallet plus the tank, and writes below the tank by selling fish to land exactly on it', () => {
    const sim = pond();
    until(sim, () => f(sim, 'p2').tank.length >= 2);
    const meter = adapter.meters.find((m) => m.key === 'score')!;
    const s = structuredClone(sim.state());
    const fed: string[] = [];
    const ctx = { settings: sim.rt.settings, feed: (text: string) => fed.push(text) } as never;
    const p2 = s.fishers.p2;
    expect(meter.get(s, 'p2', ctx)).toBe(p2.wallet + tankValue(p2.tank, rarityOf).total);
    // Work on a copy: an empty wallet, so the cut has to come out of the tank.
    p2.wallet = 0;
    const fish = p2.tank.length;
    const want = Math.floor(meter.get(s, 'p2', ctx) / 3);
    meter.set(s, 'p2', want, ctx);
    expect(meter.get(s, 'p2', ctx)).toBe(want);
    expect(p2.tank.length).toBeLessThan(fish);
    expect(p2.wallet).toBeGreaterThanOrEqual(0);
    expect(fed[0]).toContain('sold from your tank');
    // Above the tank, only the wallet moves.
    const tank = p2.tank.slice();
    meter.set(s, 'p2', want + 500, ctx);
    expect(p2.tank).toEqual(tank);
    expect(meter.get(s, 'p2', ctx)).toBe(want + 500);
  });

  it('keeps the Trophy Hunt score read-only: the three heaviest fish', () => {
    const sim = pond({ trophyHunt: true });
    until(sim, () => f(sim, 'p1').tank.length >= 1);
    const meter = adapter.meters.find((m) => m.key === 'score')!;
    const ctx = { settings: sim.rt.settings } as never;
    const v = tankValue(f(sim, 'p1').tank, rarityOf, false).total;
    expect(meter.get(sim.state(), 'p1', ctx)).toBe(v);
    expect((meter.min as any)(sim.state(), 'p1', ctx)).toBe(v);
    expect(meter.max!(sim.state(), 'p1', ctx)).toBe(v);
    expect(sim.cast('p2', { cheatId: 'score.pickpocket', target: 'p1' })).toMatchObject({ ok: false });
  });
});

describe('big-catch pack: your line', () => {
  it('Bait Bucket gives 3 casts, and can be undone', () => {
    const sim = pond();
    sim.idle.add('p1');
    const casts = f(sim, 'p1').casts;
    const r = cast(sim, 'p1', 'bait-bucket');
    expect(r.ok).toBe(true);
    expect(f(sim, 'p1').casts).toBe(casts + 3);
    if (r.ok) expect(sim.rt.undoCast('p1', r.castId).ok).toBe(true);
    expect(f(sim, 'p1').casts).toBe(casts);
  });

  it('Hungry Fish makes the fish bite now, and refuses with no line out', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'hungry-fish')).toMatchObject({ ok: false });
    expect(act(sim, 'p1', { type: 'cast' }).ok).toBe(true);
    expect(cast(sim, 'p1', 'hungry-fish').ok).toBe(true);
    expect(line(sim, 'p1').biteAt).toBe(sim.now);
    sim.run(10);
    expect(line(sim, 'p1').phase).toBe('biting');
    expect(act(sim, 'p1', { type: 'reel' }).ok).toBe(true);
    expect(line(sim, 'p1').phase).toBe('landed');
    expect(line(sim, 'p1').landed.perfect).toBe(true);
  });

  it('Strong Line keeps a bite on the line 2 seconds longer', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'strong-line').ok).toBe(true);
    castAndBite(sim, 'p1');
    const bite = line(sim, 'p1').biteAt;
    sim.run(REEL_WINDOW_MS + 500);
    expect(line(sim, 'p1').phase).toBe('biting');
    expect(line(sim, 'p1').biteAt).toBe(bite + BIG_CATCH_CHAOS.STRONG_LINE_MS);
    expect(act(sim, 'p1', { type: 'reel' }).ok).toBe(true);
    expect(line(sim, 'p1').phase).toBe('landed');
    expect(line(sim, 'p1').landed.perfect).toBe(false);
    // Without it, the next fish gets away after 3 seconds.
    act(sim, 'p1', { type: 'sell', seq: line(sim, 'p1').seq });
    sim.run(20_000);
    castAndBite(sim, 'p1');
    sim.run(REEL_WINDOW_MS + 100);
    expect(line(sim, 'p1').phase).toBe('idle');
    expect(f(sim, 'p1').outcome.kind).toBe('escaped');
  });

  it('Perfect Strike makes a late reel a perfect catch, 10% heavier, once', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'perfect-strike').ok).toBe(true);
    castAndBite(sim, 'p1');
    const hooked = line(sim, 'p1').hooked.grams;
    const perfect = f(sim, 'p1').perfect;
    sim.run(1500);
    expect(act(sim, 'p1', { type: 'reel' }).ok).toBe(true);
    const fish = line(sim, 'p1').landed;
    expect(fish.perfect).toBe(true);
    expect(fish.grams).toBe(Math.round(hooked * (1 + PERFECT_BONUS)));
    expect(f(sim, 'p1').perfect).toBe(perfect + 1);
    expect(f(sim, 'p1').top.find((t: any) => t.id === fish.id).grams).toBe(fish.grams);
    expect(fx(sim, 'perfect-strike')).toBeUndefined();
  });

  it('Perfect Strike in Trophy Hunt pays the heavier fish into the wallet', () => {
    const sim = pond({ trophyHunt: true });
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'perfect-strike').ok).toBe(true);
    castAndBite(sim, 'p1');
    const hooked = line(sim, 'p1').hooked.grams;
    const wallet = f(sim, 'p1').wallet;
    sim.run(1500);
    expect(act(sim, 'p1', { type: 'reel' }).ok).toBe(true);
    const grams = Math.round(hooked * (1 + PERFECT_BONUS));
    expect(f(sim, 'p1').outcome.fish.grams).toBe(grams);
    expect(f(sim, 'p1').outcome.title).toContain('perfect');
    expect(f(sim, 'p1').outcome.points).toBe(pointsFor(grams));
    expect(f(sim, 'p1').wallet).toBe(wallet + pointsFor(grams));
  });

  it('Lucky Scales keeps the heaviest of 3 weighings, and Skinny Fish the lightest, of the very fish the mode drew', () => {
    for (const [cheat, by, on, keep] of [
      ['lucky-scales', 'p1', 'p1', 'heavier'],
      ['skinny-fish', 'p2', 'p1', 'lighter'],
    ] as const) {
      const a = pond();
      const b = pond();
      handFished(a, 'p1', 3);
      handFished(b, 'p1', 3);
      expect(cast(a, by, cheat, by === on ? undefined : on).ok).toBe(true);
      let changed = 0;
      for (let i = 0; i < 3; i++) {
        expect(act(a, 'p1', { type: 'cast' }).ok).toBe(true);
        expect(act(b, 'p1', { type: 'cast' }).ok).toBe(true);
        const [x, y] = [line(a, 'p1').hooked, line(b, 'p1').hooked];
        // The same fish (the mode's draw is untouched), weighed again within its species' range.
        expect(x.species).toBe(y.species);
        const [lo, hi] = weightRange(speciesById(x.species)!, { event: null });
        expect(x.grams).toBeGreaterThanOrEqual(Math.round(lo * 1000));
        expect(x.grams).toBeLessThanOrEqual(Math.round(hi * 1000));
        if (keep === 'heavier') expect(x.grams).toBeGreaterThanOrEqual(y.grams);
        else expect(x.grams).toBeLessThanOrEqual(y.grams);
        if (x.grams !== y.grams) changed++;
        for (const s of [a, b]) {
          s.run(6000);
          if (line(s, 'p1').phase === 'biting') act(s, 'p1', { type: 'reel' });
          if (line(s, 'p1').phase === 'landed') act(s, 'p1', { type: 'sell', seq: line(s, 'p1').seq });
        }
      }
      expect(changed).toBeGreaterThan(0);
    }
  });

  it('Spare Rod lands a fish from the water being fished and sells it at once', () => {
    const sim = pond();
    sim.idle.add('p1');
    const before = { wallet: f(sim, 'p1').wallet, landed: f(sim, 'p1').landed, top: f(sim, 'p1').top.length };
    expect(cast(sim, 'p1', 'spare-rod').ok).toBe(true);
    const fish = f(sim, 'p1').top.find((t: any) => t.at === sim.now);
    expect(speciesOf(sim.state().water).map((s) => s.id)).toContain(fish.species);
    expect(f(sim, 'p1').wallet).toBe(before.wallet + pointsFor(fish.grams));
    expect(f(sim, 'p1').landed).toBe(before.landed + 1);
  });

  it('Landing Net lands a fish that would have got away, once', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'landing-net').ok).toBe(true);
    castAndBite(sim, 'p1');
    const hooked = line(sim, 'p1').hooked;
    const escaped = f(sim, 'p1').escaped;
    sim.run(REEL_WINDOW_MS + 200);
    expect(line(sim, 'p1').phase).toBe('landed');
    expect(line(sim, 'p1').landed).toMatchObject({ species: hooked.species, grams: hooked.grams, perfect: false });
    expect(f(sim, 'p1').escaped).toBe(escaped);
    expect(fx(sim, 'landing-net')).toBeUndefined();
    // The catch on the table is the player's to sell or keep, as usual.
    expect(act(sim, 'p1', { type: 'tank', seq: line(sim, 'p1').seq }).ok).toBe(true);
  });

  it('Landing Net in Trophy Hunt sells the netted fish at once', () => {
    const sim = pond({ trophyHunt: true });
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'landing-net').ok).toBe(true);
    castAndBite(sim, 'p1');
    const hooked = line(sim, 'p1').hooked;
    const wallet = f(sim, 'p1').wallet;
    sim.run(REEL_WINDOW_MS + 200);
    expect(line(sim, 'p1').phase).toBe('idle');
    expect(f(sim, 'p1').outcome).toMatchObject({ kind: 'sold', points: pointsFor(hooked.grams) });
    expect(f(sim, 'p1').wallet).toBe(wallet + pointsFor(hooked.grams));
  });

  it('Patient Bobber ignores a reel before the bite; Lucky Sinker gives back a cast scared off', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'patient-bobber').ok).toBe(true);
    expect(act(sim, 'p1', { type: 'cast' }).ok).toBe(true);
    expect(act(sim, 'p1', { type: 'reel' }).ok).toBe(false);
    expect(line(sim, 'p1').phase).toBe('waiting');
    expect(f(sim, 'p1').spooked).toBe(0);

    const other = pond();
    handFished(other, 'p1');
    expect(cast(other, 'p1', 'lucky-sinker').ok).toBe(true);
    expect(act(other, 'p1', { type: 'cast' }).ok).toBe(true);
    const casts = f(other, 'p1').casts;
    expect(act(other, 'p1', { type: 'reel' }).ok).toBe(true);
    expect(f(other, 'p1').outcome.kind).toBe('spooked');
    expect(f(other, 'p1').casts).toBe(casts + 1);
  });

  it('Secret Spot draws casts from the water picked, and refuses the water the boat is on', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(sim.state().water).toBe('river');
    expect(cast(sim, 'p1', 'secret-spot', undefined, { water: 'river' })).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'secret-spot', undefined, { water: 'reef' }).ok).toBe(true);
    expect(act(sim, 'p1', { type: 'cast' }).ok).toBe(true);
    expect(line(sim, 'p1').water).toBe('reef');
    expect(speciesOf('reef').map((s) => s.id)).toContain(line(sim, 'p1').hooked.species);
    expect(sim.cast('p1', { cheatId: 'big-catch.secret-spot', params: { water: 'reef' } })).toMatchObject({ ok: false });
    expect(new ChaosSim({ modeId: 'big-catch', questions: MIXED_SET, players: 2, settings: { water: 'river' } }).cast('p1', { cheatId: 'big-catch.secret-spot' })).toMatchObject({ ok: false });
  });

  it('Golden Bait redraws casts from the Golden Hour table, and refuses during Golden Hour', () => {
    const a = pond();
    const b = pond();
    handFished(a, 'p1');
    handFished(b, 'p1');
    expect(cast(a, 'p1', 'golden-bait').ok).toBe(true);
    act(a, 'p1', { type: 'cast' });
    act(b, 'p1', { type: 'cast' });
    expect(line(a, 'p1').hooked).not.toEqual(line(b, 'p1').hooked);
    expect(speciesOf('river').map((s) => s.id)).toContain(line(a, 'p1').hooked.species);
    const c = pond({ events: true });
    until(c, () => !c.state().event);
    expect(cast(c, 'p2', 'golden-hour-now').ok).toBe(true);
    expect(cast(c, 'p1', 'golden-bait')).toMatchObject({ ok: false });
  });

  it('Chum Bucket halves the wait for a bite, and Noisy Boat doubles it', () => {
    for (const [cheat, by, factor] of [
      ['chum-bucket', 'p1', 0.5],
      ['noisy-boat', 'p2', 2],
    ] as const) {
      const a = pond();
      const b = pond();
      handFished(a, 'p1');
      handFished(b, 'p1');
      expect(cast(a, by, cheat, by === 'p1' ? undefined : 'p1').ok).toBe(true);
      act(a, 'p1', { type: 'cast' });
      act(b, 'p1', { type: 'cast' });
      const wait = (s: ChaosSim) => line(s, 'p1').biteAt - line(s, 'p1').castAt;
      expect(wait(a)).toBe(Math.round(wait(b) * factor));
    }
  });

  it('Borrowed Lure lends the next lure for 30 seconds, blocks buying one meanwhile, then takes it back', () => {
    const sim = pond();
    handFished(sim, 'p1');
    const lure = f(sim, 'p1').lure;
    expect(cast(sim, 'p1', 'borrowed-lure').ok).toBe(true);
    expect(f(sim, 'p1').lure).toBe(lure + 1);
    expect(cast(sim, 'p1', 'trade-in')).toMatchObject({ ok: false });
    sim.run(30_500);
    expect(f(sim, 'p1').lure).toBe(lure);
  });

  it('Fish Finder shows the fish on the line, and refuses with no line out', () => {
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'fish-finder')).toMatchObject({ ok: false });
    act(sim, 'p1', { type: 'cast' });
    expect(cast(sim, 'p1', 'fish-finder').ok).toBe(true);
    const name = speciesById(line(sim, 'p1').hooked.species)!.name;
    expect(sim.view('p1').overlays.some((o) => String(o.text).toLowerCase().includes(name.toLowerCase()))).toBe(true);
    expect(sim.view('p2').overlays.length).toBe(0);
  });
});

describe('big-catch pack: other fishers', () => {
  it('Tangled Line stops casting for 8 seconds', () => {
    const sim = pond();
    handFished(sim, 'p2');
    expect(cast(sim, 'p1', 'tangled-line', 'p2').ok).toBe(true);
    expect(act(sim, 'p2', { type: 'cast' }).ok).toBe(false);
    sim.run(8100);
    expect(act(sim, 'p2', { type: 'cast' }).ok).toBe(true);
  });

  it('Cheeky Seagull takes a catch from the table, with odds that add up to 100', () => {
    expect(percentsIn('cheeky-seagull').reduce((a, b) => a + b, 0)).toBe(100);
    const sim = pond();
    handFished(sim, 'p2');
    expect(cast(sim, 'p1', 'cheeky-seagull', 'p2')).toMatchObject({ ok: false });
    castAndBite(sim, 'p2');
    act(sim, 'p2', { type: 'reel' });
    const fish = line(sim, 'p2').landed;
    const wallet = f(sim, 'p1').wallet;
    expect(cast(sim, 'p1', 'cheeky-seagull', 'p2').ok).toBe(true);
    expect(line(sim, 'p2').phase).toBe('idle');
    expect(f(sim, 'p2').outcome).toMatchObject({ kind: 'escaped', escaped: fish.species });
    const half = Math.max(1, Math.round(pointsFor(fish.grams) / 2));
    expect([wallet, wallet + half]).toContain(f(sim, 'p1').wallet);
  });

  it('Sunken Log loses the fish on a line in the water', () => {
    const sim = pond();
    handFished(sim, 'p2');
    expect(cast(sim, 'p1', 'sunken-log', 'p2')).toMatchObject({ ok: false });
    act(sim, 'p2', { type: 'cast' });
    const species = line(sim, 'p2').hooked.species;
    expect(cast(sim, 'p1', 'sunken-log', 'p2').ok).toBe(true);
    expect(line(sim, 'p2').phase).toBe('idle');
    expect(f(sim, 'p2').outcome).toMatchObject({ kind: 'escaped', escaped: species });
    sim.run(10_000);
    expect(sim.errors).toEqual([]);
  });

  it('Rusty Reel sticks on the first reel after a bite only', () => {
    const sim = pond();
    handFished(sim, 'p2');
    expect(cast(sim, 'p1', 'rusty-reel', 'p2').ok).toBe(true);
    castAndBite(sim, 'p2');
    expect(act(sim, 'p2', { type: 'reel' }).ok).toBe(false);
    expect(line(sim, 'p2').phase).toBe('biting');
    expect(act(sim, 'p2', { type: 'reel' }).ok).toBe(true);
    expect(line(sim, 'p2').phase).toBe('landed');
  });

  it('Weed on the Lure leaves a bare hook for 20 seconds, then gives the lure back', () => {
    const sim = pond({}, 20_000);
    until(sim, () => f(sim, 'p2').lure >= 1, 300_000);
    sim.idle.add('p2');
    const lure = f(sim, 'p2').lure;
    expect(cast(sim, 'p1', 'weedy-lure', 'p2').ok).toBe(true);
    expect(f(sim, 'p2').lure).toBe(0);
    sim.run(20_500);
    expect(f(sim, 'p2').lure).toBe(lure);
    expect(cast(sim, 'p3', 'weedy-lure', 'p4').ok || f(sim, 'p4').lure === 0).toBe(true);
  });

  it('Crossed Lines swaps the fish on two lines', () => {
    const sim = pond();
    handFished(sim, 'p1');
    handFished(sim, 'p2');
    act(sim, 'p2', { type: 'cast' });
    expect(cast(sim, 'p1', 'crossed-lines', 'p2')).toMatchObject({ ok: false });
    act(sim, 'p1', { type: 'cast' });
    const [mine, theirs] = [line(sim, 'p1').hooked, line(sim, 'p2').hooked];
    expect(cast(sim, 'p1', 'crossed-lines', 'p2').ok).toBe(true);
    expect(line(sim, 'p1').hooked).toEqual(theirs);
    expect(line(sim, 'p2').hooked).toEqual(mine);
  });

  it('Fish Swap trades the newest fish in two tanks', () => {
    const sim = pond();
    until(sim, () => f(sim, 'p1').tank.length > 0 && f(sim, 'p2').tank.length > 0);
    sim.idle.add('p1');
    sim.idle.add('p2');
    const a = f(sim, 'p1').tank.at(-1);
    const b = f(sim, 'p2').tank.at(-1);
    const total = scoreOf(sim, 'p1') + scoreOf(sim, 'p2');
    expect(cast(sim, 'p1', 'fish-swap', 'p2').ok).toBe(true);
    expect(f(sim, 'p1').tank.at(-1)).toEqual(b);
    expect(f(sim, 'p2').tank.at(-1)).toEqual(a);
    // Set bonuses can move with the fish, so the total may change; the fish themselves just change hands.
    expect(Math.abs(scoreOf(sim, 'p1') + scoreOf(sim, 'p2') - total)).toBeLessThanOrEqual(2 * 250);
  });

  it('Bait Thief takes 2 casts', () => {
    const sim = pond();
    handFished(sim, 'p2');
    sim.idle.add('p1');
    const [mine, theirs] = [f(sim, 'p1').casts, f(sim, 'p2').casts];
    expect(cast(sim, 'p1', 'bait-thief', 'p2').ok).toBe(true);
    const took = Math.min(2, theirs);
    expect(f(sim, 'p2').casts).toBe(theirs - took);
    expect(f(sim, 'p1').casts).toBe(mine + took);
  });
});

describe('big-catch pack: the market', () => {
  it('Fish Auction sells the whole tank at 25% over its points', () => {
    const sim = pond();
    until(sim, () => f(sim, 'p1').tank.length >= 2);
    sim.idle.add('p1');
    const points = f(sim, 'p1').tank.reduce((n: number, fish: any) => n + pointsFor(fish.grams), 0);
    const wallet = f(sim, 'p1').wallet;
    expect(cast(sim, 'p1', 'fish-auction').ok).toBe(true);
    expect(f(sim, 'p1').tank).toEqual([]);
    expect(f(sim, 'p1').wallet).toBe(wallet + Math.round(points * BIG_CATCH_CHAOS.AUCTION_PREMIUM));
    expect(cast(sim, 'p2', 'fish-auction').ok || f(sim, 'p2').tank.length > 0).toBe(true);
  });

  it('Tackle Sale gives back half the price of the next lure, once; Lure Trade-In refunds a lure in full', () => {
    const sim = pond();
    const bare = sim.ids.find((id) => f(sim, id).lure === 0)!;
    expect(cast(sim, bare, 'trade-in')).toMatchObject({ ok: false });
    const canBuy = (id: string) => f(sim, id).lure < 3 && f(sim, id).wallet >= LURES[f(sim, id).lure + 1]!.price;
    until(sim, () => sim.ids.some(canBuy));
    const id = sim.ids.find(canBuy)!;
    sim.idle.add(id);
    const level = f(sim, id).lure + 1;
    expect(cast(sim, id, 'tackle-sale').ok).toBe(true);
    const wallet = f(sim, id).wallet;
    expect(act(sim, id, { type: 'lure', level }).ok).toBe(true);
    expect(f(sim, id).wallet).toBe(wallet - LURES[level]!.price + Math.floor(LURES[level]!.price / 2));
    expect(fx(sim, 'tackle-sale')).toBeUndefined();
    const now = f(sim, id).wallet;
    expect(cast(sim, id, 'trade-in').ok).toBe(true);
    expect(f(sim, id).lure).toBe(level - 1);
    expect(f(sim, id).wallet).toBe(now + LURES[level]!.price);
  });

  it('Matching Fish completes a set with a fish of that rarity from the water being fished', () => {
    const sim = pond();
    const short = (id: string) => {
      const tank = f(sim, id).tank as any[];
      return tank.length < 6 && ['common', 'uncommon', 'rare', 'legend'].some((r) => tank.filter((x) => rarityOf(x.species) === r).length % SET_SIZE === SET_SIZE - 1);
    };
    until(sim, () => sim.ids.some(short), 300_000);
    const id = sim.ids.find(short)!;
    sim.idle.add(id);
    const before = f(sim, id).tank.length;
    expect(cast(sim, id, 'matching-fish').ok).toBe(true);
    const fish = f(sim, id).tank.at(-1);
    expect(f(sim, id).tank.length).toBe(before + 1);
    expect(f(sim, id).tank.filter((x: any) => rarityOf(x.species) === rarityOf(fish.species)).length % SET_SIZE).toBe(0);
    expect(speciesOf(sim.state().water).map((s) => s.id)).toContain(fish.species);
  });
});

describe('big-catch pack: the water and luck', () => {
  it('starts, stretches, changes and ends events, and refuses a second one', () => {
    const sim = pond({ events: true });
    until(sim, () => !sim.state().event);
    expect(cast(sim, 'p1', 'dinner-bell').ok).toBe(true);
    const ev = sim.state().event;
    expect(ev).toMatchObject({ id: 'feeding', endsAt: sim.now + 20_000 });
    expect(cast(sim, 'p2', 'call-the-school')).toMatchObject({ ok: false });
    expect(cast(sim, 'p2', 'slack-tide').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(ev.endsAt + 15_000);
    expect(sim.state().nextEventAt === null || sim.state().nextEventAt >= sim.state().event.endsAt).toBe(true);
    expect(percentsIn('change-of-tide').reduce((a, b) => a + b, 0)).toBe(100);
    expect(cast(sim, 'p3', 'change-of-tide').ok).toBe(true);
    expect(['golden', 'school']).toContain(sim.state().event.id);
    expect(cast(sim, 'p4', 'still-water').ok).toBe(true);
    expect(sim.state().event).toBeNull();
    expect(cast(sim, 'p1', 'still-water')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'change-of-tide')).toMatchObject({ ok: false });
  });

  it('moves the boat on early, and holds it with the anchor', () => {
    const sim = pond();
    expect(sim.state().water).toBe('river');
    expect(cast(sim, 'p1', 'full-steam').ok).toBe(true);
    expect(sim.state().water).toBe('estuary');
    expect(sim.state().nextWaterAt).toBe(sim.now + WATER_ROTATE_SEC * 1000);
    const next = sim.state().nextWaterAt;
    expect(cast(sim, 'p2', 'drop-anchor').ok).toBe(true);
    expect(sim.state().nextWaterAt).toBe(next + 60_000);
    sim.run(WATER_ROTATE_SEC * 1000 + 1000);
    expect(sim.state().water).toBe('estuary');
    sim.run(60_000);
    expect(sim.state().water).toBe('reef');
  });

  it('Message in a Bottle shows odds that add up to 100 and always changes something', () => {
    expect(percentsIn('message-bottle').reduce((a, b) => a + b, 0)).toBe(100);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = new ChaosSim({ modeId: 'big-catch', questions: MIXED_SET, players: 2, seed, settings: { events: false } });
      sim.run(5000);
      sim.idle.add('p1');
      const snap = () => JSON.stringify([f(sim, 'p1').casts, f(sim, 'p1').wallet, f(sim, 'p1').landed]);
      const before = snap();
      expect(cast(sim, 'p1', 'message-bottle').ok).toBe(true);
      expect(snap()).not.toBe(before);
    }
  });

  it('Double or Splash shows its odds and settles the catch on the table', () => {
    expect(percentsIn('double-or-splash').reduce((a, b) => a + b, 0)).toBe(100);
    const sim = pond();
    handFished(sim, 'p1');
    expect(cast(sim, 'p1', 'double-or-splash')).toMatchObject({ ok: false });
    castAndBite(sim, 'p1');
    act(sim, 'p1', { type: 'reel' });
    const fish = line(sim, 'p1').landed;
    const wallet = f(sim, 'p1').wallet;
    expect(cast(sim, 'p1', 'double-or-splash').ok).toBe(true);
    expect(line(sim, 'p1').phase).toBe('idle');
    const outcome = f(sim, 'p1').outcome;
    if (outcome.kind === 'sold') expect(f(sim, 'p1').wallet).toBe(wallet + 2 * pointsFor(fish.grams));
    else {
      expect(outcome).toMatchObject({ kind: 'escaped', escaped: fish.species });
      expect(f(sim, 'p1').wallet).toBe(wallet);
    }
  });
});
