import type { ChaosSim } from '../../src/testing/chaos.ts';
import { headingTo, lineOfSight, outsideRing, ringAt, wrapAngle } from '../../src/modes/glow-tag/arena.ts';
import { TAG } from '../../src/modes/glow-tag/meta.ts';
import { crateMax } from '../../src/modes/glow-tag/index.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for glow-tag cheats. See chaos-scenarios.ts for what each field does.
 *
 * Many Glow Tag cheats wait for a beam: a tag that lands, one that misses,
 * one that lands on the caster. These play both games on (identically, so
 * they stay twins) until a player can make that tag, and then make it as
 * the player would: turn to face the rival and press Tag. Ring cheats wait
 * for a shrink, crate cheats for room in the park, team cheats for a
 * teammate in the right state. Nothing here edits the game state by hand.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const G = (sim: ChaosSim): Record<string, any> => sim.state().g;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const glowingIds = (sim: ChaosSim) => live(sim).filter((id) => G(sim)[id]?.in);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 200_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

const teamOf = (sim: ChaosSim, id: string) => sim.rt.playerList().find((p) => p.id === id)?.teamId ?? null;
/** Players who count as opponents of `id` (another team, or anyone when there are no teams). Kept here: importing it would make the scenario files import each other. */
const opponentsOf = (sim: ChaosSim, id: string) =>
  sim.rt
    .playerList()
    .filter((p) => p.id !== id && (teamOf(sim, id) === null || p.teamId !== teamOf(sim, id)))
    .map((p) => p.id);

const teammatesOf = (sim: ChaosSim, id: string) => {
  const team = sim.rt.playerList().find((p) => p.id === id)?.teamId ?? null;
  return team === null ? [] : sim.rt.playerList().filter((p) => p.id !== id && p.teamId === team).map((p) => p.id);
};

/** Whether a player could press Tag right now (glowing, a charge, the beam recharged). */
function canTag(sim: ChaosSim, id: string) {
  const me = G(sim)[id];
  return Boolean(me?.in && sim.rt.hasPlayer(id) && me.charges >= 1 && sim.now >= me.cooldownUntil);
}

/** Whether `by` could tag `at` (a glowing rival, not flickering) with nothing in between, and how far away they are. */
function aimable(sim: ChaosSim, by: string, at: string): number | null {
  const me = G(sim)[by];
  const t = G(sim)[at];
  if (!canTag(sim, by) || !t?.in || !sim.rt.hasPlayer(at) || sim.now < t.safeUntil || !opponentsOf(sim, by).includes(at)) return null;
  if (!lineOfSight(sim.state().map, me.x, me.z, t.x, t.z)) return null;
  return Math.hypot(t.x - me.x, t.z - me.z);
}

/** The first rival `by` could tag for which `ok` holds. */
function rivalFor(sim: ChaosSim, by: string, ok: (t: any, dist: number) => boolean): string | null {
  for (const id of opponentsOf(sim, by)) {
    const d = aimable(sim, by, id);
    if (d !== null && ok(G(sim)[id], d)) return id;
  }
  return null;
}

/** Turn `by` to face `at` (plus `offset` radians), staying put, then press Tag. */
function tagAt(sim: ChaosSim, by: string, at: string, offset = 0) {
  const me = G(sim)[by];
  const t = G(sim)[at];
  sim.rt.act(by, { type: 'move', x: me.x, z: me.z, h: wrapAngle(headingTo(me.x, me.z, t.x, t.z) + offset) });
  sim.rt.act(by, { type: 'tag', target: at });
}

/** A rival the caster can tag head on: in range, in sight, and not flickering. */
const inReach = (extra: (t: any) => boolean = () => true) => (t: any, d: number) => d <= TAG.range - 2 && extra(t);
/** Long Beam: further than the beam reaches, but within Long Beam's 24 metres, on a rival with glow to spare. */
const longReach = (t: any, d: number) => d > TAG.range + 0.5 && d <= 23.5 && (t.glow >= 2 || t.shield);
/** Wide Beam: close enough, on a rival with glow to spare; the caster will face 32 degrees off. */
const wideReach = (t: any, d: number) => d >= 4 && d <= TAG.range - 2 && (t.glow >= 2 || t.shield);
const WIDE_OFFSET = (32 * Math.PI) / 180;

const casterCan = (ok: (t: any, d: number) => boolean): Pre => (sim, caster) => void until(sim, () => rivalFor(sim, caster, ok) !== null);
const casterTags = (ok: (t: any, d: number) => boolean, offset = 0): Post => (sim, caster) => {
  const at = rivalFor(sim, caster, ok);
  if (at) tagAt(sim, caster, at, offset);
};

/** The caster misses on purpose: they face away from a rival and press Tag. */
const casterMisses: Post = (sim, caster) => {
  const at = rivalFor(sim, caster, (_t, d) => d >= 2);
  if (at) tagAt(sim, caster, at, Math.PI);
};

/** The cheat's target presses Tag at someone (any rival) as soon as they can. `far`: only at a rival further than that. */
const targetTags = (far = 0): Post => (sim, _caster, _def, target) => {
  if (!target) return;
  until(sim, () => rivalFor(sim, target, (_t, d) => d > far) !== null, 60_000);
  const at = rivalFor(sim, target, (_t, d) => d > far);
  if (at) tagAt(sim, target, at);
};

/** Someone presses Tag at the cheat's target as soon as anyone can. */
const someoneTagsTarget: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  const tagger = () => live(sim).find((id) => id !== target && aimable(sim, id, target) !== null && aimable(sim, id, target)! <= TAG.range - 2) ?? null;
  until(sim, () => tagger() !== null, 60_000);
  const by = tagger();
  if (by) tagAt(sim, by, target);
};

/** Anyone presses Tag at anyone, for a cheat that stops every beam. */
const anyoneTags: Post = (sim) => {
  const pair = () => {
    for (const by of glowingIds(sim)) {
      const at = rivalFor(sim, by, () => true);
      if (at) return [by, at] as const;
    }
    return null;
  };
  until(sim, () => pair() !== null, 60_000);
  const p = pair();
  if (p) tagAt(sim, p[0], p[1]);
};

/** The cheat's target takes a step, so a cheat on their walking has a step to work on. */
const targetWalks: Post = (sim, _caster, _def, target) => {
  const t = target ? G(sim)[target] : null;
  if (t?.in) sim.rt.act(target!, { type: 'move', x: t.x + Math.sin(t.h) * 1.5, z: t.z + Math.cos(t.h) * 1.5, h: t.h });
};

/** A rival who can tag the caster, for a mirror to bounce. The caster must not have a shield up already. */
function attackerOf(sim: ChaosSim, caster: string): string | null {
  if (G(sim)[caster]?.shield) return null;
  return opponentsOf(sim, caster).find((id) => (aimable(sim, id, caster) ?? Infinity) <= TAG.range - 2) ?? null;
}

/**
 * Ring Tether: wait for a shrink. A caster caught outside the ring it is
 * shrinking to stops there until the ring has passed them; anyone else is
 * refused, and the suite moves on to the next caster while the shrink lasts.
 */
const caughtOutside: Pre = (sim, caster) => {
  const s = () => sim.state();
  const me = () => G(sim)[caster];
  if (!until(sim, () => sim.now >= s().ring.startAt && sim.now < s().ring.endAt, 250_000)) return;
  if (!me()?.in || !outsideRing(s().ring.to, me().x, me().z)) return;
  sim.idle.add(caster);
  until(sim, () => !me()?.in || outsideRing(ringAt(s().ring, sim.now), me().x, me().z), 20_000);
};

const shrinkingFor = (ms: number): Pre => (sim) =>
  void until(sim, () => {
    const s = sim.state();
    return sim.now >= s.ring.startAt && s.ring.endAt - sim.now >= ms;
  });
const crateRoom: Pre = (sim) => void until(sim, () => sim.state().crates.length < crateMax(live(sim).length));
const usefulCrate: Pre = (sim, caster) =>
  void until(sim, () => {
    const me = G(sim)[caster];
    return Boolean(me?.in) && sim.state().crates.some((c: any) => (c.kind === 'charge' ? me.charges < 8 : c.kind === 'shield' ? !me.shield : true));
  });
const mateIs = (ok: (mate: any, me: any) => boolean): Pre => (sim, caster) =>
  void until(sim, () => teammatesOf(sim, caster).some((m) => sim.rt.hasPlayer(m) && ok(G(sim)[m], G(sim)[caster])));

/** A rival puts up a shield (with Pocket Shield) if nobody has one, so there is a shield to pop. */
const rivalShielded: Pre = (sim, caster) => {
  const rivals = opponentsOf(sim, caster).filter((id) => G(sim)[id]?.in);
  if (rivals.some((id) => G(sim)[id].shield)) return;
  if (rivals[0]) sim.cast(rivals[0], { cheatId: 'glow-tag.pocket-shield' });
};

export const scenarios: ScenarioSet = {
  // Searchlight and Park Flare only work in Lights Out.
  settings: { 'glow-tag': [{ lightsOut: true }] },
  pre: {
    'glow-tag.long-beam': casterCan(longReach),
    'glow-tag.wide-beam': casterCan(wideReach),
    'glow-tag.overcharge': casterCan(inReach((t) => t.glow >= 3 && !t.shield)),
    'glow-tag.beam-pickpocket': casterCan(inReach((t) => t.score > 0)),
    'glow-tag.chain-glow': casterCan(inReach()),
    'glow-tag.lucky-sparks': casterCan(inReach()),
    'glow-tag.refund-beam': casterCan((_t, d) => d >= 2),
    'glow-tag.mirror-shield': (sim, caster) => void until(sim, () => attackerOf(sim, caster) !== null),
    'glow-tag.ring-tether': caughtOutside,
    'glow-tag.ring-freeze': shrinkingFor(3000),
    'glow-tag.ring-rush': shrinkingFor(4000),
    'glow-tag.crate-call': crateRoom,
    'glow-tag.supply-drop': crateRoom,
    'glow-tag.crate-snatch': usefulCrate,
    'glow-tag.shield-pop': rivalShielded,
    'glow-tag.rally-call': mateIs((m) => m && !m.in && !m.out && m.relight === 0),
    'glow-tag.glow-link': mateIs((m, me) => m?.in && me?.in && me.glow >= 2 && m.glow < 3),
    'glow-tag.squad-jump': mateIs((m, me) => m?.in && me?.in && Math.hypot(m.x - me.x, m.z - me.z) > 6),
  },
  post: {
    'glow-tag.long-beam': casterTags(longReach),
    'glow-tag.wide-beam': casterTags(wideReach, WIDE_OFFSET),
    'glow-tag.overcharge': casterTags(inReach((t) => t.glow >= 3 && !t.shield)),
    'glow-tag.beam-pickpocket': casterTags(inReach((t) => t.score > 0)),
    'glow-tag.chain-glow': casterTags(inReach()),
    'glow-tag.lucky-sparks': casterTags(inReach()),
    'glow-tag.refund-beam': casterMisses,
    'glow-tag.mirror-shield': (sim, caster) => {
      // The caster's own mirror shield is up now; the rival who could tag them a moment ago does.
      const by = opponentsOf(sim, caster).find((id) => (aimable(sim, id, caster) ?? Infinity) <= TAG.range - 2);
      if (by) tagAt(sim, by, caster);
    },
    'glow-tag.glow-bounty': someoneTagsTarget,
    'glow-tag.jammed-beam': targetTags(),
    'glow-tag.short-beam': targetTags(9),
    'glow-tag.beam-break': anyoneTags,
    'glow-tag.mud-patch': targetWalks,
  },
  reactive: [
    'glow-tag.long-beam',
    'glow-tag.wide-beam',
    'glow-tag.overcharge',
    'glow-tag.mirror-shield',
    'glow-tag.ring-tether',
    'glow-tag.mud-patch',
    'glow-tag.jammed-beam',
    'glow-tag.short-beam',
    'glow-tag.beam-pickpocket',
    'glow-tag.glow-bounty',
    'glow-tag.chain-glow',
    'glow-tag.beam-break',
    'glow-tag.refund-beam',
    'glow-tag.lucky-sparks',
  ],
};
