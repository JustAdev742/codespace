import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { glowTag } from '../src/modes/glow-tag/index.ts';
import { ARENA, CHARGE, CRATES, FLAGS, LIGHTS_OUT, MOVE, PLAYER_RADIUS, RELIGHT, RING, SCORE, TAG, variants, type ArenaMap, type CrateKind } from '../src/modes/glow-tag/meta.ts';
import { arenaSize, edgeSpots, generateMap, headingTo, lineOfSight, overlapsCover } from '../src/modes/glow-tag/arena.ts';
import type { ModeVariant } from '../src/sdk/types.ts';
import { findAnswerLeaks } from '../src/testing/harness.ts';
import { drive, TRUE_SET, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Glow Tag Royale rules, driven through a real GameRuntime on a fake clock.
 * Every question is a true statement, so `right` answers true. Players are
 * walked into place with ordinary move actions along a path found on a
 * half-metre grid around cover (and around crates, unless a test wants one),
 * one step every 125 ms, which is walking speed. The two lanes through the
 * centre are always open, so face-offs happen there: the time limit is long
 * unless a test wants the ring, so it stays out of the way.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string) => variants.find((v) => v.meta.id === id)!;

interface GameOptions {
  players?: Seat[];
  settings?: Record<string, unknown>;
  common?: Record<string, number>;
  teams?: number;
  seed?: number;
  variant?: ModeVariant;
}

function game(o: GameOptions = {}) {
  return drive(glowTag, {
    players: o.players ?? ['a', 'b'],
    questions: TRUE_SET,
    seed: o.seed ?? 42,
    common: { timeLimitSec: 600, ...o.common },
    settings: o.settings ?? {},
    ...(o.teams !== undefined ? { teams: o.teams } : {}),
    ...(o.variant ? { variant: o.variant } : {}),
  });
}

const me = (h: Driven, id: string): any => h.state().g[id];
const mapOf = (h: Driven): ArenaMap => h.state().map;
const now = (h: Driven) => h.rt.gameNow();
const tag = (h: Driven, id: string, target: string) => h.rt.act(id, { type: 'tag', target });
const errorOf = (r: { ok: boolean; message?: string }) => (r.ok ? null : r.message);
/** Turn on the spot. */
const turn = (h: Driven, id: string, heading: number) => expect(h.rt.act(id, { type: 'move', x: me(h, id).x, z: me(h, id).z, h: heading }).ok).toBe(true);
const faceTowards = (h: Driven, id: string, other: string) => turn(h, id, headingTo(me(h, id).x, me(h, id).z, me(h, other).x, me(h, other).z));

/** Answer right until a player holds at least n charges. */
function charge(h: Driven, id: string, n: number) {
  for (let i = 0; me(h, id).charges < n && i < 20; i++) expect(h.answer(id, 'right').ok).toBe(true);
  expect(me(h, id).charges).toBeGreaterThanOrEqual(n);
}

/* ------------------------------ walking about ----------------------------- */

const STEP = 0.6;
const STEP_MS = 125;

/** Whether a player could stand at (x, z), clear of cover by a margin. */
const clear = (m: ArenaMap, x: number, z: number) => Math.abs(x) <= m.size / 2 - PLAYER_RADIUS - 0.05 && Math.abs(z) <= m.size / 2 - PLAYER_RADIUS - 0.05 && !overlapsCover(m, x, z, PLAYER_RADIUS + 0.15);

/** A path of grid points from (fx, fz) to (tx, tz), around cover and the given crates. */
function plan(m: ArenaMap, crates: { x: number; z: number }[], fx: number, fz: number, tx: number, tz: number): [number, number][] {
  const cell = 0.5;
  const lim = m.size / 2 - PLAYER_RADIUS - 0.05;
  const n = Math.floor((2 * lim) / cell) + 1;
  const at = (i: number) => -lim + i * cell;
  const idx = (v: number) => Math.max(0, Math.min(n - 1, Math.round((v + lim) / cell)));
  const free = (i: number, j: number) => clear(m, at(i), at(j)) && !crates.some((c) => Math.hypot(c.x - at(i), c.z - at(j)) < CRATES.reach + 0.7);
  const start = idx(fx) * n + idx(fz);
  const goal = idx(tx) * n + idx(tz);
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let q = 0; q < queue.length && !prev.has(goal); q++) {
    const c = queue[q]!;
    const i = Math.floor(c / n);
    const j = c % n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const k = ni * n + nj;
      if (prev.has(k)) continue;
      if (k !== goal && !free(ni, nj)) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      prev.set(k, c);
      queue.push(k);
    }
  }
  if (!prev.has(goal)) throw new Error(`no path to ${tx}, ${tz}`);
  const path: [number, number][] = [];
  for (let c = goal; c !== start && c !== -1; c = prev.get(c)!) path.unshift([at(Math.floor(c / n)), at(c % n)]);
  path.pop();
  path.push([tx, tz]);
  return path;
}

/** Walk a player to (x, z) with ordinary moves, at walking speed. `onto` is a crate the walk may cross. */
function walkTo(h: Driven, id: string, x: number, z: number, onto: number | null = null) {
  for (let leg = 0; leg < 200; leg++) {
    const g = me(h, id);
    if (Math.hypot(g.x - x, g.z - z) < 0.011) return;
    const crates = (h.state().crates as { id: number; x: number; z: number }[]).filter((c) => c.id !== onto);
    // Walk a few points, then plan again: crates may have dropped in the way.
    for (const [wx, wz] of plan(mapOf(h), crates, g.x, g.z, x, z).slice(0, 8)) {
      for (let guard = 0; guard < 50; guard++) {
        const cur = me(h, id);
        const d = Math.hypot(wx - cur.x, wz - cur.z);
        if (d < 0.011) break;
        const k = Math.min(1, STEP / d);
        h.tick(STEP_MS);
        expect(h.rt.act(id, { type: 'move', x: cur.x + (wx - cur.x) * k, z: cur.z + (wz - cur.z) * k, h: headingTo(cur.x, cur.z, wx, wz) }).ok).toBe(true);
        if (!me(h, id).in) throw new Error(`${id} was dimmed while walking`);
      }
    }
  }
  throw new Error(`could not walk ${id} to ${x}, ${z}`);
}

/** Two players in the open lane through the centre, `gap` metres apart, facing each other. */
function faceOff(h: Driven, a = 'a', b = 'b', gap = 12) {
  walkTo(h, a, 0, -gap / 2);
  walkTo(h, b, 0, gap / 2);
  turn(h, a, 0);
  turn(h, b, Math.PI);
}

/** A free spot near (x, z). */
function freeNear(m: ArenaMap, x: number, z: number): [number, number] {
  for (let r = 0; r < 6; r += 0.5) {
    for (let k = 0; k < 16; k++) {
      const px = Math.round((x + Math.sin((k * Math.PI) / 8) * r) * 100) / 100;
      const pz = Math.round((z + Math.cos((k * Math.PI) / 8) * r) * 100) / 100;
      if (clear(m, px, pz)) return [px, pz];
    }
  }
  throw new Error(`nowhere free near ${x}, ${z}`);
}

/** A free spot 1.6 to 2.5 metres from a crate with a clear straight walk onto it. */
function approach(m: ArenaMap, c: { x: number; z: number }): [number, number] {
  for (const d of [1.6, 2, 2.5]) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const [x, z] = [Math.round((c.x + Math.sin(a) * d) * 100) / 100, Math.round((c.z + Math.cos(a) * d) * 100) / 100];
      if ([...Array(11).keys()].every((i) => clear(m, x + ((c.x - x) * i) / 10, z + ((c.z - z) * i) / 10))) return [x, z];
    }
  }
  throw new Error('no clear way onto the crate');
}

/** The centre of the ring to come (the next one if it is shown). */
function ringAhead(h: Driven) {
  const ring = h.view('a').ring;
  return ring.next ?? ring.to;
}

/** Two players close together near the centre of the ring to come, in sight of each other, facing each other. */
function pairUp(h: Driven, a: string, b: string) {
  const m = mapOf(h);
  const c = ringAhead(h);
  for (const r of [1.5, 2.5, 3.5]) {
    for (let k = 0; k < 8; k++) {
      const dx = Math.sin((k * Math.PI) / 4) * r;
      const dz = Math.cos((k * Math.PI) / 4) * r;
      const pa: [number, number] = [Math.round((c.x - dx) * 100) / 100, Math.round((c.z - dz) * 100) / 100];
      const pb: [number, number] = [Math.round((c.x + dx) * 100) / 100, Math.round((c.z + dz) * 100) / 100];
      if (!clear(m, ...pa) || !clear(m, ...pb) || !lineOfSight(m, ...pa, ...pb)) continue;
      walkTo(h, a, ...pa);
      walkTo(h, b, ...pb);
      faceTowards(h, a, b);
      faceTowards(h, b, a);
      return;
    }
  }
  throw new Error('no open pair of spots near the ring centre');
}

/** Walk players to free spots near the centre of the ring to come, so the ring leaves them alone. */
function gather(h: Driven, ids: string[]) {
  const c = ringAhead(h);
  ids.forEach((id, i) => walkTo(h, id, ...freeNear(mapOf(h), c.x + (i - (ids.length - 1) / 2) * 1.2, c.z)));
}

/** Move the clock on to game time t, firing timers on the way. */
function tickTo(h: Driven, t: number) {
  if (t > now(h)) h.tick(t - now(h));
}

/** Tag until the target is dimmed, waiting out the cooldown and the target's flicker. */
function dimBy(h: Driven, id: string, target: string) {
  for (let i = 0; me(h, target).in && i < 10; i++) {
    tickTo(h, Math.max(me(h, id).cooldownUntil, me(h, target).safeUntil));
    expect(tag(h, id, target).ok).toBe(true);
    expect(['hit', 'dimmed']).toContain(me(h, id).lastTag.outcome);
  }
  expect(me(h, target).in).toBe(false);
}

/* ---------------------------------- the park ------------------------------ */

describe('the park', () => {
  it('grows with the room: 40 metres for up to 6 players, 80 for 40', () => {
    expect([1, 6, 23, 40, 60].map(arenaSize)).toEqual([40, 40, 60, 80, 80]);
    expect(mapOf(game()).size).toBe(40);
    expect(mapOf(game({ players: Array.from({ length: 12 }, (_, i) => `p${String(i)}`) })).size).toBe(arenaSize(12));
  });

  it('is fair and open: one quarter turned four ways, open lanes and edge, pieces kept apart', () => {
    for (const size of [40, 60, 80]) {
      const m = generateMap(size, createRng(size));
      const half = size / 2;
      const key = (...n: number[]) => n.map((v) => Math.round(v * 10)).join(',');
      const boxes = new Set(m.boxes.map(([k, x, z, w, d]) => key(k, x, z, w, d)));
      const trees = new Set(m.trees.map(([x, z, r]) => key(x, z, r)));
      expect(m.boxes.length + m.trees.length).toBeGreaterThanOrEqual(4 * ARENA.minPieces);
      for (const [k, x, z, w, d] of m.boxes) {
        // A quarter turn about the centre carries every piece onto another.
        expect(boxes.has(key(k, z, -x, d, w))).toBe(true);
        expect(Math.abs(x) - w / 2).toBeGreaterThanOrEqual(ARENA.lane - 0.05);
        expect(Math.abs(z) - d / 2).toBeGreaterThanOrEqual(ARENA.lane - 0.05);
        expect(Math.abs(x) + w / 2).toBeLessThanOrEqual(half - ARENA.edgeBand + 0.05);
        expect(Math.abs(z) + d / 2).toBeLessThanOrEqual(half - ARENA.edgeBand + 0.05);
      }
      for (const [x, z, r] of m.trees) {
        expect(trees.has(key(z, -x, r))).toBe(true);
        expect(Math.min(Math.abs(x), Math.abs(z)) - r).toBeGreaterThanOrEqual(ARENA.lane - 0.05);
      }
      const rects = [...m.boxes.map(([, x, z, w, d]) => [x, z, w, d]), ...m.trees.map(([x, z, r]) => [x, z, 2 * r, 2 * r])];
      rects.forEach(([x, z, w, d], i) =>
        rects.slice(i + 1).forEach(([x2, z2, w2, d2]) => {
          const apart = Math.max(Math.abs(x! - x2!) - (w! + w2!) / 2, Math.abs(z! - z2!) - (d! + d2!) / 2);
          expect(apart).toBeGreaterThanOrEqual(ARENA.gap - 0.1);
        }),
      );
      // Starting spots are spread round the open edge, facing the centre.
      for (const s of edgeSpots(size, 7, 0.3)) {
        expect(Math.max(Math.abs(s.x), Math.abs(s.z))).toBeCloseTo(half - ARENA.edgeBand / 2, 5);
        expect(overlapsCover(m, s.x, s.z, PLAYER_RADIUS)).toBe(false);
        expect(Math.abs(s.h - headingTo(s.x, s.z, 0, 0))).toBeLessThan(0.01);
      }
    }
  });
});

/* --------------------------------- walking -------------------------------- */

describe('walking', () => {
  it('cuts a step that is too long down to walking speed, plus a little slack', () => {
    const h = game();
    walkTo(h, 'a', 0, -10);
    h.tick(1000);
    expect(h.rt.act('a', { type: 'move', x: 0, z: 10, h: 0 }).ok).toBe(true);
    // Standing still banks at most windowMs, plus slackMs for jitter.
    const reach = (MOVE.speed * (MOVE.windowMs + MOVE.slackMs)) / 1000;
    expect(me(h, 'a').z).toBeCloseTo(-10 + reach, 2);
    // That spent the allowance: a second step at once goes nowhere, and 200 ms later it may go 1 metre.
    h.rt.act('a', { type: 'move', x: 0, z: 10, h: 0 });
    expect(me(h, 'a').z).toBeCloseTo(-10 + reach, 2);
    h.tick(200);
    h.rt.act('a', { type: 'move', x: 0, z: 10, h: 0 });
    expect(me(h, 'a').z).toBeCloseTo(-10 + reach + MOVE.speed * 0.2, 2);
  });

  it('keeps players inside the arena walls', () => {
    const h = game();
    const half = mapOf(h).size / 2;
    walkTo(h, 'a', half - 2, 0);
    for (let i = 0; i < 10; i++) {
      h.tick(200);
      h.rt.act('a', { type: 'move', x: 100, z: 0, h: Math.PI / 2 });
    }
    expect(me(h, 'a').x).toBeCloseTo(half - PLAYER_RADIUS, 5);
    // Wild numbers never reach the mode.
    expect(h.rt.act('a', { type: 'move', x: 1e6, z: 0, h: 0 }).ok).toBe(false);
    expect(h.rt.act('a', { type: 'move', x: Number.NaN, z: 0, h: 0 }).ok).toBe(false);
  });

  it('pushes players out of cover: walking into a hedge stops at its face', () => {
    const h = game();
    const m = mapOf(h);
    // A piece with open ground beside it, approached straight on.
    let spot: { x: number; z: number; dx: number; dz: number; stop: number } | null = null;
    for (const [, bx, bz, w, d] of m.boxes) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const half = dx ? w / 2 : d / 2;
        const x = Math.round((bx - dx * (half + 1)) * 100) / 100;
        const z = Math.round((bz - dz * (half + 1)) * 100) / 100;
        if (!clear(m, x, z)) continue;
        spot = { x, z, dx, dz, stop: (dx ? bx : bz) - (dx || dz) * (half + PLAYER_RADIUS) };
        break;
      }
      if (spot) break;
    }
    expect(spot).not.toBeNull();
    const s = spot!;
    walkTo(h, 'a', s.x, s.z);
    h.tick(400);
    h.rt.act('a', { type: 'move', x: s.x + s.dx * 2, z: s.z + s.dz * 2, h: 0 });
    const g = me(h, 'a');
    expect(overlapsCover(m, g.x, g.z, PLAYER_RADIUS - 0.001)).toBe(false);
    expect(s.dx ? g.x : g.z).toBeCloseTo(s.stop, 1);
  });

  it('keeps plain walking quiet (a pulse, not full views), and never sets a timer', () => {
    const h = game();
    const next = h.rt.nextTimerAt();
    const before = { ...h.changes };
    h.wait(200);
    expect(h.rt.act('a', { type: 'move', x: me(h, 'a').x + 0.5, z: me(h, 'a').z, h: 1 }).ok).toBe(true);
    h.wait(200);
    expect(h.rt.act('a', { type: 'move', x: me(h, 'a').x - 0.5, z: me(h, 'a').z, h: 2 }).ok).toBe(true);
    expect(h.changes).toEqual({ changed: before.changed, pulsed: before.pulsed + 2 });
    expect(h.rt.nextTimerAt()).toBe(next);
    expect(me(h, 'a').h).toBe(2);
  });
});

/* --------------------------------- charges -------------------------------- */

describe('charges', () => {
  it('gives 2 charges a right answer, 1 more every third in a row, up to 8', () => {
    const h = game();
    const text = () => me(h, 'a').stream.last.text;
    h.answer('a', 'right');
    expect([me(h, 'a').charges, text()]).toEqual([2, '+2 charges']);
    h.answer('a', 'right');
    expect(me(h, 'a').charges).toBe(4);
    h.answer('a', 'right');
    expect([me(h, 'a').charges, text()]).toEqual([4 + CHARGE.perRight + CHARGE.streakBonus, '+3 charges (3 in a row)']);
    h.answer('a', 'wrong');
    expect([me(h, 'a').charges, text()]).toEqual([7, 'No charge this time.']);
    h.answer('a', 'right');
    expect([me(h, 'a').charges, text()]).toEqual([CHARGE.max, '+1 charge']);
    h.answer('a', 'right');
    expect([me(h, 'a').charges, text()]).toEqual([CHARGE.max, 'Charges full (8)']);
    expect(me(h, 'a').score).toBe(5 * SCORE.answer);
    expect(h.view('a').you.question).not.toBeNull();
  });
});

/* ---------------------------------- tags ---------------------------------- */

describe('tagging', () => {
  it('needs a charge, waits out the cooldown, and never targets yourself or someone who left', () => {
    const h = game({ players: ['a', 'b', 'c'] });
    faceOff(h);
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/No charge/);
    charge(h, 'a', 3);
    const charges = me(h, 'a').charges;
    expect(errorOf(tag(h, 'a', 'a'))).toMatch(/yourself/);
    expect(errorOf(tag(h, 'a', 'nobody'))).toMatch(/not in the game/);
    h.rt.removePlayer('c');
    expect(errorOf(tag(h, 'a', 'c'))).toMatch(/not in the game/);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    // Refusals spend nothing; the tag spent one charge and started the cooldown.
    expect(me(h, 'a').charges).toBe(charges - 1);
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/recharging/);
    expect(me(h, 'a').cooldownUntil).toBe(now(h) + TAG.cooldownMs);
  });

  it('hits within range, in front and in sight: 1 glow, 100 points, and the target flickers for 1.5 seconds', () => {
    const h = game();
    faceOff(h);
    charge(h, 'a', 4);
    const score = me(h, 'a').score;
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag).toMatchObject({ target: 'b', outcome: 'hit' });
    expect(me(h, 'b').glow).toBe(2);
    expect(me(h, 'b').lastHit).toMatchObject({ by: 'a', outcome: 'hit' });
    expect(me(h, 'a').score).toBe(score + SCORE.tag);
    expect(me(h, 'b').safeUntil).toBe(now(h) + TAG.safeMs);
    expect(h.view('b').players.find((p: any) => p[0] === 'b')[7] & FLAGS.safe).toBe(FLAGS.safe);
    // Flickering: refused (no charge spent) until the 1.5 seconds are up.
    h.tick(TAG.cooldownMs);
    const charges = me(h, 'a').charges;
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/flickering/);
    expect(me(h, 'a').charges).toBe(charges);
    h.tick(TAG.safeMs - TAG.cooldownMs);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'b').glow).toBe(1);
    // The beam is in everyone's view, from the tagger to the target.
    expect(h.view('b').beams[0]).toMatchObject({ by: 'a', to: 'b', outcome: 'hit', x1: 0, z1: -6, x2: 0, z2: 6 });
  });

  it('spends the charge on a miss and says why: too far away or not in front', () => {
    const h = game();
    faceOff(h, 'a', 'b', 18);
    charge(h, 'a', 4);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('range');
    expect(me(h, 'a').charges).toBe(3);
    expect(me(h, 'b').glow).toBe(3);
    // A miss still lights a beam: straight ahead, its full reach.
    expect(h.view('a').beams[0]).toMatchObject({ outcome: 'range', x2: 0, z2: -9 + TAG.range });
    walkTo(h, 'b', 0, 4);
    turn(h, 'a', Math.PI / 2);
    h.tick(TAG.cooldownMs);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('front');
    expect(me(h, 'a').charges).toBe(2);
    // Just inside the cone still counts.
    turn(h, 'a', ((TAG.coneDeg / 2 - 1) * Math.PI) / 180);
    h.tick(TAG.cooldownMs);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('hit');
  });

  it('misses when cover is in the way, and says so', () => {
    const h = game();
    const m = mapOf(h);
    let pair: [[number, number], [number, number]] | null = null;
    for (const [, bx, bz, w, d] of m.boxes) {
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const half = dx ? w / 2 : d / 2;
        const p1: [number, number] = [Math.round((bx - dx * (half + 1.2)) * 100) / 100, Math.round((bz - dz * (half + 1.2)) * 100) / 100];
        const p2: [number, number] = [Math.round((bx + dx * (half + 1.2)) * 100) / 100, Math.round((bz + dz * (half + 1.2)) * 100) / 100];
        if (clear(m, ...p1) && clear(m, ...p2) && !lineOfSight(m, ...p1, ...p2)) pair = [p1, p2];
        if (pair) break;
      }
      if (pair) break;
    }
    expect(pair).not.toBeNull();
    walkTo(h, 'a', ...pair![0]);
    walkTo(h, 'b', ...pair![1]);
    faceTowards(h, 'a', 'b');
    charge(h, 'a', 1);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('blocked');
    expect(me(h, 'b').glow).toBe(3);
    // The beam stops at the cover.
    const beam = h.view('a').beams[0];
    expect(Math.hypot(beam.x2 - beam.x1, beam.z2 - beam.z1)).toBeLessThan(Math.hypot(pair![1][0] - pair![0][0], pair![1][1] - pair![0][1]));
  });

  it('lets a shield block one tag', () => {
    const h = game({ seed: seedWithFirstCrate('shield') });
    h.tick(CRATES.firstMs);
    const crate = h.state().crates[0];
    walkTo(h, 'b', crate.x, crate.z, crate.id);
    expect(me(h, 'b').shield).toBe(true);
    faceOff(h);
    charge(h, 'a', 2);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('shield');
    expect(me(h, 'b')).toMatchObject({ shield: false, glow: 3 });
    expect(me(h, 'b').lastHit).toMatchObject({ by: 'a', outcome: 'shield' });
    h.tick(TAG.cooldownMs);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'b').glow).toBe(2);
  });
});

/* ------------------------------ dim and relight --------------------------- */

describe('dimming and relighting', () => {
  it('dims at 0 glow (50 more points), and 2 right answers relight you at the edge of the ring, safe for a moment', () => {
    const h = game();
    faceOff(h);
    charge(h, 'a', 3);
    dimBy(h, 'a', 'b');
    expect(me(h, 'a').lastTag.outcome).toBe('dimmed');
    expect(me(h, 'a').score).toBe(me(h, 'a').stream.correct * SCORE.answer + 3 * SCORE.tag + SCORE.dim);
    expect(h.feed.map((f) => f.text)).toContain('A dimmed B.');
    h.tick(TAG.cooldownMs);
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/already dimmed/);
    // Dimmed: out of the arena, but the questions keep coming.
    expect(errorOf(h.rt.act('b', { type: 'move', x: 0, z: 0, h: 0 }))).toMatch(/dimmed/);
    expect(h.view('b').you).toMatchObject({ in: false, out: false, relight: { have: 0, need: RELIGHT.need } });
    h.answer('b', 'right');
    expect(me(h, 'b')).toMatchObject({ in: false, relight: 1, charges: 0 });
    expect(me(h, 'b').stream.last.text).toBe('Relight 1 of 2.');
    h.answer('b', 'right');
    const b = me(h, 'b');
    expect(b).toMatchObject({ in: true, glow: 3, charges: RELIGHT.charges, safeUntil: now(h) + RELIGHT.safeMs, relights: 1 });
    expect(b.stream.last.text).toBe('Relit! Back in the arena with 2 charges.');
    expect(overlapsCover(mapOf(h), b.x, b.z, PLAYER_RADIUS - 0.001)).toBe(false);
    // As far from rivals as it could find: the far side of the park from A.
    expect(Math.hypot(b.x - me(h, 'a').x, b.z - me(h, 'a').z)).toBeGreaterThan(15);
    h.tick(TAG.cooldownMs);
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/flickering/);
  });
});

/* ---------------------------------- the ring ------------------------------ */

describe('the ring', () => {
  it('shrinks in phases shown in advance, drifting a little', () => {
    const h = game({ common: { timeLimitSec: 120 } });
    const half = mapOf(h).size / 2;
    const r = (k: number) => Math.round(RING.phases[k]!.radius * half * 10) / 10;
    const v0 = h.view('a').ring;
    expect(v0).toMatchObject({ x: 0, z: 0, r: half * RING.startRadius, phase: 0, phases: 3, final: false, finalAt: 90_000 });
    expect(v0.next).toMatchObject({ r: r(0), startAt: 30_000, endAt: 45_000 });
    // The next ring sits inside the one before it.
    expect(Math.hypot(v0.next.x, v0.next.z) + v0.next.r).toBeLessThanOrEqual(v0.r);
    tickTo(h, 37_500);
    const mid = h.view('a').ring;
    expect(mid.phase).toBe(1);
    expect(mid.r).toBeCloseTo((half * RING.startRadius + r(0)) / 2, 0);
    expect(mid.next).toBeNull();
    expect(h.feed.map((f) => f.text)).toContain('The ring is shrinking. Head for the new ring.');
    tickTo(h, 45_000);
    const after = h.view('a').ring;
    expect(after).toMatchObject({ r: r(0), x: v0.next.x, z: v0.next.z });
    // As soon as a shrink ends, the next ring is shown.
    expect(after.next).toMatchObject({ r: r(1), startAt: 60_000, endAt: 75_000 });
    expect(Math.hypot(after.next.x - after.x, after.next.z - after.z) + after.next.r).toBeLessThanOrEqual(after.r + 0.1);
  });

  it('drains 1 glow every 3 seconds outside the ring, and can dim', () => {
    const h = game({ common: { timeLimitSec: 120 } });
    // Wait in the middle of the ring to come until the first shrink is over.
    gather(h, ['a']);
    tickTo(h, 45_000);
    expect(me(h, 'a').glow).toBe(3);
    // Then step just outside it, towards the corner.
    const ring = h.view('a').ring;
    const half = mapOf(h).size / 2;
    const away = Math.atan2(half - ring.x, half - ring.z);
    const [ox, oz] = freeNear(mapOf(h), ring.x + Math.sin(away) * (ring.r + 1.5), ring.z + Math.cos(away) * (ring.r + 1.5));
    expect(Math.hypot(ox - ring.x, oz - ring.z)).toBeGreaterThan(ring.r);
    walkTo(h, 'a', ox, oz);
    const glow = me(h, 'a').glow;
    expect(glow).toBeGreaterThanOrEqual(2);
    // Drains come every 3 seconds from the first shrink: at game times divisible by 3000.
    h.tick(3000 - (now(h) % 3000) + 1);
    expect(me(h, 'a').glow).toBe(glow - 1);
    expect(me(h, 'a').lastHit).toMatchObject({ by: null, outcome: glow - 1 > 0 ? 'hit' : 'dimmed' });
    h.tick(3000 * (glow - 1));
    expect(me(h, 'a').in).toBe(false);
    expect(h.feed.map((f) => f.text)).toContain('A was dimmed by the ring.');
    expect(h.state().stats.ring).toBeGreaterThanOrEqual(glow);
  });

  it('in the final ring nobody relights, dimmed players earn cheer points, and the last one glowing wins', () => {
    const h = game({ players: ['a', 'b', 'c'], common: { timeLimitSec: 120 } });
    faceOff(h, 'a', 'c');
    charge(h, 'a', 8);
    dimBy(h, 'a', 'c');
    // A and B keep inside each ring as it comes.
    gather(h, ['a', 'b']);
    tickTo(h, 45_000);
    gather(h, ['a', 'b']);
    tickTo(h, 75_000);
    gather(h, ['a', 'b']);
    const before = { a: me(h, 'a').score, b: me(h, 'b').score };
    tickTo(h, 90_000);
    expect(h.state().final).toBe(true);
    expect(h.feed.map((f) => f.text)).toContain('Final ring! Nobody relights now. Dimmed players can still earn cheer points.');
    expect(me(h, 'a').score).toBe(before.a + SCORE.finalRing);
    expect(me(h, 'b').score).toBe(before.b + SCORE.finalRing);
    expect(h.view('a').finalStretch).toBe(true);
    // C is out for good: right answers earn cheer points, never a relight.
    expect(h.view('c').you).toMatchObject({ in: false, out: true, relight: null });
    const score = me(h, 'c').score;
    h.answer('c', 'right');
    h.answer('c', 'right');
    h.answer('c', 'right');
    expect(me(h, 'c')).toMatchObject({ in: false, out: true, cheer: 3 * SCORE.cheer, score: score + 3 * (SCORE.answer + SCORE.cheer) });
    expect(me(h, 'c').stream.last).toMatchObject({ text: '+10 cheer points', points: SCORE.answer + SCORE.cheer });
    expect(h.rt.status).toBe('running');
    // A dims B: only A is left glowing, so the game ends at once.
    pairUp(h, 'a', 'b');
    const aScore = me(h, 'a').score;
    dimBy(h, 'a', 'b');
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.endedBy).toBe('mode');
    expect(me(h, 'a').score).toBe(aScore + 3 * SCORE.tag + SCORE.dim + SCORE.lastGlow);
    expect(h.rt.results?.summary).toMatch(/^A was the last one glowing\. Most tags: A/);
    expect(h.rt.results?.standings[0]).toMatchObject({ playerId: 'a', rank: 1 });
  });
});

/* ------------------------------- ending the game -------------------------- */

describe('ending', () => {
  it('ends at the time limit, which is 6 minutes when none is set', () => {
    expect(game({ common: { timeLimitSec: 0 } }).view('a').endsAt).toBe(360_000);
    // (One player, so the final ring cannot end it first.)
    const h = game({ players: ['a'], common: { timeLimitSec: 60 } });
    tickTo(h, 59_999);
    expect(h.rt.status).toBe('running');
    h.tick(1);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.endedBy).toBe('mode');
  });

  it('plays a solo game to the time limit: one player never ends the final ring early', () => {
    const h = game({ players: ['a'], common: { timeLimitSec: 60 } });
    gather(h, ['a']);
    for (const t of [15_000, 30_000, 45_000]) {
      tickTo(h, t);
      gather(h, ['a']);
    }
    tickTo(h, 50_000);
    expect(h.state().final).toBe(true);
    expect(h.rt.status).toBe('running');
    h.answer('a', 'right');
    tickTo(h, 60_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.endedBy).toBe('mode');
    expect(h.rt.results?.standings).toHaveLength(1);
    // Glowing when the final ring started and at the end.
    expect(me(h, 'a').score).toBe(me(h, 'a').stream.correct * SCORE.answer + SCORE.finalRing + SCORE.lastGlow);
  });

  it('ends the final ring at once when only one player is glowing as it starts', () => {
    const h = game({ common: { timeLimitSec: 120 } });
    faceOff(h);
    charge(h, 'a', 3);
    dimBy(h, 'a', 'b');
    for (const t of [0, 45_000, 75_000]) {
      tickTo(h, t);
      gather(h, ['a']);
    }
    tickTo(h, 90_000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.gameNow()).toBe(90_000);
    expect(h.rt.results?.summary).toMatch(/^A was the last one glowing/);
  });
});

/* ---------------------------------- crates -------------------------------- */

/** A seed whose first crate holds `kind`, so a test can walk to it. */
function seedWithFirstCrate(kind: CrateKind) {
  for (let seed = 1; seed < 200; seed++) {
    const h = game({ seed });
    h.tick(CRATES.firstMs);
    if (h.state().crates[0]?.kind === kind) return seed;
  }
  throw new Error(`no seed drops a ${kind} crate first`);
}

describe('crates', () => {
  it('drop on a timer inside the ring, away from cover and players, and show their odds', () => {
    const h = game();
    expect(h.view('a').crateOdds).toEqual([
      { kind: 'charge', percent: 50 },
      { kind: 'shield', percent: 25 },
      { kind: 'speed', percent: 25 },
    ]);
    expect(h.view('a').crates).toEqual([]);
    h.tick(CRATES.firstMs);
    const [c] = h.view('a').crates;
    expect(c).toMatchObject({ kind: expect.stringMatching(/^(charge|shield|speed)$/) });
    expect(overlapsCover(mapOf(h), c.x, c.z, PLAYER_RADIUS)).toBe(false);
    for (const id of ['a', 'b']) expect(Math.hypot(me(h, id).x - c.x, me(h, id).z - c.z)).toBeGreaterThanOrEqual(4);
    // One every few seconds, up to a limit for the room.
    for (let i = 0; i < 10; i++) h.tick(CRATES.everySmall);
    expect(h.view('a').crates).toHaveLength(CRATES.maxSmall);
  });

  it('a charge pack gives 3 charges, is left alone by a player who is full, and picking it up is a full change', () => {
    const h = game({ seed: seedWithFirstCrate('charge') });
    h.tick(CRATES.firstMs);
    const crate = h.state().crates[0];
    charge(h, 'a', CHARGE.max);
    walkTo(h, 'a', crate.x, crate.z, crate.id);
    expect(h.state().crates.map((c: any) => c.id)).toContain(crate.id);
    // B, with no charges, walks up to it: that last step picks it up, and is a full change, not a quiet one.
    walkTo(h, 'b', ...approach(mapOf(h), crate));
    h.wait(400);
    const before = { ...h.changes };
    expect(h.rt.act('b', { type: 'move', x: crate.x, z: crate.z, h: 0 }).ok).toBe(true);
    expect(h.changes).toEqual({ changed: before.changed + 1, pulsed: before.pulsed });
    expect(h.state().crates.map((c: any) => c.id)).not.toContain(crate.id);
    expect(me(h, 'b').charges).toBe(CRATES.charge);
    expect(h.feedTo('b')).toContain('You picked up a charge pack.');
    expect(h.feedTo('a')).not.toContain('You picked up a charge pack.');
    expect(h.state().stats.crates).toBe(1);
  });

  it('a speed boost lets you walk 40% faster for 8 seconds', () => {
    const h = game({ seed: seedWithFirstCrate('speed') });
    h.tick(CRATES.firstMs);
    const crate = h.state().crates[0];
    walkTo(h, 'a', crate.x, crate.z, crate.id);
    expect(me(h, 'a').speedUntil).toBeGreaterThan(now(h));
    expect(me(h, 'a').speedUntil).toBeLessThanOrEqual(now(h) + CRATES.speedMs);
    // A clear run of 5 metres from where it stands.
    const g = me(h, 'a');
    const m = mapOf(h);
    const dir = [...Array(16).keys()]
      .map((k) => (k * Math.PI) / 8)
      .find((a) => [...Array(21).keys()].every((i) => clear(m, g.x + Math.sin(a) * i * 0.25, g.z + Math.cos(a) * i * 0.25)));
    expect(dir).toBeDefined();
    h.tick(1000);
    h.rt.act('a', { type: 'move', x: g.x + Math.sin(dir!) * 10, z: g.z + Math.cos(dir!) * 10, h: dir! });
    const moved = Math.hypot(me(h, 'a').x - g.x, me(h, 'a').z - g.z);
    expect(moved).toBeCloseTo((MOVE.speed * MOVE.boost * (MOVE.windowMs + MOVE.slackMs)) / 1000, 1);
    expect(h.view('a').players.find((p: any) => p[0] === 'a')[7] & FLAGS.speed).toBe(FLAGS.speed);
  });
});

/* ----------------------------------- teams -------------------------------- */

describe('teams', () => {
  it('never lets you tag a teammate, and team scores are totals', () => {
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], teams: 2 });
    faceOff(h, 'a', 'b');
    charge(h, 'a', 2);
    expect(errorOf(tag(h, 'a', 'b'))).toMatch(/teammate/);
    expect(me(h, 'a').charges).toBe(2);
    walkTo(h, 'c', 0, 3);
    turn(h, 'c', Math.PI);
    charge(h, 'c', 2);
    expect(tag(h, 'c', 'a').ok).toBe(true);
    expect(me(h, 'c').lastTag.outcome).toBe('hit');
    h.answer('b', 'right');
    const teams = h.view('a').teams;
    expect(teams.find((t: any) => t.id === 't1')).toMatchObject({ score: me(h, 'a').score + me(h, 'b').score, members: 2, glowing: 2 });
    h.rt.end('host');
    const ts = h.rt.results!.teamStandings;
    expect(ts.find((t) => t.teamId === 't1')?.score).toBe(me(h, 'a').score + me(h, 'b').score);
    expect(ts.find((t) => t.teamId === 't2')?.score).toBe(me(h, 'c').score);
  });
});

/* ---------------------------- pulses and views ---------------------------- */

const FORTY = Array.from({ length: 40 }, (_, i) => `glow-player-${String(i + 1).padStart(2, '0')}`);

describe('pulses and views', () => {
  it('pulses compact positions for everyone, the ring and the time, with nothing private', () => {
    const h = game({ players: FORTY });
    h.wait(1234);
    const p = h.rt.pulse() as any;
    expect(p.t).toBe(now(h));
    expect(p.ring).toEqual([0, 0, Math.round(arenaSize(40) / 2 * RING.startRadius * 10)]);
    expect(p.p).toHaveLength(40);
    for (const e of p.p) {
      expect(e).toHaveLength(6);
      const g = me(h, e[0]);
      expect(e.slice(1)).toEqual([Math.round(g.x * 10), Math.round(g.z * 10), Math.round(g.h * 100), FLAGS.in, 3]);
    }
    // Room ids are short (p1, p2 ...); even these long ones keep the pulse small.
    expect(JSON.stringify(p).length).toBeLessThan(2000);
    expect(findAnswerLeaks(p)).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/charges|question|prompt/);
  });

  it('keeps a player view under 8 KB with 40 players, crates and beams about', () => {
    const h = game({ players: FORTY, teams: 6 });
    for (const id of FORTY) for (let i = 0; i < 3; i++) h.answer(id, 'right');
    for (let i = 0; i < 30; i++) h.tick(1000);
    // Neighbours on the edge tag each other: beams for everyone's view.
    for (let i = 0; i < 8; i++) tag(h, FORTY[i]!, FORTY[i + 1]!);
    expect(h.view(FORTY[0]!).crates.length).toBeGreaterThan(3);
    expect(h.view(FORTY[0]!).beams.length).toBeGreaterThan(3);
    const sizes = FORTY.map((id) => JSON.stringify(h.view(id)).length);
    expect(Math.max(...sizes)).toBeLessThan(8 * 1024);
    expect(JSON.stringify(h.host()).length).toBeLessThan(8 * 1024);
    const v = h.view(FORTY[39]!);
    expect(v.players).toHaveLength(40);
    expect(v.board.length).toBe(6);
    expect(v.board[5]).toMatchObject({ id: FORTY[39], you: true });
    expect(findAnswerLeaks(v)).toEqual([]);
  });

  it('gives a fresh view everything a screen needs to place everyone', () => {
    const h = game();
    const v = h.view('a');
    expect(Object.keys(v).sort()).toEqual(['at', 'beams', 'board', 'crateOdds', 'crates', 'endsAt', 'glowing', 'map', 'players', 'ring', 'rules', 'teams', 'you']);
    expect(v.players.map((p: any) => p.slice(0, 3))).toEqual([
      ['a', 'A', null],
      ['b', 'B', null],
    ]);
    const a = me(h, 'a');
    expect(v.players[0].slice(3)).toEqual([Math.round(a.x * 10) / 10, Math.round(a.z * 10) / 10, Math.round(a.h * 100) / 100, 3, FLAGS.in]);
    expect(v.you).toMatchObject({ id: 'a', glow: 3, maxGlow: 3, charges: 0, maxCharges: 8, in: true, out: false, relight: null, shield: false, score: 0, rank: 1 });
    expect(v.you.question).toMatchObject({ iid: expect.any(String) });
    expect(v.rules).toEqual({ glow: 3, relight: 2, lightsOut: false, squads: false });
    const host = h.host();
    expect(host.you).toBeUndefined();
    expect(host.stats).toEqual({ tags: 0, dims: 0, relights: 0, crates: 0, ring: 0 });
  });

  it('lets a late joiner in at a safe spot, or as a cheering player once the final ring has started', () => {
    const h = game({ players: ['a'] });
    h.tick(5000);
    expect(h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false }).ok).toBe(true);
    const late = me(h, 'late');
    expect(late).toMatchObject({ in: true, glow: 3, safeUntil: now(h) + RELIGHT.safeMs });
    expect(overlapsCover(mapOf(h), late.x, late.z, PLAYER_RADIUS - 0.001)).toBe(false);
    expect((h.rt.pulse() as any).p.map((e: any) => e[0])).toEqual(['a', 'late']);
    // A solo game never ends early, so it is still running in its final ring.
    const solo = game({ players: ['a'], common: { timeLimitSec: 60 } });
    tickTo(solo, 46_000);
    expect(solo.state().final).toBe(true);
    solo.rt.addPlayer({ id: 'later', name: 'Later', teamId: null, isBot: false });
    expect(me(solo, 'later')).toMatchObject({ in: false, out: true });
    expect(solo.view('later').you).toMatchObject({ out: true, relight: null });
  });
});

/* --------------------------------- variants ------------------------------- */

describe('variants', () => {
  it('Squads: teams always on, and a dimmed player relights beside a glowing teammate', () => {
    const v = variant('glow-tag-squads');
    expect(v.common?.teamCount).toBeGreaterThanOrEqual(2);
    expect(v.locked).toEqual(['squads']);
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }], variant: v });
    expect(h.view('a').rules.squads).toBe(true);
    faceOff(h, 'c', 'a');
    charge(h, 'c', 3);
    dimBy(h, 'c', 'a');
    h.answer('a', 'right');
    h.answer('a', 'right');
    const a = me(h, 'a');
    const b = me(h, 'b');
    expect(a.in).toBe(true);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(3.5);
  });

  it('One Glow: everyone has 1 glow, one tag dims, one right answer relights', () => {
    const h = game({ variant: variant('glow-tag-one-glow') });
    expect(me(h, 'a').glow).toBe(1);
    expect(h.view('a').rules).toMatchObject({ glow: 1, relight: 1 });
    faceOff(h);
    charge(h, 'a', 1);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(me(h, 'a').lastTag.outcome).toBe('dimmed');
    expect(me(h, 'a').score).toBe(me(h, 'a').stream.correct * SCORE.answer + SCORE.tag + SCORE.dim);
    expect(h.view('b').you.relight).toEqual({ have: 0, need: 1 });
    h.answer('b', 'right');
    expect(me(h, 'b')).toMatchObject({ in: true, glow: 1 });
  });

  it('Lights Out: others are hidden unless near, a teammate, or lit by their own beam, on screens and in the pulse', () => {
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 2 }, { id: 'm', team: 1 }], teams: 2, variant: variant('glow-tag-lights-out') });
    const seen = (viewer: string | null, id: string) => {
      const v = viewer ? h.view(viewer) : h.host();
      return v.players.find((p: any) => p[0] === id)[3] !== null;
    };
    const pulsed = () => (h.rt.pulse() as any).p.map((e: any) => e[0]);
    faceOff(h, 'a', 'b', 28);
    walkTo(h, 'm', -2.5, -14);
    h.wait(LIGHTS_OUT.litMs);
    expect(seen('b', 'a')).toBe(false);
    expect(seen('a', 'a')).toBe(true);
    expect(seen(null, 'a')).toBe(false);
    expect(pulsed()).toEqual([]);
    // A teammate is always seen.
    expect(seen('a', 'm')).toBe(true);
    expect(seen('b', 'm')).toBe(false);
    // Using a beam lights you up for everyone for 2 seconds.
    charge(h, 'a', 1);
    expect(tag(h, 'a', 'b').ok).toBe(true);
    expect(seen('b', 'a')).toBe(true);
    expect(seen(null, 'a')).toBe(true);
    expect(pulsed()).toEqual(['a']);
    expect(h.view('b').players.find((p: any) => p[0] === 'a')[7] & FLAGS.lit).toBe(FLAGS.lit);
    h.wait(LIGHTS_OUT.litMs + 1);
    expect(seen('b', 'a')).toBe(false);
    expect(pulsed()).toEqual([]);
    // Close enough to see each other: within 12 metres.
    walkTo(h, 'b', 0, -3);
    expect(seen('b', 'a')).toBe(true);
    expect(seen('a', 'b')).toBe(true);
    expect(seen(null, 'a')).toBe(false);
    expect(pulsed()).toEqual([]);
    // Up close, walking refreshes everyone's views (at most every 200 ms) instead of being quiet.
    h.wait(LIGHTS_OUT.refreshMs);
    const before = { ...h.changes };
    h.rt.act('b', { type: 'move', x: 0, z: -3.1, h: Math.PI });
    expect(h.changes.changed).toBe(before.changed + 1);
    h.rt.act('b', { type: 'move', x: 0, z: -3.1, h: Math.PI });
    expect(h.changes).toEqual({ changed: before.changed + 1, pulsed: before.pulsed + 1 });
  });

  it('leaves the base game as it was: everyone seen, 3 glow, no squad relight', () => {
    const h = game();
    expect(h.view('a').rules).toEqual({ glow: 3, relight: 2, lightsOut: false, squads: false });
    expect(h.view('a').players.every((p: any) => p[3] !== null)).toBe(true);
    expect((h.rt.pulse() as any).p).toHaveLength(2);
  });
});
