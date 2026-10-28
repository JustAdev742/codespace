import { describe, expect, it } from 'vitest';
import '../src/chaos/cheats/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats, getCheat } from '../src/chaos/registry.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { capabilitiesOf } from '../src/chaos/engine.ts';
import { CHARGE, CRATES, GLOW, PLAYER_RADIUS, RELIGHT, RING, SCORE, TAG } from '../src/modes/glow-tag/meta.ts';
import { headingTo, lineOfSight, outsideRing, overlapsCover, ringAt, wrapAngle } from '../src/modes/glow-tag/arena.ts';
import { crateMax } from '../src/modes/glow-tag/index.ts';
import { makeTeams } from '../src/teams.ts';

/* Exact behaviour of the Glow Tag Royale cheat pack and adapter: amounts, limits, refusals, expiry, and the two promises (nobody is dimmed by a cheat, nobody is put in cover or outside the walls). */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ParkOpts {
  settings?: Record<string, unknown>;
  players?: number;
  seed?: number;
  teams?: number;
}

function park(o: ParkOpts = {}) {
  return new ChaosSim({ modeId: 'glow-tag', questions: MIXED_SET, players: o.players ?? 4, seed: o.seed ?? 11, settings: o.settings ?? {}, common: o.teams ? { teamCount: o.teams } : {} });
}

/** Two identical games, for comparing what a cheat changed. */
const twins = (o: ParkOpts = {}) => [park(o), park(o)] as const;

const G = (sim: ChaosSim, id: string): any => sim.state().g[id];
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string) => sim.cast(by, { cheatId: `glow-tag.${cheat}`, target: target ?? null });
const effect = (sim: ChaosSim, cheat: string) => sim.chaos().effects.find((e) => e.cheatId === `glow-tag.${cheat}`);
const idleAll = (...sims: ChaosSim[]) => sims.forEach((sim) => sim.ids.forEach((id) => sim.idle.add(id)));
const runAll = (ms: number, ...sims: ChaosSim[]) => sims.forEach((sim) => sim.run(ms));

function until(sim: ChaosSim, pred: () => boolean, maxMs = 240_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  if (!pred()) throw new Error('the situation never came up');
}

/** Play twins on together until `pred` holds in the first (they stay identical). */
function untilBoth(a: ChaosSim, b: ChaosSim, pred: () => boolean, maxMs = 240_000) {
  for (let t = 0; t < maxMs && !pred() && a.rt.status === 'running'; t += 250) runAll(250, a, b);
  if (!pred()) throw new Error('the situation never came up');
}

function legal(sim: ChaosSim, id: string) {
  const p = G(sim, id);
  const map = sim.state().map;
  const lim = map.size / 2 - PLAYER_RADIUS + 1e-6;
  return Math.abs(p.x) <= lim && Math.abs(p.z) <= lim && !overlapsCover(map, p.x, p.z, PLAYER_RADIUS - 0.02);
}

const teamOf = (sim: ChaosSim, id: string) => sim.rt.playerList().find((p) => p.id === id)?.teamId ?? null;
const rivals = (sim: ChaosSim, id: string) => sim.ids.filter((o) => o !== id && (teamOf(sim, id) === null || teamOf(sim, o) !== teamOf(sim, id)));

function canTag(sim: ChaosSim, id: string) {
  const me = G(sim, id);
  return Boolean(me?.in && me.charges >= 1 && sim.now >= me.cooldownUntil);
}

/** Distance from `by` to `at` if `by` could tag them with nothing in between, else null. */
function aimable(sim: ChaosSim, by: string, at: string): number | null {
  const me = G(sim, by);
  const t = G(sim, at);
  if (!canTag(sim, by) || !t?.in || sim.now < t.safeUntil || !rivals(sim, by).includes(at)) return null;
  if (!lineOfSight(sim.state().map, me.x, me.z, t.x, t.z)) return null;
  return Math.hypot(t.x - me.x, t.z - me.z);
}

function rivalFor(sim: ChaosSim, by: string, ok: (t: any, d: number) => boolean): string | null {
  for (const id of rivals(sim, by)) {
    const d = aimable(sim, by, id);
    if (d !== null && ok(G(sim, id), d)) return id;
  }
  return null;
}

/** Turn to face a rival (plus an offset), staying put, and press Tag. */
function tagAt(sim: ChaosSim, by: string, at: string, offset = 0) {
  const me = G(sim, by);
  const t = G(sim, at);
  sim.rt.act(by, { type: 'move', x: me.x, z: me.z, h: wrapAngle(headingTo(me.x, me.z, t.x, t.z) + offset) });
  return sim.rt.act(by, { type: 'tag', target: at });
}

/** A twin pair where p1 can tag a rival for which `ok` holds; everyone stops acting. Returns the rival. */
function duel(ok: (t: any, d: number) => boolean, o: ParkOpts = {}): [ChaosSim, ChaosSim, string] {
  const [a, b] = twins(o);
  untilBoth(a, b, () => rivalFor(a, 'p1', ok) !== null);
  idleAll(a, b);
  return [a, b, rivalFor(a, 'p1', ok)!];
}

const near = (t: any, d: number) => d <= TAG.range - 2 && !t.shield;

describe('glow-tag adapter', () => {
  const adapter = chaosAdapterFor('glow-tag')!;
  const meter = (key: string) => adapter.meters.find((m) => m.key === key)!;

  it('keeps glow between 1 and the starting glow, and never touches a dimmed player', () => {
    const sim = park();
    until(sim, () => sim.ids.some((id) => !G(sim, id).in) && sim.ids.some((id) => G(sim, id).in));
    const ctx = { settings: sim.rt.settings } as never;
    const lit = sim.ids.find((id) => G(sim, id).in)!;
    const dim = sim.ids.find((id) => !G(sim, id).in)!;
    const glow = meter('glow');
    expect((glow.min as any)(sim.state(), lit, ctx)).toBe(1);
    expect(glow.max!(sim.state(), lit, ctx)).toBe(GLOW.start);
    expect((glow.min as any)(sim.state(), dim, ctx)).toBe(0);
    expect(glow.max!(sim.state(), dim, ctx)).toBe(0);
    // Relight progress stops one right answer short: the last one is the player's own.
    if (!sim.state().final) expect(meter('relight').max!(sim.state(), dim, ctx)).toBe(RELIGHT.need - 1);
    expect(meter('relight').max!(sim.state(), lit, ctx)).toBe(0);
    expect(meter('shield').max!(sim.state(), dim, ctx)).toBe(0);
    expect(meter('currency').max!(sim.state(), lit, ctx)).toBe(CHARGE.max);
  });

  it('offers what the settings switch on', () => {
    const caps = (settings: Record<string, unknown>, teams = 0) => capabilitiesOf(adapter, makeTeams(teams), settings);
    const base = caps({});
    for (const c of ['meter:score', 'meter:currency', 'meter:glow', 'stream', 'question', 'revive', 'knockouts', 'ring', 'crates', 'spare-glow']) expect(base).toContain(c);
    expect(base).not.toContain('losses');
    expect(base).not.toContain('teams');
    expect(caps({ oneGlow: true })).not.toContain('spare-glow');
    expect(caps({ lightsOut: true })).toContain('lights-out');
    expect(caps({ squads: true }, 2)).toEqual(expect.arrayContaining(['squads', 'teams']));
    // In One Glow there is no glow to move, so glow cheats stay off.
    const sim = park({ settings: { oneGlow: true } });
    sim.run(10_000);
    expect(cast(sim, 'p1', 'glow-up').ok).toBe(false);
    expect(cast(sim, 'p1', 'dim-down', 'p2').ok).toBe(false);
  });

  it('Second Life relights a dimmed player at the edge of the ring, as a right answer would', () => {
    const sim = park();
    until(sim, () => !sim.state().final && sim.ids.some((id) => !G(sim, id).in));
    const dim = sim.ids.find((id) => !G(sim, id).in)!;
    const by = sim.ids.find((id) => id !== dim)!;
    const charges = G(sim, dim).charges;
    const relights = sim.state().stats.relights;
    expect(sim.cast(by, { cheatId: 'adv.revive', target: dim }).ok).toBe(true);
    const g = G(sim, dim);
    expect(g.in).toBe(true);
    expect(g.glow).toBe(GLOW.start);
    expect(g.charges).toBe(Math.max(charges, RELIGHT.charges));
    expect(g.safeUntil).toBe(sim.now + RELIGHT.safeMs);
    expect(g.relight).toBe(0);
    expect(sim.state().stats.relights).toBe(relights + 1);
    expect(legal(sim, dim)).toBe(true);
    expect(outsideRing(ringAt(sim.state().ring, Math.max(sim.now, sim.state().ring.endAt)), g.x, g.z)).toBe(false);
  });

  it('nobody relights in the final ring, not even by a cheat', () => {
    const sim = park({ players: 8, teams: 2, seed: 1 });
    until(sim, () => sim.state().final && sim.ids.some((id) => !G(sim, id).in), 300_000);
    expect(sim.rt.status).toBe('running');
    const dim = sim.ids.find((id) => !G(sim, id).in)!;
    const mate = sim.ids.find((id) => id !== dim && teamOf(sim, id) === teamOf(sim, dim))!;
    const r = sim.cast(mate, { cheatId: 'adv.revive', target: dim });
    expect(r.ok).toBe(false);
    expect(cast(sim, mate, 'rally-call', dim)).toMatchObject({ ok: false, message: expect.stringContaining('final ring') });
    expect(G(sim, dim).in).toBe(false);
  });
});

describe('glow-tag pack: you', () => {
  it('Glow Sprint boosts you for 10 seconds, and stopping it ends the boost', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    const r = cast(sim, 'p1', 'sprint');
    expect(r.ok).toBe(true);
    expect(G(sim, 'p1').speedUntil).toBe(sim.now + 10_000);
    sim.run(2000);
    expect(sim.rt.stopEffect('p1', effect(sim, 'sprint')!.eid).ok).toBe(true);
    expect(G(sim, 'p1').speedUntil).toBe(sim.now);
  });

  it('Pocket Shield puts up a shield, refuses a second one, and can be undone', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    const r = cast(sim, 'p1', 'pocket-shield');
    expect(r.ok).toBe(true);
    expect(G(sim, 'p1').shield).toBe(true);
    expect(cast(sim, 'p1', 'mirror-shield')).toMatchObject({ ok: false, message: expect.stringContaining('already have a shield') });
    expect(sim.rt.undoCast('p1', (r as any).castId).ok).toBe(true);
    expect(G(sim, 'p1').shield).toBe(false);
  });

  it('Decoy Flicker makes you untaggable for 4 seconds; stopping it ends that', () => {
    const sim = park();
    until(sim, () => sim.ids.some((id) => id !== 'p1' && canTag(sim, id)) && G(sim, 'p1').in && sim.now >= G(sim, 'p1').safeUntil);
    idleAll(sim);
    const attacker = sim.ids.find((id) => id !== 'p1' && canTag(sim, id))!;
    expect(cast(sim, 'p1', 'decoy-flicker').ok).toBe(true);
    expect(G(sim, 'p1').safeUntil).toBe(sim.now + 4000);
    expect(sim.rt.act(attacker, { type: 'tag', target: 'p1' })).toMatchObject({ ok: false, message: expect.stringContaining('flickering') });
    expect(sim.rt.stopEffect('p1', effect(sim, 'decoy-flicker')!.eid).ok).toBe(true);
    expect(G(sim, 'p1').safeUntil).toBe(sim.now);
  });

  it('Long Beam lands a tag 16 to 24 metres away that would have missed', () => {
    const long = (t: any, d: number) => d > TAG.range + 0.5 && d <= 23.5 && t.glow >= 2 && !t.shield;
    const [a, b, rival] = duel(long);
    const before = { score: G(a, 'p1').score, glow: G(a, rival).glow };
    expect(cast(a, 'p1', 'long-beam').ok).toBe(true);
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(b, 'p1').lastTag.outcome).toBe('range');
    expect(G(b, rival).glow).toBe(before.glow);
    expect(G(a, 'p1').lastTag.outcome).toBe('hit');
    expect(G(a, rival).glow).toBe(before.glow - 1);
    expect(G(a, 'p1').score).toBe(before.score + SCORE.tag);
    expect(G(a, rival).safeUntil).toBe(a.now + TAG.safeMs);
    expect(a.state().beams[0]).toMatchObject({ by: 'p1', to: rival, outcome: 'hit' });
  });

  it('Long Beam never takes a last glow', () => {
    const long = (t: any, d: number) => d > TAG.range + 0.5 && d <= 23.5 && t.glow >= 2 && !t.shield;
    const [a, , rival] = duel(long);
    const others = a.ids.filter((id) => id !== 'p1' && id !== rival);
    // Two other players dim the rival down to their last glow.
    for (const by of others) if (G(a, rival).glow > 1) expect(cast(a, by, 'dim-down', rival).ok).toBe(true);
    expect(G(a, rival).glow).toBe(1);
    expect(cast(a, 'p1', 'long-beam').ok).toBe(true);
    tagAt(a, 'p1', rival);
    expect(G(a, 'p1').lastTag.outcome).toBe('range');
    expect(G(a, rival).glow).toBe(1);
    expect(G(a, rival).in).toBe(true);
  });

  it('Wide Beam lands a tag 32 degrees off centre that would have missed', () => {
    const wide = (t: any, d: number) => d >= 4 && d <= TAG.range - 2 && t.glow >= 2 && !t.shield;
    const [a, b, rival] = duel(wide);
    const glow = G(a, rival).glow;
    expect(cast(a, 'p1', 'wide-beam').ok).toBe(true);
    const off = (32 * Math.PI) / 180;
    tagAt(a, 'p1', rival, off);
    tagAt(b, 'p1', rival, off);
    expect(G(b, 'p1').lastTag.outcome).toBe('front');
    expect(G(a, 'p1').lastTag.outcome).toBe('hit');
    expect(G(a, rival).glow).toBe(glow - 1);
  });

  it('Beam Overcharge takes 2 glow from a rival with 3, once', () => {
    const [a, b, rival] = duel((t, d) => near(t, d) && t.glow === 3);
    expect(cast(a, 'p1', 'overcharge').ok).toBe(true);
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(b, rival).glow).toBe(2);
    expect(G(a, rival).glow).toBe(1);
    expect(G(a, rival).in).toBe(true);
    expect(effect(a, 'overcharge')).toBeUndefined();
  });

  it('Beam Overcharge never takes a last glow: on a rival with 2 it takes 1 and waits', () => {
    const [a, , rival] = duel((t, d) => near(t, d) && t.glow === 3);
    expect(cast(a, a.ids.find((id) => id !== 'p1' && id !== rival)!, 'dim-down', rival).ok).toBe(true);
    expect(cast(a, 'p1', 'overcharge').ok).toBe(true);
    tagAt(a, 'p1', rival);
    expect(G(a, rival).glow).toBe(1);
    expect(G(a, rival).in).toBe(true);
    expect(effect(a, 'overcharge')).toBeDefined();
  });

  it('Mirror Shield blocks a tag and bounces 1 glow back to the tagger', () => {
    const [a, b] = twins();
    const attackerOf = (sim: ChaosSim) => rivals(sim, 'p1').find((id) => (aimable(sim, id, 'p1') ?? Infinity) <= TAG.range - 2 && G(sim, id).glow >= 2 && !G(sim, id).shield && !G(sim, 'p1').shield);
    untilBoth(a, b, () => attackerOf(a) !== undefined);
    idleAll(a, b);
    const by = attackerOf(a)!;
    const glow = { me: G(a, 'p1').glow, them: G(a, by).glow };
    expect(cast(a, 'p1', 'mirror-shield').ok).toBe(true);
    expect(G(a, 'p1').shield).toBe(true);
    tagAt(a, by, 'p1');
    tagAt(b, by, 'p1');
    expect(G(b, 'p1').glow).toBe(glow.me - 1);
    expect(G(a, 'p1').glow).toBe(glow.me);
    expect(G(a, 'p1').shield).toBe(false);
    expect(G(a, by).glow).toBe(glow.them - 1);
    expect(G(a, by).lastHit).toMatchObject({ by: 'p1', outcome: 'hit' });
    expect(effect(a, 'mirror-shield')).toBeUndefined();
  });

  it('Mirror Shield fades after 20 seconds if nothing hits it', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'mirror-shield').ok).toBe(true);
    sim.run(20_500);
    expect(G(sim, 'p1').shield).toBe(false);
  });

  it('Blink lands inside the ring, clear of cover, further from rivals', () => {
    let blinked = 0;
    for (const seed of [3, 11, 21]) {
      const sim = park({ seed });
      sim.run(30_000);
      until(sim, () => G(sim, 'p1').in);
      idleAll(sim);
      const room = () => Math.min(...rivals(sim, 'p1').filter((id) => G(sim, id).in).map((id) => Math.hypot(G(sim, id).x - G(sim, 'p1').x, G(sim, id).z - G(sim, 'p1').z)));
      // The ring to come: the next ring while it is shown, otherwise where the ring is shrinking to.
      const area = sim.state().next ?? (sim.now < sim.state().ring.endAt ? sim.state().ring.to : ringAt(sim.state().ring, sim.now));
      const wasInside = !outsideRing(area, G(sim, 'p1').x, G(sim, 'p1').z);
      const before = room();
      const r = cast(sim, 'p1', 'blink');
      if (!r.ok) {
        expect(r.message).toContain('as safe as');
        continue;
      }
      expect(legal(sim, 'p1')).toBe(true);
      expect(outsideRing(area, G(sim, 'p1').x, G(sim, 'p1').z)).toBe(false);
      expect(outsideRing(ringAt(sim.state().ring, sim.now), G(sim, 'p1').x, G(sim, 'p1').z)).toBe(false);
      if (wasInside) expect(room()).toBeGreaterThan(before);
      expect(G(sim, 'p1').budgetAt).toBe(sim.now);
      blinked++;
    }
    expect(blinked).toBeGreaterThanOrEqual(2);
  });

  it('Ring Tether pulls you inside instead of letting the ring drain you', () => {
    const [a, b] = twins();
    idleAll(a, b);
    expect(cast(a, 'p1', 'ring-tether')).toMatchObject({ ok: false, message: expect.stringContaining('not started') });
    // Everyone stands still at the edge; the first shrink passes them.
    untilBoth(a, b, () => a.state().drainAt !== null && outsideRing(ringAt(a.state().ring, a.now), G(a, 'p1').x, G(a, 'p1').z));
    expect(cast(a, 'p1', 'ring-tether').ok).toBe(true);
    runAll(11_000, a, b);
    expect(G(a, 'p1').glow).toBe(GLOW.start);
    expect(G(b, 'p1').glow).toBeLessThan(GLOW.start);
    expect(legal(a, 'p1')).toBe(true);
    expect(outsideRing(ringAt(a.state().ring, a.state().drainAt - RING.drainEveryMs), G(a, 'p1').x, G(a, 'p1').z)).toBe(false);
    // Inside the ring there is nothing to tether.
    const [c] = twins();
    idleAll(c);
    until(c, () => c.state().phase >= 1);
    expect(cast(c, 'p3', 'blink').ok).toBe(true);
    expect(cast(c, 'p3', 'ring-tether')).toMatchObject({ ok: false, message: expect.stringContaining('safely inside') });
  });

  it('Glow Up gives back 1 glow, never above the start', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'glow-up')).toMatchObject({ ok: false, message: expect.stringContaining('full') });
    expect(cast(sim, 'p2', 'dim-down', 'p1').ok).toBe(true);
    expect(G(sim, 'p1').glow).toBe(GLOW.start - 1);
    sim.run(46_000);
    expect(cast(sim, 'p1', 'glow-up').ok).toBe(true);
    expect(G(sim, 'p1').glow).toBe(GLOW.start);
  });
});

describe('glow-tag pack: teammates', () => {
  it('Squad Jump lands 2.5 metres from a glowing teammate, clear of cover', () => {
    const sim = park({ teams: 2 });
    until(sim, () => G(sim, 'p1').in && G(sim, 'p3').in && Math.hypot(G(sim, 'p1').x - G(sim, 'p3').x, G(sim, 'p1').z - G(sim, 'p3').z) > 6);
    idleAll(sim);
    expect(cast(sim, 'p1', 'squad-jump', 'p3').ok).toBe(true);
    expect(Math.hypot(G(sim, 'p1').x - G(sim, 'p3').x, G(sim, 'p1').z - G(sim, 'p3').z)).toBeCloseTo(2.5, 0);
    expect(legal(sim, 'p1')).toBe(true);
    expect(cast(sim, 'p3', 'squad-jump', 'p1')).toMatchObject({ ok: false, message: expect.stringContaining('already beside') });
  });

  it('Rally Call brings a dimmed teammate one right answer closer, never all the way', () => {
    const sim = park({ teams: 2, players: 6 });
    // p1, p3 and p5 are a team.
    until(sim, () => !sim.state().final && ['p3', 'p5'].some((id) => !G(sim, id).in && G(sim, id).relight === 0));
    const dim = ['p3', 'p5'].find((id) => !G(sim, id).in && G(sim, id).relight === 0)!;
    const other = dim === 'p3' ? 'p5' : 'p3';
    expect(cast(sim, 'p1', 'rally-call', dim).ok).toBe(true);
    expect(G(sim, dim).relight).toBe(1);
    expect(G(sim, dim).in).toBe(false);
    expect(cast(sim, other, 'rally-call', dim)).toMatchObject({ ok: false, message: expect.stringContaining('one right answer') });
  });

  it('Glow Link passes 1 glow to a teammate, and never your last', () => {
    const sim = park({ teams: 2 });
    sim.run(5000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'glow-link', 'p3')).toMatchObject({ ok: false, message: expect.stringContaining('full') });
    expect(cast(sim, 'p2', 'dim-down', 'p3').ok).toBe(true);
    expect(cast(sim, 'p1', 'glow-link', 'p3').ok).toBe(true);
    expect([G(sim, 'p1').glow, G(sim, 'p3').glow]).toEqual([GLOW.start - 1, GLOW.start]);
    expect(cast(sim, 'p4', 'dim-down', 'p1').ok).toBe(true);
    expect(G(sim, 'p1').glow).toBe(1);
    expect(cast(sim, 'p3', 'dim-down', 'p2').ok).toBe(true);
    expect(cast(sim, 'p3', 'glow-link', 'p1').ok).toBe(true);
    sim.run(41_000);
    expect(cast(sim, 'p4', 'dim-down', 'p1').ok).toBe(false);
  });
});

describe('glow-tag pack: rivals', () => {
  it('Mud Patch halves how far a rival walks', () => {
    const [a, b] = twins();
    runAll(3000, a, b);
    idleAll(a, b);
    expect(cast(a, 'p1', 'mud-patch', 'p2').ok).toBe(true);
    const start = { x: G(a, 'p2').x, z: G(a, 'p2').z };
    // Walk along the open running track at the edge of the park, towards the far corner of p2's side.
    const half = a.state().map.size / 2 - 2.5;
    const goal = Math.abs(start.x) > Math.abs(start.z) ? { x: start.x, z: start.z > 0 ? -half : half } : { x: start.x > 0 ? -half : half, z: start.z };
    for (let t = 0; t < 2000; t += 125) {
      for (const sim of [a, b]) {
        const p = G(sim, 'p2');
        const d = Math.hypot(goal.x - p.x, goal.z - p.z) || 1;
        const step = Math.min(d, 2);
        sim.rt.act('p2', { type: 'move', x: p.x + ((goal.x - p.x) / d) * step, z: p.z + ((goal.z - p.z) / d) * step, h: headingTo(p.x, p.z, goal.x, goal.z) });
      }
      runAll(125, a, b);
    }
    const walked = (sim: ChaosSim) => Math.hypot(G(sim, 'p2').x - start.x, G(sim, 'p2').z - start.z);
    expect(walked(b)).toBeGreaterThan(8);
    expect(walked(a) / walked(b)).toBeGreaterThan(0.4);
    expect(walked(a) / walked(b)).toBeLessThan(0.65);
  });

  it('Jammed Beam makes a rival wait 3 seconds after each tag', () => {
    const sim = park();
    until(sim, () => rivalFor(sim, 'p2', (_t, d) => d <= TAG.range - 2) !== null);
    idleAll(sim);
    expect(cast(sim, 'p1', 'jammed-beam', 'p2').ok).toBe(true);
    tagAt(sim, 'p2', rivalFor(sim, 'p2', (_t, d) => d <= TAG.range - 2)!);
    expect(G(sim, 'p2').cooldownUntil).toBe(sim.now + 3000);
  });

  it('Beam Fizzle takes 2 charges and the beam for 3 seconds, and refuses an empty beam', () => {
    const sim = park();
    expect(cast(sim, 'p1', 'beam-fizzle', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('no charges') });
    until(sim, () => G(sim, 'p2').in && G(sim, 'p2').charges >= 2);
    idleAll(sim);
    const charges = G(sim, 'p2').charges;
    expect(cast(sim, 'p3', 'beam-fizzle', 'p2').ok).toBe(true);
    expect(G(sim, 'p2').charges).toBe(charges - 2);
    expect(G(sim, 'p2').cooldownUntil).toBeGreaterThanOrEqual(sim.now + 3000);
  });

  it('Short Beam stops tags beyond 8 metres before the beam leaves', () => {
    const sim = park();
    until(sim, () => rivalFor(sim, 'p2', (_t, d) => d > 9) !== null);
    idleAll(sim);
    const far = rivalFor(sim, 'p2', (_t, d) => d > 9)!;
    const charges = G(sim, 'p2').charges;
    expect(cast(sim, 'p1', 'short-beam', 'p2').ok).toBe(true);
    expect(tagAt(sim, 'p2', far)).toMatchObject({ ok: false, message: expect.stringContaining('8 metres') });
    expect(G(sim, 'p2').charges).toBe(charges);
    sim.run(12_500);
    expect(tagAt(sim, 'p2', far).ok).toBe(true);
    expect(G(sim, 'p2').charges).toBe(charges - 1);
  });

  it('Shield Pop pops a shield and refuses when there is none', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'shield-pop', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('no shield') });
    expect(cast(sim, 'p2', 'pocket-shield').ok).toBe(true);
    expect(cast(sim, 'p3', 'shield-pop', 'p2').ok).toBe(true);
    expect(G(sim, 'p2').shield).toBe(false);
  });

  it('Dim Down takes 1 glow and never the last', () => {
    const sim = park();
    sim.run(5000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'dim-down', 'p2').ok).toBe(true);
    expect(cast(sim, 'p3', 'dim-down', 'p2').ok).toBe(true);
    expect(G(sim, 'p2').glow).toBe(1);
    expect(cast(sim, 'p4', 'dim-down', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('last glow') });
    expect(G(sim, 'p2')).toMatchObject({ glow: 1, in: true });
  });

  it('Swap Spots swaps two players exactly, headings kept', () => {
    const sim = park();
    sim.run(20_000);
    until(sim, () => G(sim, 'p1').in && G(sim, 'p2').in);
    idleAll(sim);
    const [p1, p2] = [{ ...G(sim, 'p1') }, { ...G(sim, 'p2') }];
    expect(cast(sim, 'p1', 'swap-spots', 'p2').ok).toBe(true);
    expect(G(sim, 'p1')).toMatchObject({ x: p2.x, z: p2.z, h: p1.h, budgetAt: sim.now });
    expect(G(sim, 'p2')).toMatchObject({ x: p1.x, z: p1.z, h: p2.h, budgetAt: sim.now });
    expect(legal(sim, 'p1') && legal(sim, 'p2')).toBe(true);
    // The next pulse already has everyone where the cheat put them.
    const pulse = (sim.rt.pulse() as any).p as any[];
    expect(pulse.find((e) => e[0] === 'p1').slice(1, 3)).toEqual([Math.round(p2.x * 10), Math.round(p2.z * 10)]);
    expect(pulse.find((e) => e[0] === 'p2').slice(1, 3)).toEqual([Math.round(p1.x * 10), Math.round(p1.z * 10)]);
  });

  it('Swap Spots will not leave a player on their last glow outside the ring', () => {
    const sim = park();
    idleAll(sim);
    // p1 blinks into the ring as the first shrink starts; the others stand still at the edge as it passes them.
    until(sim, () => sim.now >= sim.state().ring.startAt && sim.state().drainAt !== null);
    expect(cast(sim, 'p1', 'blink').ok).toBe(true);
    expect(cast(sim, 'p2', 'dim-down', 'p1').ok).toBe(true);
    expect(cast(sim, 'p3', 'dim-down', 'p1').ok).toBe(true);
    expect(G(sim, 'p1').glow).toBe(1);
    const out = () => outsideRing(ringAt(sim.state().ring, sim.state().drainAt), G(sim, 'p4').x, G(sim, 'p4').z);
    until(sim, () => out() || !G(sim, 'p4').in, 20_000);
    expect(G(sim, 'p4').in).toBe(true);
    expect(cast(sim, 'p1', 'swap-spots', 'p4')).toMatchObject({ ok: false, message: expect.stringContaining('last glow') });
  });

  it('Searchlight shows a hidden rival to everyone in Lights Out, for 10 seconds', () => {
    const sim = park({ settings: { lightsOut: true } });
    sim.run(3000);
    idleAll(sim);
    sim.run(2500);
    const inPulse = () => ((sim.rt.pulse() as any).p as any[]).some((e) => e[0] === 'p2');
    const hostSees = () => ((sim.rt.view({ kind: 'host' }) as any).players as any[]).find((p) => p[0] === 'p2')[3] !== null;
    expect(inPulse()).toBe(false);
    expect(hostSees()).toBe(false);
    expect(cast(sim, 'p1', 'searchlight', 'p2').ok).toBe(true);
    for (let t = 0; t < 9000; t += 1000) {
      expect(inPulse()).toBe(true);
      expect(hostSees()).toBe(true);
      sim.run(1000);
    }
    sim.run(4000);
    expect(inPulse()).toBe(false);
  });
});

describe('glow-tag pack: points', () => {
  it('Beam Pickpocket takes 10% of the points of the next player you tag', () => {
    const [a, b, rival] = duel((t, d) => near(t, d) && t.score >= 20);
    expect(cast(a, 'p1', 'beam-pickpocket').ok).toBe(true);
    const take = Math.max(1, Math.round(G(a, rival).score / 10));
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(b, 'p1').lastTag.outcome).toMatch(/hit|dimmed/);
    expect(G(a, 'p1').score - G(b, 'p1').score).toBe(take);
    expect(G(b, rival).score - G(a, rival).score).toBe(take);
    expect(effect(a, 'beam-pickpocket')).toBeUndefined();
  });

  it('Glow Bounty pays 50 more for every tag on the marked rival, to whoever lands it', () => {
    const [a, b, rival] = duel(near);
    expect(cast(a, a.ids.find((id) => id !== 'p1' && id !== rival)!, 'glow-bounty', rival).ok).toBe(true);
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(a, 'p1').score - G(b, 'p1').score).toBe(SCORE.dim);
  });

  it('Chain Glow pays 50, then 100, for tags in a row', () => {
    const [a, b, rival] = duel((t, d) => near(t, d) && t.glow === 3);
    // Enough charges for two tags, in both games alike.
    if (G(a, 'p1').charges < 2) for (const sim of [a, b]) expect(cast(sim, 'p1', 'charge-pack').ok).toBe(true);
    expect(cast(a, 'p1', 'chain-glow').ok).toBe(true);
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(a, 'p1').score - G(b, 'p1').score).toBe(SCORE.dim);
    runAll(TAG.safeMs + 50, a, b);
    expect(aimable(a, 'p1', rival)).not.toBeNull();
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    expect(G(a, 'p1').score - G(b, 'p1').score).toBe(SCORE.dim * 3);
  });
});

describe('glow-tag pack: the ring', () => {
  it('Ring Freeze holds the shrinking ring for 6 seconds, then lets it finish 6 seconds late', () => {
    const sim = park();
    idleAll(sim);
    expect(cast(sim, 'p1', 'ring-freeze')).toMatchObject({ ok: false, message: expect.stringContaining('not shrinking') });
    until(sim, () => sim.state().phase >= 1 && sim.now >= sim.state().ring.startAt + 3000);
    const endAt = sim.state().ring.endAt;
    const r = ringAt(sim.state().ring, sim.now).r;
    expect(cast(sim, 'p1', 'ring-freeze').ok).toBe(true);
    expect(sim.state().ring.endAt).toBe(endAt + 6000);
    sim.run(5000);
    expect(ringAt(sim.state().ring, sim.now).r).toBeCloseTo(r, 0);
    sim.run(3000);
    expect(ringAt(sim.state().ring, sim.now).r).toBeLessThan(r - 0.5);
    sim.run(endAt + 6000 - sim.now + 100);
    expect(sim.state().next).not.toBeNull();
  });

  it('Ring Rush finishes the shrink in half the time it had left, without a jump', () => {
    const sim = park();
    idleAll(sim);
    until(sim, () => sim.state().phase >= 1 && sim.now >= sim.state().ring.startAt + 2000);
    const before = ringAt(sim.state().ring, sim.now);
    const left = sim.state().ring.endAt - sim.now;
    expect(cast(sim, 'p1', 'ring-rush').ok).toBe(true);
    expect(sim.state().ring.endAt).toBe(sim.now + Math.round(left / 2 / 100) * 100);
    expect(ringAt(sim.state().ring, sim.now).r).toBeCloseTo(before.r, 1);
    sim.run(sim.state().ring.endAt - sim.now + 100);
    expect(sim.state().next).not.toBeNull();
  });

  it('Late Ring starts the next shrink 10 seconds later', () => {
    const sim = park();
    sim.run(5000);
    const next = { ...sim.state().next };
    expect(cast(sim, 'p1', 'late-ring').ok).toBe(true);
    expect(sim.state().next).toMatchObject({ startAt: next.startAt + 10_000, endAt: next.endAt + 10_000, x: next.x, z: next.z, r: next.r });
    expect(sim.state().phaseStarts[0]).toBe(next.startAt + 10_000);
    sim.run(next.startAt - sim.now + 1000);
    expect(sim.state().phase).toBe(0);
    sim.run(10_000);
    expect(sim.state().phase).toBe(1);
    expect(sim.state().ring.startAt).toBe(next.startAt + 10_000);
  });

  it('Ring Reroll draws the next ring again inside the ring now', () => {
    const sim = park();
    sim.run(5000);
    const next = { ...sim.state().next };
    const prev = sim.state().ring.to;
    expect(cast(sim, 'p1', 'ring-reroll').ok).toBe(true);
    const now = sim.state().next;
    expect(now.r).toBe(next.r);
    expect(Math.hypot(now.x - next.x, now.z - next.z)).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(now.x - prev.x, now.z - prev.z)).toBeLessThanOrEqual(RING.drift * (prev.r - now.r) + 0.1);
  });

  it('Beam Break stops every beam for 6 seconds', () => {
    const sim = park();
    until(sim, () => sim.ids.some((id) => rivalFor(sim, id, () => true) !== null));
    idleAll(sim);
    const by = sim.ids.find((id) => rivalFor(sim, id, () => true) !== null)!;
    const at = rivalFor(sim, by, () => true)!;
    expect(cast(sim, 'p4', 'beam-break').ok).toBe(true);
    expect(tagAt(sim, by, at)).toMatchObject({ ok: false, message: expect.stringContaining('Beam break') });
    sim.run(6100);
    expect(tagAt(sim, by, at).ok).toBe(true);
  });

  it('Park Flare shows everyone in Lights Out', () => {
    const sim = park({ settings: { lightsOut: true } });
    sim.run(3000);
    idleAll(sim);
    sim.run(2500);
    const seen = () => ((sim.rt.pulse() as any).p as any[]).length;
    expect(seen()).toBe(0);
    expect(cast(sim, 'p1', 'park-flare').ok).toBe(true);
    expect(seen()).toBe(4);
    sim.run(5000);
    expect(seen()).toBe(4);
  });

  it('Park Scramble moves every glowing player to another one\'s spot', () => {
    const sim = park();
    sim.run(20_000);
    idleAll(sim);
    const lit = sim.ids.filter((id) => G(sim, id).in);
    const spots = new Map(lit.map((id) => [id, `${G(sim, id).x},${G(sim, id).z}`]));
    expect(cast(sim, 'p1', 'park-scramble').ok).toBe(true);
    const after = lit.map((id) => `${G(sim, id).x},${G(sim, id).z}`);
    expect(after.slice().sort()).toEqual([...spots.values()].sort());
    for (const id of lit) {
      expect(`${G(sim, id).x},${G(sim, id).z}`).not.toBe(spots.get(id));
      expect(legal(sim, id)).toBe(true);
    }
  });
});

describe('glow-tag pack: charges and crates', () => {
  it('Charge Pack gives 3 charges, up to 8', () => {
    const sim = park();
    idleAll(sim);
    expect(cast(sim, 'p1', 'charge-pack').ok).toBe(true);
    expect(G(sim, 'p1').charges).toBe(CRATES.charge);
    const s2 = park();
    until(s2, () => G(s2, 'p1').charges >= CHARGE.max - 1);
    idleAll(s2);
    const r = cast(s2, 'p1', 'charge-pack');
    if (G(s2, 'p1').charges === CHARGE.max && !r.ok) expect(r.message).toContain('full');
    else expect(G(s2, 'p1').charges).toBe(CHARGE.max);
  });

  it('Crate Call drops a crate beside you, and not past the park\'s limit', () => {
    const sim = park();
    sim.run(2000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'crate-call').ok).toBe(true);
    const crate = sim.state().crates.at(-1);
    expect(['charge', 'shield', 'speed']).toContain(crate.kind);
    expect(Math.hypot(crate.x - G(sim, 'p1').x, crate.z - G(sim, 'p1').z)).toBeLessThanOrEqual(3.6);
    expect(overlapsCover(sim.state().map, crate.x, crate.z, PLAYER_RADIUS + 0.6)).toBe(false);
    for (const by of ['p2', 'p3', 'p4']) cast(sim, by, 'crate-call');
    expect(sim.state().crates.length).toBe(crateMax(4));
  });

  it('Refund Beam gives back the charge of a tag that misses', () => {
    const [a, b, rival] = duel((_t, d) => d >= 2);
    expect(cast(a, 'p1', 'refund-beam').ok).toBe(true);
    const charges = G(a, 'p1').charges;
    tagAt(a, 'p1', rival, Math.PI);
    tagAt(b, 'p1', rival, Math.PI);
    expect(G(b, 'p1').charges).toBe(charges - 1);
    expect(G(a, 'p1').charges).toBe(charges);
  });

  it('Crate Snatch takes the nearest useful crate from across the park', () => {
    const sim = park();
    until(sim, () => G(sim, 'p1').in && sim.state().crates.some((c: any) => c.kind !== 'charge' || G(sim, 'p1').charges < CHARGE.max));
    idleAll(sim);
    const count = sim.state().crates.length;
    const picked = sim.state().stats.crates;
    expect(cast(sim, 'p1', 'crate-snatch').ok).toBe(true);
    expect(sim.state().crates.length).toBe(count - 1);
    expect(sim.state().stats.crates).toBe(picked + 1);
  });

  it('Supply Drop fills the park with crates inside the ring', () => {
    const sim = park();
    sim.run(2000);
    idleAll(sim);
    expect(cast(sim, 'p1', 'supply-drop').ok).toBe(true);
    const crates = sim.state().crates;
    expect(crates.length).toBe(crateMax(4));
    const area = sim.state().next ?? sim.state().ring.to;
    for (const c of crates) {
      expect(Math.hypot(c.x - area.x, c.z - area.z)).toBeLessThanOrEqual(area.r);
      expect(overlapsCover(sim.state().map, c.x, c.z, PLAYER_RADIUS + 0.6)).toBe(false);
    }
    expect(cast(sim, 'p2', 'supply-drop')).toMatchObject({ ok: false, message: expect.stringContaining('as many crates') });
  });
});

describe('glow-tag pack: luck', () => {
  it('every random cheat shows odds that add up to 100', () => {
    const random = allCheats().filter((d) => d.modes?.includes('glow-tag') && (d.category === 'random' || /odds/.test(d.description)));
    expect(random.length).toBeGreaterThanOrEqual(5);
    for (const d of random) {
      const percents = [...d.description.matchAll(/(\d+)%/g)].map((x) => Number(x[1]));
      expect(percents.reduce((x, y) => x + y, 0), d.id).toBe(100);
    }
  });

  it('Mystery Glow always changes something', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = park({ seed });
      sim.run(15_000);
      until(sim, () => G(sim, 'p1').in);
      idleAll(sim);
      const before = JSON.stringify(G(sim, 'p1'));
      expect(cast(sim, 'p1', 'mystery-glow').ok).toBe(true);
      expect(JSON.stringify(G(sim, 'p1'))).not.toBe(before);
    }
  });

  it('Glow Dice always takes something from the rival, never their last glow', () => {
    let rolled = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = park({ seed });
      sim.run(15_000);
      until(sim, () => G(sim, 'p2').in);
      idleAll(sim);
      const before = JSON.stringify(G(sim, 'p2'));
      const r = cast(sim, 'p1', 'glow-dice', 'p2');
      if (!r.ok) {
        expect(r.message).toContain('nothing the dice');
        continue;
      }
      expect(JSON.stringify(G(sim, 'p2'))).not.toBe(before);
      expect(G(sim, 'p2').glow).toBeGreaterThanOrEqual(1);
      rolled++;
    }
    expect(rolled).toBeGreaterThanOrEqual(3);
  });

  it('Lucky Sparks pays out on a tag that lands', () => {
    const [a, b, rival] = duel(near);
    expect(cast(a, 'p1', 'lucky-sparks').ok).toBe(true);
    tagAt(a, 'p1', rival);
    tagAt(b, 'p1', rival);
    const d = { charges: G(a, 'p1').charges - G(b, 'p1').charges, score: G(a, 'p1').score - G(b, 'p1').score, glow: G(a, 'p1').glow - G(b, 'p1').glow };
    expect([JSON.stringify({ charges: 1, score: 0, glow: 0 }), JSON.stringify({ charges: 0, score: SCORE.dim, glow: 0 }), JSON.stringify({ charges: 0, score: 0, glow: 1 })]).toContain(JSON.stringify(d));
  });
});

describe('glow-tag pack: promises', () => {
  const pack = allCheats().filter((d) => d.modes?.includes('glow-tag'));

  it('has about 35 cheats with names unique across the catalogue', () => {
    expect(pack.length).toBeGreaterThanOrEqual(35);
    const names = allCheats().map((d) => d.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const d of pack) expect(getCheat(d.id)).toBe(d);
  });

  it('a cheat never dims anyone, and never puts anyone in cover or outside the walls', () => {
    let cast = 0;
    for (const seed of [2, 5]) {
      const sim = park({ seed, teams: 2, players: 6 });
      for (let round = 0; round < 45 && sim.rt.status === 'running'; round++) {
        sim.run(6000);
        pack.forEach((d, i) => {
          const by = sim.ids[(round + i) % sim.ids.length]!;
          const pool = sim.ids.filter((id) => id !== by && (d.target !== 'teammate' || teamOf(sim, id) === teamOf(sim, by)) && (d.target !== 'opponent' || teamOf(sim, id) !== teamOf(sim, by)));
          const t = d.target === 'self' || d.target === 'room' ? null : (pool[round % Math.max(1, pool.length)] ?? null);
          const lit = sim.ids.filter((id) => G(sim, id).in);
          if (!sim.cast(by, { cheatId: d.id, target: t }).ok) return;
          cast++;
          for (const id of lit) expect(G(sim, id).in, `${d.id} dimmed ${id}`).toBe(true);
          for (const id of sim.ids) if (G(sim, id).in) expect(legal(sim, id), `${d.id} put ${id} somewhere illegal`).toBe(true);
        });
      }
      expect(sim.errors).toEqual([]);
    }
    expect(cast).toBeGreaterThan(100);
  }, 120_000);
});
