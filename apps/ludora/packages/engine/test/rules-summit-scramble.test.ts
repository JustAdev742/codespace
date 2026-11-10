import { describe, expect, it } from 'vitest';
import { commonSettingsSchema, createRng } from '@ludora/shared';
import { drawLeap, placeRopes, summitScramble } from '../src/modes/summit-scramble/index.ts';
import { CAMP_EVERY, LEAP, LEAP_CHANCE, MAX_EXTRA, MAX_GRIP, NIGHT_SIGHT, POINTS, ROPE_PULL, STEADY_MS, WIND, campFloor, campsBelow, summitBonus, variants } from '../src/modes/summit-scramble/meta.ts';
import { leapChance, leapOdds } from '../src/modes/summit-scramble/odds.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Summit Scramble: the conformance checks every self-paced catalogue mode
 * passes, then the rules, driven through a real GameRuntime on a fake clock.
 * Every question is a true statement, so `right` answers true. Leaps are
 * random, so tests that need a slip or a landing leap until one turns up,
 * reading what happened from the game state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

function climb(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number; variantId?: string } = {}) {
  return drive(summitScramble, {
    players: o.players ?? ['a', 'b'],
    questions: TRUE_SET,
    teams: o.teams ?? 0,
    seed: o.seed ?? 42,
    common: o.common ?? {},
    ...(o.variantId ? { variant: variant(o.variantId) } : {}),
    settings: { wind: false, ...o.settings },
  });
}
const party = (h: Driven, id: string) => h.state().parties[h.state().climbers[id].party];
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) {
    // A wrong answer holds the next question back; let the Glim catch its balance first.
    if (!h.view(id).you.question) h.tick(STEADY_MS);
    h.answer(id, 'right');
  }
};
/** Climb ledge by ledge until `id` stands on `ledge`. */
function climbTo(h: Driven, id: string, ledge: number) {
  for (let i = 0; i < 500 && party(h, id).ledge < ledge; i++) {
    if (party(h, id).grip < 1) earn(h, id, 1);
    expect(h.rt.act(id, { type: 'climb' }).ok).toBe(true);
  }
  expect(party(h, id).ledge).toBe(ledge);
}
const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

describe('Summit Scramble: conformance', () => {
  const sim = (o: Parameters<typeof simulateGame>[0] extends infer T ? Partial<T> : never) => simulateGame({ modeId: 'summit-scramble', mode: summitScramble, questions: MIXED_SET, players: 4, ...o });

  it('has the catalogue metadata, settings and variants the registry needs', () => {
    const m = summitScramble.meta;
    expect(m.pacing).toBe('self');
    expect(m.stage).toBe('3d');
    expect(m.status).toBe('playable');
    expect(m.questionTypes).not.toContain('flashcard');
    expect(variants.length).toBeGreaterThanOrEqual(3);
    const keys = new Set(summitScramble.settings.map((f) => f.key));
    for (const v of variants) {
      expect(v.meta.id.startsWith('summit-scramble-')).toBe(true);
      for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id}: ${k}`).toBe(true);
      expect(parseSettings(summitScramble.settings, v.settings)).toMatchObject(v.settings ?? {});
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
      expect(r.results?.standings[0]?.rank).toBe(1);
    });
  }

  it('bots climb to the summit, and the game ends when enough of them get there', () => {
    const r = sim({ players: 5, seed: 8, skill: 0.85 });
    expect(problems(r)).toEqual([]);
    expect(r.results?.summary).toMatch(/reached the summit first/);
    // Three finishers by default, well inside the 7 minutes.
    expect(r.gameMs).toBeLessThan(420_000);
  });

  it('survives churn, a pause, teams and a flashcard-only set, and replays from a seed', () => {
    for (const r of [sim({ players: 6, seed: 77, churn: true, pauseAt: 15_000 }), sim({ players: 6, common: { teamCount: 2 }, seed: 11 }), sim({ players: 3, questions: FLASHCARD_SET, seed: 5 })]) {
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    }
    const a = sim({ players: 3, seed: 99 });
    const b = sim({ players: 3, seed: 99 });
    expect(a.results?.standings.map((s) => [s.playerId, s.score])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score]));
  });

  for (const v of variants) {
    it(`variant ${v.meta.title} plays to the end with bots, alone and with churn`, () => {
      for (const r of [sim({ variantId: v.meta.id, players: 1, seed: 23 }), sim({ variantId: v.meta.id, players: 5, seed: 41, churn: true, pauseAt: 15_000 })]) {
        expect(problems(r)).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.leaks).toEqual([]);
      }
    });
  }
});

describe('Summit Scramble: grip', () => {
  it('gives 1 grip for a right answer, none for a wrong one, and a bonus on every third in a row', () => {
    const h = climb();
    h.answer('a', 'wrong');
    expect(party(h, 'a').grip).toBe(0);
    earn(h, 'a', 2);
    expect(party(h, 'a').grip).toBe(2);
    earn(h, 'a', 1);
    expect(party(h, 'a').grip).toBe(4);
    expect(h.view('a').you.last.text).toContain('streak bonus');
  });

  it(`holds at most ${MAX_GRIP} grip`, () => {
    const h = climb();
    earn(h, 'a', 10);
    expect(party(h, 'a').grip).toBe(MAX_GRIP);
    expect(h.view('a').you.last.text).toContain('full');
  });

  it('holds the next question back for a moment after a wrong answer, and costs nothing else', () => {
    const h = climb();
    earn(h, 'a', 2);
    h.answer('a', 'wrong');
    expect(party(h, 'a').grip).toBe(2);
    expect(h.view('a').you.question).toBeNull();
    expect(h.view('a').you.steadyUntil).toBe(h.rt.gameNow() + STEADY_MS);
    // Grip can still be spent while the Glim steadies itself.
    expect(h.rt.act('a', { type: 'climb' }).ok).toBe(true);
    h.tick(STEADY_MS - 1);
    expect(h.view('a').you.question).toBeNull();
    h.tick(1);
    expect(h.view('a').you.question).not.toBeNull();
  });
});

describe('Summit Scramble: climbing and leaping', () => {
  it('climbs one ledge for 1 grip, always, and refuses with no grip', () => {
    const h = climb();
    expect(h.rt.act('a', { type: 'climb' }).ok).toBe(false);
    earn(h, 'a', 1);
    expect(h.rt.act('a', { type: 'climb' }).ok).toBe(true);
    expect(party(h, 'a').ledge).toBe(1);
    expect(party(h, 'a').grip).toBe(0);
    expect(h.view('a').you.move).toMatchObject({ kind: 'climb', from: 0, to: 1 });
  });

  it('prints the odds on the leap: 70% in calm air, 50% in the wind', () => {
    expect(leapChance(false)).toBe(LEAP_CHANCE.calm);
    expect(leapChance(true)).toBe(LEAP_CHANCE.wind);
    expect(leapOdds(5, 0, 30, false)).toMatchObject({ chance: 70, cost: 2, gain: 4, land: 9, fall: 4 });
    // Never past the summit, never below the last camp.
    expect(leapOdds(29, 20, 30, false).land).toBe(30);
    expect(leapOdds(10, 10, 30, false).fall).toBe(10);
    const h = climb();
    expect(h.view('a').you.leap.chance).toBe(70);
  });

  for (const chance of [LEAP_CHANCE.calm, LEAP_CHANCE.wind]) {
    it(`draws leaps with the chance it prints (${chance}%) over many seeded trials`, () => {
      const rng = createRng(chance);
      const n = 40_000;
      let ok = 0;
      for (let i = 0; i < n; i++) if (drawLeap(chance, rng)) ok++;
      expect(Math.abs((ok / n) * 100 - chance)).toBeLessThan(1);
    });
  }

  it('makes a leap the better bet in calm air and the worse one in the wind, against two climbs', () => {
    const calm = leapOdds(5, 0, 30, false);
    const wind = leapOdds(5, 0, 30, true);
    // Two climbs always gain 2 ledges for the same 2 grip.
    expect(calm.average).toBeCloseTo(0.7 * LEAP.gain - 0.3 * LEAP.slip);
    expect(calm.average).toBeCloseTo(2.5);
    expect(wind.average).toBeCloseTo(1.5);
    expect(calm.average).toBeGreaterThan(2.25);
    expect(wind.average).toBeLessThan(1.75);
    // From a camp a slip costs nothing.
    expect(leapOdds(10, 10, 30, false).average).toBeCloseTo(2.8);
  });

  it('lands four ledges up on a good leap and slides back one on a bad one, about 7 times in 10', () => {
    let good = 0;
    let bad = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const h = climb({ seed, players: ['a'] });
      climbTo(h, 'a', 4);
      earn(h, 'a', 2);
      expect(h.rt.act('a', { type: 'leap' }).ok).toBe(true);
      const m = h.view('a').you.move;
      expect(m.chance).toBe(70);
      if (m.kind === 'leap') {
        good++;
        expect(party(h, 'a').ledge).toBe(8);
      } else {
        bad++;
        expect(m.kind).toBe('slip');
        expect(party(h, 'a').ledge).toBe(3);
      }
    }
    expect(good + bad).toBe(400);
    expect(Math.abs((good / 400) * 100 - 70)).toBeLessThan(7);
  });

  it('refuses a leap with too little grip, and has none in a Steady Climb', () => {
    const h = climb();
    earn(h, 'a', 1);
    expect(h.rt.act('a', { type: 'leap' }).ok).toBe(false);
    const steady = climb({ variantId: 'summit-scramble-steady' });
    earn(steady, 'a', 4);
    expect(steady.rt.act('a', { type: 'leap' }).ok).toBe(false);
    expect(steady.view('a').you.leap).toBeNull();
    expect(steady.view('a').wind).toBeNull();
    expect(steady.state().nextWind).toBeNull();
  });
});

describe('Summit Scramble: camps', () => {
  it(`makes every ${CAMP_EVERY}th ledge a camp below the summit`, () => {
    expect(campsBelow(30)).toEqual([10, 20]);
    expect(campsBelow(40)).toEqual([10, 20, 30]);
    expect(campFloor(17, 30)).toBe(10);
  });

  it('never lets anyone slide below a camp they reached, over many slips', () => {
    let slips = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const h = climb({ seed, players: ['a'], settings: { summit: 60 } });
      climbTo(h, 'a', 10);
      for (let i = 0; i < 40 && party(h, 'a').finished === null; i++) {
        earn(h, 'a', 2);
        h.rt.act('a', { type: 'leap' });
        const p = party(h, 'a');
        if (p.last.kind === 'slip') slips++;
        expect(p.ledge).toBeGreaterThanOrEqual(p.camp);
        expect(p.camp).toBe(campFloor(Math.max(p.ledge, p.camp), 60));
      }
    }
    expect(slips).toBeGreaterThan(50);
  });

  it('gives the first three to each camp a bonus, best for the first', () => {
    const h = climb({ players: ['a', 'b', 'c', 'd'] });
    for (const id of ['a', 'b', 'c', 'd']) climbTo(h, id, 10);
    const bonus = (id: string) => party(h, id).bonus;
    expect([bonus('a'), bonus('b'), bonus('c'), bonus('d')]).toEqual([...POINTS.camp, 0]);
    expect(h.view('a').you.move.camp).toEqual({ ledge: 10, order: 1, bonus: POINTS.camp[0] });
    expect(h.host().camps[0].first).toEqual(['A', 'B', 'C']);
  });

  it('counts a camp leapt past as reached', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const h = climb({ seed, players: ['a'] });
      climbTo(h, 'a', 8);
      earn(h, 'a', 2);
      h.rt.act('a', { type: 'leap' });
      if (party(h, 'a').last.kind === 'leap') {
        expect(party(h, 'a').ledge).toBe(12);
        expect(party(h, 'a').camp).toBe(10);
        return;
      }
    }
    throw new Error('no leap landed');
  });
});

describe('Summit Scramble: the wind', () => {
  it('warns every screen before it blows, then halves the leap odds while it does', () => {
    const h = climb({ settings: { wind: true } });
    const warnAt = WIND.firstSec * 1000 - WIND.warnSec * 1000;
    h.tick(warnAt - 1);
    expect(h.view('a').wind).toBeNull();
    h.tick(1);
    expect(h.view('a').wind).toMatchObject({ blowing: false });
    expect(h.host().wind).toMatchObject({ blowing: false });
    expect(h.feed.some((f) => /wind is picking up/.test(f.text))).toBe(true);
    expect(h.view('a').you.leap.chance).toBe(70);
    h.tick(WIND.warnSec * 1000);
    expect(h.view('a').wind).toMatchObject({ blowing: true });
    expect(h.view('a').you.leap.chance).toBe(50);
    h.tick(WIND.blowSec * 1000);
    expect(h.view('a').wind).toBeNull();
    expect(h.view('a').you.leap.chance).toBe(70);
  });

  it('draws leaps in the wind at 50%', () => {
    let good = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const h = climb({ seed, players: ['a'], settings: { wind: true } });
      earn(h, 'a', 2);
      h.tick(WIND.firstSec * 1000);
      h.rt.act('a', { type: 'leap' });
      expect(party(h, 'a').last.chance).toBe(50);
      if (party(h, 'a').last.kind === 'leap') good++;
    }
    expect(Math.abs((good / n) * 100 - 50)).toBeLessThan(8);
  });
});

describe('Summit Scramble: ropes', () => {
  it('hangs ropes between camps, never on a camp or the summit', () => {
    const ropes = placeRopes(40, createRng(3));
    expect(ropes.length).toBe(8);
    for (const l of ropes) {
      expect(l % CAMP_EVERY).not.toBe(0);
      expect(l).toBeLessThan(40);
    }
  });

  it('lets a climber pick up a rope and pull the nearest climber below up two ledges, scoring for both', () => {
    const h = climb({ players: ['a', 'b', 'c'] });
    const rope = h.state().ropes[1] as number;
    climbTo(h, 'b', 1);
    climbTo(h, 'c', 2);
    expect(h.rt.act('a', { type: 'rope' }).ok).toBe(false);
    climbTo(h, 'a', rope);
    expect(party(h, 'a').rope).toBe(true);
    expect(h.view('a').you.ropeTarget).toBe('C');
    const before = { a: party(h, 'a').bonus, c: party(h, 'c').ledge };
    expect(h.rt.act('a', { type: 'rope' }).ok).toBe(true);
    expect(party(h, 'c').ledge).toBe(Math.min(rope, before.c + ROPE_PULL));
    expect(party(h, 'a').bonus).toBe(before.a + POINTS.rope);
    expect(party(h, 'a').rope).toBe(false);
    expect(h.view('c').you.move).toMatchObject({ kind: 'pulled', other: 'A' });
    expect(h.host().news[0]).toMatchObject({ kind: 'rope', name: 'A', other: 'C' });
  });

  it('refuses a rope with nobody below, and never pulls anyone past the thrower', () => {
    const h = climb({ players: ['a', 'b'] });
    const rope = h.state().ropes[0] as number;
    climbTo(h, 'a', rope);
    expect(h.rt.act('a', { type: 'rope' }).ok).toBe(true);
    climbTo(h, 'b', party(h, 'b').ledge);
    const h2 = climb({ players: ['a', 'b'] });
    const r2 = h2.state().ropes[0] as number;
    climbTo(h2, 'b', r2 - 1);
    climbTo(h2, 'a', r2);
    expect(h2.rt.act('a', { type: 'rope' }).ok).toBe(true);
    expect(party(h2, 'b').ledge).toBe(r2);
    const h3 = climb({ players: ['a', 'b'] });
    climbTo(h3, 'a', h3.state().ropes[0]);
    climbTo(h3, 'b', h3.state().ropes[0] + 1);
    // B is above A now: nobody below A.
    expect(h3.rt.act('a', { type: 'rope' }).ok).toBe(false);
  });
});

describe('Summit Scramble: the summit and the end', () => {
  it('ends when enough climbers reach the summit, ranking by points that follow height and finishing order', () => {
    const h = climb({ players: ['a', 'b', 'c'], settings: { finishers: 2, ropes: false } });
    climbTo(h, 'b', 30);
    expect(party(h, 'b').finished).toBe(1);
    expect(h.rt.status).toBe('running');
    climbTo(h, 'a', 30);
    expect(h.rt.status).toBe('ended');
    const st = h.rt.results!.standings;
    const row = (id: string) => st.find((r: any) => r.playerId === id)!;
    expect(row('b').rank).toBe(1);
    expect(row('a').rank).toBe(2);
    expect(row('c').rank).toBe(3);
    expect(row('b').score - row('a').score).toBe(summitBonus(1, 2) - summitBonus(2, 2) + POINTS.camp[0]! * 2 - POINTS.camp[1]! * 2);
    expect(h.rt.results!.summary).toContain('B reached the summit first');
  });

  it('refuses moves at the summit and caps a leap there', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const h = climb({ seed, players: ['a', 'b'], settings: { ropes: false } });
      climbTo(h, 'a', 29);
      earn(h, 'a', 2);
      h.rt.act('a', { type: 'leap' });
      if (party(h, 'a').last.kind === 'leap') {
        expect(party(h, 'a').ledge).toBe(30);
        earn(h, 'a', 1);
        expect(h.rt.act('a', { type: 'climb' }).ok).toBe(false);
        return;
      }
    }
    throw new Error('no leap landed');
  });

  it('ends when the time runs out, and a solo climber ends it by reaching the top', () => {
    const h = climb({ common: { timeLimitSec: 60 } });
    climbTo(h, 'a', 3);
    h.tick(61_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.standings.find((r: any) => r.playerId === 'a')!.score).toBe(3 * POINTS.ledge);
    const solo = climb({ players: ['a'] });
    climbTo(solo, 'a', 30);
    expect(solo.rt.status).toBe('ended');
  });

  it('gives a late joiner a place at the foot of the mountain', () => {
    const h = climb();
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: null, isBot: false });
    earn(h, 'z', 1);
    expect(h.rt.act('z', { type: 'climb' }).ok).toBe(true);
    expect(party(h, 'z').ledge).toBe(1);
  });

  it('keeps a player view small with 40 climbers', () => {
    const players = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const h = climb({ players });
    for (const p of players) earn(h, p, 1);
    expect(JSON.stringify(h.view('p0')).length).toBeLessThan(8000);
    expect(JSON.stringify(h.host()).length).toBeLessThan(16000);
  });
});

describe('Summit Scramble: variants', () => {
  it('Roped Teams: a team shares one height, one grip bag and one score', () => {
    const v = variant('summit-scramble-roped-teams');
    const h = drive(summitScramble, { players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], questions: TRUE_SET, variant: v, teams: 2, settings: { wind: false } });
    earn(h, 'a', 1);
    earn(h, 'b', 1);
    expect(party(h, 'a').grip).toBe(2);
    expect(h.rt.act('b', { type: 'climb' }).ok).toBe(true);
    expect(h.rt.act('a', { type: 'climb' }).ok).toBe(true);
    expect(party(h, 'a').ledge).toBe(2);
    expect(party(h, 'b')).toBe(party(h, 'a'));
    expect(h.view('b').you.ledge).toBe(2);
    expect(party(h, 'c').ledge).toBe(0);
    h.rt.end('host');
    const st = h.rt.results!.standings;
    expect(st.find((r: any) => r.playerId === 'a')!.score).toBe(st.find((r: any) => r.playerId === 'b')!.score);
    const teams = h.rt.results!.teamStandings!;
    expect(teams.find((t: any) => t.teamId === 't1')!.score).toBe(2 * POINTS.ledge);
  });

  it('Roped Teams splits players into teams by default', () => {
    expect(variant('summit-scramble-roped-teams').common?.teamCount).toBe(2);
    const r = simulateGame({ modeId: 'summit-scramble', mode: summitScramble, variantId: 'summit-scramble-roped-teams', questions: MIXED_SET, players: 6, seed: 4, common: commonSettingsSchema.parse({ teamCount: 2 }) });
    expect(problems(r)).toEqual([]);
    expect(r.results?.teamStandings).toHaveLength(2);
  });

  it('Night Climb: climbers see ropes only a few ledges ahead, and the wind comes with no warning', () => {
    const h = climb({ variantId: 'summit-scramble-night-climb', settings: { wind: true } });
    const ropes: number[] = h.state().ropes;
    expect(h.view('a').ropes).toEqual(ropes.filter((l) => l <= NIGHT_SIGHT));
    climbTo(h, 'a', 8);
    expect(h.view('a').ropes).toEqual(ropes.filter((l) => l <= 8 + NIGHT_SIGHT));
    // The day climb shows every rope.
    expect(climb().view('a').ropes.length).toBe(climb().state().ropes.length);
    h.tick(WIND.firstSec * 1000 - WIND.warnSec * 1000);
    expect(h.view('a').wind).toBeNull();
    expect(h.host().wind).toBeNull();
    expect(h.feed.some((f) => /picking up/.test(f.text))).toBe(false);
    h.tick(WIND.warnSec * 1000);
    expect(h.view('a').wind).toMatchObject({ blowing: true });
    expect(h.view('a').you.leap.chance).toBe(50);
    expect(h.feed.some((f) => /out of the dark/.test(f.text))).toBe(true);
  });
});

describe('Summit Scramble: finishing order decides the top of the table', () => {
  /** Finishing place from a standing's label ("… (summit, 2nd)"), or null for a climber still on the mountain. */
  const place = (label: string) => {
    const m = /summit, (\d+)/.exec(label);
    return m ? Number(m[1]) : null;
  };
  function expectOrdered(standings: { score: number; rank: number; label: string }[], where: string) {
    const rows = [...standings].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = place(rows[i]!.label);
        const b = place(rows[j]!.label);
        // A summiter never below one who did not finish; an earlier summiter never below a later one.
        if (b !== null) {
          expect(a, `${where}: ${rows[j]!.label} ranked below ${rows[i]!.label}`).not.toBeNull();
          expect(a!, where).toBeLessThan(b);
          expect(rows[i]!.score, where).toBeGreaterThan(rows[j]!.score);
        }
      }
    }
  }

  it('the summit bonus step is bigger than anything else a climber can score beyond height', () => {
    expect(campsBelow(60).length * POINTS.camp[0]! + POINTS.ropeScored * POINTS.rope).toBe(MAX_EXTRA);
    for (const f of [1, 3, 20]) {
      for (let k = 1; k < f; k++) expect(summitBonus(k, f) - summitBonus(k + 1, f)).toBeGreaterThan(MAX_EXTRA);
      // Even the last place beats a climber one ledge short with every bonus there is.
      expect(POINTS.ledge + summitBonus(f, f)).toBeGreaterThan(MAX_EXTRA);
    }
  });

  it('holds over many seeded bot games, with ropes, camps, teams and churn', () => {
    let summiters = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const players = 3 + (seed % 8);
      const r = simulateGame({
        modeId: 'summit-scramble',
        mode: summitScramble,
        questions: MIXED_SET,
        players,
        seed,
        skill: 0.55 + (seed % 5) * 0.1,
        settings: { finishers: 1 + (seed % 5), summit: seed % 3 === 0 ? 20 : 30 },
        ...(seed % 4 === 0 ? { common: { teamCount: 2 } } : {}),
        ...(seed % 7 === 0 ? { churn: true } : {}),
      });
      expect(problems(r)).toEqual([]);
      summiters += r.results!.standings.filter((s) => place(s.label) !== null).length;
      expectOrdered(r.results!.standings, `seed ${seed}`);
    }
    expect(summiters).toBeGreaterThan(60);
  });

  it('holds when a late summiter collected every camp first and threw many ropes', () => {
    const h = climb({ players: ['a', 'b', 'c'], settings: { finishers: 2, summit: 60 } });
    // C races ahead to take every camp first and throws every rope it finds down to A or B.
    for (let i = 0; i < 400 && party(h, 'c').ledge < 59; i++) {
      if (party(h, 'c').rope && party(h, 'c').ledge > 1) h.rt.act('c', { type: 'rope' });
      if (party(h, 'c').grip < 1) earn(h, 'c', 1);
      h.rt.act('c', { type: 'climb' });
      if (party(h, 'c').ledge > party(h, 'a').ledge + 3) climbTo(h, 'a', party(h, 'a').ledge + 1);
    }
    expect(party(h, 'c').ropesThrown).toBeGreaterThan(3);
    climbTo(h, 'b', 60);
    climbTo(h, 'c', 60);
    expect(h.rt.status).toBe('ended');
    expectOrdered(h.rt.results!.standings as any, 'hand-played');
    expect(h.rt.results!.standings.find((s: any) => s.playerId === 'b')!.rank).toBe(1);
  });
});
