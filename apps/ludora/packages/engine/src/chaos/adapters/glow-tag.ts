import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { ARENA, CHARGE, GLOW, PLAYER_RADIUS, RELIGHT, type ArenaMap, type RingCircle } from '../../modes/glow-tag/meta.ts';
import { clampToArena, headingTo, outsideRing, overlapsCover, pushOut, ringAt } from '../../modes/glow-tag/arena.ts';

/*
 * How Glow Tag Royale looks to the chaos layer.
 *
 * Meters keep the mode's own limits, and one more: chaos never dims anyone.
 * Glow written by a cheat stays between 1 and the starting glow while a
 * player is in the arena, and cannot be written at all while they are
 * dimmed (relighting is a whole move: a spot at the edge of the ring, the
 * starting glow, at least 2 charges and a moment of safety), so a cheat that
 * brings someone back goes through `relightNow`, which refuses in the final
 * ring, where the rules say nobody relights. Relight progress stops one right
 * answer short: the last one is always the player's own.
 *
 * Read-only meters (`beams`, `hits`) tick when a player uses their beam or
 * loses glow or a shield, so lasting cheats can react to a tag the moment it
 * happens. `walk` is the server's walking allowance (game time already spent
 * walking): bending it is how a cheat slows a player down without touching
 * where they are.
 *
 * Geometry helpers for the pack live here too: every place a cheat puts a
 * player is clamped to the walls, pushed out of cover and checked, as the
 * mode does with its own spots.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

export const glower = (s: any, id: PlayerId): any => s?.g?.[id];
export const startGlowOf = (ctx: Pick<ModeContext, 'settings'>) => (ctx.settings.oneGlow ? GLOW.oneGlow : GLOW.start);
export const relightNeedOf = (ctx: Pick<ModeContext, 'settings'>) => (ctx.settings.oneGlow ? RELIGHT.oneGlowNeed : RELIGHT.need);
const teamsOn = (ctx: ModeContext) => ctx.teams().length > 0;

/** Whether a player is in the arena now (present and glowing). */
export function glowing(s: any, ctx: ModeContext, id: PlayerId): boolean {
  return Boolean(glower(s, id)?.in && ctx.player(id));
}

/** The ring as it is now. */
export function ringNow(s: any, now: number): RingCircle {
  return ringAt(s.ring, now);
}

/** The ring a player should head for: where a shrink is going while it runs, otherwise the ring itself. */
export function ringSoon(s: any, now: number): RingCircle {
  return now < s.ring.endAt ? { ...s.ring.to } : ringAt(s.ring, now);
}

/** Whether a player circle at (x, z) stands somewhere the mode allows: inside the walls and clear of cover. */
export function legalSpot(map: ArenaMap, x: number, z: number): boolean {
  const lim = map.size / 2 - PLAYER_RADIUS + 1e-6;
  return Math.abs(x) <= lim && Math.abs(z) <= lim && !overlapsCover(map, x, z, PLAYER_RADIUS - 0.02);
}

/** The legal spot nearest (x, z), as the mode places players: clamped to the walls, pushed out of cover, rounded. Null if pushing out failed. */
export function settle(map: ArenaMap, x: number, z: number): [number, number] | null {
  const [cx, cz] = clampToArena(map.size, x, z);
  const [px, pz] = pushOut(map, cx, cz);
  const [fx, fz] = clampToArena(map.size, px, pz);
  const out: [number, number] = [r2(fx), r2(fz)];
  return legalSpot(map, out[0], out[1]) ? out : null;
}

/** Glowing players a player could tag (other glowing players, not teammates). */
export function rivalsOf(s: any, ctx: ModeContext, id: PlayerId): PlayerId[] {
  const me = glower(s, id);
  return ctx
    .players()
    .map((p) => p.id)
    .filter((o) => o !== id && glowing(s, ctx, o) && !(teamsOn(ctx) && me?.team !== null && glower(s, o)?.team === me?.team));
}

/** How far the nearest of these players is from (x, z). Infinity when there are none. */
export function roomFrom(s: any, ids: readonly PlayerId[], x: number, z: number): number {
  let best = Infinity;
  for (const o of ids) {
    const g = glower(s, o);
    if (g) best = Math.min(best, Math.hypot(g.x - x, g.z - z));
  }
  return best;
}

/** Put a player at a legal spot, facing `h`, with a fresh walking allowance (as the mode does when someone relights). */
export function placePlayer(s: any, id: PlayerId, x: number, z: number, h: number, now: number) {
  const g = glower(s, id);
  g.x = x;
  g.z = z;
  g.h = r3(h);
  g.budgetAt = now;
}

/**
 * Where a dimmed player relights: beside a glowing teammate with Squad
 * relight, otherwise round the edge of the ring, as far from rivals as
 * possible. The mode's own rule, without its random starting angle.
 */
export function relightSpot(s: any, ctx: ModeContext, id: PlayerId): { x: number; z: number; h: number } {
  const now = ctx.now();
  const ring = ringSoon(s, now);
  const rivals = rivalsOf(s, ctx, id);
  const candidates: [number, number][] = [];
  if (ctx.settings.squads && teamsOn(ctx)) {
    const me = glower(s, id);
    const mates = ctx
      .players()
      .map((p) => p.id)
      .filter((o) => o !== id && glowing(s, ctx, o) && glower(s, o).team === me.team)
      .sort((a, b) => Math.hypot(glower(s, a).x - ring.x, glower(s, a).z - ring.z) - Math.hypot(glower(s, b).x - ring.x, glower(s, b).z - ring.z) || a.localeCompare(b));
    for (const mate of mates) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const spot = settle(s.map, glower(s, mate).x + Math.sin(a) * 2.5, glower(s, mate).z + Math.cos(a) * 2.5);
        if (spot && !outsideRing(ring, spot[0], spot[1])) candidates.push(spot);
      }
      if (candidates.length) break;
    }
  }
  if (!candidates.length) {
    const rad = Math.max(0, Math.min(ring.r - 2, s.map.size / 2 - ARENA.edgeBand / 2));
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI * 2) / 12;
      const spot = settle(s.map, ring.x + Math.sin(a) * rad, ring.z + Math.cos(a) * rad);
      if (spot) candidates.push(spot);
    }
  }
  let best = candidates[0] ?? [ring.x, ring.z];
  let bestRoom = -1;
  for (const c of candidates) {
    const room = rivals.length ? roomFrom(s, rivals, c[0], c[1]) : 0;
    if (room > bestRoom) {
      best = c;
      bestRoom = room;
    }
  }
  return { x: best[0], z: best[1], h: headingTo(best[0], best[1], ring.x, ring.z) };
}

/** Whether a dimmed player may relight now: they are present and dimmed, and the final ring has not started. */
export function canRelight(s: any, ctx: ModeContext, id: PlayerId): boolean {
  const g = glower(s, id);
  return Boolean(g && ctx.player(id) && !g.in && !g.out && !s.final && !s.over);
}

/** Relight a dimmed player now, exactly as a right answer would. False (and nothing changes) when the rules do not allow it. */
export function relightNow(s: any, ctx: ModeContext, id: PlayerId): boolean {
  if (!canRelight(s, ctx, id)) return false;
  const g = glower(s, id);
  const now = ctx.now();
  const spot = relightSpot(s, ctx, id);
  placePlayer(s, id, spot.x, spot.z, spot.h, now);
  g.in = true;
  g.glow = startGlowOf(ctx);
  g.relight = 0;
  g.charges = Math.max(g.charges, RELIGHT.charges);
  g.safeUntil = now + RELIGHT.safeMs;
  g.relights++;
  s.stats.relights++;
  return true;
}

/** A yes/no a player holds in the arena (their shield), as a 0/1 meter so cheats that give or take it can be undone. */
const shieldMeter: MeterDef = {
  key: 'shield',
  label: 'Shield',
  scope: 'player',
  get: (s, id) => (glower(s, id)?.shield ? 1 : 0),
  set: (s, id, v) => {
    const g = glower(s, id);
    if (g?.in) g.shield = v > 0;
  },
  // Dimmed players hold no shield (the mode drops it when they are dimmed).
  max: (s, id) => (glower(s, id)?.in ? 1 : 0),
};

const glowMeter: MeterDef = {
  key: 'glow',
  label: 'Glow',
  scope: 'player',
  get: (s, id) => glower(s, id)?.glow ?? 0,
  set: (s, id, v) => {
    const g = glower(s, id);
    if (g?.in) g.glow = v;
  },
  // Never dim anyone (at least 1 while glowing); never more than the starting glow; dimmed players are not touched.
  min: (s, id) => (glower(s, id)?.in ? 1 : 0),
  max: (s, id, ctx) => (glower(s, id)?.in ? startGlowOf(ctx) : 0),
};

const relightMeter: MeterDef = {
  key: 'relight',
  label: 'Relight progress',
  scope: 'player',
  get: (s, id) => glower(s, id)?.relight ?? 0,
  set: (s, id, v) => {
    const g = glower(s, id);
    if (g && !g.in && !g.out && !s.final) g.relight = v;
  },
  // Only while relighting is allowed, and one right answer short: relighting itself is the player's.
  max: (s, id, ctx) => {
    const g = glower(s, id);
    return g && !g.in && !g.out && !s.final ? relightNeedOf(ctx) - 1 : (g?.relight ?? 0);
  },
};

/** Read-only counters that change when something happens to a player, for delta hooks to watch. */
function watch(key: string, label: string, read: (g: any) => number): MeterDef {
  const get = (s: any, id: string) => read(glower(s, id) ?? {});
  return { key, label, scope: 'player', get, set: () => {}, min: get, max: get };
}

const walkMeter: MeterDef = {
  key: 'walk',
  label: 'Walking time used',
  scope: 'player',
  get: (s, id) => glower(s, id)?.budgetAt ?? 0,
  set: (s, id, v) => {
    const g = glower(s, id);
    if (g) g.budgetAt = v;
  },
  integer: false,
};

export const glowTagAdapter: ChaosAdapter = {
  modeId: 'glow-tag',
  meters: [
    // Points: tags, dims, answers and the ring bonuses. Nothing in the mode ever takes them away, and no score ends the game.
    fieldMeter('score', 'Points', (s: any) => s.g, 'score'),
    // Beam charges are what the game earns and spends: right answers and crates fill them, every tag spends one.
    fieldMeter('currency', 'Beam charges', (s: any) => s.g, 'charges', { max: () => CHARGE.max }),
    glowMeter,
    shieldMeter,
    relightMeter,
    watch('beams', 'Beams used', (g) => g.lastTag?.n ?? 0),
    watch('hits', 'Glow or shields lost', (g) => g.lastHit?.n ?? 0),
    walkMeter,
  ],
  ...streamParts((s: any, id) => s.g[id]?.stream),
  // Dimmed players are out of the arena; before the final ring they can be relit.
  isOut: (s, id) => Boolean(glower(s, id) && !glower(s, id).in),
  revive: (s, id, ctx) => relightNow(s, ctx, id),
  features: (settings) => [
    'ring',
    'crates',
    'knockouts',
    // Three glow and two right answers to relight: room for glow to move without anyone being dimmed by a cheat.
    ...(settings.oneGlow ? [] : ['spare-glow']),
    ...(settings.lightsOut ? ['lights-out'] : []),
    ...(settings.squads ? ['squads'] : []),
  ],
};
