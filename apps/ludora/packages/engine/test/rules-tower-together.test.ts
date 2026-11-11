import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { towerTogether } from '../src/modes/tower-together/index.ts';
import { GUST_ODDS, GUST_TIMING, LEVERAGE, MAX_HOLD, MAX_SWAY, PIECES, POINTS, QUIET_END_SEC, SETTLE, STEADY_MS, STRENGTHS, WARN_SEC, braceGap, variants } from '../src/modes/tower-together/meta.ts';
import { gustOdds, leverage, pickGust, pieceEffect, starsFor, swayFor, targetFloors, topples, towerSway } from '../src/modes/tower-together/odds.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { sampleTower, simulateTower } from '../src/testing/tower-sim.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Tower Together: the conformance checks every self-paced catalogue mode
 * passes, then the rules, driven through a real GameRuntime on a fake clock.
 * Every question is a true statement, so `right` answers true. Most tests
 * build in calm air (no gusts) unless they are about the wind.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

function build(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number; variantId?: string } = {}) {
  return drive(towerTogether, {
    players: o.players ?? ['a', 'b'],
    questions: TRUE_SET,
    ...(o.teams !== undefined ? { teams: o.teams } : {}),
    seed: o.seed ?? 42,
    common: o.common ?? {},
    ...(o.variantId ? { variant: variant(o.variantId) } : {}),
    settings: { ...(o.variantId ? {} : { gusts: 'calm' }), ...o.settings },
  });
}
const tower = (h: Driven, id = 'class') => h.state().towers[id];
const builder = (h: Driven, id: string) => h.state().builders[id];
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) {
    if (!h.view(id).you.question) h.tick(STEADY_MS);
    h.answer(id, 'right');
  }
};
const place = (h: Driven, id: string, kind: 'timber' | 'stone' | 'lantern') => h.rt.act(id, { type: 'place', kind });
/** Earn a piece and place it. */
const put = (h: Driven, id: string, kind: 'timber' | 'stone' | 'lantern') => {
  if (builder(h, id).held < 1) earn(h, id, 1);
  const r = place(h, id, kind);
  expect(r.ok, r.ok ? '' : r.message).toBe(true);
};
/** What the gauge shows for a tower, worked out as the view does. */
const gauge = (h: Driven, id = 'class') => {
  const t = tower(h, id);
  return towerSway({ build: t.build, unbraced: t.height - t.braceAt, target: t.target });
};
const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

describe('Tower Together: conformance', () => {
  const sim = (o: Parameters<typeof simulateGame>[0] extends infer T ? Partial<T> : never) => simulateGame({ modeId: 'tower-together', mode: towerTogether, questions: MIXED_SET, players: 4, ...o });

  it('has the catalogue metadata, settings and variants the registry needs', () => {
    const m = towerTogether.meta;
    expect(m.pacing).toBe('self');
    expect(m.stage).toBe('3d');
    expect(m.status).toBe('playable');
    expect(m.questionTypes).not.toContain('flashcard');
    expect(variants.length).toBeGreaterThanOrEqual(3);
    const keys = new Set(towerTogether.settings.map((f) => f.key));
    for (const v of variants) {
      expect(v.meta.id.startsWith('tower-together-')).toBe(true);
      for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id}: ${k}`).toBe(true);
      expect(parseSettings(towerTogether.settings, v.settings)).toMatchObject(v.settings ?? {});
    }
  });

  for (const players of [1, 4, 12]) {
    it(`plays to dawn with ${players} player${players === 1 ? '' : 's'}`, () => {
      const r = sim({ players, seed: players * 13 });
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
      expect(r.results?.endedBy).toBe('mode');
      expect(r.results?.standings).toHaveLength(players);
      expect(r.results?.standings[0]?.rank).toBe(1);
      expect(['coop-win', 'coop-loss']).toContain(r.results?.outcome);
      expect(r.gameMs).toBeGreaterThanOrEqual(360_000);
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
    expect(a.results?.standings.map((s) => [s.playerId, s.score])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score]));
    expect(a.results?.summary).toBe(b.results?.summary);
  });

  for (const v of variants) {
    it(`variant ${v.meta.title} plays to dawn with bots, alone and with churn`, () => {
      for (const r of [sim({ variantId: v.meta.id, players: 1, seed: 23 }), sim({ variantId: v.meta.id, players: 5, seed: 41, churn: true, pauseAt: 15_000 })]) {
        expect(problems(r)).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.leaks).toEqual([]);
      }
    });
  }

  it('keeps a player’s view small with 40 in the room and a tall tower', () => {
    const h = build({ players: Array.from({ length: 40 }, (_, i) => `p${i}`) });
    for (let i = 0; i < 400; i++) put(h, `p${i % 40}`, h.view('p0').towers[0].braceNeeds === 0 ? 'lantern' : gauge(h) > 50 ? 'stone' : 'timber');
    expect(tower(h).height).toBeGreaterThan(400);
    expect(JSON.stringify(h.view('p0')).length).toBeLessThan(8 * 1024);
  });
});

describe('Tower Together: pieces', () => {
  it('gives a piece for a right answer, none for a wrong one, and holds at most three', () => {
    const h = build();
    h.answer('a', 'wrong');
    expect(builder(h, 'a').held).toBe(0);
    expect(h.view('a').you.question).toBeNull();
    h.tick(STEADY_MS);
    earn(h, 'a', 2);
    expect(builder(h, 'a').held).toBe(2);
    earn(h, 'a', 3);
    expect(builder(h, 'a').held).toBe(MAX_HOLD);
    expect(h.view('a').you.last.text).toContain('hands are full');
  });

  it('holds the next question back for a moment after a wrong answer, and costs nothing else', () => {
    const h = build();
    earn(h, 'a', 1);
    h.answer('a', 'wrong');
    expect(builder(h, 'a').held).toBe(1);
    expect(h.view('a').you.steadyUntil).toBe(h.rt.gameNow() + STEADY_MS);
    // A held piece can still go on meanwhile.
    expect(place(h, 'a', 'stone').ok).toBe(true);
    h.tick(STEADY_MS - 1);
    expect(h.view('a').you.question).toBeNull();
    h.tick(1);
    expect(h.view('a').you.question).not.toBeNull();
  });

  it('refuses to place with nothing in hand', () => {
    const h = build();
    const r = place(h, 'a', 'stone');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toMatch(/no pieces/);
  });

  it('timber adds two floors and sway, stone one floor and steadies, as the buttons print', () => {
    const h = build({ players: ['a'] });
    const t0 = tower(h);
    const target = t0.target;
    const timber = h.view('a').you.effects.find((e: any) => e.kind === 'timber');
    earn(h, 'a', 1);
    const shown = h.view('a').you.effects.find((e: any) => e.kind === 'timber');
    expect(shown).toMatchObject({ floors: 2, ok: true });
    expect(timber.after).toBe(shown.after);
    put(h, 'a', 'timber');
    expect(tower(h).height).toBe(2);
    expect(tower(h).build).toBe(PIECES.timber.sway);
    // The gauge adds the leverage of two unbraced floors.
    expect(gauge(h)).toBeCloseTo(PIECES.timber.sway + (LEVERAGE * 2) / target, 1);
    expect(gauge(h)).toBe(shown.after);
    const stone = h.view('a').you.effects.find((e: any) => e.kind === 'stone');
    put(h, 'a', 'stone');
    expect(tower(h).height).toBe(3);
    expect(tower(h).build).toBe(PIECES.timber.sway + PIECES.stone.sway);
    expect(gauge(h)).toBe(stone.after);
    expect(stone.sway).toBeLessThan(0);
  });

  it('moves the gauge 1/n as much for each piece in a crew of n, so any class size moves it at the same pace', () => {
    expect(swayFor('timber', 1)).toBe(PIECES.timber.sway);
    expect(swayFor('timber', 10)).toBeCloseTo(PIECES.timber.sway / 10, 1);
    expect(swayFor('stone', 30)).toBeCloseTo(PIECES.stone.sway / 30, 1);
    const h = build({ players: Array.from({ length: 10 }, (_, i) => `p${i}`) });
    put(h, 'p0', 'timber');
    expect(tower(h).build).toBeCloseTo(PIECES.timber.sway / 10, 1);
  });

  it('a lantern brace adds no height, takes the leverage away, and needs enough floors above the last one', () => {
    const h = build({ players: ['a'] });
    const gap = braceGap(tower(h).target);
    earn(h, 'a', 1);
    const r = place(h, 'a', 'lantern');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toMatch(new RegExp(`needs ${gap} more floors`));
    expect(h.view('a').you.effects.find((e: any) => e.kind === 'lantern')).toMatchObject({ ok: false });
    while (tower(h).height < gap) put(h, 'a', tower(h).build > 40 ? 'stone' : 'timber');
    const before = gauge(h);
    put(h, 'a', 'lantern');
    expect(tower(h).height).toBeGreaterThanOrEqual(gap);
    expect(tower(h).braceAt).toBe(tower(h).height);
    expect(gauge(h)).toBeCloseTo(towerSway({ build: tower(h).build, unbraced: 0, target: tower(h).target }), 1);
    expect(gauge(h)).toBeLessThan(before);
    // Straight after a brace, another needs the whole gap again.
    expect(h.view('a').towers[0].braceNeeds).toBe(gap);
  });

  it('refuses timber once the tower would sway past the top of the gauge, and says to steady it', () => {
    const h = build({ players: ['a'] });
    let refused = '';
    for (let i = 0; i < 30 && !refused; i++) {
      earn(h, 'a', 1);
      const r = place(h, 'a', 'timber');
      if (!r.ok) refused = r.message;
    }
    expect(refused).toMatch(/Steady it with stone/);
    expect(gauge(h)).toBeLessThanOrEqual(MAX_SWAY);
    expect(place(h, 'a', 'stone').ok).toBe(true);
  });

  it('works out effects with leverage the same way the server applies them', () => {
    const t = { build: 20, unbraced: 10, target: 100, crew: 4 };
    expect(leverage(10, 100)).toBe(LEVERAGE / 10);
    const e = pieceEffect('timber', t);
    expect(e.next).toEqual({ build: 20 + PIECES.timber.sway / 4, unbraced: 12 });
    expect(e.after).toBeCloseTo(20 + PIECES.timber.sway / 4 + (LEVERAGE * 12) / 100, 1);
    expect(pieceEffect('lantern', t).after).toBe(20);
    expect(pieceEffect('stone', { ...t, build: 0, unbraced: 0 }).after).toBeCloseTo(LEVERAGE / 100, 1);
  });
});

describe('Tower Together: gusts and falls', () => {
  it(`announces each gust ${WARN_SEC} seconds ahead with its strength, on a fixed schedule`, () => {
    const h = build({ settings: { gusts: 'normal' } });
    const first = GUST_TIMING.normal.firstSec * 1000;
    const start = h.rt.gameNow();
    expect(h.view('a').gust).toMatchObject({ landsAt: start + first, announced: false, strength: null, limit: null });
    expect(h.view('a').odds.map((o: any) => o.chance)).toEqual([GUST_ODDS.normal.breeze, GUST_ODDS.normal.gust, GUST_ODDS.normal.gale]);
    h.tick(first - WARN_SEC * 1000);
    const g = h.view('a').gust;
    expect(g.announced).toBe(true);
    expect(Object.keys(STRENGTHS)).toContain(g.strength);
    expect(g.limit).toBe(STRENGTHS[g.strength as keyof typeof STRENGTHS].limit);
    expect(h.host().gust.strength).toBe(g.strength);
    expect(h.feed.at(-1)!.text).toMatch(new RegExp(`in ${WARN_SEC} seconds`));
    h.tick(WARN_SEC * 1000);
    expect(h.view('a').towers[0].gust).toMatchObject({ strength: g.strength, held: true });
    expect(h.view('a').gust.landsAt).toBe(start + first + GUST_TIMING.normal.everySec * 1000);
  });

  it('lands no gust in the last seconds before dawn, and none at all in calm air', () => {
    const h = build({ settings: { gusts: 'storm' }, common: { timeLimitSec: 120 } });
    const lands: number[] = [];
    const start = h.rt.gameNow();
    for (let i = 0; i < 130; i++) {
      const g = h.view('a')?.gust;
      if (g && !lands.includes(g.landsAt)) lands.push(g.landsAt);
      h.tick(1000);
    }
    expect(lands.map((t) => (t - start) / 1000)).toEqual([30, 60, 90]);
    expect(Math.max(...lands) - start).toBeLessThanOrEqual(120_000 - QUIET_END_SEC * 1000);
    const calm = build();
    expect(calm.view('a').gust).toBeNull();
    expect(calm.view('a').odds).toEqual([]);
  });

  for (const wind of ['normal', 'storm'] as const) {
    it(`draws ${wind} gust strengths with the printed chances over many seeded trials`, () => {
      const odds = gustOdds(wind);
      expect(odds.reduce((n, o) => n + o.chance, 0)).toBe(100);
      const rng = createRng(wind.length * 97);
      const n = 30_000;
      const seen: Record<string, number> = { breeze: 0, gust: 0, gale: 0 };
      for (let i = 0; i < n; i++) seen[pickGust(odds, rng.next())]!++;
      for (const o of odds) expect(Math.abs((seen[o.strength]! / n) * 100 - o.chance), o.strength).toBeLessThan(1);
    });
  }

  it('draws real games’ gusts with the printed chances too', () => {
    const seen: Record<string, number> = { breeze: 0, gust: 0, gale: 0 };
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const h = build({ players: ['a'], seed, settings: { gusts: 'normal' } });
      h.tick((GUST_TIMING.normal.firstSec - WARN_SEC) * 1000);
      seen[h.view('a').gust.strength]!++;
      total++;
    }
    for (const [k, v] of Object.entries(GUST_ODDS.normal)) expect(Math.abs((seen[k]! / total) * 100 - v), k).toBeLessThan(7);
  });

  it('holds when the tower sways no more than the gust can stand, and drops every floor above the highest brace when it sways more', () => {
    expect(topples(STRENGTHS.gust.limit, 'gust')).toBe(false);
    expect(topples(STRENGTHS.gust.limit + 0.1, 'gust')).toBe(true);
    // Find a seed whose first gust is a gale, then build a braced tower that sways too much for it.
    let seed = 1;
    for (; seed < 200; seed++) {
      const probe = build({ players: ['a'], seed, settings: { gusts: 'normal' } });
      probe.tick((GUST_TIMING.normal.firstSec - WARN_SEC) * 1000);
      if (probe.view('a').gust.strength === 'gale') break;
    }
    const h = build({ players: ['a'], seed, settings: { gusts: 'normal' } });
    const gap = braceGap(tower(h).target);
    while (tower(h).height < gap) put(h, 'a', tower(h).build > 30 ? 'stone' : 'timber');
    put(h, 'a', 'lantern');
    const braced = tower(h).height;
    put(h, 'a', 'timber');
    put(h, 'a', 'timber');
    expect(gauge(h)).toBeGreaterThan(STRENGTHS.gale.limit);
    const buildBefore = tower(h).build;
    h.tick(GUST_TIMING.normal.firstSec * 1000);
    const t = h.view('a').towers[0];
    expect(t.gust).toMatchObject({ strength: 'gale', held: false, fell: 4, from: braced + 4, to: braced, kinds: 'TT' });
    expect(t.height).toBe(braced);
    expect(t.gust.saved).toBe(braced);
    expect(t.gust.savedBy).toBe('A');
    expect(builder(h, 'a').saved).toBe(braced);
    expect(tower(h).build).toBeCloseTo(Math.round(buildBefore * SETTLE * 10) / 10, 1);
    expect(h.feed.some((f) => /4 floors fell, and the brace saved/.test(f.text))).toBe(true);
  });

  it('with no brace, a gust that topples the tower takes it all the way down', () => {
    let seed = 1;
    for (; seed < 200; seed++) {
      const probe = build({ players: ['a'], seed, settings: { gusts: 'normal' } });
      probe.tick((GUST_TIMING.normal.firstSec - WARN_SEC) * 1000);
      if (probe.view('a').gust.strength !== 'breeze') break;
    }
    const h = build({ players: ['a'], seed, settings: { gusts: 'normal' } });
    for (let i = 0; i < 3; i++) put(h, 'a', 'timber');
    expect(gauge(h)).toBeGreaterThan(STRENGTHS.gust.limit);
    h.tick(GUST_TIMING.normal.firstSec * 1000);
    expect(tower(h).height).toBe(0);
    expect(tower(h).falls).toBe(1);
    expect(h.view('a').towers[0].gust).toMatchObject({ held: false, fell: 6, saved: 0, savedBy: null });
  });

  it('credits the brace only with the floors between it and the brace below', () => {
    let seed = 1;
    for (; seed < 200; seed++) {
      const probe = build({ players: ['a', 'b'], seed, settings: { gusts: 'normal' } });
      probe.tick((GUST_TIMING.normal.firstSec - WARN_SEC) * 1000);
      if (probe.view('a').gust.strength === 'gale') break;
    }
    const h = build({ players: ['a', 'b'], seed, settings: { gusts: 'normal' } });
    const gap = braceGap(tower(h).target);
    while (tower(h).height < gap) put(h, 'a', tower(h).build > 20 ? 'stone' : 'timber');
    put(h, 'a', 'lantern');
    const first = tower(h).height;
    while (tower(h).height < first + gap) put(h, 'b', tower(h).build > 20 ? 'stone' : 'timber');
    put(h, 'b', 'lantern');
    const second = tower(h).height;
    while (gauge(h) <= STRENGTHS.gale.limit) put(h, 'a', 'timber');
    h.tick(GUST_TIMING.normal.firstSec * 1000);
    expect(tower(h).height).toBe(second);
    expect(builder(h, 'b').saved).toBe(second - first);
    expect(builder(h, 'a').saved).toBe(0);
  });
});

describe('Tower Together: targets, stars and the end', () => {
  it('sets the target from the number of builders, for 1 to 60 (and longer nights)', () => {
    expect(targetFloors(1, 360)).toBe(32);
    expect(targetFloors(5, 360)).toBe(176);
    expect(targetFloors(30, 360)).toBe(1076);
    expect(targetFloors(60, 360)).toBe(2156);
    expect(targetFloors(5, 360, 'low')).toBeLessThan(targetFloors(5, 360));
    expect(targetFloors(5, 360, 'high')).toBeGreaterThan(targetFloors(5, 360));
    expect(targetFloors(5, 720)).toBeGreaterThan(targetFloors(5, 360) * 1.9);
    expect(build({ players: ['a', 'b', 'c', 'd', 'e'] }).view('a').towers[0].target).toBe(176);
  });

  it('raises the target for a late joiner by their share of the night left', () => {
    const h = build({ players: ['a'] });
    const before = tower(h).target;
    h.tick(180_000);
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: null, isBot: false });
    expect(tower(h).target).toBe(targetFloors(1.5, 360));
    expect(tower(h).target).toBeGreaterThan(before);
  });

  it('gives a star for the target and more for going beyond it', () => {
    expect(starsFor(99, 100)).toEqual({ stars: 0, steps: [100, 125, 150] });
    expect(starsFor(100, 100).stars).toBe(1);
    expect(starsFor(125, 100).stars).toBe(2);
    expect(starsFor(400, 100).stars).toBe(3);
  });

  it('ends at dawn: a class that reached the target wins together, one that did not loses together', () => {
    const h = build({ players: ['a'], common: { timeLimitSec: 60 } });
    const target = tower(h).target;
    while (tower(h).height < target) put(h, 'a', 'stone');
    expect(h.feed.some((f) => /reached the target/.test(f.text))).toBe(true);
    h.tick(60_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.outcome).toBe('coop-win');
    expect(h.rt.results?.summary).toMatch(/past the target/);
    const lose = build({ players: ['a'], common: { timeLimitSec: 60 } });
    put(lose, 'a', 'stone');
    lose.tick(60_000);
    expect(lose.rt.results?.outcome).toBe('coop-loss');
    expect(lose.rt.results?.summary).toMatch(/Dawn came with the tower at 1 floor of/);
  });

  it('scores each builder for pieces placed, floors still standing and floors their braces saved; the board is in the same order', () => {
    const h = build({ players: ['a', 'b'], common: { timeLimitSec: 60 } });
    put(h, 'a', 'timber');
    put(h, 'a', 'stone');
    put(h, 'b', 'stone');
    const rows = h.view('a').board;
    expect(rows.map((r: any) => [r.playerId, r.points])).toEqual([
      ['a', 2 * POINTS.piece + 3 * POINTS.standing],
      ['b', POINTS.piece + POINTS.standing],
    ]);
    h.tick(60_000);
    const res = h.rt.results!;
    expect(res.standings.map((s) => [s.playerId, s.score, s.rank])).toEqual([
      ['a', 2 * POINTS.piece + 3 * POINTS.standing, 1],
      ['b', POINTS.piece + POINTS.standing, 2],
    ]);
    expect(res.standings[0]!.label).toMatch(/2 pieces, 3 floors standing/);
  });
});

describe('Tower Together: variants', () => {
  it('Two Towers: each team builds its own tower with its own target, the same gusts hit both, and the nearer its target wins', () => {
    const h = build({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 2 }, { id: 'c', team: 2 }], variantId: 'tower-together-two-towers', settings: { gusts: 'normal' } });
    const ids = Object.keys(h.state().towers).sort();
    expect(ids).toEqual(['team:t1', 'team:t2']);
    expect(tower(h, 'team:t1').target).toBe(targetFloors(1, 360));
    expect(tower(h, 'team:t2').target).toBe(targetFloors(2, 360));
    put(h, 'a', 'stone');
    expect(tower(h, 'team:t1').height).toBe(1);
    expect(tower(h, 'team:t2').height).toBe(0);
    // Each team's pieces move only their own gauge, scaled to their own crew.
    put(h, 'b', 'timber');
    expect(tower(h, 'team:t2').build).toBeCloseTo(PIECES.timber.sway / 2, 1);
    h.tick(GUST_TIMING.normal.firstSec * 1000);
    const g1 = tower(h, 'team:t1').gust;
    const g2 = tower(h, 'team:t2').gust;
    expect(g1.seq).toBe(g2.seq);
    expect(g1.strength).toBe(g2.strength);
    expect(h.view('a').towers).toHaveLength(2);
    h.tick(400_000);
    const res = h.rt.results!;
    expect(res.outcome).toBe('competitive');
    expect(res.teamStandings).toHaveLength(2);
    expect(res.summary).toMatch(/won the night|draw/);
  });

  it('Storm Night: gusts every 30 seconds, and strong gusts and gales far more likely', () => {
    const v = variant('tower-together-storm-night');
    expect(v.settings).toMatchObject({ gusts: 'storm' });
    expect(GUST_TIMING.storm.everySec).toBeLessThan(GUST_TIMING.normal.everySec);
    expect(GUST_ODDS.storm.gale + GUST_ODDS.storm.gust).toBeGreaterThan(GUST_ODDS.normal.gale + GUST_ODDS.normal.gust);
    const h = build({ variantId: 'tower-together-storm-night' });
    // A stormier night has a lower target: the gusts cost floors even when the class plays well.
    expect(targetFloors(5, 360, 'standard', 'storm')).toBeLessThan(targetFloors(5, 360));
    expect(build({ players: ['a', 'b', 'c', 'd', 'e'], variantId: 'tower-together-storm-night' }).view('a').towers[0].target).toBe(targetFloors(5, 360, 'standard', 'storm'));
    expect(h.view('a').gust.landsAt - h.rt.gameNow()).toBe(GUST_TIMING.storm.firstSec * 1000);
  });

  it('Calm Build: no gusts and nothing ever falls, but a tower at full sway takes no more timber', () => {
    const h = build({ players: ['a'], variantId: 'tower-together-calm-build' });
    expect(h.view('a').gust).toBeNull();
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) {
      earn(h, 'a', 1);
      refused = !place(h, 'a', 'timber').ok;
    }
    expect(refused).toBe(true);
    h.tick(400_000);
    expect(tower(h).falls).toBe(0);
    expect(tower(h).height).toBeGreaterThan(0);
  });
});

describe('Tower Together: bots and balance', () => {
  it('practice bots build to dawn, place every kind of piece, and replay the same from the same seed', () => {
    const a = simulateTower({ players: 5, strategy: 'sensible', seed: 4 });
    const b = simulateTower({ players: 5, strategy: 'sensible', seed: 4 });
    expect(a).toEqual(b);
    expect(a.placed.timber).toBeGreaterThan(0);
    expect(a.placed.stone).toBeGreaterThan(0);
    expect(a.placed.lantern).toBeGreaterThan(0);
  });

  it('a class that reads the gauge usually reaches the target; one that ignores it, or always places one piece, usually does not', () => {
    const seeds = 8;
    const sensible = sampleTower({ players: 5, strategy: 'sensible', seeds, firstSeed: 300 });
    const random = sampleTower({ players: 5, strategy: 'random', seeds, firstSeed: 300 });
    const height = sampleTower({ players: 5, strategy: 'height', seeds, firstSeed: 300 });
    const timber = sampleTower({ players: 5, strategy: 'timber', seeds: 3, firstSeed: 300 });
    const stone = sampleTower({ players: 5, strategy: 'stone', seeds: 3, firstSeed: 300 });
    expect(sensible.winRate).toBeGreaterThanOrEqual(0.75);
    expect(random.winRate).toBeLessThanOrEqual(0.25);
    expect(height.winRate).toBeLessThanOrEqual(0.25);
    expect(timber.winRate).toBe(0);
    expect(stone.winRate).toBe(0);
    const alone = sampleTower({ players: 1, strategy: 'sensible', seeds: 12, firstSeed: 300 });
    const aloneRandom = sampleTower({ players: 1, strategy: 'random', seeds: 12, firstSeed: 300 });
    expect(alone.winRate).toBeGreaterThan(aloneRandom.winRate);
  }, 60_000);
});
