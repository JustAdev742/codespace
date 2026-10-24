import { describe, expect, it } from 'vitest';
import { commonSettingsSchema, type Question } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import type { GameMode, ModeVariant } from '../src/sdk/types.ts';
import { findAnswerLeaks, makeTeams, simulateGame, type SimulateOptions, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { oilCapacity, skyLanterns, STORM_CHANCE_CAP, stormChanceAfter } from '../src/modes/sky-lanterns/index.ts';
import { variants as skyVariants } from '../src/modes/sky-lanterns/meta.ts';
import { gloomGiant, startingShield } from '../src/modes/gloom-giant/index.ts';
import { variants as gloomVariants } from '../src/modes/gloom-giant/meta.ts';
import { leanOf, pullStrength, sideOfTeamIndex, tugOfWar, tugScore } from '../src/modes/tug-of-war/index.ts';
import { variants as tugVariants } from '../src/modes/tug-of-war/meta.ts';

/*
 * Sky Lanterns, Gloom Giant and Tug of War: the conformance checks every
 * catalogue mode must pass (played to the end by bots, with churn, pauses,
 * flashcards, teams, determinism and every variant), then the rules
 * themselves, driven through a GameRuntime on a fake clock.
 */

const SUITES: { mode: GameMode; variants: readonly ModeVariant[]; outcomes: string[] }[] = [
  { mode: skyLanterns, variants: skyVariants, outcomes: ['competitive'] },
  { mode: gloomGiant, variants: gloomVariants, outcomes: ['coop-win', 'coop-loss'] },
  { mode: tugOfWar, variants: tugVariants, outcomes: ['competitive'] },
];

const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

function expectClean(r: SimulateResult, outcomes: string[]) {
  expect(problems(r)).toEqual([]);
  expect(r.stalled).toBe(false);
  expect(r.leaks).toEqual([]);
  expect(r.results).not.toBeNull();
  expect(r.results?.endedBy).toBe('mode');
  expect(outcomes).toContain(r.results?.outcome);
  expect(r.results?.standings[0]?.rank).toBe(1);
}

for (const { mode, variants, outcomes } of SUITES) {
  const sim = (opts: Partial<SimulateOptions>) => simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 4, ...opts });

  describe(`${mode.meta.title}: conformance`, () => {
    it('has the catalogue metadata, settings and variants the registry needs', () => {
      expect(mode.meta.pacing).toBe('self');
      expect(mode.meta.status).toBe('playable');
      expect(mode.meta.description.length).toBeGreaterThan(40);
      expect(mode.meta.rules.length).toBeGreaterThan(1);
      expect(mode.meta.questionTypes).not.toContain('flashcard');
      const keys = new Set(mode.settings.map((f) => f.key));
      const commonKeys = new Set(Object.keys(commonSettingsSchema.shape));
      for (const v of variants) {
        expect(v.meta.modeId).toBe(mode.meta.id);
        expect(v.meta.id.startsWith(`${mode.meta.id}-`)).toBe(true);
        expect(v.locked?.length, v.meta.id).toBeGreaterThan(0);
        for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id}: ${k}`).toBe(true);
        for (const k of v.locked ?? []) expect(keys.has(k) || commonKeys.has(k), `${v.meta.id}: ${k}`).toBe(true);
        // Variant presets survive the same clamping the server applies.
        expect(parseSettings(mode.settings, v.settings)).toMatchObject(v.settings ?? {});
      }
      const ids = [mode.meta.id, ...variants.map((v) => v.meta.id)];
      expect(new Set(ids).size).toBe(ids.length);
    });

    const counts = [...new Set([mode.meta.players.min, 4, 12])];
    for (const players of counts) {
      it(`plays to the end with ${players} player${players === 1 ? '' : 's'}`, () => {
        const r = sim({ players, seed: players * 31 });
        expectClean(r, outcomes);
        expect(r.results?.standings).toHaveLength(players);
        expect(r.actions).toBeGreaterThan(0);
      });
    }

    it('survives a pause, a disconnect, a late joiner and a player leaving', () => {
      // A strong room keeps the battle going long enough for the churn at 20 seconds.
      const r = sim({ players: 6, seed: 77, churn: true, pauseAt: 15_000, skill: mode === gloomGiant ? 0.97 : 0.7 });
      expectClean(r, outcomes);
      expect(r.gameMs).toBeGreaterThan(20_000);
      const late = r.results?.standings.find((s) => s.playerId === 'late');
      const leaver = r.results?.standings.find((s) => s.playerId === 'p3');
      expect(late).toBeDefined();
      expect(leaver?.left).toBe(true);
      expect(r.results?.standings).toHaveLength(7);
    });

    it('plays a flashcard-only set after adapting it', () => {
      const r = sim({ questions: FLASHCARD_SET, players: Math.max(mode.meta.players.min, 3), seed: 5 });
      expectClean(r, outcomes);
    });

    it('plays the same way twice with the same seed', () => {
      const a = sim({ players: 5, seed: 99 });
      const b = sim({ players: 5, seed: 99 });
      expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
      expect(a.results?.summary).toBe(b.results?.summary);
      expect(a.gameMs).toBe(b.gameMs);
    });

    if (mode.meta.teams === 'none') {
      it('ignores a team setting', () => {
        const r = sim({ players: 6, common: { teamCount: 2 }, seed: 11 });
        expectClean(r, outcomes);
        expect(r.results?.teamStandings).toEqual([]);
      });
    } else {
      for (const teamCount of [2, 3]) {
        it(`plays with ${teamCount} teams`, () => {
          const r = sim({ players: 6, common: { teamCount }, seed: 11 + teamCount });
          expectClean(r, outcomes);
          expect(r.results?.teamStandings).toHaveLength(teamCount);
        });
      }
    }

    for (const variant of variants) {
      it(`variant ${variant.meta.title} (${variant.meta.id}) plays to the end`, () => {
        const r = sim({ variant, players: Math.max(mode.meta.players.min, 5), seed: 3 });
        expectClean(r, outcomes);
        expect(r.results?.standings).toHaveLength(Math.max(mode.meta.players.min, 5));
      });
    }
  });
}

/* ------------------------------------------------------------------------ */
/* Rule tests: a GameRuntime on a fake clock with questions we can answer.  */
/* ------------------------------------------------------------------------ */

/** Every statement is true, so `true` is always right and `false` always wrong. */
const TRUE_SET: Question[] = Array.from({ length: 6 }, (_, i) => ({ id: `tf${i + 1}`, type: 'truefalse' as const, prompt: `Statement ${i + 1} is true.`, correct: true }));

type Seat = string | { id: string; teamId: string };

function play(mode: GameMode, opts: { players: Seat[]; settings?: Record<string, unknown>; common?: Record<string, unknown>; teams?: number; seed?: number }) {
  const clock = { t: 50_000, now: () => clock.t };
  const errors: unknown[] = [];
  const feed: string[] = [];
  const rt = new GameRuntime({
    mode,
    settings: parseSettings(mode.settings, opts.settings ?? {}),
    common: commonSettingsSchema.parse({ ...mode.defaults, ...opts.common }),
    questions: TRUE_SET,
    players: opts.players.map((s) => {
      const id = typeof s === 'string' ? s : s.id;
      return { id, name: id.toUpperCase(), teamId: typeof s === 'string' ? null : s.teamId, isBot: false };
    }),
    teams: makeTeams(opts.teams ?? 0),
    seed: opts.seed ?? 42,
    clock,
    strict: true,
    listener: { error: (e) => errors.push(e), feed: (f) => feed.push(f.text) },
  });
  expect(rt.start().ok).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = (id: string): any => rt.view({ kind: 'player', playerId: id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const host = (): any => rt.view({ kind: 'host' });
  const answer = (id: string, right = true) => rt.act(id, { type: 'answer', iid: view(id).you.question.iid, answer: { type: 'truefalse', value: right } });
  const advanceTo = (gameMs: number) => {
    clock.t += Math.max(0, gameMs - rt.gameNow());
    rt.fireDueTimers();
  };
  const advance = (ms: number) => advanceTo(rt.gameNow() + ms);
  const leaks = (ids: string[]) => [...findAnswerLeaks(host(), 'host'), ...ids.flatMap((id) => findAnswerLeaks(view(id), id))];
  return { rt, errors, feed, view, host, answer, advanceTo, advance, leaks };
}

describe('Sky Lanterns rules', () => {
  it('earns 1 oil per correct answer, 1 more on every third in a row, and spills what the can cannot hold', () => {
    const g = play(skyLanterns, { players: ['a'] });
    expect(g.view('a').oilCap).toBe(oilCapacity(3));
    const oilAfter = (right: boolean) => {
      expect(g.answer('a', right).ok).toBe(true);
      return g.view('a').you.oil;
    };
    expect(oilAfter(true)).toBe(1);
    expect(g.view('a').you.last.text).toBe('+1 oil');
    expect(oilAfter(true)).toBe(2);
    expect(oilAfter(true)).toBe(4);
    expect(g.view('a').you.last.text).toBe('+2 oil (streak bonus)');
    expect(oilAfter(false)).toBe(4);
    expect(g.view('a').you.last.text).toBe('No oil this time');
    expect(oilAfter(true)).toBe(5);
    expect(oilAfter(true)).toBe(6);
    // Third in a row again (+2), but the can holds 6.
    expect(oilAfter(true)).toBe(6);
    expect(g.view('a').you.last.text).toBe('Your oil can is full: light a lantern');
    expect(g.errors).toEqual([]);
  });

  it('lights lanterns with oil and launches all of them at once for lanterns × the wind', () => {
    const g = play(skyLanterns, { players: ['a'], settings: { storms: false } });
    expect(g.rt.act('a', { type: 'light' })).toMatchObject({ ok: false, message: 'You need 3 oil to light a lantern.' });
    expect(g.rt.act('a', { type: 'launch' })).toMatchObject({ ok: false });
    for (let i = 0; i < 5; i++) g.answer('a');
    expect(g.view('a').you.oil).toBe(6);
    expect(g.rt.act('a', { type: 'light' }).ok).toBe(true);
    expect(g.rt.act('a', { type: 'light' }).ok).toBe(true);
    expect(g.view('a').you).toMatchObject({ oil: 0, ground: 2, score: 0 });
    expect(g.view('a').wind).toMatchObject({ kind: 'calm', mult: 1 });
    expect(g.rt.act('a', { type: 'launch' }).ok).toBe(true);
    expect(g.view('a').you).toMatchObject({ ground: 0, score: 2, launched: 2 });

    // Light three more, then wait for a stronger wind.
    for (let lit = 0; lit < 3; ) {
      if (g.view('a').you.oil >= 3) {
        g.rt.act('a', { type: 'light' });
        lit++;
      } else g.answer('a');
    }
    for (let i = 0; i < 11 && g.view('a').wind.mult < 2; i++) g.advanceTo(g.view('a').wind.changeAt);
    const wind = g.view('a').wind;
    expect(wind.mult).toBeGreaterThanOrEqual(2);
    expect(g.rt.act('a', { type: 'launch' }).ok).toBe(true);
    expect(g.view('a').you.score).toBe(2 + 3 * wind.mult);
    expect(g.view('a').you.lastLaunch).toMatchObject({ count: 3, mult: wind.mult, points: 3 * wind.mult });
    expect(g.host().launches[0]).toMatchObject({ name: 'A', count: 3, points: 3 * wind.mult });
    expect(g.leaks(['a'])).toEqual([]);
    expect(g.errors).toEqual([]);
  });

  it('a storm blows out every lantern still on the ground, but never launched points or oil', () => {
    const g = play(skyLanterns, { players: ['a', 'b'], settings: { stormChance: 50, stormRise: 25 }, common: { timeLimitSec: 900 } });
    // A: launch one lantern (safe), light another and keep some oil. B: two lanterns on the ground.
    for (let i = 0; i < 3; i++) g.answer('a');
    g.rt.act('a', { type: 'light' });
    g.rt.act('a', { type: 'launch' });
    for (let i = 0; i < 3; i++) g.answer('a');
    g.rt.act('a', { type: 'light' });
    for (let i = 0; i < 5; i++) g.answer('b');
    g.rt.act('b', { type: 'light' });
    g.rt.act('b', { type: 'light' });
    const a0 = g.view('a').you;
    const b0 = g.view('b').you;
    expect(a0).toMatchObject({ ground: 1, score: 1 });
    expect(a0.oil).toBeGreaterThan(0);
    expect(b0).toMatchObject({ ground: 2, score: 0 });

    let stormed = false;
    for (let i = 0; i < 30 && !stormed; i++) {
      g.advanceTo(g.view('a').wind.changeAt);
      const a = g.view('a').you;
      const b = g.view('b').you;
      if (g.view('a').wind.storm) {
        stormed = true;
        expect(g.view('a').wind).toMatchObject({ kind: 'calm', mult: 1, storm: { lost: 3 } });
        expect(a).toMatchObject({ ground: 0, score: a0.score, oil: a0.oil, lost: 1, lastLoss: { count: 1 } });
        expect(b).toMatchObject({ ground: 0, score: 0, oil: b0.oil, lost: 2 });
        expect(g.feed).toContain('A storm blew out 3 lanterns!');
      } else {
        expect(a.ground).toBe(1);
        expect(b.ground).toBe(2);
      }
    }
    expect(stormed).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('forecasts a storm chance that rises after every change without a storm and resets after one', () => {
    expect(stormChanceAfter(0, { storms: true, stormChance: 10, stormRise: 10 })).toBe(10);
    expect(stormChanceAfter(3, { storms: true, stormChance: 10, stormRise: 10 })).toBe(40);
    expect(stormChanceAfter(20, { storms: true, stormChance: 10, stormRise: 10 })).toBe(STORM_CHANCE_CAP);
    expect(stormChanceAfter(5, { storms: false, stormChance: 10, stormRise: 10 })).toBe(0);

    const g = play(skyLanterns, { players: ['a'], settings: { stormChance: 10, stormRise: 20 }, common: { timeLimitSec: 1500 } });
    let chance = g.view('a').forecast.chance;
    expect(chance).toBe(10);
    let storms = 0;
    let quiet = 0;
    for (let i = 0; i < 40; i++) {
      g.advanceTo(g.view('a').wind.changeAt);
      const v = g.view('a');
      if (v.wind.storm) {
        storms++;
        expect(v.forecast.chance).toBe(10);
      } else {
        quiet++;
        expect(['calm', 'breezy', 'gusty']).toContain(v.wind.kind);
        expect(v.forecast.chance).toBe(Math.min(STORM_CHANCE_CAP, chance + 20));
      }
      // Players and the big screen see the same forecast, and nothing about the wind to come.
      expect(g.host().forecast).toEqual(v.forecast);
      expect(Object.keys(v.wind).sort()).toEqual(['changeAt', 'changes', 'kind', 'label', 'mult', 'since', 'storm']);
      chance = v.forecast.chance;
    }
    expect(storms).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });

  it('changes the wind on a fixed beat and stops changing before the end', () => {
    const g = play(skyLanterns, { players: ['a'], settings: { windChangeSec: 20 }, common: { timeLimitSec: 60 } });
    const starts: number[] = [];
    for (let i = 0; i < 5 && g.view('a').wind.changeAt !== null; i++) {
      starts.push(g.view('a').wind.changeAt - g.view('a').wind.since);
      g.advanceTo(g.view('a').wind.changeAt);
    }
    expect(starts).toEqual([20_000, 20_000]);
    expect(g.view('a').wind.changes).toBe(2);
    expect(g.view('a').wind.changeAt).toBeNull();
  });

  it('lanterns still on the ground when time runs out do not score', () => {
    const g = play(skyLanterns, { players: ['a', 'b'], settings: { storms: false }, common: { timeLimitSec: 20 } });
    for (let i = 0; i < 3; i++) g.answer('a');
    g.rt.act('a', { type: 'light' });
    g.rt.act('a', { type: 'launch' });
    for (let i = 0; i < 3; i++) g.answer('a');
    g.rt.act('a', { type: 'light' });
    for (let i = 0; i < 3; i++) g.answer('b');
    g.rt.act('b', { type: 'light' });
    g.advanceTo(g.view('a').endsAt);
    expect(g.rt.status).toBe('ended');
    const byId = Object.fromEntries(g.rt.results!.standings.map((s) => [s.playerId, s]));
    expect(byId.a).toMatchObject({ score: 1, rank: 1, label: '1 point from 1 lantern' });
    expect(byId.b).toMatchObject({ score: 0, rank: 2, label: '0 points' });
    expect(g.rt.results!.summary).toBe('A lit up the sky with 1 point.');
    expect(g.feed).toContain('Time is up! 2 lanterns never left the ground.');
  });

  it('Calm Skies never brings a storm', () => {
    const calm = skyVariants.find((v) => v.meta.id === 'sky-lanterns-calm-skies')!;
    const g = play(skyLanterns, { players: ['a'], settings: calm.settings, common: { timeLimitSec: 1500 } });
    for (let i = 0; i < 50; i++) {
      g.advanceTo(g.view('a').wind.changeAt);
      expect(g.view('a').wind.storm).toBeNull();
      expect(g.view('a').forecast).toMatchObject({ storms: false, chance: 0 });
    }
  });

  it('Tempest brings a rare gale that scores ×4', () => {
    const tempest = skyVariants.find((v) => v.meta.id === 'sky-lanterns-tempest')!;
    const g = play(skyLanterns, { players: ['a'], settings: tempest.settings, common: { timeLimitSec: 3600 } });
    expect(g.view('a').forecast.chance).toBe(25);
    // Fill the can (oil is safe from storms), then light and launch only when a gale blows.
    for (let i = 0; i < 5; i++) g.answer('a');
    expect(g.view('a').you.oil).toBe(6);
    for (let i = 0; i < 140 && g.view('a').wind.kind !== 'gale'; i++) g.advanceTo(g.view('a').wind.changeAt);
    expect(g.view('a').wind).toMatchObject({ kind: 'gale', mult: 4 });
    expect(g.feed).toContain('A gale! Every lantern launched now scores ×4.');
    g.rt.act('a', { type: 'light' });
    g.rt.act('a', { type: 'light' });
    g.rt.act('a', { type: 'launch' });
    expect(g.view('a').you.score).toBe(8);
  });

  it('bots light, launch and answer', () => {
    const r = simulateGame({ modeId: 'sky-lanterns', mode: skyLanterns, questions: MIXED_SET, players: 3, seed: 8 });
    const standings = r.results!.standings;
    expect(standings.some((s) => s.score > 0)).toBe(true);
    expect(standings.every((s) => s.stats.answered > 0)).toBe(true);
  });
});

describe('Gloom Giant rules', () => {
  it('sizes the giant and the shield from the room, and grows the giant once for each late joiner', () => {
    expect(startingShield(5, 1)).toBe(6);
    expect(startingShield(5, 4)).toBe(7);
    expect(startingShield(5, 5)).toBe(8);
    expect(startingShield(5, 4, '3')).toBe(17);
    // The default is 3 extra shield per player: 5 + 4 x 3.
    const g = play(gloomGiant, { players: ['a', 'b', 'c', 'd'] });
    expect(g.host()).toMatchObject({ hp: 48, maxHp: 48, shield: 17, shieldMax: 17, enraged: false });
    g.rt.addPlayer({ id: 'e', name: 'E', teamId: null, isBot: false });
    expect(g.host()).toMatchObject({ hp: 60, maxHp: 60, shield: 17 });
    g.rt.removePlayer('e');
    g.rt.addPlayer({ id: 'e', name: 'E', teamId: null, isBot: false });
    expect(g.host()).toMatchObject({ hp: 60, maxHp: 60 });
    expect(g.view('e').you.question).not.toBeNull();
    expect(g.errors).toEqual([]);
  });

  it('a correct answer deals 1 damage, +1 on a streak of three or more, +1 on a critical hit', () => {
    const g = play(gloomGiant, { players: ['a', 'b', 'c', 'd'], settings: { shieldPerPlayer: 'half', hpPerPlayer: 40 } });
    let crits = 0;
    for (let i = 0; i < 60; i++) {
      const id = ['a', 'b', 'c', 'd'][i % 4]!;
      const before = g.view(id).you;
      const hpBefore = g.host().hp;
      g.answer(id);
      const after = g.view(id).you;
      const crit = after.crits - before.crits;
      crits += crit;
      const expected = 1 + (after.streak >= 3 ? 1 : 0) + crit;
      expect(after.damage - before.damage).toBe(expected);
      expect(hpBefore - g.host().hp).toBe(expected);
      if (crit) expect(after.last.text).toMatch(/critical hit/);
    }
    expect(crits).toBeGreaterThan(0);
    // A wrong answer breaks the streak, so the next hit is back to 1 (plus any critical).
    g.answer('a', false);
    const before = g.view('a').you;
    g.answer('a');
    const after = g.view('a').you;
    expect(after.damage - before.damage).toBe(1 + (after.crits - before.crits));
    expect(g.feed.some((f) => f.endsWith('landed a critical hit.'))).toBe(true);
  });

  it('wrong answers cost the shield 1, then 2 once the giant is enraged below half health', () => {
    const g = play(gloomGiant, { players: ['a'], settings: { shieldPerPlayer: 'half', hpPerPlayer: 20, shieldBase: 10 } });
    expect(g.host()).toMatchObject({ hp: 20, shield: 11 });
    g.answer('a', false);
    expect(g.host().shield).toBe(10);
    expect(g.view('a').you.last.text).toBe('The giant struck the shield (−1)');
    while (!g.host().enraged) g.answer('a');
    expect(g.host().hp).toBeLessThan(10);
    expect(g.feed).toContain('The Gloom Giant is enraged! Wrong answers now cost 2 shield.');
    g.answer('a', false);
    expect(g.host().shield).toBe(8);
    expect(g.host().recent[0]).toMatchObject({ kind: 'strike', amount: 2, name: 'A' });
  });

  it('wins for everyone when the giant falls', () => {
    const g = play(gloomGiant, { players: ['a', 'b'], settings: { shieldPerPlayer: 'half', hpPerPlayer: 4 } });
    for (let i = 0; i < 20 && g.rt.status === 'running'; i++) g.answer(i % 2 ? 'b' : 'a');
    expect(g.rt.status).toBe('ended');
    const r = g.rt.results!;
    expect(r.outcome).toBe('coop-win');
    expect(r.summary).toMatch(/^The Gloom Giant is down\. [AB] landed the final blow\.$/);
    expect(r.standings.reduce((n, s) => n + s.score, 0)).toBe(8);
    for (const s of r.standings) expect(s.label).toBe(`${s.score} damage`);
    expect(g.feed.some((f) => /landed the final blow/.test(f))).toBe(true);
    expect(g.rt.act('a', { type: 'answer', iid: 'q1', answer: { type: 'truefalse', value: true } }).ok).toBe(false);
  });

  it('loses for everyone when the shield breaks', () => {
    const g = play(gloomGiant, { players: ['a', 'b'], settings: { shieldPerPlayer: 'half', shieldBase: 1 } });
    expect(g.host().shield).toBe(2);
    g.answer('a');
    g.answer('a', false);
    expect(g.rt.status).toBe('running');
    const hp = g.host().hp;
    expect(hp).toBeLessThan(24);
    g.answer('b', false);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results).toMatchObject({ outcome: 'coop-loss', summary: `The shield broke with the Gloom Giant on ${hp} of 24 health.` });
    expect(g.feed).toContain('The shield shattered.');
  });

  it('loses for everyone when time runs out', () => {
    const g = play(gloomGiant, { players: ['a'], common: { timeLimitSec: 60 } });
    g.answer('a');
    g.advance(59_000);
    expect(g.rt.status).toBe('running');
    g.advance(1_000);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results!.outcome).toBe('coop-loss');
    expect(g.rt.results!.summary).toMatch(/^Time ran out with the Gloom Giant on 1[01] of 12 health\.$/);
  });

  it('bots reach both endings: a sharp room wins, a struggling room loses', () => {
    const win = simulateGame({ modeId: 'gloom-giant', mode: gloomGiant, questions: MIXED_SET, players: 6, skill: 1, seed: 21 });
    expectClean(win, ['coop-win']);
    const loss = simulateGame({ modeId: 'gloom-giant', mode: gloomGiant, questions: MIXED_SET, players: 6, skill: 0.1, seed: 21 });
    expectClean(loss, ['coop-loss']);
  });

  it('never puts a question or an answer in the big-screen view', () => {
    const g = play(gloomGiant, { players: ['a', 'b'] });
    g.answer('a');
    g.answer('b', false);
    expect(g.host().you).toBeNull();
    expect(g.leaks(['a', 'b'])).toEqual([]);
  });
});

describe('Tug of War rules', () => {
  const side = (id: string, team: 1 | 2 | 3 | 4) => ({ id, teamId: `t${team}` });

  it('makes team size irrelevant: (players on the smaller side) ÷ (players on your side) per pull', () => {
    expect(pullStrength('left', { left: 3, right: 5 })).toBe(1);
    expect(pullStrength('right', { left: 3, right: 5 })).toBeCloseTo(0.6);
    for (const [l, r] of [[1, 1], [2, 4], [3, 5], [1, 7], [10, 13], [29, 30]] as const) {
      const counts = { left: l, right: r };
      // Same answers per player per minute => same pull per minute for each side.
      expect(l * pullStrength('left', counts)).toBeCloseTo(r * pullStrength('right', counts));
      expect(Math.max(pullStrength('left', counts), pullStrength('right', counts))).toBe(1);
    }
    // A side with nobody connected still lets the other side pull.
    expect(pullStrength('left', { left: 3, right: 0 })).toBeCloseTo(1 / 3);
  });

  it('two players and four players pulling once each leave the knot where it started', () => {
    const g = play(tugOfWar, { players: [side('a', 1), side('b', 1), side('c', 2), side('d', 2), side('e', 2), side('f', 2)], teams: 2 });
    expect(g.view('a').you).toMatchObject({ side: 'left', strength: 1 });
    expect(g.view('c').you).toMatchObject({ side: 'right', strength: 0.5 });
    g.answer('a');
    expect(g.host().pos).toBe(-1);
    expect(g.view('a').you.last.text).toBe('Pulled 1 space');
    g.answer('c');
    expect(g.host().pos).toBe(-0.5);
    expect(g.view('c').you.last.text).toBe('Pulled 0.5 spaces');
    for (const id of ['b', 'd', 'e', 'f']) g.answer(id);
    expect(g.host().pos).toBe(0);
    expect(g.host().sides.left).toMatchObject({ label: 'Comets', players: 2, pulls: 2, distance: 2 });
    expect(g.host().sides.right).toMatchObject({ label: 'Lanterns', players: 4, pulls: 4, distance: 2 });
    // Wrong answers do not move the rope unless it is slippery.
    g.answer('a', false);
    expect(g.host().pos).toBe(0);
    // Disconnected players do not count: two of four drop out, so each right-side pull is worth 1.
    g.rt.setConnected('e', false);
    g.rt.setConnected('f', false);
    g.answer('d');
    expect(g.host().pos).toBe(1);
    expect(g.leaks(['a', 'c'])).toEqual([]);
    expect(g.errors).toEqual([]);
  });

  it('the first side to drag the knot to its end wins', () => {
    const g = play(tugOfWar, { players: [side('a', 1), side('b', 2)], teams: 2, settings: { ropeLength: 8 } });
    for (let i = 0; i < 7; i++) g.answer('a');
    expect(g.rt.status).toBe('running');
    expect(g.feed).toEqual(['The Comets have the knot halfway to their line.', 'The Comets are nearly over the line.']);
    g.answer('a');
    expect(g.rt.status).toBe('ended');
    const r = g.rt.results!;
    expect(r.summary).toBe('The Comets pulled the knot over the line.');
    expect(r.teamStandings).toEqual([
      { teamId: 't1', name: 'Comets', rank: 1, score: 100, label: 'Won: knot over their line' },
      { teamId: 't2', name: 'Lanterns', rank: 2, score: 0, label: 'Lost: knot over the other line' },
    ]);
    expect(r.standings.map((s) => [s.playerId, s.score, s.label])).toEqual([
      ['a', 8, '8 pulls'],
      ['b', 0, '0 pulls'],
    ]);
  });

  it('when time runs out the side the knot leans to wins, and dead level is a draw', () => {
    const lean = play(tugOfWar, { players: [side('a', 1), side('b', 2)], teams: 2, common: { timeLimitSec: 30 } });
    lean.answer('b');
    lean.answer('b');
    lean.answer('a');
    lean.advance(30_000);
    expect(lean.rt.status).toBe('ended');
    expect(lean.rt.results!.summary).toBe('Time is up with the knot 1 space towards the Lanterns.');
    expect(lean.rt.results!.teamStandings.map((t) => [t.teamId, t.rank, t.score])).toEqual([
      ['t2', 1, 53],
      ['t1', 2, 47],
    ]);

    const level = play(tugOfWar, { players: [side('a', 1), side('b', 2)], teams: 2, common: { timeLimitSec: 30 } });
    level.answer('a');
    level.answer('b');
    level.advance(30_000);
    expect(level.rt.status).toBe('ended');
    expect(level.rt.results!.summary).toBe('Time is up with the knot dead level. It is a draw.');
    expect(level.rt.results!.teamStandings.map((t) => [t.rank, t.score])).toEqual([
      [1, 50],
      [1, 50],
    ]);
  });

  it('scores teams out of 100, always in favour of the side the knot leans to', () => {
    expect(tugScore('left', -20, 20)).toBe(100);
    expect(tugScore('right', -20, 20)).toBe(0);
    expect(tugScore('left', 0, 20)).toBe(50);
    expect(tugScore('right', 0.001, 20)).toBe(51);
    expect(tugScore('left', 0.001, 20)).toBe(49);
    expect(tugScore('right', 4, 20)).toBe(60);
    expect(tugScore('left', 4, 20)).toBe(40);
    expect(leanOf(0)).toBe('draw');
    expect(leanOf(-0.5)).toBe('left');
  });

  it('with more than two teams, teams alternate onto the two sides', () => {
    expect([0, 1, 2, 3].map(sideOfTeamIndex)).toEqual(['left', 'right', 'left', 'right']);
    const g = play(tugOfWar, { players: [side('a', 1), side('b', 2), side('c', 3), side('d', 4), side('e', 3)], teams: 4, common: { timeLimitSec: 30 } });
    const h = g.host();
    expect(h.sides.left.teams.map((t: { id: string }) => t.id)).toEqual(['t1', 't3']);
    expect(h.sides.right.teams.map((t: { id: string }) => t.id)).toEqual(['t2', 't4']);
    expect(h.sides.left).toMatchObject({ label: 'Comets and Fireflies', players: 3 });
    expect(g.view('c').you.side).toBe('left');
    g.answer('c');
    expect(g.host().pos).toBeCloseTo(-2 / 3);
    g.advance(30_000);
    const teams = Object.fromEntries(g.rt.results!.teamStandings.map((t) => [t.teamId, t]));
    expect(teams.t1!.score).toBe(teams.t3!.score);
    expect(teams.t2!.score).toBe(teams.t4!.score);
    expect(teams.t1!.rank).toBe(1);
    expect(teams.t2!.rank).toBe(3);
  });

  it('Slippery Rope: a wrong answer lets the rope slip half a pull towards the other side', () => {
    const slack = tugVariants.find((v) => v.meta.id === 'tug-of-war-slack')!;
    const g = play(tugOfWar, { players: [side('a', 1), side('b', 2), side('c', 2)], teams: 2, settings: slack.settings });
    g.answer('a', false);
    expect(g.host().pos).toBe(0.5);
    expect(g.view('a').you).toMatchObject({ slips: 1, pulls: 0 });
    expect(g.view('a').you.last.text).toBe('The rope slipped 0.5 spaces the other way');
    g.answer('b', false);
    expect(g.host().pos).toBe(0.25);
  });

  it('Marathon Tug doubles the rope and the clock', () => {
    const marathon = tugVariants.find((v) => v.meta.id === 'tug-of-war-marathon')!;
    const g = play(tugOfWar, { players: [side('a', 1), side('b', 2)], teams: 2, settings: marathon.settings, common: marathon.common });
    expect(g.host()).toMatchObject({ ropeLength: 40 });
    expect(g.host().endsAt - g.rt.gameNow()).toBe(480_000);
  });
});
