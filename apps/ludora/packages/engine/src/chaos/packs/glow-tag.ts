import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target, transfer } from '../cheats/kit.ts';
import { glower, glowing, placePlayer, rivalsOf, ringNow, ringSoon, roomFrom, settle, startGlowOf } from '../adapters/glow-tag.ts';
import { BEAMS, CHARGE, CRATE_INFO, CRATES, MOVE, PLAYER_RADIUS, RING, SCORE, TAG, type CrateKind, type RingCircle, type TagOutcome } from '../../modes/glow-tag/meta.ts';
import { clampToArena, headingTo, inCone, lineOfSight, outsideRing, overlapsCover, ringAt } from '../../modes/glow-tag/arena.ts';
import { crateMax, crateOdds } from '../../modes/glow-tag/index.ts';
import type { PlayerId } from '../../sdk/types.ts';

/*
 * Cheats that only make sense in Glow Tag Royale: beams, glow, charges,
 * shields, speed, the shrinking ring, crates, positions in the park and
 * Lights Out.
 *
 * Chaos never dims anyone. Glow moves through the adapter's glow meter,
 * which stops at 1, and a beam that only lands thanks to a cheat (a longer
 * reach, a wider cone, a mirror bouncing it back, an overcharge) never takes
 * anyone's last glow. Relighting goes through the adapter, which refuses in
 * the final ring. Nobody is ever put inside cover or outside the walls:
 * every spot a cheat picks is clamped, pushed out of cover and checked, and
 * a cheat that cannot find one refuses.
 *
 * Charges, glow, shields and relight progress are meters, so cheats that
 * only move those can be undone. Cheats that move players, the ring or
 * crates write the mode's state and cannot. Casts and chaos ticks are full
 * updates, so every screen's next view and pulse show where a cheat put
 * someone.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'glow-tag';
const M = [MODE] as const;
/** Long Beam's reach and Wide Beam's cone (the mode's are 16 metres and 40 degrees). */
const LONG_RANGE = 24;
const WIDE_CONE = 80;
/** Short Beam's reach. */
const SHORT_RANGE = 8;
/** How long a jammed beam takes to recharge after each tag (the mode's is 0.7 seconds). */
const JAM_MS = 3000;

type Api = ChaosApi;
type Err = { error: string };
const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const g = (api: Api, id: PlayerId): any => glower(api.s, id);
const isIn = (api: Api, id: PlayerId) => glowing(api.s, api.ctx, id);
const LANDED: readonly TagOutcome[] = ['hit', 'dimmed'];
const MISSED: readonly TagOutcome[] = ['range', 'front', 'blocked'];

/** Refuse unless the player is in the arena. */
function needIn(api: Api, id: PlayerId, self: boolean): Err | null {
  if (isIn(api, id)) return null;
  if (self) return { error: g(api, id)?.out ? 'You are out for the rest of this game.' : 'You are dimmed. Relight first.' };
  return { error: `${api.name(id)} is dimmed.` };
}

function shrinking(api: Api): boolean {
  const now = api.now();
  return now >= api.s.ring.startAt && now < api.s.ring.endAt;
}

/**
 * Whether a player on their last glow would stand outside the ring when it
 * next drains, at (x, z): the ring would dim them there, so no cheat puts
 * them there (or keeps them stuck there).
 */
function stranded(api: Api, id: PlayerId, x: number, z: number): boolean {
  const s = api.s;
  return g(api, id).glow <= 1 && s.drainAt !== null && outsideRing(ringAt(s.ring, Math.max(api.now(), s.drainAt)), x, z);
}

/** The beam `id` used in the transaction a hook is looking at, seen once per effect. */
function freshTag(api: Api, fx: ActiveEffect, id: PlayerId): any | null {
  const t = g(api, id)?.lastTag;
  if (!t || t.at !== api.now()) return null;
  const seen = (fx.data.seen ?? {}) as Record<string, number>;
  if (seen[id] === t.n) return null;
  fx.data.seen = { ...seen, [id]: t.n };
  return t;
}

/** A new beam streak from one player to another, as the mode draws them. */
function drawBeam(api: Api, by: PlayerId, to: PlayerId, outcome: TagOutcome) {
  const a = g(api, by);
  const b = g(api, to);
  const n = ++api.s.seq;
  api.s.beams = [{ n, by, to, x1: r1(a.x), z1: r1(a.z), x2: r1(b.x), z2: r1(b.z), at: api.now(), outcome }, ...api.s.beams].slice(0, BEAMS.keep);
}

/** A beam from `by` lands on `to` because of a cheat: a shield catches it, otherwise it takes 1 glow, never the last ('none' when that was all they had). */
function chaosHit(api: Api, by: PlayerId, to: PlayerId): 'shield' | 'hit' | 'none' {
  const t = g(api, to);
  const now = api.now();
  if (t.shield) {
    t.shield = false;
    t.lastHit = { n: ++api.s.seq, at: now, by, name: api.name(by), outcome: 'shield' };
    return 'shield';
  }
  if (api.add('glow', to, -1) === 0) return 'none';
  t.safeUntil = now + TAG.safeMs;
  t.lastHit = { n: ++api.s.seq, at: now, by, name: api.name(by), outcome: 'hit' };
  return 'hit';
}

/** The reach a player's beam has now, with Long Beam and Wide Beam worked in. */
function reachOf(api: Api, id: PlayerId): { range: number; cone: number } {
  const on = api.effectsOn(id).map((e) => e.cheatId);
  return { range: on.includes('glow-tag.long-beam') ? LONG_RANGE : TAG.range, cone: on.includes('glow-tag.wide-beam') ? WIDE_CONE : TAG.coneDeg };
}

/**
 * Long Beam and Wide Beam: a beam the mode counted as a miss for range or
 * aim lands after all if the extra reach covers it (and nothing is in the
 * way). It never takes a last glow: on a rival with 1 glow and no shield the
 * miss stands.
 */
function extendBeam(api: Api, fx: ActiveEffect, d: Record<string, number>) {
  const id = target(fx);
  if (!d[id]) return;
  const tag = freshTag(api, fx, id);
  if (!tag || (tag.outcome !== 'range' && tag.outcome !== 'front')) return;
  const me = g(api, id);
  const t = g(api, tag.target);
  if (!me?.in || !t?.in || !api.ctx.player(tag.target)) return;
  const reach = reachOf(api, id);
  const dist = Math.hypot(t.x - me.x, t.z - me.z);
  if (dist > reach.range || !inCone(me.h, headingTo(me.x, me.z, t.x, t.z), dist, reach.cone) || !lineOfSight(api.s.map, me.x, me.z, t.x, t.z)) return;
  if (!t.shield && t.glow < 2) {
    api.feed(`Your beam reached ${api.name(tag.target)}, but a cheat never takes a last glow.`, 'info', [id]);
    return;
  }
  const what = chaosHit(api, id, tag.target);
  if (what === 'hit') {
    api.add('score', id, SCORE.tag);
    me.tags++;
    api.s.stats.tags++;
  }
  const outcome: TagOutcome = what === 'shield' ? 'shield' : 'hit';
  me.lastTag = { ...tag, outcome };
  const beam = api.s.beams.find((b: any) => b.n === tag.n);
  if (beam) {
    beam.x2 = r1(t.x);
    beam.z2 = r1(t.z);
    beam.outcome = outcome;
  }
  api.feed(`${api.name(id)}'s ${dist > TAG.range ? 'long' : 'wide'} beam ${what === 'shield' ? `broke ${api.name(tag.target)}'s shield` : `tagged ${api.name(tag.target)}`}.`, 'info');
}

/** A spot near (x, z) at `dist` metres, trying 8 directions from `h`; scored by `score` (higher is better). */
function bestSpotAround(api: Api, x: number, z: number, dist: number, h: number, score: (sx: number, sz: number) => number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (let k = 0; k < 8; k++) {
    const a = h + (k * Math.PI) / 4;
    const spot = settle(api.s.map, x + Math.sin(a) * dist, z + Math.cos(a) * dist);
    if (!spot) continue;
    const v = score(spot[0], spot[1]);
    if (v > bestScore) {
      best = spot;
      bestScore = v;
    }
  }
  return best;
}

/** The nearest legal spot just inside a ring, along the line to its centre. */
function insideRing(api: Api, x: number, z: number, ring: RingCircle): [number, number] | null {
  const d = Math.hypot(x - ring.x, z - ring.z) || 1;
  for (const margin of [1, 2, 3, 4.5, 6, 8]) {
    const k = Math.max(0, ring.r - margin) / d;
    const spot = settle(api.s.map, ring.x + (x - ring.x) * k, ring.z + (z - ring.z) * k);
    if (spot && !outsideRing(ring, spot[0], spot[1])) return spot;
  }
  return null;
}

/** A crate kind drawn with the mode's own crate odds. */
const CRATE_ROWS = crateOdds().map((c) => [c.kind, c.percent] as [CrateKind, number]);
const CRATE_ODDS_TEXT = odds(crateOdds().map((c) => [CRATE_INFO[c.kind].label.toLowerCase(), c.percent]));

/** Whether a crate of this kind would do anything for a player (the mode leaves useless ones lying). */
function crateUseful(me: any, kind: CrateKind) {
  return kind === 'charge' ? me.charges < CHARGE.max : kind === 'shield' ? !me.shield : true;
}

/** Whether a crate may lie at (x, z): in the walls with room round it, clear of cover and of other crates. */
function crateFits(api: Api, x: number, z: number) {
  return !overlapsCover(api.s.map, x, z, PLAYER_RADIUS + 0.6) && !api.s.crates.some((c: any) => Math.hypot(c.x - x, c.z - z) < 3);
}

function addCrate(api: Api, x: number, z: number): CrateKind {
  const kind = rollOdds(api, CRATE_ROWS);
  api.s.crates.push({ id: ++api.s.seq, kind, x, z });
  return kind;
}

/** A lasting cheat that sets one of the mode's timed fields (safe, speed) and takes it back if it is ended early. */
function timedField(field: 'safeUntil' | 'speedUntil') {
  return {
    set(api: Api, id: PlayerId, fx: ActiveEffect | null, ms: number): Err | null {
      const me = g(api, id);
      const until = api.now() + ms;
      if (me[field] >= until) return { error: field === 'safeUntil' ? 'You are already flickering for longer than that.' : 'Your speed boost already lasts longer than that.' };
      me[field] = until;
      if (fx) fx.data.until = until;
      return null;
    },
    end(api: Api, fx: ActiveEffect, reason: string) {
      const me = g(api, target(fx));
      if (me && reason !== 'expired' && me[field] === fx.data.until && me[field] > api.now()) me[field] = api.now();
    },
  };
}
const safeField = timedField('safeUntil');
const speedField = timedField('speedUntil');

const cheats: CheatDef[] = [
  /* ---------------------------------- you ---------------------------------- */
  {
    id: 'glow-tag.sprint',
    name: 'Glow Sprint',
    category: 'advantage',
    description: `Walk ${Math.round((MOVE.boost - 1) * 100)}% faster for 10 seconds, like a speed crate that lasts longer.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 10_000,
    apply: (api, c, fx) => needIn(api, c.caster, true) ?? speedField.set(api, c.caster, fx, 10_000) ?? undefined,
    hooks: { end: (api, fx, reason) => speedField.end(api, fx, reason) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Glow Sprint', until: fx.endsAt }),
  },
  {
    id: 'glow-tag.pocket-shield',
    name: 'Pocket Shield',
    category: 'advantage',
    description: 'A shield straight away, as if you had walked into a shield crate: it blocks the next tag on you.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      if (api.set('shield', c.caster, 1) <= 0) return { error: 'You already have a shield up.' };
    },
  },
  {
    id: 'glow-tag.decoy-flicker',
    name: 'Decoy Flicker',
    category: 'advantage',
    description: 'Flicker like a decoy for 4 seconds: nobody can tag you, as if you had just been tagged.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 4_000,
    apply: (api, c, fx) => needIn(api, c.caster, true) ?? safeField.set(api, c.caster, fx, 4_000) ?? undefined,
    hooks: { end: (api, fx, reason) => safeField.end(api, fx, reason) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Flickering', until: fx.endsAt }),
  },
  {
    id: 'glow-tag.long-beam',
    name: 'Long Beam',
    category: 'advantage',
    description: `For 15 seconds your beam reaches ${LONG_RANGE} metres instead of ${TAG.range}. A tag that only lands thanks to the extra reach never dims anyone: a rival on their last glow is out of its reach.`,
    target: 'self',
    modes: M,
    needs: ['spare-glow'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    priority: 10,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: { delta: { beams: extendBeam } },
    overlay: () => ({ kind: 'badge', text: `Beam reach ${LONG_RANGE} m`, tone: 'good' }),
  },
  {
    id: 'glow-tag.wide-beam',
    name: 'Wide Beam',
    category: 'advantage',
    description: `For 15 seconds your beam catches players in an ${WIDE_CONE}-degree cone in front of you instead of ${TAG.coneDeg}. A tag that only lands thanks to the wider cone never dims anyone: a rival on their last glow slips past its edge.`,
    target: 'self',
    modes: M,
    needs: ['spare-glow'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    priority: 10,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: { delta: { beams: extendBeam } },
    overlay: () => ({ kind: 'badge', text: `Beam cone ${WIDE_CONE}°`, tone: 'good' }),
  },
  {
    id: 'glow-tag.overcharge',
    name: 'Beam Overcharge',
    category: 'advantage',
    description: 'Within 20 seconds, your next tag that lands on a rival with 3 glow takes 2 of it instead of 1. It never takes anyone\'s last glow.',
    target: 'self',
    modes: M,
    needs: ['spare-glow'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: {
      delta: {
        glow: (api, fx, d) => {
          if (fx.data.used) return;
          for (const id of Object.keys(d)) {
            const t = g(api, id);
            const hit = t?.lastHit;
            if (!(d[id]! < 0) || !t.in || !hit || hit.at !== api.now() || hit.by !== fx.caster || hit.outcome !== 'hit' || t.glow < 2) continue;
            d[id] = d[id]! - 1;
            fx.data.used = 1;
            api.feed(`${api.name(fx.caster)}'s overcharged beam took 2 glow from ${api.name(id)}.`, 'info');
            api.endEffect(fx.eid, 'used');
            return;
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Beam overcharged', tone: 'good' }),
  },
  {
    id: 'glow-tag.mirror-shield',
    name: 'Mirror Shield',
    category: 'advantage',
    description:
      'For 20 seconds you carry a mirror shield: it blocks the next tag on you and bounces the beam back, so the tagger loses 1 glow (never their last; their own shield catches it if they have one). It fades if nothing hits it. Not while you already have a shield.',
    target: 'self',
    modes: M,
    needs: ['spare-glow'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    apply: (api, c, fx) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      if (api.set('shield', c.caster, 1) <= 0) return { error: 'You already have a shield up.' };
      if (fx) fx.data.gave = 1;
    },
    hooks: {
      delta: {
        hits: (api, fx, d) => {
          const id = target(fx);
          const me = g(api, id);
          const hit = me?.lastHit;
          if (!d[id] || fx.data.used || !hit || hit.at !== api.now() || hit.outcome !== 'shield' || !hit.by) return;
          fx.data.used = 1;
          const by = hit.by as PlayerId;
          if (isIn(api, by)) {
            const what = chaosHit(api, id, by);
            if (what !== 'none') drawBeam(api, id, by, what);
            const words = what === 'shield' ? `${api.name(by)}'s own shield caught it` : what === 'hit' ? `${api.name(by)} lost 1 glow` : `${api.name(by)} was on their last glow, so it took nothing`;
            api.feed(`${api.name(id)}'s mirror shield bounced the beam back: ${words}.`, 'info');
          }
          api.endEffect(fx.eid, 'used');
        },
      },
      end: (api, fx, reason) => {
        const me = g(api, target(fx));
        if (reason !== 'used' && fx.data.gave && !fx.data.used && me?.shield) me.shield = false;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Mirror shield', until: fx.endsAt }),
  },
  {
    id: 'glow-tag.blink',
    name: 'Blink',
    category: 'advantage',
    description: 'Blink to the spot inside the ring (or the ring it is shrinking to) that is furthest from every rival. Never into cover.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      const me = g(api, c.caster);
      const now = api.now();
      const area: RingCircle = api.s.next ?? ringSoon(api.s, now);
      const ring = ringNow(api.s, now);
      const rivals = rivalsOf(api.s, api.ctx, c.caster);
      let best: [number, number] | null = null;
      let bestRoom = -Infinity;
      const reach = Math.max(0, area.r - 1.5);
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        for (let k = 0; k < (f === 0 ? 1 : 16); k++) {
          const a = (k * Math.PI) / 8;
          const spot = settle(api.s.map, area.x + Math.sin(a) * reach * f, area.z + Math.cos(a) * reach * f);
          if (!spot || outsideRing(area, spot[0], spot[1]) || outsideRing(ring, spot[0], spot[1])) continue;
          // With nobody to get away from, the middle of the ring is safest.
          const room = rivals.length ? roomFrom(api.s, rivals, spot[0], spot[1]) : -Math.hypot(spot[0] - area.x, spot[1] - area.z);
          if (room > bestRoom) {
            best = spot;
            bestRoom = room;
          }
        }
      }
      const here = rivals.length ? roomFrom(api.s, rivals, me.x, me.z) : -Math.hypot(me.x - area.x, me.z - area.z);
      const inside = !outsideRing(area, me.x, me.z) && !outsideRing(ring, me.x, me.z);
      if (!best || Math.hypot(best[0] - me.x, best[1] - me.z) < 1 || (inside && here >= bestRoom)) return { error: 'You are already as safe as the ring allows.' };
      placePlayer(api.s, c.caster, best[0], best[1], headingTo(best[0], best[1], area.x, area.z), now);
      api.feed(`${api.name(c.caster)} blinked across the park.`, 'info');
    },
  },
  {
    id: 'glow-tag.ring-tether',
    name: 'Ring Tether',
    category: 'advantage',
    description: 'For 12 seconds the ring cannot drain you: each time it would, it pulls you just inside instead. Only while you are outside the ring, or outside the ring it is shrinking to.',
    target: 'self',
    modes: M,
    needs: ['ring'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 12_000,
    tickMs: RING.drainEveryMs,
    apply: (api, c, fx) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      const s = api.s;
      if (s.drainAt === null) return { error: 'The ring has not started shrinking yet.' };
      const me = g(api, c.caster);
      const now = api.now();
      const caught = outsideRing(ringNow(s, now), me.x, me.z) || (shrinking(api) && outsideRing(s.ring.to, me.x, me.z));
      if (!caught) return { error: 'You are safely inside the ring.' };
      // Tick just before each drain, so the pull comes first.
      if (fx) fx.nextTickAt = Math.max(now, s.drainAt - 1);
    },
    hooks: {
      tick: (api, fx) => {
        const id = target(fx);
        const s = api.s;
        if (!isIn(api, id) || s.drainAt === null || s.drainAt - api.now() > 50) return;
        const me = g(api, id);
        const ring = ringAt(s.ring, s.drainAt);
        if (!outsideRing(ring, me.x, me.z)) return;
        const spot = insideRing(api, me.x, me.z, ring);
        if (!spot) return;
        placePlayer(s, id, spot[0], spot[1], headingTo(spot[0], spot[1], ring.x, ring.z), api.now());
        api.feed('Your Ring Tether pulled you back inside the ring.', 'good', [id]);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Ring Tether', until: fx.endsAt }),
  },
  {
    id: 'glow-tag.glow-up',
    name: 'Glow Up',
    category: 'advantage',
    description: 'Get 1 glow back, up to the glow everyone starts with.',
    target: 'self',
    modes: M,
    needs: ['spare-glow'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      if (api.add('glow', c.caster, 1) <= 0) return { error: 'Your glow is already full.' };
    },
  },

  /* -------------------------------- teammates ------------------------------- */
  {
    id: 'glow-tag.squad-jump',
    name: 'Squad Jump',
    category: 'advantage',
    description: 'Jump to a glowing teammate\'s side: the clear spot 2.5 metres from them that is furthest from rivals, inside the ring if there is one. Never outside the ring while you are on your last glow.',
    target: 'teammate',
    modes: M,
    needs: ['teams'],
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const mate = target(c);
      const no = needIn(api, c.caster, true) ?? needIn(api, mate, false);
      if (no) return no;
      const me = g(api, c.caster);
      const them = g(api, mate);
      if (Math.hypot(me.x - them.x, me.z - them.z) <= 4) return { error: `You are already beside ${api.name(mate)}.` };
      const ring = ringSoon(api.s, api.now());
      const rivals = rivalsOf(api.s, api.ctx, c.caster);
      const spot = bestSpotAround(api, them.x, them.z, 2.5, them.h, (x, z) => (stranded(api, c.caster, x, z) ? -1e6 : 0) + (outsideRing(ring, x, z) ? -1000 : 0) + Math.min(50, roomFrom(api.s, rivals, x, z)));
      if (!spot) return { error: `There is no clear spot beside ${api.name(mate)}.` };
      if (stranded(api, c.caster, spot[0], spot[1])) return { error: `Beside ${api.name(mate)} you would be outside the ring on your last glow.` };
      placePlayer(api.s, c.caster, spot[0], spot[1], them.h, api.now());
      api.feed(`${api.name(c.caster)} jumped to ${api.name(mate)}'s side.`, 'info');
    },
  },
  {
    id: 'glow-tag.rally-call',
    name: 'Rally Call',
    category: 'advantage',
    description: 'A dimmed teammate gets 1 right answer closer to relighting. They always give the last right answer themselves. Not in the final ring, where nobody relights.',
    target: 'teammate',
    modes: M,
    needs: ['teams', 'spare-glow'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const mate = target(c);
      const t = g(api, mate);
      if (t?.in) return { error: `${api.name(mate)} is still glowing.` };
      if (t?.out || api.s.final) return { error: 'Nobody relights in the final ring.' };
      if (api.add('relight', mate, 1) <= 0) return { error: `${api.name(mate)} is one right answer from relighting already.` };
      api.feed(`${api.name(c.caster)} rallied ${api.name(mate)}: one right answer closer to relighting.`, 'good');
    },
  },
  {
    id: 'glow-tag.glow-link',
    name: 'Glow Link',
    category: 'advantage',
    description: 'Pass 1 of your glow to a teammate. You keep at least 1, and they never go above the glow everyone starts with.',
    target: 'teammate',
    modes: M,
    needs: ['teams', 'spare-glow'],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const mate = target(c);
      const no = needIn(api, c.caster, true) ?? needIn(api, mate, false);
      if (no) return no;
      if (api.get('glow', c.caster) < 2) return { error: 'You only have your last glow.' };
      if (transfer(api, 'glow', c.caster, mate, 1) <= 0) return { error: `${api.name(mate)}'s glow is already full.` };
      api.feed(`${api.name(c.caster)} passed 1 glow to ${api.name(mate)}.`, 'good');
    },
  },

  /* ---------------------------------- rivals ---------------------------------- */
  {
    id: 'glow-tag.mud-patch',
    name: 'Mud Patch',
    category: 'troll',
    description: 'For 8 seconds a rival walks through mud: every step costs them twice the time, so they move at half speed (a speed boost still helps). The mud lets go of a rival on their last glow while they are outside the ring.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 8_000,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, t, false);
      if (no) return no;
      if (stranded(api, t, g(api, t).x, g(api, t).z)) return { error: `${api.name(t)} is outside the ring on their last glow.` };
    },
    hooks: {
      delta: {
        walk: (api, fx, d) => {
          const id = target(fx);
          const raw = d[id] ?? 0;
          if (!(raw > 0) || !isIn(api, id) || stranded(api, id, g(api, id).x, g(api, id).z)) return;
          // The walking allowance a step spent: from where it was (or the last 0.4 s of standing still) to where the step left it.
          const cur = api.get('walk', id);
          const base = Math.max(cur - raw, api.now() - MOVE.windowMs);
          const cost = cur - base;
          if (cost > 0) d[id] = raw + cost;
        },
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Stuck in mud', until: fx.endsAt }),
  },
  {
    id: 'glow-tag.jammed-beam',
    name: 'Jammed Beam',
    category: 'troll',
    description: `For 20 seconds a rival's beam takes ${JAM_MS / 1000} seconds to recharge after every tag, instead of ${TAG.cooldownMs / 1000}.`,
    target: 'opponent',
    modes: M,
    needs: ['meter:currency'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c) => needIn(api, target(c), false) ?? undefined,
    hooks: {
      delta: {
        beams: (api, fx, d) => {
          const id = target(fx);
          if (!d[id] || !freshTag(api, fx, id)) return;
          const t = g(api, id);
          t.cooldownUntil = Math.max(t.cooldownUntil, api.now() + JAM_MS);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Beam jammed', tone: 'bad' }),
  },
  {
    id: 'glow-tag.beam-fizzle',
    name: 'Beam Fizzle',
    category: 'troll',
    description: 'A rival\'s beam fizzles: they lose 2 charges (or the one they have) and cannot tag for 3 seconds.',
    target: 'opponent',
    modes: M,
    needs: ['meter:currency'],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, t, false);
      if (no) return no;
      if (api.add('currency', t, -2) >= 0) return { error: `${api.name(t)} has no charges.` };
      const them = g(api, t);
      them.cooldownUntil = Math.max(them.cooldownUntil, api.now() + 3000);
      api.feed(`${api.name(c.caster)} made ${api.name(t)}'s beam fizzle.`, 'info');
    },
  },
  {
    id: 'glow-tag.short-beam',
    name: 'Short Beam',
    category: 'troll',
    description: `For 12 seconds a rival's beam only reaches ${SHORT_RANGE} metres: a tag at anyone further away fizzles out before the beam leaves (no charge spent).`,
    target: 'opponent',
    modes: M,
    needs: ['meter:currency'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 12_000,
    apply: (api, c) => needIn(api, target(c), false) ?? undefined,
    hooks: {
      gate: (api, _fx, playerId, action: any) => {
        if (action?.type !== 'tag') return;
        const me = g(api, playerId);
        const t = g(api, action.target);
        if (!me?.in || !t?.in) return;
        if (Math.hypot(t.x - me.x, t.z - me.z) > SHORT_RANGE) return { block: `Your beam is short for now: it only reaches ${SHORT_RANGE} metres.` };
      },
    },
    overlay: () => ({ kind: 'badge', text: `Beam reach ${SHORT_RANGE} m`, tone: 'bad' }),
  },
  {
    id: 'glow-tag.shield-pop',
    name: 'Shield Pop',
    category: 'troll',
    description: 'Pop a rival\'s shield before it blocks anything.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, t, false);
      if (no) return no;
      if (api.set('shield', t, 0) >= 0) return { error: `${api.name(t)} has no shield up.` };
      api.feed(`${api.name(c.caster)} popped ${api.name(t)}'s shield.`, 'info');
    },
  },
  {
    id: 'glow-tag.dim-down',
    name: 'Dim Down',
    category: 'troll',
    description: 'A rival loses 1 glow. Never their last: a rival on 1 glow cannot be dimmed down.',
    target: 'opponent',
    modes: M,
    needs: ['spare-glow'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, t, false);
      if (no) return no;
      if (api.add('glow', t, -1) >= 0) return { error: `${api.name(t)} is on their last glow.` };
      api.feed(`${api.name(c.caster)} dimmed ${api.name(t)} down a glow.`, 'info');
    },
  },
  {
    id: 'glow-tag.swap-spots',
    name: 'Swap Spots',
    category: 'troll',
    description: 'Swap places with a rival anywhere in the park. You each keep facing the way you were. Not if it would leave either of you outside the ring on your last glow.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, c.caster, true) ?? needIn(api, t, false);
      if (no) return no;
      const me = g(api, c.caster);
      const them = g(api, t);
      if (Math.hypot(me.x - them.x, me.z - them.z) < 1) return { error: `You are standing right next to ${api.name(t)}.` };
      if (stranded(api, c.caster, them.x, them.z)) return { error: `At ${api.name(t)}'s spot you would be outside the ring on your last glow.` };
      if (stranded(api, t, me.x, me.z)) return { error: `At your spot ${api.name(t)} would be outside the ring on their last glow.` };
      const [mx, mz, mh] = [me.x, me.z, me.h];
      const now = api.now();
      // Both spots held a player a moment ago, so both are clear of cover and inside the walls.
      placePlayer(api.s, c.caster, them.x, them.z, mh, now);
      placePlayer(api.s, t, mx, mz, them.h, now);
      api.feed(`${api.name(c.caster)} swapped spots with ${api.name(t)}.`, 'info');
    },
  },
  {
    id: 'glow-tag.searchlight',
    name: 'Searchlight',
    category: 'troll',
    description: 'In Lights Out, a searchlight follows a rival for 10 seconds: everyone can see where they are, as if they kept using their beam.',
    target: 'opponent',
    modes: M,
    needs: ['lights-out'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 10_000,
    tickMs: 1000,
    apply: (api, c) => {
      const no = needIn(api, target(c), false);
      if (no) return no;
      g(api, target(c)).beamAt = api.now();
    },
    hooks: {
      tick: (api, fx) => {
        if (isIn(api, target(fx))) g(api, target(fx)).beamAt = api.now();
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'In the searchlight', until: fx.endsAt }),
  },

  /* ---------------------------------- points ---------------------------------- */
  {
    id: 'glow-tag.beam-pickpocket',
    name: 'Beam Pickpocket',
    category: 'score',
    description: 'Within 20 seconds, your next tag that lands also takes 10% of the tagged player\'s points (at least 1, if they have any).',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 10,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const id = fx.caster;
          if (fx.data.used || !(d[id]! > 0)) return;
          const tag = freshTag(api, fx, id);
          if (!tag || !LANDED.includes(tag.outcome)) return;
          fx.data.used = 1;
          // A tag does not change the tagged player's points, so theirs are what they hold now (after any earlier hook's change).
          const take = share(api.get('score', tag.target) + (d[tag.target] ?? 0), 10);
          if (take > 0) {
            d[tag.target] = (d[tag.target] ?? 0) - take;
            d[id] = d[id]! + take;
            api.feed(`${api.name(id)}'s beam picked ${take} points from ${api.name(tag.target)}.`, 'info');
          }
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Pickpocket beam', tone: 'good' }),
  },
  {
    id: 'glow-tag.glow-bounty',
    name: 'Glow Bounty',
    category: 'score',
    description: `For 30 seconds a rival glows with a bounty: every tag that lands on them scores ${SCORE.dim} more points for whoever lands it.`,
    target: 'opponent',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 30_000,
    apply: (api, c) => needIn(api, target(c), false) ?? undefined,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const marked = target(fx);
          for (const id of Object.keys(d)) {
            if (!(d[id]! > 0) || id === marked) continue;
            const tag = freshTag(api, fx, id);
            if (!tag || tag.target !== marked || !LANDED.includes(tag.outcome)) continue;
            d[id] = d[id]! + SCORE.dim;
            api.feed(`${api.name(id)} claimed ${SCORE.dim} bounty points for tagging ${api.name(marked)}.`, 'info');
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bounty on you', tone: 'bad' }),
  },
  {
    id: 'glow-tag.chain-glow',
    name: 'Chain Glow',
    category: 'score',
    description: `For 20 seconds every tag you land scores a growing bonus: ${SCORE.dim} for the first, ${SCORE.dim * 2} for the second, ${SCORE.dim * 3} for the third, and so on.`,
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const id = fx.caster;
          if (!(d[id]! > 0)) return;
          const tag = freshTag(api, fx, id);
          if (!tag || !LANDED.includes(tag.outcome)) return;
          const n = Number(fx.data.chain ?? 0) + 1;
          fx.data.chain = n;
          d[id] = d[id]! + SCORE.dim * n;
          api.feed(`Chain Glow: tag ${n} in the chain, +${SCORE.dim * n} points.`, 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Chain Glow', tone: 'good' }),
  },

  /* ---------------------------------- the ring ---------------------------------- */
  {
    id: 'glow-tag.ring-freeze',
    name: 'Ring Freeze',
    category: 'round',
    description: 'The shrinking ring holds still for 6 seconds, then carries on to the same place (it finishes 6 seconds later). Only while it is shrinking, and never into the next shrink.',
    target: 'room',
    modes: M,
    needs: ['ring'],
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 6_000,
    apply: (api, c, fx) => {
      const s = api.s;
      const now = api.now();
      if (!shrinking(api) || s.ring.endAt - now < 1000) return { error: 'The ring is not shrinking right now.' };
      const endAt = s.ring.endAt + 6_000;
      if (endAt > (s.phaseStarts[s.phase] ?? s.endsAt) - 1000) return { error: 'There is no time to hold the ring before what comes next.' };
      const from = ringAt(s.ring, now);
      s.ring = { from: { x: r1(from.x), z: r1(from.z), r: r1(from.r) }, to: s.ring.to, startAt: now + 6_000, endAt };
      api.ctx.setTimer('ringDone', endAt);
      if (fx) fx.data.startAt = now + 6_000;
      api.feed(`${api.name(c.caster)} froze the ring for 6 seconds.`, 'big');
    },
    hooks: {
      end: (api, fx, reason) => {
        const s = api.s;
        const now = api.now();
        // Ended early: the ring carries on shrinking from now, taking as long as it had left.
        if (reason === 'expired' || s.ring.startAt !== fx.data.startAt || now >= s.ring.startAt) return;
        const left = s.ring.endAt - s.ring.startAt;
        s.ring = { ...s.ring, startAt: now, endAt: now + left };
        api.ctx.setTimer('ringDone', s.ring.endAt);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Ring frozen', until: fx.endsAt }),
    overlayFor: 'all',
  },
  {
    id: 'glow-tag.ring-rush',
    name: 'Ring Rush',
    category: 'round',
    description: 'The shrinking ring speeds up: it finishes in half the time it has left. It never jumps, it just shrinks faster. Only while it is shrinking.',
    target: 'room',
    modes: M,
    needs: ['ring'],
    cost: 35,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const now = api.now();
      if (!shrinking(api)) return { error: 'The ring is not shrinking right now.' };
      const left = s.ring.endAt - now;
      if (left < 2000) return { error: 'The ring has almost finished shrinking.' };
      const from = ringAt(s.ring, now);
      const endAt = now + Math.max(1000, Math.round(left / 2 / 100) * 100);
      s.ring = { from: { x: r1(from.x), z: r1(from.z), r: r1(from.r) }, to: s.ring.to, startAt: now, endAt };
      api.ctx.setTimer('ringDone', endAt);
      api.feed(`${api.name(c.caster)} rushed the ring: it finishes shrinking in ${Math.round((endAt - now) / 1000)} seconds.`, 'big');
    },
  },
  {
    id: 'glow-tag.late-ring',
    name: 'Late Ring',
    category: 'round',
    description: 'The next shrink starts 10 seconds later than shown (and so does the final ring, if it is the next one). Only while waiting for it, and never into the shrink after.',
    target: 'room',
    modes: M,
    needs: ['ring'],
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const next = s.next;
      if (!next || api.now() >= next.startAt) return { error: 'No shrink is waiting to start.' };
      const k = s.phase;
      const limit = s.phaseStarts[k + 1] ?? s.endsAt;
      if (next.endAt + 10_000 > limit - 1000) return { error: 'There is no room to delay the next shrink.' };
      s.next = { ...next, startAt: next.startAt + 10_000, endAt: next.endAt + 10_000 };
      s.phaseStarts[k] = s.next.startAt;
      if (k === RING.phases.length - 1) s.finalAt = s.next.startAt;
      api.ctx.setTimer('ring', s.next.startAt);
      api.feed(`${api.name(c.caster)} held the ring back: the next shrink starts 10 seconds later.`, 'big');
    },
  },
  {
    id: 'glow-tag.ring-reroll',
    name: 'Ring Reroll',
    category: 'round',
    description: 'Draw again where the next ring will be, the way the park draws it: at random inside the ring now, drifting up to half the room the shrink leaves. Only while the next ring is shown.',
    target: 'room',
    modes: M,
    needs: ['ring'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const next = s.next;
      if (!next || api.now() >= next.startAt) return { error: 'The next ring is not showing yet.' };
      const prev = s.ring.to;
      const half = s.map.size / 2;
      const room = Math.max(0, prev.r - next.r);
      if (RING.drift * room < 1) return { error: 'The next ring has no room to move.' };
      const lim = Math.max(0, half - next.r);
      for (let tries = 0; tries < 8; tries++) {
        const a = api.rng.next() * Math.PI * 2;
        const dist = api.rng.next() * RING.drift * room;
        const x = r1(Math.min(lim, Math.max(-lim, prev.x + Math.sin(a) * dist)));
        const z = r1(Math.min(lim, Math.max(-lim, prev.z + Math.cos(a) * dist)));
        if (Math.hypot(x - next.x, z - next.z) < 1) continue;
        s.next = { ...next, x, z };
        api.feed(`${api.name(c.caster)} moved the next ring.`, 'big');
        return;
      }
      return { error: 'The next ring landed in the same place. Try again.' };
    },
  },
  {
    id: 'glow-tag.beam-break',
    name: 'Beam Break',
    category: 'round',
    description: 'For 6 seconds nobody\'s beam works, yours included. Tags are refused before the beam leaves, so no charge is spent.',
    target: 'room',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 6_000,
    hooks: {
      gate: (_api, _fx, _id, action: any) => (action?.type === 'tag' ? { block: 'Beam break: no beams for a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Beam break', until: fx.endsAt }),
    overlayFor: 'all',
  },
  {
    id: 'glow-tag.park-flare',
    name: 'Park Flare',
    category: 'round',
    description: 'In Lights Out, a flare lights the whole park for 8 seconds: everyone in the arena can see everyone else.',
    target: 'room',
    modes: M,
    needs: ['lights-out'],
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 8_000,
    tickMs: 1000,
    apply: (api) => {
      const lit = api.ids().filter((id) => isIn(api, id));
      if (lit.length < 2) return { error: 'There is nobody else in the arena to see.' };
      for (const id of lit) g(api, id).beamAt = api.now();
    },
    hooks: {
      tick: (api) => {
        for (const id of api.ids()) if (isIn(api, id)) g(api, id).beamAt = api.now();
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Park flare', until: fx.endsAt }),
    overlayFor: 'all',
  },
  {
    id: 'glow-tag.park-scramble',
    name: 'Park Scramble',
    category: 'round',
    description: 'Every glowing player swaps spots at random: the spots go round in one random circle (each circle equally likely), so nobody keeps their own. Everyone keeps facing the way they were. Circles that would leave a player on their last glow outside the ring are drawn again.',
    target: 'room',
    modes: M,
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const ids = api.ids().filter((id) => isIn(api, id));
      if (ids.length < 2) return { error: 'There need to be at least two players in the arena.' };
      const spots = ids.map((id) => [g(api, id).x, g(api, id).z] as [number, number]);
      let order: number[] | null = null;
      for (let tries = 0; tries < 30 && !order; tries++) {
        // Sattolo's shuffle: a single cycle, so every player moves.
        const o = ids.map((_, i) => i);
        for (let i = o.length - 1; i > 0; i--) {
          const j = api.rng.int(0, i - 1);
          [o[i], o[j]] = [o[j]!, o[i]!];
        }
        if (!ids.some((id, i) => stranded(api, id, spots[o[i]!]![0], spots[o[i]!]![1]))) order = o;
      }
      if (!order) return { error: 'Any scramble would leave someone on their last glow outside the ring.' };
      const now = api.now();
      ids.forEach((id, i) => placePlayer(api.s, id, spots[order[i]!]![0], spots[order[i]!]![1], g(api, id).h, now));
      api.feed(`${api.name(c.caster)} scrambled the park: everyone swapped spots.`, 'big');
    },
  },

  /* ------------------------------ charges and crates ------------------------------ */
  {
    id: 'glow-tag.charge-pack',
    name: 'Charge Pack',
    category: 'economy',
    description: `Get ${CRATES.charge} beam charges straight away, without answering (you can hold ${CHARGE.max}).`,
    target: 'self',
    modes: M,
    needs: ['meter:currency'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('currency', c.caster, CRATES.charge) <= 0) return { error: `Your charges are full (${CHARGE.max}).` };
    },
  },
  {
    id: 'glow-tag.crate-call',
    name: 'Crate Call',
    category: 'economy',
    description: `Call a crate down beside you, packed with the park's own odds: ${CRATE_ODDS_TEXT}. Not while the park holds as many crates as it can.`,
    target: 'self',
    modes: M,
    needs: ['crates'],
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      if (api.s.crates.length >= crateMax(api.ctx.players().length)) return { error: 'The park already holds as many crates as it can.' };
      const me = g(api, c.caster);
      for (const dist of [2.5, 3.5]) {
        for (let k = 0; k < 12; k++) {
          const a = me.h + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
          const [x, z] = clampToArena(api.s.map.size, me.x + Math.sin(a) * dist, me.z + Math.cos(a) * dist, 1.5).map(r1) as [number, number];
          if (!crateFits(api, x, z)) continue;
          const kind = addCrate(api, x, z);
          api.feed(`A ${CRATE_INFO[kind].label.toLowerCase()} crate landed beside you.`, 'good', [c.caster]);
          return;
        }
      }
      return { error: 'There is no clear ground beside you for a crate.' };
    },
  },
  {
    id: 'glow-tag.refund-beam',
    name: 'Refund Beam',
    category: 'economy',
    description: 'For 20 seconds, every tag of yours that misses (too far, not in front of you, or blocked) gives its charge back.',
    target: 'self',
    modes: M,
    needs: ['meter:currency'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 40,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: {
      delta: {
        beams: (api, fx, d) => {
          const id = fx.caster;
          if (!d[id]) return;
          const tag = freshTag(api, fx, id);
          if (tag && MISSED.includes(tag.outcome) && api.add('currency', id, 1) > 0) api.feed('Refund Beam: that charge came back.', 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Misses refunded', tone: 'good' }),
  },
  {
    id: 'glow-tag.crate-snatch',
    name: 'Crate Snatch',
    category: 'economy',
    description: 'Snatch the nearest crate anywhere in the park that would do something for you, and get what is inside at once.',
    target: 'self',
    modes: M,
    needs: ['crates'],
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      const me = g(api, c.caster);
      const crate = api.s.crates
        .filter((k: any) => crateUseful(me, k.kind))
        .sort((a: any, b: any) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z) || a.id - b.id)[0];
      if (!crate) return { error: api.s.crates.length ? 'None of the crates would do anything for you.' : 'There are no crates in the park.' };
      if (crate.kind === 'charge') me.charges = Math.min(CHARGE.max, me.charges + CRATES.charge);
      else if (crate.kind === 'shield') me.shield = true;
      else me.speedUntil = api.now() + CRATES.speedMs;
      api.s.crates = api.s.crates.filter((k: any) => k.id !== crate.id);
      api.s.stats.crates++;
      api.feed(`You snatched a ${CRATE_INFO[crate.kind as CrateKind].label.toLowerCase()} from across the park.`, 'good', [c.caster]);
    },
  },
  {
    id: 'glow-tag.supply-drop',
    name: 'Supply Drop',
    category: 'economy',
    description: `Crates rain into the ring until the park holds as many as it can, each packed with the park's own odds: ${CRATE_ODDS_TEXT}.`,
    target: 'room',
    modes: M,
    needs: ['crates'],
    cost: 35,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const space = crateMax(api.ctx.players().length) - s.crates.length;
      if (space <= 0) return { error: 'The park already holds as many crates as it can.' };
      const area: RingCircle = s.next ?? s.ring.to;
      const glowers = api.ids().filter((id) => isIn(api, id));
      let dropped = 0;
      for (let tries = 0; tries < 60 && dropped < space; tries++) {
        const rad = Math.max(0, area.r - 1.5) * Math.sqrt(api.rng.next());
        const a = api.rng.next() * Math.PI * 2;
        const [x, z] = clampToArena(s.map.size, area.x + Math.sin(a) * rad, area.z + Math.cos(a) * rad, 1.5).map(r1) as [number, number];
        if (!crateFits(api, x, z) || glowers.some((id) => Math.hypot(g(api, id).x - x, g(api, id).z - z) < 4)) continue;
        addCrate(api, x, z);
        dropped++;
      }
      if (!dropped) return { error: 'There is no clear ground in the ring for a crate.' };
      api.feed(`${api.name(c.caster)} called a supply drop: ${dropped} ${dropped === 1 ? 'crate' : 'crates'} landed in the ring.`, 'big');
    },
  },

  /* ---------------------------------- luck ---------------------------------- */
  {
    id: 'glow-tag.mystery-glow',
    name: 'Mystery Glow',
    category: 'random',
    description: `Open a mystery glow: ${odds([
      [`${CRATES.charge} charges`, 30],
      ['a shield', 20],
      [`a speed boost for ${CRATES.speedMs / 1000} seconds`, 20],
      ['1 glow back', 15],
      ['lose 2 charges', 15],
    ])}. If what you get cannot change anything (charges full, a shield already up, glow full, no charges to lose), you get ${SCORE.dim} points instead.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = needIn(api, c.caster, true);
      if (no) return no;
      const me = g(api, c.caster);
      const pick = rollOdds(api, [
        ['charges', 30],
        ['shield', 20],
        ['speed', 20],
        ['glow', 15],
        ['lose', 15],
      ] as const);
      let changed = 0;
      if (pick === 'charges') changed = api.add('currency', c.caster, CRATES.charge);
      else if (pick === 'shield') changed = api.set('shield', c.caster, 1);
      else if (pick === 'glow') changed = api.add('glow', c.caster, 1);
      else if (pick === 'lose') changed = api.add('currency', c.caster, -2);
      else if (me.speedUntil < api.now() + CRATES.speedMs) {
        me.speedUntil = api.now() + CRATES.speedMs;
        changed = 1;
      }
      const n = Math.abs(changed);
      const charges = `${n} ${n === 1 ? 'charge' : 'charges'}`;
      const words = { charges, shield: 'a shield', speed: 'a speed boost', glow: '1 glow back', lose: `it fizzled: ${charges} gone` }[pick];
      if (changed === 0) {
        api.add('score', c.caster, SCORE.dim);
        api.feed(`Mystery Glow: ${SCORE.dim} points.`, 'good', [c.caster]);
      } else api.feed(`Mystery Glow: ${words}.`, pick === 'lose' ? 'bad' : 'good', [c.caster]);
    },
  },
  {
    id: 'glow-tag.lucky-sparks',
    name: 'Lucky Sparks',
    category: 'random',
    description: `For 20 seconds every tag you land throws off lucky sparks: ${odds([
      ['1 charge back', 50],
      [`${SCORE.dim} points`, 35],
      ['1 glow back', 15],
    ])}. A spark that cannot change anything (charges or glow already full) gives ${SCORE.dim} points instead.`,
    target: 'self',
    modes: M,
    needs: ['meter:currency'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 40,
    apply: (api, c) => needIn(api, c.caster, true) ?? undefined,
    hooks: {
      delta: {
        beams: (api, fx, d) => {
          const id = fx.caster;
          if (!d[id]) return;
          const tag = freshTag(api, fx, id);
          if (!tag || !LANDED.includes(tag.outcome)) return;
          const pick = rollOdds(api, [
            ['charge', 50],
            ['points', 35],
            ['glow', 15],
          ] as const);
          const changed = pick === 'charge' ? api.add('currency', id, 1) : pick === 'glow' ? api.add('glow', id, 1) : 0;
          if (!changed) api.add('score', id, SCORE.dim);
          api.feed(`Lucky Sparks: ${changed ? (pick === 'charge' ? '1 charge back' : '1 glow back') : `+${SCORE.dim} points`}.`, 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lucky Sparks', tone: 'good' }),
  },
  {
    id: 'glow-tag.glow-dice',
    name: 'Glow Dice',
    category: 'random',
    description: `Roll the glow dice at a rival: ${odds([
      ['they lose 1 glow (never their last)', 40],
      ['they lose 2 charges', 35],
      ['their shield and speed boost are gone', 25],
    ])}. If the roll would change nothing, the next of these that can is used instead.`,
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needIn(api, t, false);
      if (no) return no;
      const them = g(api, t);
      const now = api.now();
      const can = { glow: them.glow >= 2 && startGlowOf(api.ctx) > 1, charges: them.charges > 0, boosts: them.shield || them.speedUntil > now };
      if (!can.glow && !can.charges && !can.boosts) return { error: `${api.name(t)} has nothing the dice could take.` };
      const order = ['glow', 'charges', 'boosts'] as const;
      let i = order.indexOf(
        rollOdds(api, [
          ['glow', 40],
          ['charges', 35],
          ['boosts', 25],
        ] as const),
      );
      while (!can[order[i]!]) i = (i + 1) % order.length;
      const pick = order[i]!;
      let words: string;
      if (pick === 'glow') words = `lost ${-api.add('glow', t, -1)} glow`;
      else if (pick === 'charges') {
        const lost = -api.add('currency', t, -2);
        words = `lost ${lost} ${lost === 1 ? 'charge' : 'charges'}`;
      } else {
        const shield = api.set('shield', t, 0) < 0;
        const speed = them.speedUntil > now;
        if (speed) them.speedUntil = now;
        words = `lost their ${shield && speed ? 'shield and speed boost' : shield ? 'shield' : 'speed boost'}`;
      }
      api.feed(`${api.name(c.caster)} rolled the glow dice: ${api.name(t)} ${words}.`, 'info');
    },
  },
];

defineCheats(cheats);
