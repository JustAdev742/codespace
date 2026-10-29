import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Exact behaviour of the sky-lanterns cheats. Every bot is idle, so oil and
 * lanterns only change when a test acts. A lantern costs 3 oil, the can holds
 * 6, the first wind is calm and the wind changes every 25 seconds.
 */

const rng = createRng(3);

function game(settings: Record<string, unknown> = {}, seed = 31) {
  const sim = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 4, seed, settings });
  for (const id of sim.ids) sim.idle.add(id);
  sim.run(1000);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();
const fl = (sim: ChaosSim, id: string) => st(sim).flyers[id];

function act(sim: ChaosSim, id: string, type: 'light' | 'launch') {
  expect(sim.rt.act(id, { type }).ok).toBe(true);
}

function right(sim: ChaosSim, id: string) {
  const a = sim.rt.botAction(id, 1, rng) as { type: string };
  expect(a.type).toBe('answer');
  expect(sim.rt.act(id, a).ok).toBe(true);
}

function wrong(sim: ChaosSim, id: string) {
  const iid = fl(sim, id).stream.iid;
  expect(sim.rt.act(id, { type: 'answer', iid, answer: { type: 'flashcard', knew: false } }).ok).toBe(true);
}

function cast(sim: ChaosSim, caster: string, cheatId: string, target?: string) {
  return sim.cast(caster, { cheatId: `sky-lanterns.${cheatId}`, target: target ?? null });
}

/** Give a player two lit lanterns: a brimming can (cast by them), then two lights. */
function twoLanterns(sim: ChaosSim, id: string) {
  expect(cast(sim, id, 'full-can').ok).toBe(true);
  act(sim, id, 'light');
  act(sim, id, 'light');
  expect(fl(sim, id).ground).toBe(2);
}

describe('sky-lanterns pack: the wind', () => {
  it('Summon a Gust strengthens the wind step by step, as far as the settings allow', () => {
    const sim = game();
    expect(st(sim).wind.kind).toBe('calm');
    expect(cast(sim, 'p1', 'summon-gust').ok).toBe(true);
    expect(st(sim).wind.kind).toBe('breezy');
    expect(cast(sim, 'p2', 'summon-gust').ok).toBe(true);
    expect(st(sim).wind.kind).toBe('gusty');
    expect(cast(sim, 'p3', 'summon-gust')).toMatchObject({ ok: false });
    const gales = game({ gales: true });
    for (const id of ['p1', 'p2', 'p3']) cast(gales, id, 'summon-gust');
    expect(st(gales).wind.kind).toBe('gale');
  });

  it('Dead Calm Skies drops the wind to calm and refuses a calm wind', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'dead-calm')).toMatchObject({ ok: false });
    cast(sim, 'p2', 'summon-gust');
    expect(cast(sim, 'p1', 'dead-calm').ok).toBe(true);
    expect(st(sim).wind.kind).toBe('calm');
    expect(st(sim).wind.changeAt).toBe(25_000);
  });

  it('Hurry the Wind makes the change happen now, and the next one the usual time later', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'hurry-wind').ok).toBe(true);
    sim.run(10);
    expect(st(sim).wind.changes).toBe(1);
    expect(st(sim).wind.since).toBe(1000);
    expect(st(sim).wind.changeAt).toBe(26_000);
  });

  it('Hold the Breeze delays the change by 15 seconds, never to the end of the game', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'hold-breeze').ok).toBe(true);
    expect(st(sim).wind.changeAt).toBe(40_000);
    sim.run(30_000);
    expect(st(sim).wind.changes).toBe(0);
    sim.run(10_000);
    expect(st(sim).wind.changes).toBe(1);
    const late = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 2, seed: 31, common: { timeLimitSec: 30 } });
    expect(late.cast('p1', { cheatId: 'sky-lanterns.hold-breeze' })).toMatchObject({ ok: false });
  });

  it('Storm Front and Clear Night Skies set the next storm chance to 90% and 0%', () => {
    const sim = game();
    expect(st(sim).stormChance).toBe(10);
    expect(cast(sim, 'p1', 'storm-front').ok).toBe(true);
    expect(st(sim).stormChance).toBe(90);
    expect(cast(sim, 'p2', 'storm-front')).toMatchObject({ ok: false });
    expect(cast(sim, 'p3', 'clear-skies').ok).toBe(true);
    expect(st(sim).stormChance).toBe(0);
    expect(cast(sim, 'p4', 'clear-skies')).toMatchObject({ ok: false });
    const calm = game({ storms: false });
    expect(cast(calm, 'p1', 'storm-front')).toMatchObject({ ok: false });
  });

  it('the festival finale gale and its storm-free last change are never touched', () => {
    const sim = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 4, seed: 31, settings: { windPattern: 'finale' }, common: { timeLimitSec: 40 } });
    for (const id of sim.ids) sim.idle.add(id);
    sim.run(1000);
    // The change at 25 s is the last one: its forecast is 0 and stays 0.
    expect(st(sim).stormChance).toBe(0);
    expect(cast(sim, 'p1', 'storm-front')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'rigged-wind')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'longer-night')).toMatchObject({ ok: false });
    sim.run(25_000);
    expect(st(sim).wind.kind).toBe('gale');
    for (const id of ['summon-gust', 'dead-calm', 'weather-vane']) expect(cast(sim, 'p2', id)).toMatchObject({ ok: false });
  });

  it('Weather Vane Spin always lands on a different wind the settings allow', () => {
    for (const seed of [1, 2, 3, 4]) {
      const sim = game({}, seed);
      expect(cast(sim, 'p1', 'weather-vane').ok).toBe(true);
      expect(['breezy', 'gusty']).toContain(st(sim).wind.kind);
    }
  });

  it('Rigged Wind clears the forecast and makes the next wind gusty', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'rigged-wind').ok).toBe(true);
    expect(st(sim).stormChance).toBe(0);
    sim.run(24_500);
    expect(st(sim).wind).toMatchObject({ changes: 1, kind: 'gusty', storm: null });
  });

  it('Longer Lantern Night adds 20 seconds and keeps the wind changing until the new end', () => {
    const sim = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 4, seed: 31, common: { timeLimitSec: 40 } });
    for (const id of sim.ids) sim.idle.add(id);
    sim.run(26_000);
    expect(st(sim).wind.changeAt).toBe(null);
    expect(cast(sim, 'p1', 'longer-night').ok).toBe(true);
    expect(st(sim).endsAt).toBe(60_000);
    expect(st(sim).wind.changeAt).toBe(50_000);
    sim.run(25_000);
    expect(st(sim).wind.changes).toBe(2);
    expect(sim.rt.status).toBe('running');
  });
});

describe('sky-lanterns pack: oil and lanterns', () => {
  it('Brimming Oil Can fills the can to 6 and refuses a full can', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'full-can').ok).toBe(true);
    expect(fl(sim, 'p1').oil).toBe(6);
    sim.run(41_000);
    expect(cast(sim, 'p1', 'full-can')).toMatchObject({ ok: false });
  });

  it('Oil Siphon takes half the target\'s oil, only as much as fits', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'oil-siphon', 'p2')).toMatchObject({ ok: false });
    cast(sim, 'p2', 'full-can');
    expect(cast(sim, 'p1', 'oil-siphon', 'p2').ok).toBe(true);
    expect(fl(sim, 'p1').oil).toBe(3);
    expect(fl(sim, 'p2').oil).toBe(3);
  });

  it('Lantern Lightning blows out half the target\'s lanterns, recorded as lost', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'lightning', 'p2')).toMatchObject({ ok: false });
    twoLanterns(sim, 'p2');
    expect(cast(sim, 'p1', 'lightning', 'p2').ok).toBe(true);
    expect(fl(sim, 'p2')).toMatchObject({ ground: 1, lost: 1 });
  });

  it('Lantern Thief, Lantern Swap and Sky Lantern Toll move lit lanterns between players', () => {
    const sim = game();
    twoLanterns(sim, 'p2');
    twoLanterns(sim, 'p3');
    expect(cast(sim, 'p1', 'lantern-thief', 'p2').ok).toBe(true);
    expect([fl(sim, 'p1').ground, fl(sim, 'p2').ground]).toEqual([1, 1]);
    expect(cast(sim, 'p4', 'lantern-swap', 'p3').ok).toBe(true);
    expect([fl(sim, 'p4').ground, fl(sim, 'p3').ground]).toEqual([2, 0]);
    expect(cast(sim, 'p3', 'sky-toll').ok).toBe(true);
    expect(fl(sim, 'p3').ground).toBe(3);
    expect([fl(sim, 'p1').ground, fl(sim, 'p2').ground, fl(sim, 'p4').ground]).toEqual([0, 0, 1]);
  });

  it('Lantern Festival gives everyone one lit lantern', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'festival').ok).toBe(true);
    expect(sim.ids.map((id) => fl(sim, id).ground)).toEqual([1, 1, 1, 1]);
  });

  it('Forced Lantern Launch launches the target\'s lanterns on the wind that is blowing', () => {
    const sim = game();
    twoLanterns(sim, 'p2');
    expect(cast(sim, 'p1', 'forced-launch', 'p2').ok).toBe(true);
    expect(fl(sim, 'p2')).toMatchObject({ ground: 0, score: 2, launched: 2, lastLaunch: { count: 2, mult: 1, points: 2 } });
  });

  it('Sky Wish Lantern lands one of its stated outcomes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = game({}, seed);
      cast(sim, 'p1', 'festival');
      expect(cast(sim, 'p1', 'sky-wish').ok).toBe(true);
      expect([0, 2, 3]).toContain(fl(sim, 'p1').ground);
    }
  });

  it('Twin Wicks lights two lanterns for the oil of one', () => {
    const sim = game();
    cast(sim, 'p1', 'full-can');
    cast(sim, 'p1', 'twin-wicks');
    act(sim, 'p1', 'light');
    expect(fl(sim, 'p1')).toMatchObject({ ground: 2, oil: 3 });
  });

  it('Oil Rush doubles oil from answers; Oil Dry Spell stops it', () => {
    const sim = game();
    cast(sim, 'p1', 'oil-rush');
    right(sim, 'p1');
    expect(fl(sim, 'p1').oil).toBe(2);
    cast(sim, 'p1', 'dry-spell', 'p2');
    right(sim, 'p2');
    expect(fl(sim, 'p2').oil).toBe(0);
  });

  it('Leaky Oil Can Curse spills 1 oil on each of the target\'s wrong answers', () => {
    const sim = game();
    cast(sim, 'p2', 'full-can');
    cast(sim, 'p1', 'leaky-curse', 'p2');
    wrong(sim, 'p2');
    expect(fl(sim, 'p2').oil).toBe(5);
  });

  it('Grounded Lanterns and Wet Lantern Wicks refuse launching and lighting', () => {
    const sim = game();
    cast(sim, 'p2', 'full-can');
    act(sim, 'p2', 'light');
    cast(sim, 'p1', 'grounded', 'p2');
    cast(sim, 'p3', 'wet-wicks', 'p2');
    expect(sim.rt.act('p2', { type: 'launch' })).toMatchObject({ ok: false });
    expect(sim.rt.act('p2', { type: 'light' })).toMatchObject({ ok: false });
    sim.run(10_500);
    act(sim, 'p2', 'light');
    act(sim, 'p2', 'launch');
  });
});

describe('sky-lanterns pack: launches and storms', () => {
  it('Lantern Updraft adds a point per lantern; Lantern Crosswind takes a wind step off', () => {
    const sim = game();
    twoLanterns(sim, 'p1');
    cast(sim, 'p1', 'updraft');
    act(sim, 'p1', 'launch');
    expect(fl(sim, 'p1')).toMatchObject({ score: 4, best: 4, lastLaunch: { mult: 2, points: 4 } });
    twoLanterns(sim, 'p2');
    cast(sim, 'p3', 'crosswind', 'p2');
    act(sim, 'p2', 'launch');
    // Calm: half, rounded down.
    expect(fl(sim, 'p2').score).toBe(1);
    cast(sim, 'p4', 'summon-gust');
    cast(sim, 'p4', 'festival');
    act(sim, 'p2', 'launch');
    expect(fl(sim, 'p2').score).toBe(2);
  });

  it('Bottled Wind keeps a strong wind for a launch on a weaker one, and refuses a calm wind', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'bottled-wind')).toMatchObject({ ok: false });
    twoLanterns(sim, 'p1');
    cast(sim, 'p2', 'summon-gust');
    cast(sim, 'p3', 'summon-gust');
    expect(cast(sim, 'p1', 'bottled-wind').ok).toBe(true);
    cast(sim, 'p4', 'dead-calm');
    act(sim, 'p1', 'launch');
    expect(fl(sim, 'p1')).toMatchObject({ score: 6, lastLaunch: { mult: 3 } });
  });

  it('Lantern Fuse burns half the waiting lanterns after 12 seconds unless they are launched', () => {
    const sim = game();
    twoLanterns(sim, 'p2');
    twoLanterns(sim, 'p3');
    cast(sim, 'p1', 'fuse-lantern', 'p2');
    cast(sim, 'p4', 'fuse-lantern', 'p3');
    act(sim, 'p3', 'launch');
    sim.run(12_500);
    expect(fl(sim, 'p2')).toMatchObject({ ground: 1, lost: 1 });
    expect(fl(sim, 'p3').lost).toBe(0);
  });

  it('Personal Raincloud blows out the target\'s lanterns at the next wind change', () => {
    const sim = game({ storms: false });
    twoLanterns(sim, 'p2');
    expect(cast(sim, 'p1', 'raincloud', 'p2').ok).toBe(true);
    sim.run(23_000);
    expect(fl(sim, 'p2').ground).toBe(2);
    sim.run(1_500);
    expect(fl(sim, 'p2')).toMatchObject({ ground: 0, lost: 2 });
  });

  it('Storm Shelter brings the caster\'s lanterns through a storm that takes everyone else\'s', () => {
    const sim = game();
    twoLanterns(sim, 'p1');
    twoLanterns(sim, 'p2');
    expect(cast(sim, 'p1', 'shelter').ok).toBe(true);
    cast(sim, 'p3', 'storm-front');
    sim.run(24_500);
    // This seed's storm roll at 90% is a storm.
    expect(st(sim).wind.storm).not.toBe(null);
    expect(fl(sim, 'p1')).toMatchObject({ ground: 2, lost: 0 });
    expect(fl(sim, 'p2')).toMatchObject({ ground: 0, lost: 2 });
    expect(st(sim).wind.storm.lost).toBe(2);
  });

  it('Sky Storm Chaser pays a point for each lantern of someone else\'s that the next storm blows out', () => {
    const sim = game();
    for (const id of ['p1', 'p2', 'p3']) twoLanterns(sim, id);
    expect(cast(sim, 'p1', 'storm-chaser').ok).toBe(true);
    cast(sim, 'p4', 'storm-front');
    sim.run(24_500);
    // The same storm as the shelter's: p2's and p3's lanterns pay; the caster's own do not.
    expect(st(sim).wind.storm).toMatchObject({ lost: 6 });
    expect(fl(sim, 'p1')).toMatchObject({ score: 4, ground: 0, lost: 2 });
    expect(sim.chaos().effects).toHaveLength(0);
    // No storm at the change: nothing is paid, and the chase is over.
    const dry = game();
    twoLanterns(dry, 'p2');
    expect(cast(dry, 'p1', 'storm-chaser').ok).toBe(true);
    cast(dry, 'p3', 'clear-skies');
    dry.run(24_500);
    expect(st(dry).wind).toMatchObject({ changes: 1, storm: null });
    expect(fl(dry, 'p1').score).toBe(0);
    expect(dry.chaos().effects).toHaveLength(0);
    expect(cast(game({ storms: false }), 'p1', 'storm-chaser')).toMatchObject({ ok: false });
  });

  it('Sky Lantern Tangled Strings sends up half a launch (rounded up) and leaves the rest lit', () => {
    const sim = game();
    twoLanterns(sim, 'p2');
    cast(sim, 'p3', 'summon-gust');
    cast(sim, 'p4', 'festival');
    expect(cast(sim, 'p1', 'tangled-strings', 'p2').ok).toBe(true);
    act(sim, 'p2', 'launch');
    expect(fl(sim, 'p2')).toMatchObject({ ground: 1, score: 4, launched: 2, best: 4, lastLaunch: { count: 2, mult: 2, points: 4 } });
    expect(st(sim).launches[0]).toMatchObject({ playerId: 'p2', count: 2, mult: 2, points: 4 });
    // A single lantern cannot be split.
    act(sim, 'p2', 'launch');
    expect(fl(sim, 'p2')).toMatchObject({ ground: 0, score: 6, launched: 3, best: 4 });
  });

  it('Sky Lantern High Drift scores a launch at the next wind instead of at once', () => {
    const sim = game();
    twoLanterns(sim, 'p1');
    expect(cast(sim, 'p1', 'high-drift').ok).toBe(true);
    act(sim, 'p1', 'launch');
    expect(fl(sim, 'p1')).toMatchObject({ ground: 0, score: 0, launched: 2, best: 0, lastLaunch: null });
    expect(st(sim).launches).toEqual([]);
    cast(sim, 'p2', 'rigged-wind');
    sim.run(24_500);
    expect(st(sim).wind.kind).toBe('gusty');
    expect(fl(sim, 'p1')).toMatchObject({ score: 6, best: 6, lastLaunch: { count: 2, mult: 3, points: 6 } });
    expect(st(sim).launches[0]).toMatchObject({ playerId: 'p1', count: 2, mult: 3, points: 6 });
  });

  it('Sky Lantern High Drift lanterns ride out a storm at ×1, and land when the effect ends if the wind has not changed', () => {
    const stormy = game();
    twoLanterns(stormy, 'p1');
    cast(stormy, 'p1', 'high-drift');
    act(stormy, 'p1', 'launch');
    cast(stormy, 'p2', 'storm-front');
    stormy.run(24_500);
    expect(st(stormy).wind.storm).not.toBe(null);
    expect(fl(stormy, 'p1')).toMatchObject({ score: 2, lost: 0 });
    // With a minute between changes, the drift ends first: the lanterns land on the calm wind blowing then.
    const slow = game({ windChangeSec: 60 });
    twoLanterns(slow, 'p1');
    cast(slow, 'p1', 'high-drift');
    act(slow, 'p1', 'launch');
    slow.run(44_000);
    expect(fl(slow, 'p1').score).toBe(0);
    slow.run(1_500);
    expect(fl(slow, 'p1')).toMatchObject({ score: 2, lastLaunch: { count: 2, mult: 1, points: 2 } });
    expect(st(slow).wind.changes).toBe(0);
    // On the last wind of the game there is nothing to drift to.
    const last = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 2, seed: 31, settings: { windChangeSec: 60 }, common: { timeLimitSec: 30 } });
    expect(last.cast('p1', { cheatId: 'sky-lanterns.high-drift' })).toMatchObject({ ok: false });
  });

  it('Sky Lantern Rekindle relights the lanterns lost last, only within 30 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'rekindle')).toMatchObject({ ok: false });
    twoLanterns(sim, 'p1');
    cast(sim, 'p2', 'lightning', 'p1');
    expect(fl(sim, 'p1')).toMatchObject({ ground: 1, lost: 1 });
    expect(cast(sim, 'p1', 'rekindle').ok).toBe(true);
    expect(fl(sim, 'p1')).toMatchObject({ ground: 2, lost: 0, lastLoss: null });
    // Cold embers.
    const cold = game({ storms: false });
    twoLanterns(cold, 'p1');
    cast(cold, 'p2', 'lightning', 'p1');
    cold.run(31_000);
    expect(cast(cold, 'p1', 'rekindle')).toMatchObject({ ok: false });
    expect(fl(cold, 'p1').ground).toBe(1);
  });

  it('Sky Lantern Rekindle brings back lanterns a storm took, and the storm\'s tally says so', () => {
    const sim = game();
    twoLanterns(sim, 'p1');
    twoLanterns(sim, 'p2');
    cast(sim, 'p3', 'storm-front');
    sim.run(24_500);
    expect(st(sim).wind.storm).toMatchObject({ lost: 4 });
    expect(cast(sim, 'p1', 'rekindle').ok).toBe(true);
    expect(fl(sim, 'p1')).toMatchObject({ ground: 2, lost: 0 });
    expect(st(sim).wind.storm.lost).toBe(2);
  });

  it('Early Sky Lantern Dawn ends the night 20 seconds sooner, never closer than 30 seconds away', () => {
    const night = (settings: Record<string, unknown> = {}) => {
      const sim = new ChaosSim({ modeId: 'sky-lanterns', questions: MIXED_SET, players: 4, seed: 31, settings, common: { timeLimitSec: 60 } });
      for (const id of sim.ids) sim.idle.add(id);
      sim.run(1000);
      return sim;
    };
    const sim = night();
    expect(cast(sim, 'p1', 'early-dawn').ok).toBe(true);
    expect(st(sim)).toMatchObject({ endsAt: 40_000, wind: { changeAt: 25_000 } });
    sim.run(24_500);
    // The mode schedules no change past the new end: this wind lasts.
    expect(st(sim).wind).toMatchObject({ changes: 1, changeAt: null });
    expect(cast(sim, 'p2', 'early-dawn')).toMatchObject({ ok: false });
    sim.run(14_000);
    expect(sim.rt.status).toBe('running');
    sim.run(1_000);
    expect(sim.rt.status).not.toBe('running');
    // A change that would now come after the end is called off.
    const slow = night({ windChangeSec: 45 });
    expect(st(slow).wind.changeAt).toBe(45_000);
    expect(cast(slow, 'p1', 'early-dawn').ok).toBe(true);
    expect(st(slow)).toMatchObject({ endsAt: 40_000, wind: { changeAt: null } });
    slow.run(38_000);
    expect(st(slow).wind.changes).toBe(0);
    expect(cast(night({ windPattern: 'finale' }), 'p1', 'early-dawn')).toMatchObject({ ok: false });
  });
});
