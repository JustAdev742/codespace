import { describe, expect, it } from 'vitest';
import {
  CROWD,
  ENDLESS_TOUGHNESS,
  FLARE_PER_GUARD,
  ROOM_TOUGHNESS,
  WAVE_MIX,
  botSpend,
  botTowerChoice,
  firstFighter,
  flareCost,
  guardPoints,
  lanternGuard,
  pickTarget,
  roomFactor,
  roster,
  startingGold,
  variantFactor,
  waveHp,
  type Target,
} from '../src/modes/lantern-guard/index.ts';
import { meta, variants } from '../src/modes/lantern-guard/meta.ts';
import {
  DIFFICULTY_HP,
  FIRST_WAVE_MS,
  FLARE_BURN,
  FLARE_BURN_BOSS,
  GLOOMLINGS,
  MAPS,
  MAP_H,
  MAP_IDS,
  MAP_W,
  SPAWN_WINDOW_MS,
  TOWER_SET_TOUGHNESS,
  TICK_MS,
  TOWERS,
  WAVE_EVERY_MS,
  distanceToPath,
  pathInReach,
  pointAt,
  spotProgress,
  towerStats,
  upgradeCost,
  type Point,
} from '../src/modes/lantern-guard/maps.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven } from './rule-helpers.ts';

/*
 * Lantern Guard: a co-operative tower defence. Every question here is a true
 * statement, so `right` answers true and `wrong` answers false. Game time
 * starts at 0; the first wave sets off at 15 seconds.
 */

const pick = (id: string) => variants.find((v) => v.meta.id === id)!;
const guard = (settings: Record<string, unknown> = {}, players: string[] = ['a'], common: Record<string, number> = {}) => drive(lanternGuard, { players, questions: TRUE_SET, settings, common });
/** Right answers in a row; returns the gold after them. */
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) expect(h.answer(id, 'right').ok).toBe(true);
  return h.view(id).you.gold as number;
};
/** Moves game time to `ms`, a second at a time (the battle's timer catches up either way). */
const until = (h: Driven, ms: number) => {
  while (h.rt.gameNow() < ms && h.rt.status === 'running') h.tick(Math.min(1000, ms - h.rt.gameNow()));
};
/** The free spot whose tower would see the most road, as bots and the Best spot button choose it. */
const bestSpot = (mapId: keyof typeof MAPS, range = 22) => {
  const map = MAPS[mapId];
  return map.spots.map((_, i) => i).reduce((a, b) => (pathInReach(map, map.spots[b]!, range) > pathInReach(map, map.spots[a]!, range) ? b : a));
};
const lastSummary = (h: Driven) => h.rt.results?.summary;
/** A wave-1 Wisp's health in a room of one on normal. */
const WISP_1 = Math.round(GLOOMLINGS.wisp.hp * roomFactor(1));

/* ----------------------------------- maps ----------------------------------- */

describe('Lantern Guard maps', () => {
  it('has three maps, each with 24 to 30 spots that keep clear of the road and of each other', () => {
    expect(MAP_IDS).toEqual(['river', 'spiral', 'twin']);
    for (const id of MAP_IDS) {
      const map = MAPS[id];
      expect(map.spots.length, id).toBeGreaterThanOrEqual(24);
      expect(map.spots.length, id).toBeLessThanOrEqual(30);
      for (const [i, s] of map.spots.entries()) {
        for (const path of map.paths) expect(distanceToPath(s, path), `${id} spot ${i}`).toBeGreaterThanOrEqual(8);
        expect(s[0]).toBeGreaterThan(0);
        expect(s[0]).toBeLessThan(MAP_W);
        expect(s[1]).toBeGreaterThan(0);
        expect(s[1]).toBeLessThan(MAP_H);
        for (const [j, o] of map.spots.entries()) if (j !== i) expect(Math.hypot(s[0] - o[0], s[1] - o[1]), `${id} spots ${i} and ${j}`).toBeGreaterThanOrEqual(10);
        // Every spot is close enough to the road for a tower there to be useful.
        expect(pathInReach(map, s, towerStats('frost', 1).range), `${id} spot ${i}`).toBeGreaterThan(0);
      }
    }
  });

  it('runs every road from an entrance on the left to the Great Lantern on the right', () => {
    for (const id of MAP_IDS) {
      const map = MAPS[id];
      for (const path of map.paths) {
        expect(path.points[0]![0], id).toBeLessThanOrEqual(0);
        expect(pointAt(path, 1)).toEqual(map.lantern);
        expect(pointAt(path, 0)).toEqual(path.points[0]);
        expect(map.lantern[0], id).toBeGreaterThan(MAP_W / 2);
      }
    }
    expect(MAPS.river.paths).toHaveLength(1);
    expect(MAPS.spiral.paths[0]!.length).toBeGreaterThan(MAPS.river.paths[0]!.length * 2);
  });

  it('gives Twin Gates two entrances whose roads meet about halfway', () => {
    const [top, bottom] = MAPS.twin.paths;
    expect(top!.points[0]).not.toEqual(bottom!.points[0]);
    // The second half is the same road.
    const shared = top!.points.filter((p) => bottom!.points.some((q) => q[0] === p[0] && q[1] === p[1]));
    const meet = top!.at[top!.points.indexOf(shared[0]!)]! / top!.length;
    expect(meet).toBeGreaterThan(0.35);
    expect(meet).toBeLessThan(0.65);
  });

  it('makes Spiral Hill’s gloomlings a little less tough, so its long road is about as hard to hold', () => {
    expect(MAPS.river.toughness).toBe(1);
    expect(MAPS.twin.toughness).toBe(1);
    expect(MAPS.spiral.toughness).toBeLessThan(1);
    expect(MAPS.spiral.toughness).toBeGreaterThan(0.8);
  });

  it('measures how much road a tower sees, and sorts spots from the entrance to the lantern', () => {
    const map = MAPS.river;
    expect(pathInReach(map, map.spots[0]!, 5)).toBe(0);
    expect(pathInReach(map, map.spots[0]!, 30)).toBeGreaterThan(pathInReach(map, map.spots[0]!, 22));
    // Spot numbers follow the road (roughly: spots across the road from each other may swap), so Previous and Next walk along it.
    const order = map.spots.map((s) => spotProgress(map, s));
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]! - 0.1);
    expect(order[0]!).toBeLessThan(0.15);
    expect(order.at(-1)!).toBeGreaterThan(0.85);
  });
});

/* ------------------------------ gold and towers ------------------------------ */

describe('Lantern Guard gold, building and upgrading', () => {
  it('starts everyone with 50 gold and pays 20 for a right answer, 25 on a streak of three', () => {
    const h = guard();
    expect(h.view('a').you.gold).toBe(50);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ gold: 70, last: { text: '+20 gold' } });
    h.answer('a', 'right');
    expect(h.view('a').you.gold).toBe(90);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ gold: 115, last: { text: '+25 gold (streak bonus)' } });
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ gold: 115, last: { text: 'No gold this time' } });
    // The streak starts again.
    h.answer('a', 'right');
    expect(h.view('a').you.gold).toBe(135);
  });

  it('builds a tower on a free spot for its price, and refuses taken spots, short purses and unknown spots', () => {
    const h = guard({}, ['a', 'b']);
    expect(h.rt.act('a', { type: 'build', spot: 3, tower: 'spark' }).ok).toBe(true);
    expect(h.view('a').you.gold).toBe(10);
    expect(h.view('a').towers).toEqual([{ spot: 3, kind: 'spark', level: 1, by: 'a', defeats: 0, shot: null }]);
    expect(h.rt.act('b', { type: 'build', spot: 3, tower: 'spark' })).toMatchObject({ ok: false, message: 'Someone has just built on that spot.' });
    expect(h.rt.act('b', { type: 'build', spot: 4, tower: 'beam' })).toMatchObject({ ok: false, message: 'You need 25 more gold for a Beam tower.' });
    expect(h.rt.act('b', { type: 'build', spot: 40, tower: 'spark' })).toMatchObject({ ok: false, message: 'There is no spot there.' });
    expect(h.rt.act('b', { type: 'build', spot: 4, tower: 'cannon' }).ok).toBe(false);
    expect(h.view('b').you.gold).toBe(50);
  });

  it('lets anyone upgrade any tower: 80% of its price for level 2, 140% for level 3, and credits who paid', () => {
    expect([upgradeCost('spark', 1), upgradeCost('spark', 2), upgradeCost('spark', 3)]).toEqual([32, 56, null]);
    expect([upgradeCost('beam', 1), upgradeCost('beam', 2), upgradeCost('firework', 2)]).toEqual([60, 105, 154]);
    const h = guard({}, ['a', 'b']);
    h.rt.act('a', { type: 'build', spot: 5, tower: 'spark' });
    earn(h, 'b', 1);
    expect(h.rt.act('b', { type: 'upgrade', spot: 5, level: 2 }).ok).toBe(true);
    expect(h.view('b').you.gold).toBe(70 - 32);
    expect(h.feedTo('a')).toContain('B upgraded your Spark tower to level 2.');
    expect(h.feedTo('b')).not.toContain('B upgraded your Spark tower to level 2.');
    // Someone else got there first: the second press does not pay for level 3 by surprise.
    expect(h.rt.act('b', { type: 'upgrade', spot: 5, level: 2 })).toMatchObject({ ok: false, message: 'Someone has just upgraded that tower. Have another look.' });
    expect(h.rt.act('b', { type: 'upgrade', spot: 5, level: 3 })).toMatchObject({ ok: false, message: 'You need 18 more gold for that upgrade.' });
    earn(h, 'a', 3);
    expect(h.rt.act('a', { type: 'upgrade', spot: 5, level: 3 }).ok).toBe(true);
    expect(h.view('a').towers[0]).toMatchObject({ level: 3, by: 'a', ups: ['b', 'a'] });
    expect(h.rt.act('a', { type: 'upgrade', spot: 5, level: 3 })).toMatchObject({ ok: false, message: 'That tower is already at the top level.' });
    expect(h.rt.act('a', { type: 'upgrade', spot: 6, level: 2 })).toMatchObject({ ok: false, message: 'There is no tower on that spot.' });
  });

  it('makes every level hit harder and reach further, and Spark and Frost fire faster', () => {
    expect(towerStats('spark', 1)).toMatchObject({ damage: 6, every: 500, range: 22 });
    expect(towerStats('spark', 2)).toMatchObject({ damage: 9.3, every: 455, range: 23.8 });
    expect(towerStats('spark', 3)).toMatchObject({ damage: 14.4, every: 413, range: 25.7 });
    expect(towerStats('beam', 3)).toMatchObject({ damage: 67.3, every: 1600, range: 37.3 });
    expect(towerStats('frost', 1)).toMatchObject({ damage: 2, every: 1000, range: 20, slow: { by: 0.45, ms: 1600 } });
    expect(towerStats('firework', 1)).toMatchObject({ damage: 16, every: 2000, range: 26, splash: 12 });
  });

  it('counts guard points: 10 a right answer, 1 a gold spent, 3 a gloomling defeated and 30 a Gloom Lord', () => {
    const h = guard();
    earn(h, 'a', 2);
    h.rt.act('a', { type: 'build', spot: 2, tower: 'beam' });
    expect(h.view('a').you.points).toBe(2 * 10 + 75);
    const g = { stream: { correct: 4 }, spent: 100, defeats: 5, lords: 1 } as Parameters<typeof guardPoints>[0];
    expect(guardPoints(g)).toBe(40 + 100 + 4 * 3 + 30);
  });
});

/* ----------------------------------- waves ---------------------------------- */

describe('Lantern Guard waves and the battle', () => {
  it('sends the first wave after 15 seconds and then one every 28 seconds, ready or not', () => {
    const h = guard({ waves: 5, lives: 40 });
    earn(h, 'a', 30);
    const map = MAPS.river;
    const bySight = map.spots.map((_, i) => i).sort((x, y) => pathInReach(map, map.spots[y]!, 32) - pathInReach(map, map.spots[x]!, 32));
    for (const spot of bySight.slice(0, 10)) h.rt.act('a', { type: 'build', spot, tower: 'beam' });
    expect(h.view('a')).toMatchObject({ wave: 0, waves: 5, nextWaveAt: FIRST_WAVE_MS, next: { wave: 1, wisp: 8, shade: 0, brute: 0, lord: 0 } });
    until(h, FIRST_WAVE_MS);
    expect(h.view('a')).toMatchObject({ wave: 1, nextWaveAt: FIRST_WAVE_MS + WAVE_EVERY_MS });
    // The first Wisp sets off at once; the other seven follow over the next 12 seconds.
    expect(h.view('a').gloom).toHaveLength(1);
    expect(h.state().spawns).toHaveLength(7);
    until(h, FIRST_WAVE_MS + SPAWN_WINDOW_MS);
    expect(h.state().spawns).toHaveLength(0);
    until(h, FIRST_WAVE_MS + 4 * WAVE_EVERY_MS);
    expect(h.view('a')).toMatchObject({ wave: 5, nextWaveAt: null, next: null });
  });

  it('grows the waves: Shades from wave 2, Brutes from wave 3, a Gloom Lord every fifth wave', () => {
    const st = { bossEvery: '5', crowd: 'normal', waves: 10, endless: false };
    expect([1, 2, 3, 5, 10].map((w) => roster(w, st))).toEqual([
      { wisp: 8, shade: 0, brute: 0, lord: 0 },
      { wisp: 8, shade: 4, brute: 0, lord: 0 },
      { wisp: 9, shade: 5, brute: 1, lord: 0 },
      { wisp: 10, shade: 6, brute: 2, lord: 1 },
      { wisp: 12, shade: 9, brute: 4, lord: 1 },
    ]);
    expect(roster(6, { ...st, bossEvery: '3' }).lord).toBe(1);
    expect(roster(5, { ...st, bossEvery: '0' }).lord).toBe(0);
    expect(roster(10, { ...st, crowd: 'more' })).toEqual({ wisp: 17, shade: 13, brute: 6, lord: 1 });
    expect(roster(10, { ...st, crowd: 'fewer' }).lord).toBe(1);
    expect(roster(10, { ...st, crowd: 'fewer' }).wisp).toBeLessThan(roster(10, st).wisp);
    // The last wave always ends with a Gloom Lord when Lords are on, so every game finishes on its biggest moment.
    expect(roster(7, { ...st, waves: 7 }).lord).toBe(1);
    expect(roster(10, { ...st, bossEvery: '3' }).lord).toBe(1);
    expect(roster(10, { ...st, bossEvery: '0' }).lord).toBe(0);
    expect(roster(7, { ...st, waves: 7, endless: true }).lord).toBe(0);
    // Deep into an endless night the Gloom Lords come in pairs.
    expect(roster(25, { ...st, endless: true }).lord).toBe(2);
    expect(Object.keys(WAVE_MIX)).toEqual(['wisp', 'shade', 'brute']);
    expect(CROWD.normal).toBe(1);
    expect(CROWD.fewer).toBeLessThan(1);
    expect(CROWD.more).toBeGreaterThan(1);
    expect(waveHp(1)).toBe(1);
    expect(waveHp(2)).toBeCloseTo(1.28, 9);
    expect(waveHp(10)).toBeCloseTo(3.52, 9);
  });

  it('moves gloomlings by progress along the road at their own speed, so every map takes as long to cross', () => {
    for (const map of MAP_IDS) {
      const h = guard({ map });
      until(h, FIRST_WAVE_MS);
      const wisp = h.view('a').gloom[0];
      // Health also allows for the map: Spiral Hill's long road is harder to cover.
      const hp = Math.round(GLOOMLINGS.wisp.hp * roomFactor(1) * MAPS[map].toughness);
      expect(wisp).toMatchObject({ kind: 'wisp', p: 0, v: GLOOMLINGS.wisp.speed, hp, max: hp });
      until(h, FIRST_WAVE_MS + 1000);
      expect(h.view('a').gloom[0].p).toBeCloseTo(GLOOMLINGS.wisp.speed, 6);
    }
  });

  it('puts out a light for every Wisp that reaches the Great Lantern, and the gloom wins when the last goes out', () => {
    const h = guard({ lives: 5 });
    const arrives = FIRST_WAVE_MS + Math.ceil(1 / ((GLOOMLINGS.wisp.speed * TICK_MS) / 1000)) * TICK_MS;
    until(h, arrives - TICK_MS);
    expect(h.view('a').lights).toBe(5);
    until(h, arrives);
    expect(h.view('a').lights).toBe(4);
    until(h, 60_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results).toMatchObject({ outcome: 'coop-loss', summary: 'The gloom reached the Great Lantern on wave 1.' });
    expect(h.feed.map((f) => f.text)).toContain('The gloom reached the Great Lantern and its last light went out on wave 1.');
  });

  it('lets a Gloom Lord put out six lights at once', () => {
    const h = guard({ bossEvery: '3', crowd: 'fewer', lives: 40 });
    // A few Sparks stop the small gloomlings but cannot stop a Gloom Lord.
    earn(h, 'a', 12);
    const map = MAPS.river;
    const bySight = map.spots.map((_, i) => i).sort((x, y) => pathInReach(map, map.spots[y]!, 22) - pathInReach(map, map.spots[x]!, 22));
    for (const spot of bySight.slice(0, 3)) h.rt.act('a', { type: 'build', spot, tower: 'spark' });
    until(h, FIRST_WAVE_MS + 2 * WAVE_EVERY_MS);
    expect(h.feed.map((f) => f.text)).toContain('Wave 3: a Gloom Lord is coming!');
    until(h, FIRST_WAVE_MS + 2 * WAVE_EVERY_MS + SPAWN_WINDOW_MS + 41_000);
    expect(h.state().log.some((e: { kind: string; gloom?: string; lights?: number }) => e.kind === 'leak' && e.gloom === 'lord' && e.lights === 6)).toBe(true);
    expect(h.feed.map((f) => f.text)).toContain('A Gloom Lord reached the Great Lantern and put out 6 lights!');
  });

  it('fires a Spark every half second for 6 damage at the gloomling in front, and credits the defeat to its builder', () => {
    const h = guard();
    const spot = bestSpot('river');
    h.rt.act('a', { type: 'build', spot, tower: 'spark' });
    const shots: number[] = [];
    let hp: number[] = [];
    let defeated = false;
    for (let t = FIRST_WAVE_MS; t < FIRST_WAVE_MS + 16_000 && !defeated; t += TICK_MS) {
      until(h, t);
      const v = h.view('a');
      const shot = v.towers[0].shot;
      if (shot && shots.at(-1) !== shot.at) {
        shots.push(shot.at);
        hp.push(v.gloom[0]?.hp ?? 0);
      }
      defeated = v.towers[0].defeats > 0;
    }
    expect(defeated).toBe(true);
    // A wave-1 Wisp in a room of one takes four shots, half a second apart.
    expect(WISP_1).toBeGreaterThan(18);
    expect(WISP_1).toBeLessThanOrEqual(24);
    expect(shots.slice(0, 4).map((t) => t - shots[0]!)).toEqual([0, 500, 1000, 1500]);
    expect(hp.slice(0, 3)).toEqual([WISP_1 - 6, WISP_1 - 12, WISP_1 - 18]);
    expect(h.view('a').you).toMatchObject({ defeats: 1 });
    expect(h.view('a').you.points).toBe(40 + 3);
  });

  it('aims Beams at the toughest gloomling in reach, Frost at the front one not slowed yet, the rest at the front one', () => {
    // Nothing is shot before it walks onto the map.
    const edge = MAPS.river;
    const offMap = { g: { p: 0.01, hp: 10, road: 0, slowUntil: 0 }, at: pointAt(edge.paths[0]!, 0.01) };
    expect(offMap.at[0]).toBeLessThan(0);
    expect(pickTarget('beam', 99, [offMap], [10, 22], edge, 0)).toBeNull();
    const map = MAPS.river;
    const at = (p: number): Point => pointAt(map.paths[0]!, p);
    const spot = at(0.5).map((v, i) => v + (i ? 9 : 0)) as unknown as Point;
    const g = (p: number, hp: number, slowUntil = 0): { g: Target & { name: string }; at: Point } => ({ g: { p, hp, road: 0, slowUntil, name: `${p}` }, at: at(p) });
    const crowd = [g(0.45, 60), g(0.5, 200, 5000), g(0.55, 20, 5000), g(0.1, 999)];
    expect(pickTarget('spark', 22, crowd, spot, map, 1000)?.g.name).toBe('0.55');
    expect(pickTarget('firework', 26, crowd, spot, map, 1000)?.g.name).toBe('0.55');
    // The far one has the most health, but it is out of reach.
    expect(pickTarget('beam', 32, crowd, spot, map, 1000)?.g.name).toBe('0.5');
    expect(pickTarget('frost', 20, crowd, spot, map, 1000)?.g.name).toBe('0.45');
    // Everyone slowed: Frost keeps the front one slow.
    expect(pickTarget('frost', 20, crowd.slice(1, 3), spot, map, 1000)?.g.name).toBe('0.55');
    expect(pickTarget('spark', 22, [g(0.1, 50)], spot, map, 1000)).toBeNull();
    // Defeated gloomlings are not targets.
    expect(pickTarget('spark', 22, [g(0.55, 0), g(0.5, 10)], spot, map, 1000)?.g.name).toBe('0.5');
  });

  it('slows a gloomling by 45% with Frost, and two Frost towers do not slow it twice', () => {
    const map = MAPS.river;
    const near = map.spots.map((_, i) => i).filter((i) => distanceToPath(map.spots[i]!, map.paths[0]!) < 14 && spotProgress(map, map.spots[i]!) < 0.3);
    const h = guard();
    earn(h, 'a', 3);
    h.rt.act('a', { type: 'build', spot: near[0]!, tower: 'frost' });
    h.rt.act('a', { type: 'build', spot: near[1]!, tower: 'frost' });
    const speeds = new Set<number>();
    for (let t = FIRST_WAVE_MS; t < FIRST_WAVE_MS + 8000; t += TICK_MS) {
      until(h, t);
      for (const x of h.view('a').gloom) speeds.add(x.v);
    }
    expect([...speeds].sort()).toEqual([Math.round(GLOOMLINGS.wisp.speed * 0.55 * 1e5) / 1e5, GLOOMLINGS.wisp.speed].sort());
  });

  it('pays every connected guard 10 gold when a wave is over, and says whether any got through', () => {
    const h = guard({}, ['a', 'b']);
    earn(h, 'a', 12);
    for (const spot of [bestSpot('river'), bestSpot('river', 32)]) h.rt.act('a', { type: 'build', spot, tower: 'beam' });
    for (let i = 0; i < 8; i++) {
      const g = h.view('a').you.gold as number;
      const free = MAPS.river.spots.map((_, s) => s).filter((s) => !h.view('a').towers.some((t: { spot: number }) => t.spot === s));
      if (g < 40) break;
      h.rt.act('a', { type: 'build', spot: free.sort((x, y) => pathInReach(MAPS.river, MAPS.river.spots[y]!, 22) - pathInReach(MAPS.river, MAPS.river.spots[x]!, 22))[0]!, tower: 'spark' });
    }
    h.rt.setConnected('b', false);
    const before = { a: h.view('a').you.gold, b: h.view('b').you.gold };
    until(h, FIRST_WAVE_MS + WAVE_EVERY_MS);
    expect(h.view('a').held).toBe(1);
    expect(h.view('a').you.gold).toBe(before.a + 10);
    expect(h.view('b').you.gold).toBe(before.b);
    expect(h.feed.map((f) => f.text)).toContain('Wave 1 held! Every guard gets 10 gold.');

    // With no towers at all the wave still ends, but not "held" without a scratch.
    const bare = guard({ lives: 20 });
    until(bare, FIRST_WAVE_MS + WAVE_EVERY_MS + 2000);
    expect(bare.view('a').lights).toBe(12);
    expect(bare.feed.map((f) => f.text)).toContain('Wave 1 is over, with 8 lights lost. Every guard gets 10 gold.');
  });
});

/* ------------------------------- the Great Lantern ------------------------------ */

describe('Lantern Guard flare', () => {
  it('takes 25 gold a tap, needs 60 for every connected guard, and counts the gold as spent', () => {
    expect(FLARE_PER_GUARD).toBe(60);
    expect([1, 4, 30].map(flareCost)).toEqual([60, 240, 1800]);
    const h = guard({}, ['a', 'b']);
    expect(h.view('a').flare).toMatchObject({ pot: 0, cost: 120, charged: false, count: 0 });
    expect(h.rt.act('a', { type: 'feed' }).ok).toBe(true);
    expect(h.view('a').flare.pot).toBe(25);
    expect(h.view('a').you).toMatchObject({ gold: 25, fed: 25, points: 25 });
    h.rt.act('a', { type: 'feed' });
    expect(h.rt.act('a', { type: 'feed' })).toMatchObject({ ok: false, message: 'You need some gold to feed the Great Lantern.' });
    earn(h, 'b', 3);
    h.rt.act('b', { type: 'feed' });
    h.rt.act('b', { type: 'feed' });
    expect(h.view('b').flare).toMatchObject({ pot: 100, charged: false });
    // Only what the lantern still needs is taken.
    h.rt.act('b', { type: 'feed' });
    expect(h.view('b').flare).toMatchObject({ pot: 120, charged: true });
    expect(h.view('b').you.gold).toBe(115 - 70);
    expect(h.rt.act('b', { type: 'feed' })).toMatchObject({ ok: false, message: 'The Great Lantern is full. It will flare when the gloom crowds the road.' });
    expect(h.feed.map((f) => f.text)).toContain('The Great Lantern is full! It will flare when the gloom crowds the road.');
  });

  it('flares once five gloomlings are on the road, burning 35% of every one’s health (10% of a Gloom Lord’s)', () => {
    expect([FLARE_BURN, FLARE_BURN_BOSS]).toEqual([0.35, 0.1]);
    const h = guard({}, ['a']);
    earn(h, 'a', 1);
    for (let i = 0; i < 3; i++) h.rt.act('a', { type: 'feed' });
    expect(h.view('a').flare).toMatchObject({ pot: 60, charged: true });
    expect(h.view('a').you.gold).toBe(10);
    // Four Wisps on the road: still waiting.
    let v = h.view('a');
    while (v.gloom.length < 4) {
      h.tick(TICK_MS);
      v = h.view('a');
    }
    expect(v.flare.count).toBe(0);
    while (h.view('a').flare.count === 0) h.tick(TICK_MS);
    v = h.view('a');
    expect(v.gloom).toHaveLength(5);
    // Each loses 35% of its health (rounded), and is slowed.
    const left = WISP_1 - Math.round(WISP_1 * FLARE_BURN);
    expect(v.gloom.map((x: { hp: number }) => x.hp)).toEqual([left, left, left, left, left]);
    expect(v.gloom.every((x: { v: number }) => x.v < GLOOMLINGS.wisp.speed)).toBe(true);
    expect(v.flare).toMatchObject({ pot: 0, charged: false, count: 1, cost: 60 });
    expect(h.feed.map((f) => f.text)).toContain('The Great Lantern flared! Thanks to A.');
  });
});

/* ------------------------------ the room's size ------------------------------ */

describe('Lantern Guard room toughness', () => {
  it('makes gloomlings tougher with every connected player, levelling off once a room can fill the map', () => {
    for (const [n, v] of ROOM_TOUGHNESS) expect(roomFactor(n)).toBeCloseTo(v, 9);
    // Straight lines between the measured points, and the last value beyond them.
    expect(roomFactor(3)).toBeCloseTo((roomFactor(2) + roomFactor(4)) / 2, 9);
    expect(roomFactor(200)).toBe(roomFactor(40));
    expect(roomFactor(0)).toBe(roomFactor(1));
    // About 0.7 a player while a room cannot yet fill the map.
    for (const n of [1, 2, 4, 8]) expect(roomFactor(n) / n).toBeGreaterThan(0.65);
    for (const n of [1, 2, 4, 8, 12]) expect(roomFactor(n) / n).toBeLessThan(0.8);
    const curve = [1, 2, 4, 8, 12].map(roomFactor);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThan(curve[i - 1]!);
    // A big room never gets an easier gloom than a room half its size could have faced at its peak.
    expect(roomFactor(40)).toBeGreaterThan(roomFactor(12) * 0.85);
  });

  it('sets health from the connected players and the difficulty when each gloomling sets off', () => {
    const wisp = (settings: Record<string, unknown>, players: string[], off: string[] = []) => {
      const h = guard(settings, players);
      for (const id of off) h.rt.setConnected(id, false);
      until(h, FIRST_WAVE_MS);
      return h.view(players[0]!).gloom[0].max as number;
    };
    expect(wisp({}, ['a'])).toBe(Math.round(30 * roomFactor(1)));
    expect(wisp({}, ['a', 'b', 'c', 'd'])).toBe(Math.round(30 * roomFactor(4)));
    expect(wisp({}, ['a', 'b', 'c', 'd'], ['c', 'd'])).toBe(Math.round(30 * roomFactor(2)));
    expect(DIFFICULTY_HP).toEqual({ easy: 0.75, normal: 1, hard: 1.15 });
    expect(wisp({ difficulty: 'easy' }, ['a'])).toBe(Math.round(30 * roomFactor(1) * 0.75));
    expect(wisp({ difficulty: 'hard' }, ['a'])).toBe(Math.round(30 * roomFactor(1) * 1.15));
    // Frost and Fire alone deal less damage for their gold, so its gloomlings are weaker; a big room's endless night too.
    expect(wisp({ towers: 'frost-fire' }, ['a'])).toBe(Math.round(30 * roomFactor(1) * TOWER_SET_TOUGHNESS['frost-fire']![0]![1]));
    expect(wisp({ endless: true }, ['a', 'b', 'c', 'd'])).toBe(Math.round(30 * roomFactor(4) * variantFactor({ towers: 'all', endless: true }, 4)));
  });

  it('weakens the gloom for Frost and Fire and for a big room on an endless night, by the room size', () => {
    const plain = { towers: 'all', endless: false };
    const ff = { towers: 'frost-fire', endless: false };
    const night = { towers: 'all', endless: true };
    for (const n of [0, 1, 4, 12, 40]) expect(variantFactor(plain, n)).toBe(1);
    for (const [n, v] of TOWER_SET_TOUGHNESS['frost-fire']!) expect(variantFactor(ff, n)).toBeCloseTo(v, 9);
    for (const [n, v] of ENDLESS_TOUGHNESS) expect(variantFactor(night, n)).toBeCloseTo(v, 9);
    expect(variantFactor(ff, 200)).toBe(variantFactor(ff, 30));
    expect(variantFactor(night, 200)).toBe(variantFactor(night, 12));
    // A small group can afford only a few 110-gold Fireworks, so its gloom is far weaker; a big class's bursts fill the road.
    expect(variantFactor(ff, 1)).toBeLessThan(0.75);
    expect(variantFactor(ff, 1)).toBeLessThan(variantFactor(ff, 4));
    expect(variantFactor(ff, 4)).toBeLessThan(variantFactor(ff, 12));
    // A lone guard's endless night is as tough as a normal game; a big room's map stops growing, so its gloom is weaker.
    expect(variantFactor(night, 1)).toBe(1);
    expect(variantFactor(night, 12)).toBeLessThan(0.9);
    for (const n of [2, 4, 8, 12]) expect(variantFactor(night, n)).toBeLessThanOrEqual(variantFactor(night, n / 2));
    expect(variantFactor({ towers: 'frost-fire', endless: true }, 12)).toBeCloseTo(variantFactor(ff, 12) * variantFactor(night, 12), 9);
  });
});

/* --------------------------- players coming and going --------------------------- */

describe('Lantern Guard players coming and going', () => {
  it('gives a late joiner 50 gold and a question, and keeps a leaver’s towers and points', () => {
    const h = guard({}, ['a', 'b']);
    h.rt.act('a', { type: 'build', spot: bestSpot('river'), tower: 'spark' });
    until(h, 20_000);
    expect(h.rt.addPlayer({ id: 'c', name: 'C', teamId: null, isBot: false }).ok).toBe(true);
    expect(h.view('c').you).toMatchObject({ gold: 50, built: 0 });
    expect(h.view('c').you.question).not.toBeNull();
    expect(h.rt.act('c', { type: 'build', spot: 0, tower: 'spark' }).ok).toBe(true);
    h.rt.removePlayer('a');
    expect(h.view('b').towers.map((t: { by: string }) => t.by)).toEqual(['a', 'c']);
    until(h, 45_000);
    h.rt.end('host');
    const a = h.rt.results!.standings.find((s) => s.playerId === 'a')!;
    expect(a).toMatchObject({ left: true, label: `${a.score} guard points` });
    expect(a.score).toBeGreaterThanOrEqual(40);
    expect(h.rt.results!.standings).toHaveLength(3);
  });

  it('stops the battle while the game is paused', () => {
    const h = guard();
    until(h, FIRST_WAVE_MS + 2000);
    const before = h.view('a').gloom.map((g: { p: number }) => g.p);
    h.rt.pause();
    h.tick(10_000);
    expect(h.view('a').gloom.map((g: { p: number }) => g.p)).toEqual(before);
    h.rt.resume();
    h.tick(1000);
    expect(h.view('a').gloom[0].p).toBeGreaterThan(before[0]);
  });

  it('plays to the end with one player, with bots on every map', () => {
    for (const map of MAP_IDS) {
      const r = simulateGame({ modeId: 'lantern-guard', questions: MIXED_SET, players: 1, seed: 8, settings: { map } });
      expect(r.errors).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.results?.endedBy).toBe('mode');
    }
  });
});

/* ----------------------------------- endings ---------------------------------- */

describe('Lantern Guard endings and results', () => {
  it('wins for everyone when the last wave is held', () => {
    const h = guard({ waves: 5 }, ['a', 'b']);
    earn(h, 'a', 40);
    const map = MAPS.river;
    const bySight = map.spots.map((_, i) => i).sort((x, y) => pathInReach(map, map.spots[y]!, 32) - pathInReach(map, map.spots[x]!, 32));
    for (const spot of bySight.slice(0, 12)) h.rt.act('a', { type: 'build', spot, tower: 'beam' });
    until(h, 300_000);
    expect(h.rt.results?.outcome).toBe('coop-win');
    expect(lastSummary(h)).toMatch(/^The festival is safe! 5 of 5 waves held with \d+ lights left\.$/);
    const [first, second] = h.rt.results!.standings;
    expect(first).toMatchObject({ playerId: 'a', rank: 1 });
    expect(first!.label).toMatch(/^\d+ guard points$/);
    // B never answered or spent: unspent gold earns no guard points.
    expect(second).toMatchObject({ playerId: 'b', score: 0, label: '0 guard points' });
    expect(h.feed.map((f) => f.text).some((t) => /^The festival is safe! Every wave was held with \d+ lights still burning\.$/.test(t))).toBe(true);
  });

  it('ends at the time limit: the class wins if the lantern is still burning', () => {
    const h = guard({ waves: 20 }, ['a'], { timeLimitSec: 60 });
    until(h, 61_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.outcome).toBe('coop-win');
    expect(lastSummary(h)).toMatch(/^Time ran out with 1 of 20 waves held and \d+ lights left\.$/);
  });

  it('never runs out of waves on an endless night, and scores the waves held', () => {
    const v = pick('lantern-guard-endless');
    const h = drive(lanternGuard, { players: ['a'], questions: TRUE_SET, variant: v, settings: { lives: 40 }, common: { timeLimitSec: 100 } });
    until(h, 99_000);
    expect(h.view('a')).toMatchObject({ waves: null });
    expect(h.view('a').nextWaveAt).not.toBeNull();
    until(h, 101_000);
    expect(h.rt.results?.outcome).toBe('coop-win');
    expect(lastSummary(h)).toMatch(/^Dawn came with \d+ waves? held and \d+ lights? left\.$/);
    const lost = drive(lanternGuard, { players: ['a'], questions: TRUE_SET, variant: v, settings: { lives: 5 } });
    until(lost, 120_000);
    expect(lost.rt.results).toMatchObject({ outcome: 'coop-loss', summary: 'The gloom reached the Great Lantern on wave 1, after 0 waves held.' });
    // With no time limit set, an endless night still ends: it falls back to the mode's default.
    expect(drive(lanternGuard, { players: ['a'], questions: TRUE_SET, variant: v, common: { timeLimitSec: 0 } }).view('a').endsAt).toBe(meta.common.defaults.timeLimitSec! * 1000);
  });

  it('gives a neutral summary when the host ends the game early', () => {
    const h = guard();
    until(h, 20_000);
    h.rt.end('host');
    expect(h.rt.results).toMatchObject({ outcome: 'coop-loss', summary: 'The game ended on wave 1 with 20 lights left.', endedBy: 'host' });
  });
});

/* ------------------------------------ views ----------------------------------- */

describe('Lantern Guard views', () => {
  it('never shows an answer, and keeps map geometry out of the view', () => {
    const h = guard({}, ['a', 'b']);
    h.rt.act('a', { type: 'build', spot: bestSpot('river'), tower: 'spark' });
    until(h, FIRST_WAVE_MS + 5000);
    for (const v of [h.view('a'), h.view('b'), h.host()]) {
      expect(findAnswerLeaks(v)).toEqual([]);
      const json = JSON.stringify(v);
      expect(json).not.toContain('"spots"');
      expect(json).not.toContain('"paths"');
      // No coordinate lists: the screens take every shape from the maps module.
      expect(json).not.toMatch(/\[\[-?\d/);
    }
    expect(h.host().you).toBeNull();
    expect(h.host().log.length).toBeGreaterThan(0);
    expect(h.view('a').log).toEqual([]);
    expect(h.view('a').you).toMatchObject({ id: 'a', gold: 10, built: 1 });
  });

  it('stays under 8 KB with 40 players in the middle of a big wave', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i + 1}`);
    const h = guard({ crowd: 'more' }, ids);
    const map = MAPS.river;
    ids.forEach((id, i) => {
      earn(h, id, 3);
      if (i < map.spots.length) h.rt.act(id, { type: 'build', spot: i, tower: (['spark', 'beam', 'frost', 'firework'] as const)[i % 4] });
    });
    until(h, FIRST_WAVE_MS + 3 * WAVE_EVERY_MS + 10_000);
    const player = JSON.stringify(h.view('p1')).length;
    const host = JSON.stringify(h.host()).length;
    expect(h.view('p1').gloom.length).toBeGreaterThan(10);
    expect(player).toBeLessThan(8000);
    expect(host).toBeLessThan(8000);
  });
});

/* ------------------------------------ bots ------------------------------------ */

describe('Lantern Guard bots', () => {
  it('build a Spark first, on the free spot that sees the most road', () => {
    const h = guard();
    expect(botSpend(h.view('a'), 'a')).toEqual({ type: 'build', spot: bestSpot('river'), tower: 'spark' });
    expect(botTowerChoice(['spark', 'beam', 'frost', 'firework'], 0, 'p1', 0)).toBe('spark');
    // In Frost and Fire the first towers are Fireworks: a Frost tower alone slows the gloom but cannot stop it.
    expect(botTowerChoice(['frost', 'firework'], 0, 'p1', 0)).toBe('firework');
    expect(botSpend(guard(pick('lantern-guard-frost-fire').settings).view('a'), 'a')).toMatchObject({ type: 'build', tower: 'firework' });
    // Once the room has a few towers, each bot follows its own mix, so a room of bots builds every kind.
    const kinds = new Set(Array.from({ length: 12 }, (_, i) => botTowerChoice(['spark', 'beam', 'frost', 'firework'], i % 3, `p${i}`, 6)));
    expect([...kinds].sort()).toEqual(['beam', 'firework', 'frost', 'spark']);
    expect(new Set(Array.from({ length: 12 }, (_, i) => botTowerChoice(['frost', 'firework'], i, 'p1', 9)))).toEqual(new Set(['frost', 'firework']));
  });

  it('upgrade the towers nearest the middle once the spots run out, then feed the Great Lantern', () => {
    const map = MAPS.river;
    const full = (level: number, gold: number) => ({
      map: 'river',
      allowed: ['spark', 'beam', 'frost', 'firework'],
      result: null,
      flare: { charged: false },
      towers: map.spots.map((_, spot) => ({ spot, kind: 'spark', level })),
      you: { id: 'p1', gold, built: 3 },
    });
    const middle = map.spots.map((_, i) => i).reduce((a, b) => (Math.abs(spotProgress(map, map.spots[b]!) - 0.5) < Math.abs(spotProgress(map, map.spots[a]!) - 0.5) ? b : a));
    expect(botSpend(full(1, 100), 'p1')).toEqual({ type: 'upgrade', spot: middle, level: 2 });
    expect(botSpend(full(1, 10), 'p1')).toBeNull();
    expect(botSpend(full(3, 30), 'p1')).toEqual({ type: 'feed' });
    expect(botSpend({ ...full(3, 30), flare: { charged: true } }, 'p1')).toBeNull();
  });

  it('win with sharp bots and lose with hopeless ones', () => {
    const play = (skill: number) => simulateGame({ modeId: 'lantern-guard', questions: MIXED_SET, players: 4, skill, seed: 13 });
    const sharp = play(0.95);
    expect(sharp.errors).toEqual([]);
    expect(sharp.results?.outcome).toBe('coop-win');
    expect(play(0.1).results?.outcome).toBe('coop-loss');
  });
});

/* ---------------------------------- variants ---------------------------------- */

describe('Lantern Guard variants', () => {
  it('changes the battle in a way players notice', () => {
    const boss = guard(pick('lantern-guard-boss-rush').settings);
    // Fewer small gloomlings than the 8 Wisps a normal first wave brings.
    expect(boss.view('a').next.wisp).toBeLessThan(8);
    const rush = { waves: 10, endless: false, ...pick('lantern-guard-boss-rush').settings } as { bossEvery: string; crowd: string; waves: number; endless: boolean };
    expect([3, 6, 9, 10].map((w) => roster(w, rush).lord)).toEqual([1, 1, 1, 1]);
    const ff = guard(pick('lantern-guard-frost-fire').settings);
    expect(ff.view('a').allowed).toEqual(['frost', 'firework']);
    // Everyone can still build a tower that fights at once: the starting gold covers a Firework.
    expect(firstFighter(['frost', 'firework'])).toBe('firework');
    expect(ff.view('a').you.gold).toBe(TOWERS.firework.cost);
    expect(pick('lantern-guard-frost-fire').meta.changes).toContain(`starts with ${TOWERS.firework.cost} gold`);
    expect(firstFighter(['spark', 'beam', 'frost', 'firework'])).toBe('spark');
    expect(startingGold(['spark', 'beam', 'frost', 'firework'])).toBe(50);
    expect(ff.rt.act('a', { type: 'build', spot: 0, tower: 'firework' }).ok).toBe(true);
    expect(ff.rt.act('a', { type: 'build', spot: 0, tower: 'spark' })).toMatchObject({ ok: false, message: 'That tower is not used in this game.' });
    expect(guard(pick('lantern-guard-fragile').settings).view('a')).toMatchObject({ lights: 8, maxLights: 8 });
    expect(guard(pick('lantern-guard-twin-gates').settings).view('a').map).toBe('twin');
    const twin = guard(pick('lantern-guard-twin-gates').settings);
    until(twin, FIRST_WAVE_MS + 3000);
    expect(new Set(twin.view('a').gloom.map((g: { road: number }) => g.road))).toEqual(new Set([0, 1]));
  });
});

/* ------------------------------------ luck ------------------------------------ */

describe('Lantern Guard has no luck in the battle', () => {
  it('plays out the same whatever the seed when players do the same things', () => {
    // Nothing in the battle is random (so there are no odds to show): the seed only shuffles the questions.
    const run = (seed: number) => {
      const h = drive(lanternGuard, { players: ['a', 'b'], questions: TRUE_SET, seed, shuffle: true });
      earn(h, 'a', 6);
      h.rt.act('a', { type: 'build', spot: bestSpot('river'), tower: 'beam' });
      h.rt.act('b', { type: 'build', spot: 7, tower: 'frost' });
      until(h, 120_000);
      const v = h.view('a');
      return JSON.stringify({ lights: v.lights, held: v.held, towers: v.towers, gloom: v.gloom, gold: v.you.gold });
    };
    expect(run(1)).toBe(run(2));
    expect(run(3)).toBe(run(1));
  });

  it('keeps the rules in step with the numbers the game plays by', () => {
    const rules = meta.rules.join(' ');
    for (const t of Object.values(TOWERS)) expect(rules).toContain(String(t.cost));
    expect(rules).toContain('20 gold, or 25 on a streak of 3');
    expect(rules).toContain('first after 15 seconds, then one every 28 seconds');
    expect(rules).toContain('6 for a Gloom Lord');
  });
});
