import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { drawShot, spotKick } from '../src/modes/spot-kick/index.ts';
import { AIMS, BASE_ODDS, FIRE_STREAK, GOLDEN_SEC, GUARD_BONUS, MAX_BALLS, MIN_GOAL, POWERS, READ_MAX, READ_STEP, meta, variants, type Aim } from '../src/modes/spot-kick/meta.ts';
import { allOdds, learn, noReads, shotOdds } from '../src/modes/spot-kick/odds.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Spot Kick rules, driven through a real GameRuntime on a fake clock. Every
 * question is a true statement, so `right` answers true. Shots are random, so
 * tests that need a particular outcome shoot until it turns up, reading what
 * happened from the game state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

function pitch(o: { players?: Seat[]; settings?: Record<string, unknown>; teams?: number; seed?: number; variant?: string } = {}) {
  return drive(spotKick, { players: o.players ?? ['a', 'b'], questions: TRUE_SET, teams: o.teams ?? 0, seed: o.seed ?? 42, settings: o.settings ?? {}, ...(o.variant ? { variant: variant(o.variant) } : {}) });
}
const kicker = (h: Driven, id: string) => h.state().kickers[id];
const earn = (h: Driven, id: string, n: number) => {
  for (let i = 0; i < n; i++) h.answer(id, 'right');
};
const shoot = (h: Driven, id: string, aim: Aim = 'tl', power: 'placed' | 'blasted' = 'placed') => h.rt.act(id, { type: 'shoot', aim, power });
/** Earn a ball and take one shot. */
const take = (h: Driven, id: string, aim: Aim = 'tl', power: 'placed' | 'blasted' = 'placed') => {
  earn(h, id, 1);
  expect(shoot(h, id, aim, power).ok).toBe(true);
  return kicker(h, id).last;
};

describe('Spot Kick: footballs', () => {
  it('gives a football for a right answer and none for a wrong one', () => {
    const h = pitch();
    h.answer('a', 'wrong');
    expect(kicker(h, 'a').balls).toBe(0);
    expect(h.view('a').you.last.text).toBe('No football');
    h.answer('a', 'right');
    expect(kicker(h, 'a').balls).toBe(1);
    expect(h.view('a').you.last.text).toBe('+1 football');
  });

  it(`holds at most ${MAX_BALLS} footballs`, () => {
    const h = pitch();
    earn(h, 'a', 6);
    expect(kicker(h, 'a').balls).toBe(MAX_BALLS);
    expect(h.view('a').you.last.text).toContain('take a penalty');
  });

  it('refuses a shot with no football, and a shot spends one', () => {
    const h = pitch();
    expect(shoot(h, 'a').ok).toBe(false);
    earn(h, 'a', 2);
    expect(shoot(h, 'a', 'br', 'blasted').ok).toBe(true);
    expect(kicker(h, 'a').balls).toBe(1);
    expect(kicker(h, 'a').shots).toBe(1);
    const last = kicker(h, 'a').last;
    expect(last.aim).toBe('br');
    expect(last.power).toBe('blasted');
    expect(['goal', 'saved', 'wide']).toContain(last.outcome);
  });

  it('refuses a place or strength that does not exist', () => {
    const h = pitch();
    earn(h, 'a', 1);
    expect(h.rt.act('a', { type: 'shoot', aim: 'roof', power: 'placed' }).ok).toBe(false);
    expect(h.rt.act('a', { type: 'shoot', aim: 'tl', power: 'chip' }).ok).toBe(false);
    expect(kicker(h, 'a').balls).toBe(1);
  });

  it('keeps questions coming while shooting', () => {
    const h = pitch();
    take(h, 'a');
    expect(h.view('a').you.question).not.toBeNull();
  });
});

describe('Spot Kick: the chances', () => {
  it('adds up to 100% for every shot, at every stage of learning and guarding', () => {
    for (const power of POWERS)
      for (const aim of AIMS)
        for (let read = 0; read <= READ_MAX; read++)
          for (const guarded of [false, true]) {
            const o = shotOdds({ aim, power, read, guarded });
            expect(o.goal + o.saved + o.wide).toBe(100);
            expect(o.goal).toBeGreaterThanOrEqual(MIN_GOAL);
          }
  });

  it('never misses with a placed shot, and a blast is harder to save but can fly wide', () => {
    for (const aim of AIMS) {
      const placed = shotOdds({ aim, power: 'placed', read: 0, guarded: false });
      const blasted = shotOdds({ aim, power: 'blasted', read: 0, guarded: false });
      expect(placed.wide).toBe(0);
      expect(blasted.wide).toBeGreaterThan(0);
      expect(blasted.saved).toBeLessThan(placed.saved);
    }
    // A placed corner is always on target but easier to save than a blasted one.
    expect(shotOdds({ aim: 'tl', power: 'placed', read: 0, guarded: false }).saved).toBe(BASE_ODDS.placed.tl.save);
  });

  it('shows the player exactly the chances of every shot, ten buttons', () => {
    const h = pitch();
    const odds = h.view('a').you.odds;
    expect(odds).toHaveLength(10);
    expect(odds).toEqual(allOdds(noReads(), null));
  });

  it('draws saves and misses at the rates it prints, over many seeded shots', () => {
    const rng = createRng(2024);
    for (const o of [shotOdds({ aim: 'tl', power: 'blasted', read: 0, guarded: false }), shotOdds({ aim: 'mid', power: 'placed', read: 2, guarded: false }), shotOdds({ aim: 'br', power: 'blasted', read: 3, guarded: true })]) {
      const n = 30_000;
      const seen = { goal: 0, saved: 0, wide: 0 };
      for (let i = 0; i < n; i++) {
        const d = drawShot(o, rng);
        seen[d.outcome]++;
        if (d.outcome === 'saved') expect(d.dive).toBe(o.aim);
        if (d.outcome === 'goal') expect(d.dive).not.toBe(o.aim);
      }
      expect(Math.abs((seen.goal / n) * 100 - o.goal)).toBeLessThan(1.2);
      expect(Math.abs((seen.saved / n) * 100 - o.saved)).toBeLessThan(1.2);
      expect(Math.abs((seen.wide / n) * 100 - o.wide)).toBeLessThan(1.2);
    }
  });

  it('matches the printed chances in real games too: a game’s shots follow the odds shown before each one', () => {
    let expected = 0;
    let goals = 0;
    let shots = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const h = pitch({ seed, players: ['a'] });
      for (let i = 0; i < 40; i++) {
        earn(h, 'a', 1);
        const aim = AIMS[i % AIMS.length]!;
        const power = i % 3 === 0 ? 'blasted' : 'placed';
        const shown = h.view('a').you.odds.find((o: any) => o.aim === aim && o.power === power);
        expected += shown.goal / 100;
        shoot(h, 'a', aim, power);
        shots++;
        if (kicker(h, 'a').last.outcome === 'goal') goals++;
      }
    }
    expect(Math.abs(goals - expected) / shots).toBeLessThan(0.02);
  });
});

describe('Spot Kick: the keeper learns', () => {
  it('covers a place a little more for each shot there, and forgets as you mix them up', () => {
    let reads = noReads();
    reads = learn(reads, 'tl');
    reads = learn(reads, 'tl');
    expect(reads.tl).toBe(2);
    reads = learn(reads, 'br');
    expect(reads.tl).toBe(1);
    expect(reads.br).toBe(1);
    for (let i = 0; i < 10; i++) reads = learn(reads, 'mid');
    expect(reads.mid).toBe(READ_MAX);
    expect(reads.tl).toBe(0);
  });

  it('puts what it has learned on the buttons: the next shot at the same place is easier to save', () => {
    const h = pitch();
    const before = h.view('a').you.odds.find((o: any) => o.aim === 'tl' && o.power === 'placed');
    take(h, 'a', 'tl');
    take(h, 'a', 'tl');
    const after = h.view('a').you.odds.find((o: any) => o.aim === 'tl' && o.power === 'placed');
    expect(after.read).toBe(2);
    expect(after.saved).toBe(before.saved + 2 * READ_STEP);
    expect(h.view('a').you.reads.tl).toBe(2);
    // Each player has their own keeper's memory.
    expect(h.view('b').you.reads.tl).toBe(0);
    take(h, 'a', 'br');
    take(h, 'a', 'bl');
    expect(h.view('a').you.reads.tl).toBe(0);
  });

  it('never learns with the setting off', () => {
    const h = pitch({ settings: { keeperLearns: false } });
    for (let i = 0; i < 4; i++) take(h, 'a', 'mid');
    expect(h.view('a').you.reads.mid).toBe(0);
  });
});

describe('Spot Kick: on fire', () => {
  /** Shoot until a goal (or a non-goal, with `want: 'miss'`) turns up, with the keeper learning off. */
  function until(h: Driven, id: string, want: 'goal' | 'miss') {
    for (let i = 0; i < 400; i++) {
      const s = take(h, id, 'tl', 'placed');
      if ((s.outcome === 'goal') === (want === 'goal')) return s;
    }
    throw new Error(`no ${want}`);
  }

  it(`catches fire after ${FIRE_STREAK} goals in a row, and the next goal counts double; a save puts it out`, () => {
    const h = pitch({ settings: { keeperLearns: false }, seed: 9 });
    let doubled = false;
    let doused = false;
    for (let round = 0; round < 60 && !(doubled && doused); round++) {
      for (let i = 0; i < 400 && !kicker(h, 'a').onFire; i++) take(h, 'a', 'tl', 'placed');
      expect(kicker(h, 'a').onFire).toBe(true);
      expect(h.view('a').you.onFire).toBe(true);
      const before = kicker(h, 'a').points;
      const s = take(h, 'a', 'tl', 'placed');
      if (s.outcome === 'goal') {
        expect(s.fire).toBe(true);
        expect(s.points).toBe(2);
        expect(kicker(h, 'a').points).toBe(before + 2);
        doubled = true;
      } else {
        expect(kicker(h, 'a').points).toBe(before);
        expect(kicker(h, 'a').notes[0].text).toContain('fire went out');
        doused = true;
      }
      expect(kicker(h, 'a').onFire).toBe(false);
    }
    expect(doubled && doused).toBe(true);
  });

  it('a double goal happens in a long game, and only right after a run of three', () => {
    const h = pitch({ settings: { keeperLearns: false }, seed: 3 });
    let doubles = 0;
    let run = 0;
    for (let i = 0; i < 300; i++) {
      const wasOnFire = kicker(h, 'a').onFire;
      const s = take(h, 'a', 'tr', 'placed');
      if (s.fire) {
        doubles++;
        expect(wasOnFire).toBe(true);
        expect(run).toBe(FIRE_STREAK);
        expect(s.points).toBe(2);
        run = 0;
      } else if (s.outcome === 'goal') {
        expect(s.points).toBe(1);
        run = run + 1;
      } else run = 0;
    }
    expect(doubles).toBeGreaterThan(5);
    expect(kicker(h, 'a').points).toBe(kicker(h, 'a').goals + doubles);
  });

  it('a miss or a save resets the run', () => {
    const h = pitch({ settings: { keeperLearns: false } });
    until(h, 'a', 'goal');
    until(h, 'a', 'miss');
    expect(kicker(h, 'a').streak).toBe(0);
  });
});

describe('Spot Kick: House Match', () => {
  const seats: Seat[] = [
    { id: 'a', team: 1 },
    { id: 'b', team: 1 },
    { id: 'c', team: 2 },
    { id: 'd', team: 2 },
  ];

  it('adds goals up for the team, shows the scoreline and scores the teams by their totals', () => {
    const h = pitch({ players: seats, teams: 2, variant: 'spot-kick-house-match' });
    expect(h.host().houseMatch).toBe(true);
    for (let i = 0; i < 20; i++) {
      take(h, 'a', AIMS[i % 5]!);
      take(h, 'b', AIMS[(i + 2) % 5]!);
    }
    const total = kicker(h, 'a').points + kicker(h, 'b').points;
    const t1 = h.host().teams.find((t: any) => t.teamId === 't1');
    expect(t1.goals).toBe(total);
    expect(t1.score).toBe(total);
    h.rt.end('host');
    expect(h.rt.results!.teamStandings!.find((t: any) => t.teamId === 't1')!.score).toBe(total);
    expect(h.rt.results!.summary).toMatch(/house match|level/);
  });

  it('the keeper learns the whole team’s habits, so teammates share one memory', () => {
    const h = pitch({ players: seats, teams: 2, variant: 'spot-kick-house-match' });
    take(h, 'a', 'mid');
    take(h, 'b', 'mid');
    expect(h.view('a').you.reads.mid).toBe(2);
    expect(h.view('b').you.reads.mid).toBe(2);
    expect(h.view('c').you.reads.mid).toBe(0);
  });

  it('without the house match, teams are scored by their average and each player has their own keeper', () => {
    const h = pitch({ players: seats, teams: 2 });
    take(h, 'a', 'mid');
    expect(h.view('b').you.reads.mid).toBe(0);
    expect(h.host().houseMatch).toBe(false);
    const t1 = h.host().teams.find((t: any) => t.teamId === 't1');
    expect(t1.score).toBe(t1.average);
  });
});

describe('Spot Kick: Keeper Duty', () => {
  it('starts every keeper guarding two places and lets the owner change them at any time', () => {
    const h = pitch({ variant: 'spot-kick-keeper-duty' });
    expect(h.view('a').you.guard).toHaveLength(2);
    expect(h.rt.act('a', { type: 'guard', places: ['tl', 'br'] }).ok).toBe(true);
    expect(kicker(h, 'a').guard).toEqual(['tl', 'br']);
    expect(h.rt.act('a', { type: 'guard', places: ['tl', 'tl'] }).ok).toBe(false);
    expect(h.rt.act('a', { type: 'guard', places: ['tl'] }).ok).toBe(false);
  });

  it('refuses a guard plan without keeper duty', () => {
    const h = pitch();
    expect(h.rt.act('a', { type: 'guard', places: ['tl', 'br'] }).ok).toBe(false);
  });

  it('shows the rival’s plan and saves shots at guarded places more often, on the buttons too', () => {
    const h = pitch({ variant: 'spot-kick-keeper-duty', settings: { keeperLearns: false } });
    h.rt.act('b', { type: 'guard', places: ['tl', 'mid'] });
    const you = h.view('a').you;
    expect(you.foe).toEqual({ name: 'B', guard: ['tl', 'mid'] });
    const tl = you.odds.find((o: any) => o.aim === 'tl' && o.power === 'placed');
    const tr = you.odds.find((o: any) => o.aim === 'tr' && o.power === 'placed');
    expect(tl.guarded).toBe(true);
    expect(tl.saved).toBe(BASE_ODDS.placed.tl.save + GUARD_BONUS);
    expect(tr.saved).toBe(BASE_ODDS.placed.tr.save);
    // Over many shots the guarded place is saved at the guarded rate.
    let saves = 0;
    const n = 300;
    for (let i = 0; i < n; i++) if (take(h, 'a', 'tl').outcome === 'saved') saves++;
    expect(Math.abs((saves / n) * 100 - tl.saved)).toBeLessThan(9);
    expect(kicker(h, 'b').kept).toBe(saves);
    expect(kicker(h, 'a').last.keeper).toBe('B');
  });

  it('takes turns at every rival and never at a teammate', () => {
    const h = pitch({ variant: 'spot-kick-keeper-duty', players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], teams: 2 });
    const faced = new Set<string>();
    for (let i = 0; i < 6; i++) faced.add(take(h, 'a').keeper);
    expect([...faced].sort()).toEqual(['C', 'D']);
  });

  it('faces the house keeper, who guards nothing, when there is no rival', () => {
    const h = pitch({ variant: 'spot-kick-keeper-duty', players: ['a'] });
    expect(h.view('a').you.foe).toEqual({ name: null, guard: [] });
    expect(h.view('a').you.odds.every((o: any) => !o.guarded)).toBe(true);
    expect(take(h, 'a').keeper).toBeNull();
  });
});

describe('Spot Kick: Golden Goal', () => {
  it('goes to golden goal when the leaders are level at the whistle, and the next leader’s goal wins', () => {
    const h = pitch({ variant: 'spot-kick-golden-goal', players: ['a', 'b', 'c'], settings: { keeperLearns: false } });
    // Nobody has scored: all three are level at the top.
    earn(h, 'c', 1);
    h.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(h.rt.status).not.toBe('ended');
    const golden = h.view('a').golden;
    expect(golden).not.toBeNull();
    expect(golden.leaders).toEqual(['A', 'B', 'C']);
    for (let i = 0; i < 200 && h.rt.status !== 'ended'; i++) take(h, 'a', AIMS[i % 5]!);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.summary).toContain('Golden goal: A scored the winner');
    expect(h.rt.results!.standings.find((s: any) => s.playerId === 'a')!.rank).toBe(1);
  });

  it('only the players level at the top may shoot during golden goal', () => {
    const h = pitch({ variant: 'spot-kick-golden-goal', players: ['a', 'b', 'c'], settings: { keeperLearns: false } });
    // a and b each score once; c does not.
    for (const id of ['a', 'b']) {
      for (let i = 0; i < 200 && kicker(h, id).points === 0; i++) take(h, id, AIMS[i % 5]!);
    }
    while (kicker(h, 'a').points !== kicker(h, 'b').points) take(h, kicker(h, 'a').points < kicker(h, 'b').points ? 'a' : 'b', 'tl');
    h.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(h.view('a').golden.leaders.sort()).toEqual(['A', 'B']);
    earn(h, 'c', 1);
    expect(h.view('c').you.canShoot).toBe(false);
    expect(shoot(h, 'c').ok).toBe(false);
    expect(h.view('a').you.canShoot).toBe(true);
  });

  it(`ends level if nobody scores within ${GOLDEN_SEC} seconds`, () => {
    const h = pitch({ variant: 'spot-kick-golden-goal' });
    h.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(h.rt.status).not.toBe('ended');
    h.tick(GOLDEN_SEC * 1000 + 10);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.summary).toContain('Nobody scored the golden goal');
  });

  it('ends at the whistle as usual when someone is ahead, or without the setting', () => {
    const ahead = pitch({ variant: 'spot-kick-golden-goal' });
    for (let i = 0; i < 200 && kicker(ahead, 'a').points === 0; i++) take(ahead, 'a', AIMS[i % 5]!);
    ahead.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(ahead.rt.status).toBe('ended');
    const plain = pitch();
    plain.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(plain.rt.status).toBe('ended');
  });

  it('works for teams: level team scores go to golden goal and a goal wins it for the team', () => {
    const h = pitch({ variant: 'spot-kick-golden-goal', players: [{ id: 'a', team: 1 }, { id: 'b', team: 2 }], teams: 2 });
    h.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(h.view('a').golden.teams).toBe(true);
    for (let i = 0; i < 200 && h.rt.status !== 'ended'; i++) take(h, 'b', AIMS[i % 5]!);
    expect(h.rt.results!.summary).toMatch(/^Golden goal: B scored the winner for /);
  });
});

describe('Spot Kick: the game', () => {
  it('ends at the whistle and ranks by goals', () => {
    const h = pitch();
    for (let i = 0; i < 30; i++) take(h, 'a', AIMS[i % 5]!);
    h.tick(meta.common.defaults.timeLimitSec! * 1000 + 10);
    expect(h.rt.status).toBe('ended');
    const a = h.rt.results!.standings.find((s: any) => s.playerId === 'a')!;
    expect(a.score).toBe(kicker(h, 'a').points);
    expect(a.label).toMatch(/goals?$/);
  });

  it('shows every shot on the big screen’s highlights reel, with names, newest first', () => {
    const h = pitch();
    take(h, 'a', 'tl');
    take(h, 'b', 'br', 'blasted');
    const reel = h.host().reel;
    expect(reel[0]).toMatchObject({ name: 'B', aim: 'br', power: 'blasted' });
    expect(reel[1]).toMatchObject({ name: 'A', aim: 'tl', power: 'placed' });
    expect(h.host().totals.shots).toBe(2);
  });

  it('keeps a player view small with 40 players, and the host view too', () => {
    const players = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const h = pitch({ players, variant: 'spot-kick-keeper-duty' });
    for (const p of players) take(h, p, 'mid');
    expect(JSON.stringify(h.view('p0')).length).toBeLessThan(8000);
    expect(JSON.stringify(h.host()).length).toBeLessThan(16000);
  });

  it('gives a late joiner a place of their own', () => {
    const h = pitch();
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: null, isBot: false });
    expect(kicker(h, 'z')).toBeDefined();
    take(h, 'z');
  });

  it('bots finish a game with one player and with a full class, scoring goals and using the keeper plan', () => {
    for (const players of [1, 12]) {
      const r = simulateGame({ modeId: 'spot-kick', mode: spotKick, questions: MIXED_SET, players, seed: 5 + players });
      expect(r.errors).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.results?.endedBy).toBe('mode');
      expect(Math.max(...r.results!.standings.map((s) => s.score))).toBeGreaterThan(0);
    }
    const duty = simulateGame({ modeId: 'spot-kick', variantId: 'spot-kick-keeper-duty', questions: MIXED_SET, players: 6, seed: 8 });
    expect(duty.errors).toEqual([]);
    expect(duty.results?.endedBy).toBe('mode');
  });
});
