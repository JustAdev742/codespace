import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import {
  BONUS_METER_MAX,
  HIDDEN_FORT,
  SHRINE_NEWS_GAP_MS,
  NOBODY,
  UNSEEN,
  botMove,
  contribution,
  contributionLabel,
  energyFor,
  eventPool,
  lanternLands,
  pickEvent,
  scoreFor,
  smallTeamBoost,
  underdogBoost,
} from '../src/modes/lantern-lands/index.ts';
import { BOOST_CAP, EVENT_KINDS, EVENT_WEIGHTS, SHRINE_FORT_COST, SHRINE_RAID_COST, UNDERDOG_BOOST, variants, type EventKind } from '../src/modes/lantern-lands/meta.ts';
import { HOME_CORNERS, buildMap, corner, distance, distancesFrom, fairShrineCounts, grid, landCount, orderFrom, shrineCountFor, type LanternMap } from '../src/modes/lantern-lands/map.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { TRUE_SET, drive, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Lantern Lands: energy, the three map actions and their refusals, races
 * between players, scoring, the final glow, room events and their odds, fog,
 * the two boosts, results, view size, the map builder's fairness, the bots and
 * every variant. Games run on the small map with events off unless a test says
 * otherwise, on a fake clock, with questions whose answer is always True.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const pick = (id: string) => variants.find((v) => v.meta.id === id)!;
const duo: Seat[] = [
  { id: 'a', team: 1 },
  { id: 'b', team: 2 },
];

function start(o: Parameters<typeof drive>[1] = {}) {
  return drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, ...o, settings: { mapSize: 'small', events: false, ...o.settings } });
}

const you = (h: Driven, id: string) => h.view(id).you;
const blockedOf = (map: LanternMap) => new Set([...map.lakes, ...map.hills]);
const homeOf = (h: Driven, id: string) => h.host().map.homes[you(h, id).team] as number;

/** Answers right until the player holds at least `n` energy. */
function charge(h: Driven, id: string, n = 1) {
  for (let i = 0; i < 30 && you(h, id).energy < n; i++) expect(h.answer(id, 'right').ok).toBe(true);
  expect(you(h, id).energy).toBeGreaterThanOrEqual(n);
}

/** Brings a player's energy to exactly `n`, by spending it on plain lands or by answering. */
function setEnergy(h: Driven, id: string, n: number) {
  for (let i = 0; i < 40; i++) {
    const v = you(h, id);
    if (v.energy === n) return;
    if (v.energy > n) {
      const shrines: number[] = h.host().map.shrines;
      const claim = v.options.claim.find((l: number) => !shrines.includes(l));
      const fort = v.options.fortify.find((l: number) => !shrines.includes(l));
      if (claim !== undefined) h.rt.act(id, { type: 'claim', land: claim });
      else if (fort !== undefined) h.rt.act(id, { type: 'fortify', land: fort });
      else throw new Error(`${id} has nothing to spend energy on`);
    } else {
      // A wrong answer first, so the right one is not a streak worth 2.
      h.answer(id, 'wrong');
      h.answer(id, 'right');
    }
  }
  throw new Error(`could not set the energy of ${id} to ${n}`);
}

/** Claims the open land that gets the player's team closest to `target`. */
function claimStep(h: Driven, id: string, target: number) {
  const v = h.view(id);
  const blocked = blockedOf(v.map);
  const dist = distancesFrom(v.map.radius, [target], (l) => !blocked.has(l));
  const next = [...(v.you.options.claim as number[])].filter((l) => l !== target).sort((x, y) => dist[x]! - dist[y]! || x - y)[0];
  if (next === undefined) throw new Error(`${id} has nothing to claim`);
  charge(h, id);
  expect(h.rt.act(id, { type: 'claim', land: next })).toEqual({ ok: true });
  return next;
}

/** Claims towards `target` until the team holds a land next to it. */
function claimToward(h: Driven, id: string, target: number) {
  for (let i = 0; i < 20; i++) {
    const v = h.view(id);
    if (grid(v.map.radius).adj[target]!.some((n) => v.owner[n] === v.you.team)) return;
    claimStep(h, id, target);
  }
  throw new Error(`${id} never reached ${target}`);
}

/** B claims two lands towards A's home, then A claims towards B's home until A has a rival land to raid. */
function meet(h: Driven) {
  claimStep(h, 'b', homeOf(h, 'a'));
  claimStep(h, 'b', homeOf(h, 'a'));
  for (let i = 0; i < 12 && !you(h, 'a').options.raid.length; i++) claimStep(h, 'a', homeOf(h, 'b'));
  expect(you(h, 'a').options.raid.length).toBeGreaterThan(0);
}

/** A game whose first room event (at 60 seconds, after `setup`) is `kind`, found by trying seeds in turn. */
function withFirstEvent(kind: EventKind, setup: (h: Driven) => void = () => {}, players = duo) {
  for (let seed = 1; seed < 300; seed++) {
    const h = drive(lanternLands, { players, teams: 2, questions: TRUE_SET, seed, settings: { mapSize: 'small' } });
    setup(h);
    h.tick(60_000);
    if (h.host().event?.kind === kind) return h;
  }
  throw new Error(`no seed starts with ${kind}`);
}

/* --------------------------------- energy -------------------------------- */

describe('Lantern Lands energy', () => {
  it('gives 1 energy for a right answer, 2 from the fourth right in a row, none for a wrong one, and stops at the cap', () => {
    const h = start();
    expect(h.answer('a').ok).toBe(true);
    expect(you(h, 'a')).toMatchObject({ energy: 1, cap: 3, streak: 1 });
    expect(you(h, 'a').last.text).toBe('+1 energy');
    h.answer('a');
    h.answer('a');
    expect(you(h, 'a').energy).toBe(3);
    // The fourth right answer in a row is worth 2, but 3 is all a player can hold.
    h.answer('a');
    expect(you(h, 'a').energy).toBe(3);
    expect(you(h, 'a').last.text).toBe('Your energy is full: spend it on the map');
    claimStep(h, 'a', homeOf(h, 'b'));
    expect(you(h, 'a').energy).toBe(2);
    h.answer('a');
    expect(you(h, 'a').energy).toBe(3);
    expect(you(h, 'a').last.text).toBe('+1 energy (5 in a row). The rest did not fit');
    claimStep(h, 'a', homeOf(h, 'b'));
    claimStep(h, 'a', homeOf(h, 'b'));
    h.answer('a');
    expect(you(h, 'a').energy).toBe(3);
    expect(you(h, 'a').last.text).toBe('+2 energy (6 in a row)');
    h.answer('a', 'wrong');
    expect(you(h, 'a')).toMatchObject({ energy: 3, streak: 0 });
    expect(you(h, 'a').last.text).toBe('No energy this time');
    expect(h.errors).toEqual([]);
  });

  it('works out the energy of an answer and both boosts', () => {
    expect(energyFor(3, false)).toBe(1);
    expect(energyFor(4, false)).toBe(2);
    expect(energyFor(1, true)).toBe(2);
    expect(smallTeamBoost(6, 7)).toBeCloseTo(1 / 6);
    expect(smallTeamBoost(5, 5)).toBe(0);
    expect(smallTeamBoost(7, 6)).toBe(0);
    expect(smallTeamBoost(1, 10)).toBe(BOOST_CAP - 1);
    expect(underdogBoost(10, 20)).toBeCloseTo(0.5 * UNDERDOG_BOOST);
    expect(underdogBoost(20, 20)).toBe(0);
    expect(underdogBoost(0, 0)).toBe(0);
  });

  it('gives a smaller team bonus energy, so one player against two earns 2 per right answer', () => {
    const h = start({ players: [{ id: 'a', team: 1 }, { id: 'c', team: 1 }, { id: 'b', team: 2 }] });
    expect(you(h, 'b').boost).toMatchObject({ small: 1, under: 0, players: 1, biggest: 2 });
    expect(you(h, 'a').boost).toBeNull();
    h.answer('b');
    expect(you(h, 'b').energy).toBe(2);
    expect(you(h, 'b').last.text).toBe('+2 energy (small team boost)');
    h.answer('a');
    expect(you(h, 'a').energy).toBe(1);
    // Disconnected players do not count: with C away, the teams are level.
    h.rt.setConnected('c', false);
    expect(you(h, 'b').boost).toBeNull();
  });

  it('lets the team with the fewest lands hold one more energy, and fills its bonus meter the further behind it is', () => {
    const h = start();
    claimStep(h, 'a', homeOf(h, 'b'));
    expect(you(h, 'a')).toMatchObject({ underdog: false, cap: 3, boost: null });
    expect(you(h, 'b')).toMatchObject({ underdog: true, cap: 4 });
    expect(you(h, 'b').boost).toMatchObject({ small: 0, lands: 1, most: 2 });
    expect(you(h, 'b').boost.under).toBeCloseTo(0.5 * UNDERDOG_BOOST);
    h.answer('b');
    h.answer('b');
    expect(you(h, 'b').energy).toBe(2);
    expect(you(h, 'b').boost.meter).toBeCloseTo(2 * 0.5 * UNDERDOG_BOOST);
    h.answer('b');
    // The third answer tips the meter over 1: 1 energy plus 1 bonus, which the underdog cap of 4 has room for.
    expect(you(h, 'b').energy).toBe(4);
    expect(you(h, 'b').last.text).toBe('+2 energy (underdog boost)');
    expect(you(h, 'b').boost.meter).toBeCloseTo(3 * 0.5 * UNDERDOG_BOOST - 1);
    expect(BONUS_METER_MAX).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------- map actions ----------------------------- */

describe('Lantern Lands map actions', () => {
  it('claims an empty land next to the team for 1 energy, with no fort', () => {
    const h = start();
    const options: number[] = you(h, 'a').options.claim;
    const home = homeOf(h, 'a');
    expect(options.length).toBeGreaterThan(0);
    for (const l of options) expect(grid(3).adj[l]).toContain(home);
    expect(h.rt.act('a', { type: 'claim', land: options[0] })).toMatchObject({ ok: false, message: 'You need 1 energy for that. Answer a question to get some.' });
    charge(h, 'a', 2);
    const before = you(h, 'a').energy;
    expect(h.rt.act('a', { type: 'claim', land: options[0] }).ok).toBe(true);
    expect(h.host().owner[options[0]!]).toBe(0);
    expect(h.host().fort[options[0]!]).toBe(0);
    expect(you(h, 'a')).toMatchObject({ energy: before - 1, stats: { claims: 1 }, move: { kind: 'claim', land: options[0] } });
    expect(h.host().changes[0]).toMatchObject({ land: options[0], team: 0, from: NOBODY });
  });

  it('refuses lands that are not next to the team, lakes and hills, and lands off the map, at no cost', () => {
    const h = drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, settings: { events: false } });
    charge(h, 'a', 3);
    const map: LanternMap = h.host().map;
    expect(h.rt.act('a', { type: 'claim', land: map.shrines[0] })).toMatchObject({ ok: false, message: 'You can only claim a land next to your team’s lands.' });
    const blocked = [...map.lakes, ...map.hills];
    expect(blocked.length).toBeGreaterThan(0);
    expect(h.rt.act('a', { type: 'claim', land: blocked[0] })).toMatchObject({ ok: false, message: 'Nobody can light a lake or a hill.' });
    expect(h.rt.act('a', { type: 'claim', land: 399 })).toMatchObject({ ok: false, message: 'That land is not on this map.' });
    expect(h.rt.act('a', { type: 'claim', land: 401 })).toMatchObject({ ok: false });
    expect(you(h, 'a').energy).toBe(3);
  });

  it('fortifies one of the team’s lands for 1 energy, up to 3 forts, but never a home', () => {
    const h = start();
    const land = claimStep(h, 'a', homeOf(h, 'b'));
    for (let f = 1; f <= 3; f++) {
      charge(h, 'a');
      const before = you(h, 'a').energy;
      expect(h.rt.act('a', { type: 'fortify', land }).ok).toBe(true);
      expect(h.host().fort[land]).toBe(f);
      expect(you(h, 'a').energy).toBe(before - 1);
    }
    charge(h, 'a');
    expect(h.rt.act('a', { type: 'fortify', land })).toMatchObject({ ok: false, message: 'That land already has 3 forts, the most it can hold.' });
    expect(you(h, 'a').options.fortify).not.toContain(land);
    expect(h.rt.act('a', { type: 'fortify', land: homeOf(h, 'a') })).toMatchObject({ ok: false, message: 'Homes can never be raided, so they need no fort.' });
    expect(h.rt.act('a', { type: 'fortify', land: you(h, 'a').options.claim[0] })).toMatchObject({ ok: false, message: 'Your team does not hold that land. Claim it first.' });
    expect(you(h, 'a').stats.forts).toBe(3);
  });

  it('raids a rival land next to the team: a raid takes a fort off, and a land with no fort is captured', () => {
    const h = start();
    meet(h);
    const target: number = you(h, 'a').options.raid.find((l: number) => !h.host().map.shrines.includes(l));
    expect(target).toBeDefined();
    charge(h, 'b');
    expect(h.rt.act('b', { type: 'fortify', land: target }).ok).toBe(true);
    expect(h.host().fort[target]).toBe(1);
    charge(h, 'a', 2);
    let before = you(h, 'a').energy;
    expect(h.rt.act('a', { type: 'raid', land: target }).ok).toBe(true);
    expect(h.host().owner[target]).toBe(1);
    expect(h.host().fort[target]).toBe(0);
    expect(you(h, 'a')).toMatchObject({ energy: before - 1, stats: { raids: 1, captures: 0 }, move: { kind: 'raid', land: target, fort: 0 } });
    before = you(h, 'a').energy;
    expect(h.rt.act('a', { type: 'raid', land: target }).ok).toBe(true);
    expect(h.host().owner[target]).toBe(0);
    expect(h.host().fort[target]).toBe(0);
    expect(you(h, 'a')).toMatchObject({ energy: before - 1, stats: { raids: 1, captures: 1 }, move: { kind: 'capture', land: target } });
    expect(h.host().changes[0]).toMatchObject({ land: target, team: 0, from: 1 });
    expect(h.host().plays[0].text).toBe(`A captured ${grid(3).labels[target]} from the Lanterns`);
    // B's homes and lands far away cannot be raided.
    expect(h.rt.act('a', { type: 'raid', land: homeOf(h, 'b') })).toMatchObject({ ok: false, message: 'Homes cannot be raided.' });
    expect(h.rt.act('a', { type: 'raid', land: target })).toMatchObject({ ok: false, message: 'Your team holds that land now.' });
    expect(h.rt.act('a', { type: 'raid', land: you(h, 'a').options.claim[0] ?? 0 })).toMatchObject({ ok: false });
    expect(h.errors).toEqual([]);
  });

  it('charges 2 energy to raid or to fortify a shrine', () => {
    expect(SHRINE_RAID_COST).toBe(2);
    expect(SHRINE_FORT_COST).toBe(2);
    const h = start();
    const centre: number = h.host().map.shrines[0];
    claimToward(h, 'b', centre);
    charge(h, 'b');
    expect(h.rt.act('b', { type: 'claim', land: centre }).ok).toBe(true);
    expect(h.feed.map((f) => f.text)).toContain('The Lanterns lit the centre shrine!');
    expect(h.host().plays[0].text).toBe('B lit the centre shrine for the Lanterns');
    // With 1 energy B cannot fortify the shrine: that needs 2.
    setEnergy(h, 'b', 1);
    expect(h.rt.act('b', { type: 'fortify', land: centre })).toMatchObject({ ok: false, message: 'That costs 2 energy. Answer another question first.' });
    expect(you(h, 'b').energy).toBe(1);
    charge(h, 'b', 2);
    const before = you(h, 'b').energy;
    expect(h.rt.act('b', { type: 'fortify', land: centre }).ok).toBe(true);
    expect(you(h, 'b').energy).toBe(before - 2);
    // A reaches the shrine and needs 2 energy for each raid on it.
    claimToward(h, 'a', centre);
    setEnergy(h, 'a', 1);
    expect(h.rt.act('a', { type: 'raid', land: centre })).toMatchObject({ ok: false, message: 'That costs 2 energy. Answer another question first.' });
    charge(h, 'a', 2);
    expect(h.rt.act('a', { type: 'raid', land: centre }).ok).toBe(true);
    expect(h.host().fort[centre]).toBe(0);
    charge(h, 'a', 2);
    expect(h.rt.act('a', { type: 'raid', land: centre }).ok).toBe(true);
    expect(h.host().owner[centre]).toBe(0);
    expect(h.feed.map((f) => f.text)).toContain('A captured the centre shrine from the Lanterns for the Comets!');
    // B takes it straight back: Big plays lists it, but the room is not told again so soon.
    charge(h, 'b', 2);
    expect(h.rt.act('b', { type: 'raid', land: centre }).ok).toBe(true);
    expect(h.host().owner[centre]).toBe(1);
    expect(h.host().plays[0].text).toBe('B captured the centre shrine from the Comets');
    expect(h.feed.filter((f) => f.text.includes('captured the centre shrine'))).toHaveLength(1);
    h.tick(SHRINE_NEWS_GAP_MS);
    charge(h, 'a', 2);
    expect(h.rt.act('a', { type: 'raid', land: centre }).ok).toBe(true);
    expect(h.feed.filter((f) => f.text.includes('captured the centre shrine'))).toHaveLength(2);
  });

  it('checks every action against the map when it arrives: whoever gets there first wins, and a refusal costs nothing', () => {
    const h = start({ players: [{ id: 'a', team: 1 }, { id: 'c', team: 1 }, { id: 'b', team: 2 }] });
    charge(h, 'a');
    charge(h, 'c');
    const land = you(h, 'a').options.claim[0];
    expect(you(h, 'c').options.claim).toContain(land);
    // A and C both tapped the same land; A's claim arrived first.
    expect(h.rt.act('a', { type: 'claim', land }).ok).toBe(true);
    const cBefore = you(h, 'c').energy;
    expect(h.rt.act('c', { type: 'claim', land })).toMatchObject({ ok: false, message: 'Your team already holds that land.' });
    expect(you(h, 'c').energy).toBe(cBefore);
    // B reaches a land A also wants: B's claim lands first.
    meet(h);
    const contested = you(h, 'b').options.claim.find((l: number) => you(h, 'a').options.claim.includes(l));
    if (contested !== undefined) {
      charge(h, 'b');
      expect(h.rt.act('b', { type: 'claim', land: contested }).ok).toBe(true);
      charge(h, 'a');
      expect(h.rt.act('a', { type: 'claim', land: contested })).toMatchObject({ ok: false, message: 'The Lanterns got there first. You could raid it instead.' });
    }
    // C goes to fortify a border land, but B captures it first.
    const border = you(h, 'b').options.raid.find((l: number) => h.host().fort[l] === 0);
    expect(border).toBeDefined();
    expect(you(h, 'c').options.fortify).toContain(border);
    charge(h, 'b', 2);
    expect(h.rt.act('b', { type: 'raid', land: border }).ok).toBe(true);
    charge(h, 'c');
    const before = you(h, 'c').energy;
    expect(h.rt.act('c', { type: 'fortify', land: border })).toMatchObject({ ok: false, message: 'The Lanterns captured that land before you got there.' });
    expect(you(h, 'c').energy).toBe(before);
    expect(h.errors).toEqual([]);
  });

  it('can act while a question is open, and nothing works once the game is over', () => {
    const h = start({ common: { timeLimitSec: 20 } });
    charge(h, 'a');
    expect(you(h, 'a').question).not.toBeNull();
    expect(h.rt.act('a', { type: 'claim', land: you(h, 'a').options.claim[0] }).ok).toBe(true);
    expect(you(h, 'a').question).not.toBeNull();
    h.tick(20_000);
    expect(h.rt.status).toBe('ended');
  });
});

/* -------------------------------- scoring -------------------------------- */

describe('Lantern Lands scoring', () => {
  it('works out a scoring from lands and shrines', () => {
    const lands = { shrinesOnly: false, bloom: false, glow: false };
    expect(scoreFor(10, 2, lands)).toBe(16);
    expect(scoreFor(10, 2, { ...lands, bloom: true })).toBe(22);
    expect(scoreFor(10, 2, { ...lands, glow: true })).toBe(32);
    expect(scoreFor(10, 2, { ...lands, shrinesOnly: true })).toBe(10);
    expect(scoreFor(10, 2, { shrinesOnly: true, bloom: true, glow: true })).toBe(40);
  });

  it('scores every team its lands plus 3 per shrine every 10 seconds', () => {
    const h = start();
    h.tick(10_000);
    expect(h.host().teams.map((t: any) => t.points)).toEqual([1, 1]);
    claimToward(h, 'a', h.host().map.shrines[0]);
    charge(h, 'a');
    expect(h.rt.act('a', { type: 'claim', land: h.host().map.shrines[0] }).ok).toBe(true);
    const t = h.host().teams[0];
    expect(t.shrines).toBe(1);
    h.tick(10_000);
    expect(h.host().teams[0].gain).toBe(t.lands + 3 * t.shrines);
    expect(h.host().teams[0].points).toBe(1 + t.lands + 3);
    expect(h.host().scoring).toMatchObject({ every: 10_000, next: 30_000, last: 20_000 });
  });

  it('scores every 15 seconds when set to', () => {
    const h = start({ settings: { scoreEvery: '15' } });
    h.tick(10_000);
    expect(h.host().teams[0].points).toBe(0);
    h.tick(5_000);
    expect(h.host().teams[0].points).toBe(1);
  });

  it('doubles every score in the final glow, the last 45 seconds, and says so in the view', () => {
    const h = start({ common: { timeLimitSec: 60 } });
    expect(h.host()).toMatchObject({ glowAt: 15_000, finalStretch: false });
    h.tick(10_000);
    expect(h.host().teams.map((t: any) => t.gain)).toEqual([1, 1]);
    h.tick(10_000);
    expect(h.host().finalStretch).toBe(true);
    expect(h.view('a').finalStretch).toBe(true);
    expect(h.host().teams.map((t: any) => t.gain)).toEqual([2, 2]);
    expect(h.feed.map((f) => f.text)).toContain('Final glow! Every score counts double for the last 45 seconds.');
  });

  it('counts a scoring due at the very end, then ends with the team on the most points winning', () => {
    const h = start({ common: { timeLimitSec: 30 } });
    claimStep(h, 'a', homeOf(h, 'b'));
    h.tick(30_000);
    expect(h.rt.status).toBe('ended');
    const r = h.rt.results!;
    // 30 seconds is all final glow: 3 scorings of 2 lands, doubled.
    expect(r.teamStandings.map((t) => [t.teamId, t.rank, t.score, t.label])).toEqual([
      ['t1', 1, 12, '12 points, 2 lands, 0 shrines'],
      ['t2', 2, 6, '6 points, 1 land, 0 shrines'],
    ]);
    expect(r.summary).toBe('The Comets lit up 2 lands and scored 12 points.');
    expect(r.standings.find((s) => s.playerId === 'a')).toMatchObject({ score: 3 + 1, label: '1 claim' });
    expect(r.standings.find((s) => s.playerId === 'b')).toMatchObject({ score: 0, label: '0 right answers' });
  });

  it('calls a tie when teams finish level', () => {
    const h = start({ common: { timeLimitSec: 20 } });
    h.tick(20_000);
    expect(h.rt.results!.summary).toBe('The Comets and the Lanterns tied on 4 points.');
    expect(h.rt.results!.teamStandings.map((t) => t.rank)).toEqual([1, 1]);
  });

  it('ends the game as soon as a team reaches the points to win', () => {
    const h = start({ settings: { goalPoints: 250 } });
    for (let i = 0; i < 8; i++) claimStep(h, 'a', homeOf(h, 'b'));
    for (let i = 0; i < 40 && h.rt.status === 'running'; i++) h.tick(10_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.gameNow()).toBeLessThan(435_000);
    expect(h.feed.map((f) => f.text)).toContain('The Comets reached 250 points!');
    expect(h.rt.results!.summary).toMatch(/^The Comets reached 250 points first, with \d+ lands lit\.$/);
    expect(h.rt.results!.teamStandings[0]!.score).toBeGreaterThanOrEqual(250);
  });

  it('plays 8 minutes when the host sets no time limit', () => {
    const h = start({ common: { timeLimitSec: 0 } });
    expect(h.host().endsAt).toBe(480_000);
  });
});

/* ------------------------------ teams and players ------------------------- */

describe('Lantern Lands teams and players', () => {
  it('keeps the lands of a team whose players have all left, but they stop scoring', () => {
    const h = start();
    claimStep(h, 'b', homeOf(h, 'a'));
    h.rt.removePlayer('b');
    expect(h.feed.map((f) => f.text)).toContain('Everyone on the Lanterns has left. Their lands stay on the map but stop scoring.');
    h.tick(10_000);
    expect(h.host().teams.map((t: any) => [t.lands, t.gain, t.players])).toEqual([
      [1, 1, 1],
      [2, 0, 0],
    ]);
    // A can still raid and take what they left behind.
    expect(h.host().owner.filter((o: number) => o === 1)).toHaveLength(2);
    h.tick(30_000);
    h.rt.end();
    const left = h.rt.results!.standings.find((s) => s.playerId === 'b');
    expect(left).toMatchObject({ left: true, label: '1 claim' });
  });

  it('lets a late joiner play on their team at once', () => {
    const h = start();
    h.tick(30_000);
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: 't2', isBot: false });
    expect(you(h, 'z')).toMatchObject({ team: 1, energy: 0 });
    expect(you(h, 'z').question).not.toBeNull();
    claimStep(h, 'z', homeOf(h, 'a'));
    expect(h.host().teams[1].lands).toBe(2);
  });

  it('puts a player without a team on the team with the fewest players', () => {
    const h = start({ players: [{ id: 'a', team: 1 }, { id: 'c', team: 1 }, { id: 'b', team: 2 }] });
    h.rt.addPlayer({ id: 'z', name: 'Z', teamId: null, isBot: false });
    expect(you(h, 'z').team).toBe(1);
  });
});

/* ------------------------------- room events ------------------------------ */

describe('Lantern Lands room events', () => {
  it('runs one at 60 seconds and then every 90, each for 30 seconds, never twice in a row and never starting in the final glow', () => {
    const h = drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, settings: { mapSize: 'small' } });
    expect(h.host().nextEvent.at).toBe(60_000);
    const seen: { at: number; kind: EventKind }[] = [];
    for (let t = 10_000; t <= 480_000 && h.rt.status === 'running'; t += 10_000) {
      h.tick(10_000);
      const e = h.host().event;
      if (e && !seen.some((s) => s.at === e.endsAt - 30_000)) seen.push({ at: e.endsAt - 30_000, kind: e.kind });
      if (seen.length && t === seen[seen.length - 1]!.at + 30_000) expect(h.host().event).toBeNull();
    }
    expect(seen.map((s) => s.at)).toEqual([60_000, 150_000, 240_000, 330_000, 420_000]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.kind).not.toBe(seen[i - 1]!.kind);
    for (const s of seen) expect(EVENT_KINDS).toContain(s.kind);
  });

  it('draws each of the events that did not just run with equal odds, and seeded draws land near them', () => {
    const first = eventPool(null);
    expect(first.map((p) => p.kind)).toEqual([...EVENT_KINDS]);
    expect(first.reduce((n, p) => n + p.chance, 0)).toBeCloseTo(1);
    for (const kind of EVENT_KINDS) {
      const pool = eventPool(kind);
      expect(pool.map((p) => p.kind)).not.toContain(kind);
      expect(pool.reduce((n, p) => n + p.chance, 0)).toBeCloseTo(1);
      for (const p of pool) expect(p.chance).toBeCloseTo(EVENT_WEIGHTS[p.kind] / (Object.values(EVENT_WEIGHTS).reduce((a, b) => a + b, 0) - EVENT_WEIGHTS[kind]));
    }
    const rng = createRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const k = pickEvent('fog', rng.next());
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts.fog).toBeUndefined();
    for (const k of ['storm', 'bloom', 'double', 'rumble']) expect(counts[k]! / 20_000).toBeCloseTo(0.25, 1);
    expect(pickEvent(null, 0)).toBe('storm');
    expect(pickEvent(null, 0.999999)).toBe('fog');
    // The view shows the odds of the next event.
    const h = drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, settings: { mapSize: 'small' } });
    expect(h.view('a').nextEvent.pool).toHaveLength(5);
    expect(h.view('a').nextEvent.pool.every((p: any) => p.chance === 20)).toBe(true);
  });

  it('Lantern storm: raids are refused, but claiming and fortifying still work, until it passes', () => {
    const h = withFirstEvent('storm', meet);
    expect(h.feed.map((f) => f.text)).toContain('Lantern storm! For 30 seconds no fort can be lowered and no land captured.');
    const target = you(h, 'a').options.raid[0];
    charge(h, 'a', 2);
    const before = you(h, 'a').energy;
    expect(h.rt.act('a', { type: 'raid', land: target })).toMatchObject({ ok: false, message: 'The lantern storm protects every land. Raid again when it passes.' });
    expect(you(h, 'a').energy).toBe(before);
    expect(h.rt.act('a', { type: 'fortify', land: you(h, 'a').options.fortify[0] }).ok).toBe(true);
    expect(botMove(h.view('a'), 'a', h.rt.gameNow())?.type).not.toBe('raid');
    h.tick(30_000);
    expect(h.feed.map((f) => f.text)).toContain('The lantern storm has passed. Raids are back on.');
    charge(h, 'a', 2);
    expect(h.rt.act('a', { type: 'raid', land: target }).ok).toBe(true);
  });

  it('Rumbling ground: every fort drops by 1 when it starts', () => {
    let land = -1;
    const h = withFirstEvent('rumble', (g) => {
      land = claimStep(g, 'a', homeOf(g, 'b'));
      charge(g, 'a', 2);
      g.rt.act('a', { type: 'fortify', land });
      g.rt.act('a', { type: 'fortify', land });
    });
    expect(h.feed.map((f) => f.text)).toContain('Rumbling ground! Every fort dropped by 1.');
    expect(h.host().fort[land]).toBe(1);
    expect(h.host().owner[homeOf(h, 'a')]).toBe(0);
  });

  it('Shrine bloom: shrines score double while it lasts', () => {
    const h = withFirstEvent('bloom', (g) => {
      const centre = g.host().map.shrines[0];
      claimToward(g, 'a', centre);
      charge(g, 'a');
      g.rt.act('a', { type: 'claim', land: centre });
    });
    const t = h.host().teams[0];
    expect(t.shrines).toBe(1);
    h.tick(10_000);
    expect(h.host().teams[0].gain).toBe(t.lands + 6 * t.shrines);
  });

  it('Double energy: every right answer gives 2', () => {
    const h = withFirstEvent('double');
    h.answer('a', 'wrong');
    h.answer('a');
    expect(you(h, 'a').energy).toBe(2);
    expect(you(h, 'a').last.text).toBe('+2 energy (double energy)');
  });

  it('Fog: rival forts are hidden from players and every fort from the big screen, but owners still show', () => {
    let border = -1;
    const h = withFirstEvent('fog', (g) => {
      meet(g);
      border = you(g, 'a').options.raid[0];
      charge(g, 'b');
      g.rt.act('b', { type: 'fortify', land: border });
      const mine = you(g, 'a').options.fortify[0];
      charge(g, 'a', 2);
      expect(g.rt.act('a', { type: 'fortify', land: mine }).ok).toBe(true);
    });
    const a = h.view('a');
    expect(a.owner[border]).toBe(1);
    expect(a.fort[border]).toBe(HIDDEN_FORT);
    expect(a.fort.some((f: number, i: number) => a.owner[i] === 0 && f > 0)).toBe(true);
    expect(h.host().fort.every((f: number) => f === HIDDEN_FORT)).toBe(true);
    expect(h.host().owner[border]).toBe(1);
    h.tick(30_000);
    expect(h.feed.map((f) => f.text)).toContain('The fog has lifted.');
    expect(h.view('a').fort[border]).toBeGreaterThanOrEqual(0);
  });

  it('can be switched off', () => {
    const h = start();
    expect(h.host().nextEvent).toBeNull();
    h.tick(100_000);
    expect(h.host().event).toBeNull();
  });
});

/* ------------------------------ fog of war ------------------------------- */

describe('Lantern Lands fog of war', () => {
  it('shows a player only the lands next to their team’s, and hides every fort on the big screen', () => {
    const h = drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, variant: pick('lantern-lands-fog'), settings: { mapSize: 'small', events: false } });
    expect(h.feed.map((f) => f.text)).toContain('Fog of war: you can only see the lands next to your team’s.');
    const v = h.view('a');
    const home = homeOf(h, 'a');
    expect(v.owner[home]).toBe(0);
    expect(v.owner[homeOf(h, 'b')]).toBe(UNSEEN);
    for (const n of grid(3).adj[home]!) expect(v.owner[n]).not.toBe(UNSEEN);
    expect(v.owner.filter((o: number) => o === UNSEEN).length).toBeGreaterThan(20);
    expect(h.host().owner[homeOf(h, 'b')]).toBe(1);
    expect(h.host().fort.every((f: number) => f === HIDDEN_FORT)).toBe(true);
    // Claiming pushes the fog back.
    const land = claimStep(h, 'a', homeOf(h, 'b'));
    for (const n of grid(3).adj[land]!) expect(h.view('a').owner[n]).not.toBe(UNSEEN);
  });
});

/* -------------------------------- results -------------------------------- */

describe('Lantern Lands results and views', () => {
  it('ranks players by contribution and says what they did', () => {
    const m = { claims: 4, captures: 2, raids: 1, forts: 3, right: 12 };
    expect(contribution(m)).toBe(4 * 3 + 2 * 5 + 1 * 2 + 3 * 2 + 12);
    expect(contributionLabel(m)).toBe('4 claims, 2 captures, 1 raid, 3 forts');
    expect(contributionLabel({ claims: 0, captures: 0, raids: 0, forts: 0, right: 1 })).toBe('1 right answer');
  });

  it('never puts an answer in a view, and keeps views small with 40 players on the big map', () => {
    const seats: Seat[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i + 1}`, team: (i % 6) + 1 }));
    const h = drive(lanternLands, { players: seats, teams: 6, questions: TRUE_SET, settings: { mapSize: 'big' } });
    for (const s of seats.slice(0, 12)) {
      const id = typeof s === 'string' ? s : s.id;
      charge(h, id);
      h.rt.act(id, { type: 'claim', land: you(h, id).options.claim[0] });
      h.answer(id, 'wrong');
    }
    h.tick(70_000);
    const host = h.host();
    const player = h.view('p1');
    expect(findAnswerLeaks(host)).toEqual([]);
    expect(findAnswerLeaks(player)).toEqual([]);
    expect(host.owner).toHaveLength(91);
    expect(JSON.stringify(host).length).toBeLessThan(8000);
    expect(JSON.stringify(player).length).toBeLessThan(8000);
    expect(host.board.length).toBeLessThanOrEqual(8);
  });
});

/* ---------------------------------- map ---------------------------------- */

describe('Lantern Lands map', () => {
  it('numbers and names the lands in reading order', () => {
    expect([3, 4, 5].map(landCount)).toEqual([37, 61, 91]);
    const g = grid(4);
    expect(g.hexes).toHaveLength(61);
    expect(g.labels[0]).toBe('A1');
    expect(g.labels[g.centre]).toBe('E5');
    expect(g.adj[g.centre]).toHaveLength(6);
    expect(g.adj[0]).toHaveLength(3);
  });

  it('builds fair, open maps for 2 to 6 teams on every size', () => {
    for (const radius of [3, 4, 5]) {
      const g = grid(radius);
      for (const teams of [2, 3, 4, 5, 6]) {
        for (const wanted of [3, 5, 7]) {
          for (const seed of [1, 2, 3]) {
            const map = buildMap({ radius, teams, shrines: wanted, rng: createRng(seed * 101 + teams) });
            const where = `radius ${radius}, ${teams} teams, ${wanted} shrines, seed ${seed}`;
            const blocked = blockedOf(map);
            // Homes at the corners, in team order.
            expect(map.homes.map((h) => g.hexes[h]), where).toEqual(HOME_CORNERS[teams]!.map((k) => corner(radius, k)));
            // The centre shrine first, then a fair number more, never blocked or by a home.
            expect(map.shrines[0], where).toBe(g.centre);
            expect(map.shrines, where).toHaveLength(shrineCountFor(radius, teams, wanted));
            expect(new Set(map.shrines).size).toBe(map.shrines.length);
            for (const s of map.shrines) {
              expect(blocked.has(s), where).toBe(false);
              for (const h of map.homes) expect(distance(g.hexes[s]!, g.hexes[h]!), where).toBeGreaterThanOrEqual(2);
            }
            // About 12% blocked, in whole symmetric groups, never a home, and every open land reachable.
            expect(blocked.size % 6, where).toBe(0);
            expect(blocked.size, where).toBeLessThanOrEqual(Math.round((0.12 * g.hexes.length) / 6) * 6);
            for (const h of map.homes) expect(blocked.has(h)).toBe(false);
            const reach = distancesFrom(radius, [g.centre], (l) => !blocked.has(l));
            g.hexes.forEach((_, l) => expect(blocked.has(l) || reach[l]! >= 0, where).toBe(true));
            if (teams === 5) continue;
            // Every team starts from the same position: the same steps to each shrine and the same ground nearby.
            const profile = (home: number) => {
              const d = distancesFrom(radius, [home], (l) => !blocked.has(l));
              const toShrines = map.shrines.map((s) => d[s]).sort((x, y) => x! - y!);
              const near = d.filter((x, l) => x !== -1 && x <= 2 && !blocked.has(l)).length;
              return JSON.stringify([toShrines, near]);
            };
            const first = profile(map.homes[0]!);
            for (const h of map.homes) expect(profile(h), where).toBe(first);
            const nearest = map.homes.map(() => 0);
            const dist = map.homes.map((h) => distancesFrom(radius, [h], (l) => !blocked.has(l)));
            g.hexes.forEach((_, l) => {
              if (blocked.has(l)) return;
              const ds = dist.map((d) => d[l]!);
              const best = Math.min(...ds);
              if (ds.filter((d) => d === best).length === 1) nearest[ds.indexOf(best)]!++;
            });
            expect(new Set(nearest).size, `${where}: lands nearest each home ${nearest}`).toBe(1);
          }
        }
      }
    }
  });

  it('moves the shrine count to the nearest one that is fair to every team', () => {
    expect(shrineCountFor(4, 2, 5)).toBe(5);
    expect(shrineCountFor(4, 4, 3)).toBe(3);
    expect(shrineCountFor(4, 3, 5)).toBe(4);
    expect(shrineCountFor(4, 3, 7)).toBe(7);
    expect(shrineCountFor(4, 6, 5)).toBe(7);
    expect(shrineCountFor(4, 6, 3)).toBe(1);
    expect(fairShrineCounts(4, 6).slice(0, 3)).toEqual([1, 7, 13]);
  });

  it('builds the same map from the same seed', () => {
    const a = buildMap({ radius: 4, teams: 2, shrines: 5, rng: createRng(9) });
    const b = buildMap({ radius: 4, teams: 2, shrines: 5, rng: createRng(9) });
    expect(a).toEqual(b);
  });

  it('turns the map so ties look the same from every home', () => {
    const g = grid(4);
    const map = buildMap({ radius: 4, teams: 2, shrines: 5, rng: createRng(1) });
    const left = orderFrom(4, map.homes[0]!);
    const right = orderFrom(4, map.homes[1]!);
    expect(left).toEqual(g.hexes.map((_, i) => i));
    expect(right[map.homes[1]!]).toBe(map.homes[0]);
    expect(right[g.centre]).toBe(g.centre);
  });
});

/* ---------------------------------- bots --------------------------------- */

describe('Lantern Lands bots', () => {
  it('wait without energy, and claim towards the nearest unlit shrine', () => {
    const h = start();
    expect(botMove(h.view('a'), 'a', 0)).toBeNull();
    charge(h, 'a');
    const v = h.view('a');
    const move = botMove(v, 'a', 0)!;
    expect(move.type).toBe('claim');
    const blocked = blockedOf(v.map);
    const dist = distancesFrom(3, v.map.shrines, (l) => !blocked.has(l));
    const best = Math.min(...v.you.options.claim.map((l: number) => dist[l]));
    expect(dist[(move as any).land]).toBe(best);
  });

  it('take free land before rival land, but never pass up a rival shrine with no fort left', () => {
    const h = start();
    meet(h);
    charge(h, 'a', 2);
    const v = h.view('a');
    expect(v.you.options.claim.length).toBeGreaterThan(0);
    expect(v.you.options.raid.some((l: number) => v.fort[l] === 0)).toBe(true);
    expect(botMove(v, 'a', 0)!.type).toBe('claim');
    // With no free land left next to the team, a rival land with no fort is next.
    const crowded = { ...v, you: { ...v.you, options: { ...v.you.options, claim: [] } } };
    const move = botMove(crowded, 'a', 0) as any;
    expect(move.type).toBe('raid');
    expect(v.fort[move.land]).toBe(0);
    // A rival shrine with no fort comes first of all.
    const g = start();
    const centre: number = g.host().map.shrines[0];
    claimToward(g, 'b', centre);
    charge(g, 'b');
    g.rt.act('b', { type: 'claim', land: centre });
    claimToward(g, 'a', centre);
    charge(g, 'a', 2);
    expect(g.view('a').you.options.claim.length).toBeGreaterThan(0);
    expect(botMove(g.view('a'), 'a', 0)).toEqual({ type: 'raid', land: centre });
  });

  it('play a whole game sensibly: every team spreads out, borders move and nobody is refused for nothing', () => {
    const r = simulateGame({ modeId: 'lantern-lands', questions: MIXED_SET, players: 12, common: { teamCount: 3 }, seed: 21 });
    expect(r.errors).toEqual([]);
    expect(r.stalled).toBe(false);
    expect(r.rejected).toBe(0);
    const teams = r.results!.teamStandings;
    expect(teams).toHaveLength(3);
    for (const t of teams) expect(t.label).not.toMatch(/ 1 land,/);
    const labels = r.results!.standings.map((s) => s.label).join(' ');
    expect(labels).toMatch(/capture/);
    expect(labels).toMatch(/claim/);
  });
});

/* -------------------------------- variants ------------------------------- */

describe('Lantern Lands variants', () => {
  const withVariant = (id: string, settings: Record<string, unknown> = {}) =>
    drive(lanternLands, { players: duo, teams: 2, questions: TRUE_SET, variant: pick(id), settings: { events: false, ...settings } });

  it('Shrine Race: only shrines score, 5 each, and there are 7', () => {
    const h = withVariant('lantern-lands-shrine-race');
    expect(h.host().map.shrines).toHaveLength(7);
    expect(h.host().scoring.shrinesOnly).toBe(true);
    claimStep(h, 'a', homeOf(h, 'b'));
    h.tick(10_000);
    expect(h.host().teams.map((t: any) => t.points)).toEqual([0, 0]);
    const centre = h.host().map.shrines[0];
    claimToward(h, 'a', centre);
    charge(h, 'a');
    h.rt.act('a', { type: 'claim', land: centre });
    h.tick(10_000);
    expect(h.host().teams[0].gain).toBe(5 * h.host().teams[0].shrines);
  });

  it('Fortress: claims start with a fort and forts go up to 5', () => {
    const h = withVariant('lantern-lands-fortress', { mapSize: 'small' });
    const land = claimStep(h, 'a', homeOf(h, 'b'));
    expect(h.host().fort[land]).toBe(1);
    expect(h.host().fortMax).toBe(5);
    for (let f = 2; f <= 5; f++) {
      charge(h, 'a');
      expect(h.rt.act('a', { type: 'fortify', land }).ok).toBe(true);
    }
    charge(h, 'a');
    expect(h.rt.act('a', { type: 'fortify', land })).toMatchObject({ ok: false, message: 'That land already has 5 forts, the most it can hold.' });
  });

  it('Big Map: 91 lands and 7 shrines', () => {
    const h = withVariant('lantern-lands-big-map');
    expect(h.host().map.radius).toBe(5);
    expect(h.host().owner).toHaveLength(91);
    expect(h.host().map.shrines).toHaveLength(7);
  });

  it('Blitz: 4 minutes, 2 energy for every right answer, and room for 5', () => {
    const h = withVariant('lantern-lands-blitz', { mapSize: 'small' });
    expect(h.host().endsAt).toBe(240_000);
    h.answer('a');
    expect(you(h, 'a')).toMatchObject({ energy: 2, cap: 5 });
    expect(you(h, 'a').last.text).toBe('+2 energy');
    h.answer('a');
    h.answer('a');
    expect(you(h, 'a').energy).toBe(5);
    expect(you(h, 'a').last.text).toBe('+1 energy. The rest did not fit');
  });
});
