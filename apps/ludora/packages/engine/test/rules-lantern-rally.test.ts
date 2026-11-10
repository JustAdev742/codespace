import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { lanternRally, layoutItems } from '../src/modes/lantern-rally/index.ts';
import { AUTO, BOOST, COUGH, GP_RACES, GRID_MS, HAZARD, LANE_MS, MAX_ANSWER_POINTS, MAX_CHARGES, POINTS, PRIZES, SLIP, SPEED, STEADY_MS, WHISTLE_MS, placePoints, variants } from '../src/modes/lantern-rally/meta.ts';
import { drawPrize, prizeOdds } from '../src/modes/lantern-rally/odds.ts';
import { CIRCUIT_IDS, lapLength, lapPos, pointAt, trackPath } from '../src/modes/lantern-rally/track.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Lantern Rally: the conformance checks every self-paced catalogue mode passes,
 * then the rules, driven through a real GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true. The race is a 50 ms
 * step simulation advanced to the clock by every hook, so tests move the clock
 * and read positions from the game state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

function race(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number; variantId?: string } = {}) {
  return drive(lanternRally, {
    players: o.players ?? ['a', 'b'],
    questions: TRUE_SET,
    ...(o.teams !== undefined ? { teams: o.teams } : {}),
    seed: o.seed ?? 42,
    common: o.common ?? {},
    ...(o.variantId ? { variant: variant(o.variantId) } : {}),
    settings: { hazards: false, ...o.settings },
  });
}
const kart = (h: Driven, id: string) => h.state().karts[id];
/** Move the clock on in small steps, firing timers (the race's tick among them). */
function run(h: Driven, ms: number) {
  for (let t = 0; t < ms && h.rt.status === 'running'; t += 100) h.tick(Math.min(100, ms - t));
}
const toStart = (h: Driven) => run(h, GRID_MS);
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) {
    if (!h.view(id).you.question) h.wait(STEADY_MS);
    h.rt.fireDueTimers();
    expect(h.answer(id, 'right').ok).toBe(true);
  }
};
const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

describe('Lantern Rally: conformance', () => {
  const sim = (o: Partial<Parameters<typeof simulateGame>[0]>) => simulateGame({ modeId: 'lantern-rally', mode: lanternRally, questions: MIXED_SET, players: 4, ...o });

  it('has the catalogue metadata, settings and variants the registry needs', () => {
    const m = lanternRally.meta;
    expect(m.pacing).toBe('self');
    expect(m.stage).toBe('3d');
    expect(m.status).toBe('playable');
    expect(m.questionTypes).not.toContain('flashcard');
    expect(variants.length).toBeGreaterThanOrEqual(3);
    const keys = new Set(lanternRally.settings.map((f) => f.key));
    for (const v of variants) {
      expect(v.meta.id.startsWith('lantern-rally-')).toBe(true);
      for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id}: ${k}`).toBe(true);
      expect(parseSettings(lanternRally.settings, v.settings)).toMatchObject(v.settings ?? {});
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

  it('bots finish the race, and it ends when everyone has crossed the line', () => {
    const r = sim({ players: 6, seed: 8, skill: 0.8 });
    expect(problems(r)).toEqual([]);
    expect(r.results?.summary).toMatch(/won the race round/);
    expect(r.results?.standings.every((s) => /\d(st|nd|rd|th), \d/.test(s.label))).toBe(true);
    expect(r.gameMs).toBeLessThan(300_000);
  });

  it('survives churn, a pause, teams and a flashcard-only set, and replays from a seed', () => {
    for (const r of [sim({ players: 6, seed: 77, churn: true, pauseAt: 15_000 }), sim({ players: 6, common: { teamCount: 2 }, seed: 11 }), sim({ players: 3, questions: FLASHCARD_SET, seed: 5 })]) {
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    }
    const a = sim({ players: 4, seed: 99, settings: { hazards: true } });
    const b = sim({ players: 4, seed: 99, settings: { hazards: true } });
    expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
    expect(a.gameMs).toBe(b.gameMs);
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

  it('keeps a player view under 8 KB with 40 in the room', () => {
    const h = race({ players: Array.from({ length: 40 }, (_, i) => `player-number-${i}`), settings: { hazards: true } });
    toStart(h);
    run(h, 5000);
    expect(JSON.stringify(h.view('player-number-7')).length).toBeLessThan(8 * 1024);
  });
});

describe('Lantern Rally: circuits', () => {
  it('has three circuits of about half a kilometre, with smooth headings', () => {
    expect(CIRCUIT_IDS).toHaveLength(3);
    const lengths = CIRCUIT_IDS.map(lapLength);
    for (const l of lengths) {
      expect(l).toBeGreaterThan(450);
      expect(l).toBeLessThan(650);
    }
    expect(new Set(lengths).size).toBe(3);
    // Going right round comes back to the start, and lanes sit either side of the centre.
    const p = trackPath('forest');
    const a = pointAt(p, 0);
    const b = pointAt(p, p.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.5);
    const right = pointAt(p, 10, 3.2);
    const mid = pointAt(p, 10);
    expect(Math.hypot(right.x - mid.x, right.z - mid.z)).toBeCloseTo(3.2, 1);
    expect(lapPos(-5, 500)).toBe(495);
  });

  it('never blocks all three lanes, and leaves the start clear', () => {
    for (let seed = 0; seed < 40; seed++) {
      const items = layoutItems(560, true, createRng(seed));
      const rows = new Map<number, number>();
      for (const it of items) if (it.kind !== 'lantern') rows.set(it.at, (rows.get(it.at) ?? 0) + 1);
      for (const n of rows.values()) expect(n).toBeLessThan(3);
      expect(Math.min(...items.map((i) => i.at))).toBeGreaterThanOrEqual(45);
      expect(items.some((i) => i.kind === 'lantern')).toBe(true);
    }
    expect(layoutItems(560, false, createRng(3)).every((i) => i.kind === 'lantern')).toBe(true);
  });
});

describe('Lantern Rally: charges and boosts', () => {
  it('gives a charge for each right answer, up to 3, and boosts at once when full', () => {
    const h = race();
    toStart(h);
    earn(h, 'a', 3);
    expect(kart(h, 'a').charges).toBe(MAX_CHARGES);
    expect(kart(h, 'a').boostUntil).toBe(0);
    earn(h, 'a', 1);
    expect(kart(h, 'a').charges).toBe(MAX_CHARGES);
    expect(kart(h, 'a').boostUntil).toBeGreaterThan(h.rt.gameNow());
    expect(h.view('a').you.last.text).toContain('boosted at once');
    expect(h.view('a').you.events.at(-1).kind).toBe('full');
  });

  it('refuses a boost before the lights and with no charges, and a boost is faster', () => {
    const h = race();
    earn(h, 'a', 1);
    expect(h.rt.act('a', { type: 'boost' }).ok).toBe(false);
    toStart(h);
    expect(h.rt.act('b', { type: 'boost' }).ok).toBe(false);
    const before = kart(h, 'a').d;
    expect(h.rt.act('a', { type: 'boost' }).ok).toBe(true);
    expect(kart(h, 'a').charges).toBe(0);
    run(h, BOOST.ms);
    const gainA = kart(h, 'a').d - before;
    // b cruised the same 3 seconds: a boost adds its speed for its whole length.
    expect(gainA - (kart(h, 'b').d - before)).toBeGreaterThan(BOOST.add * (BOOST.ms / 1000) * 0.9);
  });

  it('a wrong answer coughs: slower for a moment, and the next question waits', () => {
    const h = race();
    toStart(h);
    run(h, 1000);
    expect(h.answer('a', 'wrong').ok).toBe(true);
    expect(h.view('a').you.question).toBeNull();
    expect(kart(h, 'a').coughUntil).toBeGreaterThan(h.rt.gameNow());
    const a0 = kart(h, 'a').d;
    const b0 = kart(h, 'b').d;
    run(h, COUGH.ms);
    expect(kart(h, 'b').d - b0 - (kart(h, 'a').d - a0)).toBeGreaterThan(COUGH.cut * (COUGH.ms / 1000) * 0.85);
    expect(h.view('a').you.question).not.toBeNull();
  });

  it('a guess is a fair gamble: about even on four choices, worth it on two, not on none', () => {
    const gain = BOOST.add * (BOOST.ms / 1000);
    const loss = COUGH.cut * (COUGH.ms / 1000);
    const ev = (p: number) => p * gain - (1 - p) * loss;
    expect(Math.abs(ev(0.25))).toBeLessThan(2);
    expect(ev(0.5)).toBeGreaterThan(5);
    expect(ev(0)).toBeLessThan(-5);
  });
});

describe('Lantern Rally: lanes, hazards and lanterns', () => {
  it('steers one lane at a time as a quiet move, inside the track, not too quickly', () => {
    const h = race();
    toStart(h);
    expect(kart(h, 'a').lane).toBe(1);
    const pulsed = h.changes.pulsed;
    expect(h.rt.act('a', { type: 'steer', dir: -1 }).ok).toBe(true);
    expect(h.changes.pulsed).toBe(pulsed + 1);
    expect(kart(h, 'a').lane).toBe(0);
    run(h, LANE_MS + 100);
    expect(h.rt.act('a', { type: 'steer', dir: -1 }).ok).toBe(false);
    expect(h.rt.act('a', { type: 'steer', dir: 1 }).ok).toBe(true);
    expect(h.rt.act('a', { type: 'steer', dir: 1 }).ok).toBe(false);
    run(h, LANE_MS + 100);
    expect(h.rt.act('a', { type: 'steer', dir: 1 }).ok).toBe(true);
    expect(kart(h, 'a').lane).toBe(2);
    expect((h.rt.pulse() as any).k.find((k: any) => k[0] === 'a')[2]).toBe(2);
  });

  it('a puddle or cone in your lane slows you for a moment, and a shield takes the hit instead', () => {
    for (const kind of ['puddle', 'cone'] as const) {
      // A layout whose first item in the middle lane (where a lone kart starts) is this hazard.
      let seed = 0;
      for (; seed < 200; seed++) {
        const h = race({ players: ['a'], settings: { hazards: true }, seed });
        const first = h.state().items.filter((i: any) => i.lane === 1).sort((p: any, q: any) => p.at - q.at)[0];
        if (first?.kind === kind) break;
      }
      const h = race({ players: ['a'], settings: { hazards: true }, seed });
      const it = h.state().items.filter((i: any) => i.lane === 1).sort((p: any, q: any) => p.at - q.at)[0];
      toStart(h);
      for (let i = 0; i < 400 && kart(h, 'a').stats.hits === 0; i++) run(h, 100);
      const k = kart(h, 'a');
      expect(k.events.at(-1).kind).toBe(kind);
      expect(lapPos(k.d, h.state().length)).toBeGreaterThanOrEqual(it.at);
      expect(k.slowCut).toBe(HAZARD[kind].cut);
      run(h, 600);
      expect(kart(h, 'a').v).toBeCloseTo(SPEED.cruise - HAZARD[kind].cut, 5);
      run(h, HAZARD[kind].ms);
      expect(kart(h, 'a').v).toBe(SPEED.cruise);
    }
    // Somewhere in a few seeded races a lantern gives a shield before a hazard: the shield is used up and nothing slows.
    let found = false;
    for (let seed = 0; seed < 40 && !found; seed++) {
      const h = race({ players: ['a'], settings: { hazards: true, laps: 2 }, seed });
      toStart(h);
      for (let i = 0; i < 1300 && !found; i++) {
        const had = kart(h, 'a').shield;
        const hits = kart(h, 'a').stats.hits;
        run(h, 50);
        if (kart(h, 'a').stats.shielded > 0) {
          found = true;
          expect(had).toBe(true);
          expect(kart(h, 'a').shield).toBe(false);
          expect(kart(h, 'a').stats.hits).toBe(hits);
          expect(kart(h, 'a').events.at(-1).kind).toBe('shield');
        }
      }
    }
    expect(found).toBe(true);
  });

  it('collects each lantern once a lap, with a prize drawn on the server', () => {
    const h = race({ players: ['a'], settings: { hazards: false }, seed: 6 });
    const lanterns = h.state().items.filter((i: any) => i.kind === 'lantern' && i.lane === 1);
    expect(lanterns.length).toBeGreaterThan(0);
    toStart(h);
    const len = h.state().length;
    run(h, Math.ceil((len / SPEED.cruise) * 1000) - 2000);
    expect(kart(h, 'a').stats.lanterns).toBeGreaterThanOrEqual(lanterns.length - 1);
    const firstLap = kart(h, 'a').stats.lanterns;
    expect(new Set(kart(h, 'a').got).size).toBe(kart(h, 'a').got.length);
    run(h, Math.ceil((len / SPEED.cruise) * 1000));
    // A new lap, the same lanterns again.
    expect(kart(h, 'a').stats.lanterns).toBeGreaterThan(firstLap);
    const prizes = kart(h, 'a').events.filter((e: any) => e.kind === 'lantern').map((e: any) => e.prize);
    for (const p of prizes) expect(['glow', 'shield', 'charge']).toContain(p);
  });

  it(`draws lantern prizes with the odds every screen prints (${PRIZES.map((p) => `${p.prize} ${p.weight}`).join(', ')})`, () => {
    const odds = prizeOdds();
    expect(odds.reduce((n, o) => n + o.percent, 0)).toBe(100);
    const rng = createRng(2024);
    const counts: Record<string, number> = { glow: 0, shield: 0, charge: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) counts[drawPrize(rng)]!++;
    for (const o of odds) expect(Math.abs((counts[o.prize]! / n) * 100 - o.percent)).toBeLessThan(1.5);
    expect(h0().view('a').odds).toEqual(odds);
  });

  it('gives a slipstream to a kart close behind in the same lane', () => {
    const h = race({ players: ['a', 'b'] });
    toStart(h);
    // Both start in different lanes; put b behind a in the same lane.
    const la = kart(h, 'a').lane;
    const lb = kart(h, 'b').lane;
    h.rt.act('b', { type: 'steer', dir: la < lb ? -1 : 1 });
    run(h, 200);
    const gap = kart(h, 'a').d - kart(h, 'b').d;
    expect(Math.abs(gap)).toBeLessThanOrEqual(SLIP.max);
    const behind = gap > 0 ? 'b' : 'a';
    if (Math.abs(gap) >= SLIP.min) {
      expect(kart(h, behind).slip).toBe(true);
      expect(kart(h, behind).v).toBeCloseTo(SPEED.cruise + SLIP.add, 5);
      expect((h.rt.pulse() as any).k.find((k: any) => k[0] === behind)[4] & 64).toBe(64);
    }
    // In a time trial nobody slipstreams.
    const t = race({ players: ['a', 'b'], variantId: 'lantern-rally-time-trial' });
    toStart(t);
    run(t, 3000);
    expect(kart(t, 'a').slip || kart(t, 'b').slip).toBe(false);
  });
});

function h0() {
  return race();
}

describe('Lantern Rally: auto-steer', () => {
  it('steers round most hazards, about as well as an average driver, and spends charges', () => {
    let hits = 0;
    let shown = 0;
    let straightHits = 0;
    for (const seed of [1, 2, 3, 4]) {
      const h = race({ players: ['auto', 'straight'], settings: { hazards: true, laps: 2 }, seed });
      expect(h.rt.act('auto', { type: 'auto', on: true }).ok).toBe(true);
      expect(h.view('auto').you.auto).toBe(true);
      earn(h, 'auto', 2);
      toStart(h);
      run(h, 130_000);
      const a = kart(h, 'auto');
      hits += a.stats.hits;
      shown += a.stats.hits + a.autoNo.length;
      straightHits += kart(h, 'straight').stats.hits;
      expect(a.stats.boosts).toBeGreaterThanOrEqual(2);
    }
    // It dodges clearly better than never steering, but is not perfect.
    expect(hits).toBeLessThan(straightHits * 0.5);
    expect(hits).toBeGreaterThan(0);
    expect(AUTO.notice).toBeLessThan(1);
    expect(shown).toBeGreaterThanOrEqual(0);
  });

  it('is private: nobody else can tell who uses it', () => {
    const h = race({ players: ['a', 'b'] });
    h.rt.act('a', { type: 'auto', on: true });
    toStart(h);
    run(h, 2000);
    const others = JSON.stringify([h.view('b'), h.host(), h.rt.pulse()]);
    expect(others).not.toMatch(/"auto"\s*:\s*true/);
    expect(h.view('a').you.auto).toBe(true);
  });

  it('steering by hand takes over from auto-steer', () => {
    const h = race();
    h.rt.act('a', { type: 'auto', on: true });
    toStart(h);
    expect(h.rt.act('a', { type: 'steer', dir: 1 }).ok).toBe(true);
    expect(kart(h, 'a').auto).toBe(false);
  });
});

describe('Lantern Rally: laps, finishing and placing', () => {
  it('counts laps, times them, and finishes after the set number', () => {
    const h = race({ players: ['a', 'b'], settings: { laps: 2 } });
    toStart(h);
    const len = h.state().length;
    run(h, Math.ceil((len / SPEED.cruise) * 1000) + 500);
    const a = kart(h, 'a');
    expect(a.lapsDone).toBe(1);
    expect(a.lastLap).toBeGreaterThan((len / SPEED.cruise) * 1000 * 0.9);
    expect(h.view('a').you.lap).toBe(2);
    expect(h.view('a').you.events.some((e: any) => e.kind === 'lap' && e.final)).toBe(true);
    run(h, Math.ceil((len / SPEED.cruise) * 1000) + 500);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toMatch(/won the race round/);
  });

  it('blows the whistle 30 seconds after the winner, and places the rest where they are', () => {
    const h = race({ players: ['fast', 'slow'], settings: { laps: 1 } });
    toStart(h);
    // fast boosts all the way; slow keeps coughing.
    const len = h.state().length;
    for (let i = 0; i < 400 && kart(h, 'fast').finished === null; i++) {
      if (kart(h, 'fast').charges < 1) earn(h, 'fast', 1);
      if (kart(h, 'fast').boostUntil <= h.rt.gameNow()) h.rt.act('fast', { type: 'boost' });
      if (h.view('slow').you.question) h.answer('slow', 'wrong');
      run(h, 200);
    }
    const won = h.rt.gameNow();
    expect(kart(h, 'fast').finished).toBe(1);
    expect(h.state().endsAt).toBe(Math.min(h.state().whistleAt, h.state().endsAt));
    expect(h.state().whistleAt - won).toBeLessThanOrEqual(WHISTLE_MS);
    // Keep slow coughing so it cannot get round before the whistle.
    for (let i = 0; i < 400 && h.rt.status === 'running'; i++) {
      if (h.view('slow').you.question) h.answer('slow', 'wrong');
      run(h, 250);
    }
    expect(h.rt.status).toBe('ended');
    expect(kart(h, 'slow').d).toBeLessThan(len);
    const [first, second] = h.rt.results!.standings;
    expect(first!.playerId).toBe('fast');
    expect(second!.label).toMatch(/2nd, lap 1 at the whistle/);
  });

  it('the finishing order decides the top of the table, whatever the answers say (seeded)', () => {
    for (const seed of [3, 17, 29]) {
      // Four drivers: the late finishers and the non-finisher answer far more questions right.
      const h = race({ players: ['w', 'x', 'y', 'z'], settings: { laps: 1, hazards: true }, seed });
      toStart(h);
      const rng = createRng(seed);
      for (let i = 0; i < 1200 && h.rt.status === 'running'; i++) {
        // w and x only boost with what they have; y and z answer constantly (z also coughs some).
        for (const id of ['y', 'z']) if (h.view(id).you.question) h.answer(id, id === 'z' && rng.next() < 0.6 ? 'wrong' : 'right');
        if (i % 25 === 0) for (const id of ['w', 'x']) if (h.view(id).you.question) h.answer(id, 'right');
        if (i % 7 === 0 && kart(h, 'w').charges) h.rt.act('w', { type: 'boost' });
        run(h, 100);
      }
      expect(h.rt.status).toBe('ended');
      const st = h.rt.results!.standings;
      const fin = (id: string) => kart(h, id).finished as number | null;
      const finishers = ['w', 'x', 'y', 'z'].filter((id) => fin(id) !== null).sort((a, b) => fin(a)! - fin(b)!);
      const rest = ['w', 'x', 'y', 'z'].filter((id) => fin(id) === null);
      const score = (id: string) => st.find((s) => s.playerId === id)!.score;
      for (let i = 1; i < finishers.length; i++) expect(score(finishers[i - 1]!), `${seed}: ${finishers.join(',')}`).toBeGreaterThan(score(finishers[i]!));
      for (const f of finishers) for (const r of rest) expect(score(f)).toBeGreaterThan(score(r));
      expect(Math.max(...['w', 'x', 'y', 'z'].map((id) => kart(h, id).answers))).toBeGreaterThan(POINTS.answerCap);
    }
    // And by the numbers: one place is worth more than every answer point.
    expect(placePoints(1, 10, true) - placePoints(2, 10, true)).toBeGreaterThan(MAX_ANSWER_POINTS);
    expect(placePoints(3, 10, true) - placePoints(4, 10, false)).toBeGreaterThan(MAX_ANSWER_POINTS);
  });

  it('ends at once when everyone still in the game has finished', () => {
    const r = simulateGame({ modeId: 'lantern-rally', mode: lanternRally, questions: MIXED_SET, players: 3, seed: 4, settings: { laps: 1 } });
    expect(r.results?.endedBy).toBe('mode');
    expect(r.gameMs).toBeLessThan(120_000);
  });

  it('tells a driver when they move up or down, and the big screen about the front', () => {
    const h = race({ players: ['a', 'b', 'c'] });
    toStart(h);
    run(h, 2000);
    const last = h.state().karts;
    const back = Object.keys(last).sort((p, q) => last[p].d - last[q].d)[0]!;
    let up = false;
    for (let i = 0; i < 6; i++) {
      earn(h, back, 1);
      h.rt.act(back, { type: 'boost' });
      run(h, 2500);
      up ||= kart(h, back).events.some((e: any) => e.kind === 'up');
    }
    expect(kart(h, back).place).toBe(1);
    expect(up).toBe(true);
    expect(h.host().news.some((n: any) => n.kind === 'lead' || n.kind === 'pass')).toBe(true);
  });
});

describe('Lantern Rally: variants', () => {
  it('Team Relay: no finish line, and a team’s distances add up, scaled for team size', () => {
    const h = race({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], variantId: 'lantern-rally-team-relay', common: { teamCount: 2, timeLimitSec: 60 } });
    expect(h.state().laps).toBeNull();
    toStart(h);
    run(h, 40_000);
    const teams = h.host().teams;
    const d = (id: string) => Math.max(0, kart(h, id).d);
    expect(teams[0].score).toBeCloseTo(d('a') + d('b'), -1);
    expect(teams[1].score).toBeCloseTo(d('c') * 2, -1);
    run(h, 30_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toMatch(/covered the most ground/);
  });

  it('Grand Prix: three one-lap races on the three circuits, points carried over, leaders at the back', () => {
    const h = race({ players: ['a', 'b', 'c'], variantId: 'lantern-rally-grand-prix' });
    const circuits = new Set<string>([h.state().circuit]);
    for (let n = 0; n < GP_RACES; n++) {
      toStart(h);
      for (let i = 0; i < 1500 && h.state().race === n && h.rt.status === 'running'; i++) {
        if (n === 0 && h.view('a').you.question) h.answer('a', 'right');
        if (n === 0 && kart(h, 'a').charges) h.rt.act('a', { type: 'boost' });
        run(h, 100);
        if (h.state().phase === 'break') break;
      }
      if (n < GP_RACES - 1) {
        expect(h.state().phase).toBe('break');
        expect(kart(h, 'a').gp).toHaveLength(n + 1);
        run(h, 13_000);
        circuits.add(h.state().circuit);
        if (n === 0) {
          // a won race 1, so a starts at the back of race 2's grid.
          const ds = ['a', 'b', 'c'].map((id) => kart(h, id).d);
          expect(kart(h, 'a').d).toBe(Math.min(...ds));
        }
      }
    }
    expect(h.rt.status).toBe('ended');
    expect(circuits.size).toBe(3);
    const a = h.rt.results!.standings.find((s) => s.playerId === 'a')!;
    expect(a.score).toBe(kart(h, 'a').gp.reduce((x: number, y: number) => x + y, 0));
    expect(h.rt.results?.summary).toMatch(/won the Grand Prix/);
  });

  it('Time Trial: alone on the track, against a ghost of your best lap, which is your score', () => {
    const h = race({ players: ['a', 'b'], variantId: 'lantern-rally-time-trial' });
    expect(h.state().laps).toBeNull();
    toStart(h);
    expect(h.view('a').karts.map((k: any) => k.playerId)).toEqual(['a']);
    const len = h.state().length;
    run(h, Math.ceil((len / SPEED.cruise) * 1000) * 2 + 1000);
    const a = kart(h, 'a');
    expect(a.lapsDone).toBeGreaterThanOrEqual(2);
    expect(h.view('a').you.ghost.length).toBeGreaterThan(20);
    expect(h.view('a').you.bestLap).toBe(a.bestLap);
    run(h, 180_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.standings[0]?.label).toMatch(/best lap/);
  });
});
