import { defineCheats } from '../registry.ts';
import type { ActiveEffect, CastInput, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target } from '../cheats/kit.ts';
import { HEAVE_EVERY, leanOf, SURGE_MS, sideOfTeamIndex, UNDERDOG_GRIP, type Side } from '../../modes/tug-of-war/index.ts';

/*
 * Cheats that only make sense in tug-of-war: they move the knot, bend how far
 * each side's pulls move it, or tamper with heaves, slips and grips. Every
 * cheat here has modes: ['tug-of-war'] and an id starting with 'tug-of-war.'.
 *
 * The knot is the adapter's 'rope' meter, which already stops one space short
 * of either line: crossing a line is the mode's moment, never a cheat's.
 * Bending hooks look at which way the knot moved in one of the mode's own
 * transactions (one action, so one player's pull or slip). Cheats aimed at a
 * single puller find out who moved it by watching each puller's distance and
 * slips, which only the mode changes.
 *
 * Every cheat that moves the knot itself goes through moveKnot or nudge (or
 * checks guardAgainst first), so a Knot Guard can stop it: instant cheats are
 * refused, and lasting ones simply make no move that way while it is up.
 */

const MODE = 'tug-of-war';
const EPS = 1e-6;

interface Puller {
  stream: { streak: number; correct: number; answered: number; last: { text?: string; iid?: string } | null };
  side: Side;
  pulls: number;
  slips: number;
  distance: number;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fmt = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);
const spaces = (n: number) => `${fmt(n)} ${Math.abs(Math.abs(n) - 1) < EPS ? 'space' : 'spaces'}`;
const pullers = (api: ChaosApi): Record<string, Puller> => api.s.pullers;
const sideOf = (api: ChaosApi, id: string): Side | null => pullers(api)[id]?.side ?? null;
const dirOf = (side: Side) => (side === 'left' ? -1 : 1);
const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left');
const knot = (api: ChaosApi) => api.get('rope', 'game');
const ropeLength = (api: ChaosApi) => Number(api.ctx.settings.ropeLength);
/** How far the knot leans towards a side's end (negative when it leans the other way). */
const towards = (api: ChaosApi, side: Side) => dirOf(side) * knot(api);
const setting = (api: ChaosApi, key: string) => Boolean(api.ctx.settings[key]);

const GUARD = 'tug-of-war.knot-guard';

/**
 * The side whose Knot Guard stops a cheat moving the knot by `delta` (in knot
 * positions: negative is towards the left end), or null. A guard stops cheats
 * dragging the knot towards the other side's end; answers, and cheats that bend
 * how far answers pull, are not cheats moving the knot themselves.
 */
function guardAgainst(api: ChaosApi, delta: number): Side | null {
  if (Math.abs(delta) < EPS) return null;
  const fx = api.effects().find((e) => e.cheatId === GUARD && dirOf(e.data.side as Side) * delta < 0);
  return fx ? (fx.data.side as Side) : null;
}

function guardError(api: ChaosApi, side: Side): { error: string } {
  const name = sideName(api, side);
  return { error: `${name[0]!.toUpperCase()}${name.slice(1)} have a knot guard up: cheats cannot drag the knot towards the other end right now.` };
}

/** A cheat nudges the knot by `delta` knot positions, unless a knot guard stops it. Returns the change made. */
function nudge(api: ChaosApi, delta: number): number {
  return guardAgainst(api, delta) ? 0 : api.add('rope', 'game', delta);
}

/** Move the knot towards a side's end (negative: away from it), unless a knot guard stops it. Returns how far it actually moved towards that end. */
function moveKnot(api: ChaosApi, side: Side, by: number): number {
  return round6(dirOf(side) * nudge(api, dirOf(side) * by));
}

/** "the Comets", or "the left side" without teams. */
function sideName(api: ChaosApi, side: Side): string {
  const names = api
    .teams()
    .filter((_, i) => sideOfTeamIndex(i) === side)
    .map((t) => t.name);
  if (!names.length) return `the ${side} side`;
  return `the ${names.join(' and ')}`;
}

function casterSide(api: ChaosApi, c: CastInput): Side | { error: string } {
  return sideOf(api, c.caster) ?? { error: 'You are not on either side of the rope.' };
}

/** The side a team-targeted cast is aimed at; refused when that team pulls on the caster's own side (three or more teams). */
function enemySide(api: ChaosApi, c: CastInput): Side | { error: string } {
  const mine = sideOf(api, c.caster);
  const theirs = sideOf(api, target(c));
  if (!mine || !theirs) return { error: 'That team is not on the rope.' };
  if (mine === theirs) return { error: 'That team pulls on your side of the rope. Pick a team on the other side.' };
  return theirs;
}

const isErr = (v: unknown): v is { error: string } => typeof v === 'object' && v !== null && 'error' in v;

/** Remember a side on the effect for its hooks. */
function keepSide(fx: ActiveEffect | null, side: Side | { error: string }): { error: string } | undefined {
  if (isErr(side)) return side;
  if (fx) fx.data.side = side;
  return undefined;
}

const fxSide = (fx: ActiveEffect) => fx.data.side as Side;

/* ------------------------------ who pulled ------------------------------ */

type Seen = Record<string, [number, number]>;

function snapshotPullers(api: ChaosApi): Seen {
  const out: Seen = {};
  for (const [id, p] of Object.entries(pullers(api))) out[id] = [p.distance, p.slips];
  return out;
}

function watchPullers(api: ChaosApi, fx: ActiveEffect | null) {
  if (fx) fx.data.seen = snapshotPullers(api);
}

interface RopeActor {
  id: string;
  side: Side;
  kind: 'pull' | 'slip';
  /** Spaces the mode pulled (for pulls). */
  amount: number;
}

/**
 * Who moved the knot in this transaction: the puller whose distance (a pull)
 * or slips (a slip) went up since the effect last looked. Only the mode
 * changes those, and one transaction is one player's action.
 */
function ropeActor(api: ChaosApi, fx: ActiveEffect): RopeActor | null {
  const seen = (fx.data.seen ?? {}) as Seen;
  let actor: RopeActor | null = null;
  for (const [id, p] of Object.entries(pullers(api))) {
    const [d0, s0] = seen[id] ?? [0, 0];
    if (p.distance > d0 + EPS) actor = { id, side: p.side, kind: 'pull', amount: round6(p.distance - d0) };
    else if (p.slips > s0) actor = { id, side: p.side, kind: 'slip', amount: 0 };
  }
  fx.data.seen = snapshotPullers(api);
  return actor;
}

const isHeave = (api: ChaosApi, a: RopeActor) => a.kind === 'pull' && setting(api, 'heave') && (pullers(api)[a.id]?.stream.streak ?? 0) % HEAVE_EVERY === 0;

/** The knot's change this transaction, in a side's direction (positive: towards that side's end). */
const movedTowards = (d: Record<string, number>, side: Side) => dirOf(side) * (d.game ?? 0);

const ROPE = ['rope'] as const;
const TEAM_ROPE = ['rope', 'teams'] as const;

const instant: CheatDef[] = [
  {
    id: 'tug-of-war.yank',
    name: 'Rope Yank',
    category: 'advantage',
    description: 'Yank the knot 1 to 3 spaces (you choose) towards your side\'s end. It always stops at least one space short of the line.',
    target: 'self',
    modes: [MODE],
    needs: ROPE,
    params: [{ key: 'spaces', label: 'Spaces', kind: 'int', min: 1, max: 3, default: 2, unit: 'spaces' }],
    cost: 30,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      const guard = guardAgainst(api, dirOf(side));
      if (guard) return guardError(api, guard);
      const moved = moveKnot(api, side, Number(c.params.spaces));
      if (moved <= 0) return { error: 'The knot is already as close to your line as chaos can drag it.' };
      api.feed(`${api.name(c.caster)} yanked the knot ${spaces(moved)} towards ${sideName(api, side)}.`, 'info');
    },
  },
  {
    id: 'tug-of-war.reset',
    name: 'Knot Reset',
    category: 'round',
    description: 'The knot jumps straight back to the middle of the rope. Only works while it leans towards the other side.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: ROPE,
    cost: 60,
    cooldownMs: 120_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      if (towards(api, side) >= -EPS) return { error: 'The knot is not leaning towards the other side.' };
      const guard = guardAgainst(api, -knot(api));
      if (guard) return guardError(api, guard);
      api.set('rope', 'game', 0);
      api.feed('The knot snapped back to the middle of the rope.', 'big');
    },
  },
  {
    id: 'tug-of-war.mirror',
    name: 'Mirror Knot',
    category: 'round',
    description: 'Flips the rope end for end: the knot moves to the same distance from the middle, but on your side. Only works while it leans towards the other side.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: ROPE,
    cost: 90,
    cooldownMs: 240_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      const lean = towards(api, side);
      if (lean >= -EPS) return { error: 'The knot is not leaning towards the other side.' };
      const guard = guardAgainst(api, -2 * knot(api));
      if (guard) return guardError(api, guard);
      api.set('rope', 'game', -knot(api));
      api.feed(`The rope flipped end for end: the knot is now ${spaces(-lean)} towards ${sideName(api, side)}.`, 'big');
    },
  },
  {
    id: 'tug-of-war.gamble',
    name: 'Knot Gamble',
    category: 'random',
    description: `Throw your weight on the rope and hope. Odds: ${odds([['the knot moves 3 spaces your way', 40], ['1 space your way', 35], ['you slip and it moves 2 spaces the other way', 25]])}.`,
    target: 'self',
    modes: [MODE],
    needs: ROPE,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      const lean = towards(api, side);
      const L = ropeLength(api);
      if (lean >= L - 1 - EPS || lean <= 1 - L + EPS) return { error: 'The knot is against a stop already. Pull it back into play first.' };
      // A gamble can go either way, so a knot guard on either side rules it out.
      const guard = guardAgainst(api, 1) ?? guardAgainst(api, -1);
      if (guard) return guardError(api, guard);
      const by = rollOdds(api, [[3, 40], [1, 35], [-2, 25]]);
      const moved = moveKnot(api, side, by);
      api.feed(
        moved > 0 ? `${api.name(c.caster)}'s gamble moved the knot ${spaces(moved)} towards ${sideName(api, side)}.` : `${api.name(c.caster)} slipped: the knot moved ${spaces(moved)} towards ${sideName(api, otherSide(side))}.`,
        moved > 0 ? 'good' : 'bad',
      );
    },
  },
  {
    id: 'tug-of-war.heave-primer',
    name: 'Heave Primer',
    category: 'advantage',
    description: 'Your next ordinary pull (within 30 seconds) is a heave and moves the knot twice as far, without waiting for a streak. A heave that was due anyway does not use it up. Needs Heave on.',
    target: 'self',
    modes: [MODE],
    needs: ['rope', 'heave'],
    cost: 20,
    cooldownMs: 30_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, _c, fx) => watchPullers(api, fx),
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull' || a.id !== fx.caster || isHeave(api, a)) return;
          d.game = round6(d.game! * 2);
          const last = pullers(api)[a.id]?.stream.last;
          if (last) last.text = `${last.text ?? 'Pulled'} · primed heave: twice as far`;
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Heave primed: next pull ×2', tone: 'good' }),
  },
  {
    id: 'tug-of-war.broken-rhythm',
    name: 'Broken Rope Rhythm',
    category: 'troll',
    description: 'An opponent\'s streak drops to zero, so they lose their progress towards the next heave. Needs Heave on.',
    target: 'opponent',
    modes: [MODE],
    needs: ['rope', 'heave'],
    cost: 15,
    cooldownMs: 25_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('streak', t) === 0) return { error: `${api.name(t)} has no streak to break.` };
      api.set('streak', t, 0);
    },
  },
  {
    id: 'tug-of-war.overtime',
    name: 'Overtime Knot',
    category: 'round',
    description: 'Adds 20 seconds to the tug of war clock. Only while the knot does not lean your way, and not once the final surge has begun.',
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    undoable: false,
    cost: 35,
    cooldownMs: 90_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      const s = api.s;
      if (s.endsAt === null) return { error: 'This tug of war has no clock.' };
      if (towards(api, side) > EPS) return { error: 'The knot already leans your way. Overtime is for the side that is behind.' };
      const surge = setting(api, 'surge');
      if (surge && !api.ctx.hasTimer('surge')) return { error: 'The final surge has begun. The clock cannot be stretched now.' };
      s.endsAt += 20_000;
      api.ctx.setTimer('time', s.endsAt);
      if (surge) api.ctx.setTimer('surge', s.endsAt - SURGE_MS);
      api.feed('Overtime! 20 more seconds on the tug of war clock.', 'big');
    },
  },
];

const lasting: CheatDef[] = [
  {
    id: 'tug-of-war.greased-rope',
    name: 'Greased Rope',
    category: 'troll',
    description: 'For 12 seconds, grease the other side\'s grip: whenever the knot moves towards their end, it moves only half as far.',
    target: 'enemy-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 12_000,
    priority: 20,
    apply: (api, c, fx) => keepSide(fx, enemySide(api, c)),
    hooks: {
      delta: {
        rope: (_api, fx, d) => {
          if (movedTowards(d, fxSide(fx)) > 0) d.game = round6(d.game! / 2);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Greased grip: half pulls', tone: 'bad' }),
  },
  {
    id: 'tug-of-war.iron-grip',
    name: 'Iron Rope Grip',
    category: 'advantage',
    description: 'For 12 seconds, whenever the knot moves towards your side\'s end, it moves 1.5 times as far.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 12_000,
    priority: 20,
    apply: (api, c, fx) => keepSide(fx, casterSide(api, c)),
    hooks: {
      delta: {
        rope: (_api, fx, d) => {
          if (movedTowards(d, fxSide(fx)) > 0) d.game = round6(d.game! * 1.5);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Iron grip: pulls ×1.5', tone: 'good' }),
  },
  {
    id: 'tug-of-war.tangled-rope',
    name: 'Tangled Rope',
    category: 'troll',
    description: 'For 6 seconds, the other side\'s rope is tangled: whenever the knot would move towards their end, it moves the same distance towards yours instead.',
    target: 'enemy-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 50,
    cooldownMs: 75_000,
    durationMs: 6_000,
    priority: 30,
    apply: (api, c, fx) => keepSide(fx, enemySide(api, c)),
    hooks: {
      delta: {
        rope: (_api, fx, d) => {
          if (movedTowards(d, fxSide(fx)) > 0) d.game = -d.game!;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Tangled rope: your pulls go backwards', tone: 'bad' }),
  },
  {
    id: 'tug-of-war.anchor',
    name: 'Rope Anchor',
    category: 'advantage',
    description: 'For 8 seconds, your side digs in: the knot cannot move towards the other side\'s end at all.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 45,
    cooldownMs: 60_000,
    durationMs: 8_000,
    priority: 40,
    apply: (api, c, fx) => keepSide(fx, casterSide(api, c)),
    hooks: {
      delta: {
        rope: (_api, fx, d) => {
          if (movedTowards(d, fxSide(fx)) < 0) d.game = 0;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Anchored: the knot will not slide back', tone: 'good' }),
  },
  {
    id: 'tug-of-war.frenzy',
    name: 'Rope Frenzy',
    category: 'round',
    description: 'For 10 seconds, every pull and slip by either side moves the knot twice as far.',
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 10_000,
    priority: 20,
    hooks: { delta: { rope: (_api, _fx, d) => void (d.game && (d.game = round6(d.game * 2))) } },
    overlay: () => ({ kind: 'banner', text: 'Rope frenzy: every pull counts double!', tone: 'info' }),
  },
  {
    id: 'tug-of-war.frayed-rope',
    name: 'Frayed Rope',
    category: 'random',
    description: `For 15 seconds the rope is frayed, and every time the knot moves (either way) the fibres decide how far. Odds each time: ${odds([['it does not move', 25], ['normal', 50], ['twice as far', 25]])}.`,
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 20,
    hooks: {
      delta: {
        rope: (api, _fx, d) => {
          if (!d.game) return;
          const f = rollOdds(api, [[0, 25], [1, 50], [2, 25]]);
          d.game = round6(d.game * f);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Frayed rope: pulls are unpredictable', tone: 'info' }),
  },
  {
    id: 'tug-of-war.rope-burn',
    name: 'Rope Burn',
    category: 'troll',
    description: 'For 10 seconds, an opponent\'s hands are burnt: their correct answers still count as pulls, but do not move the knot at all.',
    target: 'opponent',
    modes: [MODE],
    needs: ROPE,
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 10_000,
    priority: 40,
    apply: (api, _c, fx) => watchPullers(api, fx),
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull' || a.id !== target(fx)) return;
          d.game = 0;
          const last = pullers(api)[a.id]?.stream.last;
          if (last) last.text = 'Rope burn: your pull did not move the knot';
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Rope burn: your pulls do not move the knot', tone: 'bad' }),
  },
  {
    id: 'tug-of-war.mighty-heave',
    name: 'Mighty Heave',
    category: 'advantage',
    description: 'For 20 seconds, your heaves (every third correct answer in a row) pull three times as far instead of twice. Needs Heave on.',
    target: 'self',
    modes: [MODE],
    needs: ['rope', 'heave'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, _c, fx) => watchPullers(api, fx),
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a && a.id === fx.caster && isHeave(api, a)) d.game = round6(d.game! * 1.5);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Mighty heave: heaves ×3', tone: 'good' }),
  },
  {
    id: 'tug-of-war.heave-breaker',
    name: 'Heave Breaker',
    category: 'troll',
    description: 'For 15 seconds, the other side\'s heaves pull only as far as an ordinary pull. Needs Heave on.',
    target: 'enemy-team',
    modes: [MODE],
    needs: ['rope', 'teams', 'heave'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 20,
    apply: (api, c, fx) => {
      watchPullers(api, fx);
      return keepSide(fx, enemySide(api, c));
    },
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a && a.side === fxSide(fx) && isHeave(api, a)) d.game = round6(d.game! / 2);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Heave breaker: no double pulls', tone: 'bad' }),
  },
  {
    id: 'tug-of-war.rosin-grip',
    name: 'Rosin Grip',
    category: 'advantage',
    description: 'For 20 seconds, your side\'s wrong answers do not let the slippery rope slip. Needs Slippery Rope on.',
    target: 'my-team',
    modes: [MODE],
    needs: ['rope', 'teams', 'slack'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 40,
    apply: (api, c, fx) => {
      watchPullers(api, fx);
      return keepSide(fx, casterSide(api, c));
    },
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'slip' || a.side !== fxSide(fx)) return;
          d.game = 0;
          const pl = pullers(api)[a.id]!;
          pl.slips--;
          if (pl.stream.last) pl.stream.last.text = 'Rosin grip: the rope did not slip';
          fx.data.seen = snapshotPullers(api);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Rosin grip: no slipping', tone: 'good' }),
  },
  {
    id: 'tug-of-war.topsy-grip',
    name: 'Topsy-Turvy Grip',
    category: 'round',
    description: `For 15 seconds the underdog grip changes hands: the side the knot leans towards pulls ${UNDERDOG_GRIP} times as hard, and the side it leans away from loses its extra grip. Needs Underdog Grip on.`,
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: ['rope', 'underdog'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 15_000,
    priority: 20,
    apply: (api, _c, fx) => watchPullers(api, fx),
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull') return;
          // Where the knot was before this pull: the mode moved it exactly the puller's new distance.
          const before = knot(api) - dirOf(a.side) * a.amount;
          const lean = leanOf(before);
          if (lean === 'draw') return;
          d.game = round6(lean === a.side ? d.game! * UNDERDOG_GRIP : d.game! / UNDERDOG_GRIP);
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Topsy-turvy grip: the leaders pull harder!', tone: 'info' }),
  },
  {
    id: 'tug-of-war.momentum',
    name: 'Rope Momentum',
    category: 'advantage',
    description: 'For 20 seconds, your side builds momentum: each pull your side makes in a row adds a quarter of a space more than the last (up to one extra space). Any movement towards the other end breaks the chain.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 25,
    apply: (api, c, fx) => {
      watchPullers(api, fx);
      if (fx) fx.data.chain = 0;
      return keepSide(fx, casterSide(api, c));
    },
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const side = fxSide(fx);
          const a = ropeActor(api, fx);
          if (movedTowards(d, side) < 0) {
            fx.data.chain = 0;
            return;
          }
          if (a?.kind !== 'pull' || a.side !== side) return;
          const chain = Number(fx.data.chain) + 1;
          fx.data.chain = chain;
          const bonus = Math.min(1, 0.25 * (chain - 1));
          if (bonus > 0) d.game = round6(d.game! + dirOf(side) * bonus);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Momentum: keep pulling!', tone: 'good' }),
  },
  {
    id: 'tug-of-war.last-stand',
    name: 'Last Stand at the Rope',
    category: 'advantage',
    description: 'For 20 seconds, every pull your side makes while the knot leans towards the other side\'s end moves it twice as far. Only castable while the knot leans the other way.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, c, fx) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      if (towards(api, side) >= -EPS) return { error: 'The knot is not leaning towards the other side. Save your last stand.' };
      watchPullers(api, fx);
      return keepSide(fx, side);
    },
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const side = fxSide(fx);
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull' || a.side !== side) return;
          const before = knot(api) - dirOf(side) * a.amount;
          if (dirOf(side) * before < -EPS) d.game = round6(d.game! * 2);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Last stand: pulls ×2 while behind', tone: 'good' }),
  },
  {
    id: 'tug-of-war.wager',
    name: 'Tug Wager',
    category: 'round',
    description: 'Bet on your side for 15 seconds. If the knot ends up closer to your end than when you bet, it moves 2 more spaces your way; if not, it moves 2 spaces the other way.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 15_000,
    apply: (api, c, fx) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      if (fx) fx.data.start = towards(api, side);
      return keepSide(fx, side);
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason !== 'expired' || api.s.winner) return;
        const side = fxSide(fx);
        const won = towards(api, side) > Number(fx.data.start) + EPS;
        const moved = moveKnot(api, side, won ? 2 : -2);
        if (moved === 0) return;
        api.feed(won ? `${api.name(fx.caster)} won the tug wager: the knot moved ${spaces(moved)} more towards ${sideName(api, side)}.` : `${api.name(fx.caster)} lost the tug wager: the knot moved ${spaces(moved)} towards ${sideName(api, otherSide(side))}.`, won ? 'good' : 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Tug wager: gain ground before time is up', until: fx.endsAt }),
  },
  {
    id: 'tug-of-war.butterfingers',
    name: 'Rope Butterfingers',
    category: 'troll',
    description: 'For 20 seconds, every wrong answer an opponent gives lets the rope slip one space towards your side\'s end, even if the rope is not slippery.',
    target: 'opponent',
    modes: [MODE],
    needs: ['rope', 'meter:wrongAnswers'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    apply: (api, c, fx) => keepSide(fx, casterSide(api, c)),
    hooks: {
      delta: {
        wrongAnswers: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || api.s.winner) return;
          const moved = moveKnot(api, fxSide(fx), 1);
          const pl = pullers(api)[t];
          if (moved > 0 && pl?.stream.last) pl.stream.last.text = `Butterfingers: the rope slipped ${spaces(moved)} the other way`;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Butterfingers: wrong answers slip the rope', tone: 'bad' }),
  },
  {
    id: 'tug-of-war.elastic',
    name: 'Elastic Rope',
    category: 'advantage',
    description: 'For 12 seconds the rope is elastic. When it ends, if the knot has been pulled towards the other side\'s end since you cast it, it springs back to where it was.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 12_000,
    apply: (api, c, fx) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      if (fx) fx.data.start = towards(api, side);
      return keepSide(fx, side);
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason !== 'expired' || api.s.winner) return;
        const side = fxSide(fx);
        const lost = Number(fx.data.start) - towards(api, side);
        if (lost <= EPS) return;
        const moved = moveKnot(api, side, lost);
        if (moved > 0) api.feed(`The elastic rope sprang back ${spaces(moved)} towards ${sideName(api, side)}.`, 'good');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Elastic rope: springs back', until: fx.endsAt }),
  },
  {
    id: 'tug-of-war.current',
    name: 'Rope Current',
    category: 'advantage',
    description: 'For 15 seconds, a current tugs the rope: every 3 seconds the knot drifts half a space towards your side\'s end.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: 3_000,
    apply: (api, c, fx) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      if (towards(api, side) >= ropeLength(api) - 1 - EPS) return { error: 'The knot is already as close to your line as chaos can drag it.' };
      const guard = guardAgainst(api, dirOf(side));
      if (guard) return guardError(api, guard);
      return keepSide(fx, side);
    },
    hooks: { tick: (api, fx) => void moveKnot(api, fxSide(fx), 0.5) },
    overlay: () => ({ kind: 'badge', text: 'Rope current: drifting your way', tone: 'good' }),
  },
  {
    id: 'tug-of-war.wobble',
    name: 'Knot Wobble',
    category: 'random',
    description: `For 12 seconds the knot wobbles: every 2 seconds it jumps half a space. Odds each time: ${odds([['towards the left end', 50], ['towards the right end', 50]])}.`,
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 15,
    cooldownMs: 40_000,
    durationMs: 12_000,
    tickMs: 2_000,
    hooks: { tick: (api) => void nudge(api, api.rng.chance(0.5) ? -0.5 : 0.5) },
    overlay: () => ({ kind: 'badge', text: 'The knot is wobbling', tone: 'info' }),
  },
  {
    id: 'tug-of-war.tangle',
    name: 'Rope Tangle',
    category: 'troll',
    description: 'For 6 seconds, an opponent is tangled in the rope and cannot answer.',
    target: 'opponent',
    modes: [MODE],
    needs: ROPE,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 6_000,
    hooks: { gate: () => ({ block: 'You are tangled in the rope! Wait a moment.' }) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Tangled in the rope', until: fx.endsAt }),
  },
];

/** Correct answers a puller has given (only the mode changes this, unlike pulls in the ranking). */
const rightAnswers = (api: ChaosApi, id: string) => pullers(api)[id]?.stream.correct ?? 0;

/** How long ago the question a puller just answered appeared on their screen, or null. */
function answeredInMs(api: ChaosApi, id: string): number | null {
  const iid = pullers(api)[id]?.stream.last?.iid;
  if (!iid) return null;
  try {
    return api.now() - api.ctx.questions.instance(iid).shownAt;
  } catch {
    return null;
  }
}

function addNote(api: ChaosApi, id: string, text: string) {
  const last = pullers(api)[id]?.stream.last;
  if (last) last.text = `${last.text ?? 'Pulled'} · ${text}`;
}

/** Snap Pull: answers this quick pull twice as far. */
export const SNAP_MS = 4_000;

const more: CheatDef[] = [
  {
    id: 'tug-of-war.rhythm-thief',
    name: 'Rope Rhythm Thief',
    category: 'troll',
    description: 'Steal an opponent\'s streak towards their next heave: theirs drops to zero and yours grows by as much (a streak is never longer than your own correct answers, so you may keep only part of it). Needs Heave on.',
    target: 'opponent',
    modes: [MODE],
    needs: ['rope', 'heave', 'meter:streak'],
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      const theirs = api.get('streak', t);
      if (theirs === 0) return { error: `${api.name(t)} has no streak to take.` };
      const room = rightAnswers(api, c.caster) - api.get('streak', c.caster);
      if (room <= 0) return { error: 'Your streak is already as long as your correct answers, so you could not keep any of theirs.' };
      api.set('streak', t, 0);
      const kept = api.add('streak', c.caster, theirs);
      api.feed(`${api.name(c.caster)} stole ${api.name(t)}'s streak of ${theirs}${kept < theirs ? ` and kept ${kept} of it` : ''}.`, 'bad');
    },
  },
  {
    id: 'tug-of-war.selfless-heave',
    name: 'Selfless Heave',
    category: 'economy',
    description: 'Give up a quarter of your pulls in the ranking (at least 1) to heave the knot up to 2 spaces towards your side\'s end. It always stops at least one space short of the line.',
    target: 'self',
    modes: [MODE],
    needs: ['rope', 'meter:score'],
    cost: 15,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const side = casterSide(api, c);
      if (isErr(side)) return side;
      const pulls = api.score(c.caster);
      if (pulls <= 0) return { error: 'You have no pulls to give up yet.' };
      const guard = guardAgainst(api, dirOf(side));
      if (guard) return guardError(api, guard);
      const moved = moveKnot(api, side, 2);
      if (moved <= 0) return { error: 'The knot is already as close to your line as chaos can drag it.' };
      const paid = -api.addScore(c.caster, -share(pulls, 25));
      api.feed(`${api.name(c.caster)} gave up ${paid} ${paid === 1 ? 'pull' : 'pulls'} from the ranking to heave the knot ${spaces(moved)} towards ${sideName(api, side)}.`, 'good');
    },
  },
  {
    id: 'tug-of-war.tiebreaker',
    name: 'Knot Tiebreaker',
    category: 'round',
    description: 'Only while the knot is within 1 space of the middle: it moves 2 spaces towards the side that has made more pulls this game, whichever side that is. Refused when both sides have made the same number.',
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api) => {
      if (Math.abs(knot(api)) > 1 + EPS) return { error: 'The knot is more than a space from the middle: there is no tie to break.' };
      const counts = api.s.pullCounts as Record<Side, number>;
      if (counts.left === counts.right) return { error: 'Both sides have made the same number of pulls.' };
      const side: Side = counts.left > counts.right ? 'left' : 'right';
      const guard = guardAgainst(api, dirOf(side));
      if (guard) return guardError(api, guard);
      const moved = moveKnot(api, side, 2);
      if (moved <= 0) return { error: 'The knot cannot move that way any further.' };
      api.feed(`Knot Tiebreaker: ${sideName(api, side)} have made more pulls (${counts[side]} to ${counts[otherSide(side)]}), so the knot moved ${spaces(moved)} their way.`, 'big');
    },
  },
  {
    id: 'tug-of-war.snap-pull',
    name: 'Tug Snap Pull',
    category: 'advantage',
    description: `For 20 seconds, every correct answer you give within ${SNAP_MS / 1000} seconds of its question appearing pulls the knot twice as far.`,
    target: 'self',
    modes: [MODE],
    needs: ROPE,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, _c, fx) => watchPullers(api, fx),
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull' || a.id !== fx.caster) return;
          const ms = answeredInMs(api, a.id);
          if (ms === null || ms > SNAP_MS) return;
          d.game = round6(d.game! * 2);
          addNote(api, a.id, 'snap pull: twice as far');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: `Snap pull: answers within ${SNAP_MS / 1000}s pull ×2`, tone: 'good' }),
  },
  {
    id: 'tug-of-war.pulling-contest',
    name: 'Tug Pulling Contest',
    category: 'round',
    description: 'Challenge an opponent: whoever of you two gives more correct answers in the next 15 seconds wins, and the knot then moves 2 spaces towards the winner\'s end. A tie moves nothing.',
    target: 'opponent',
    hostile: false,
    modes: [MODE],
    needs: ROPE,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    apply: (api, c, fx) => {
      const mine = casterSide(api, c);
      if (isErr(mine)) return mine;
      const t = target(c);
      const theirs = sideOf(api, t);
      if (!theirs) return { error: `${api.name(t)} is not on the rope.` };
      if (theirs === mine) return { error: `${api.name(t)} pulls on your side of the rope. Pick someone on the other side.` };
      if (fx) fx.data.start = { [c.caster]: rightAnswers(api, c.caster), [t]: rightAnswers(api, t) };
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason !== 'expired' || api.s.winner) return;
        const t = target(fx);
        const start = fx.data.start as Record<string, number>;
        const mine = rightAnswers(api, fx.caster) - (start[fx.caster] ?? 0);
        const theirs = rightAnswers(api, t) - (start[t] ?? 0);
        if (mine === theirs) {
          api.feed(`The pulling contest between ${api.name(fx.caster)} and ${api.name(t)} was a tie (${mine} each). The knot stays put.`, 'info');
          return;
        }
        const [winner, loser] = mine > theirs ? [fx.caster, t] : [t, fx.caster];
        const side = sideOf(api, winner);
        if (!side) return;
        const score = `${Math.max(mine, theirs)} to ${Math.min(mine, theirs)}`;
        const guarded = guardAgainst(api, dirOf(side));
        const moved = moveKnot(api, side, 2);
        const won = `${api.name(winner)} beat ${api.name(loser)} in the pulling contest (${score})`;
        api.feed(
          moved > 0
            ? `${won}: the knot moved ${spaces(moved)} towards ${sideName(api, side)}.`
            : guarded
              ? `${won}, but ${sideName(api, guarded)} have a knot guard up, so the knot stayed put.`
              : `${won}, but the knot could not move any further that way.`,
          'big',
        );
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'countdown', label: 'Pulling contest: most correct answers wins', until: fx.endsAt }),
  },
  {
    id: 'tug-of-war.drumbeat',
    name: 'Tug Drumbeat',
    category: 'round',
    description: 'A drum beats four times, 5 seconds apart. At each beat the knot moves 1 space towards the side that made more pulls since the last beat (or since the cast); it stays put when both made the same number.',
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 21_000,
    tickMs: 5_000,
    apply: (api, _c, fx) => {
      if (fx) fx.data.counts = { ...(api.s.pullCounts as Record<Side, number>) };
    },
    hooks: {
      tick: (api, fx) => {
        if (api.s.winner) return;
        const now = api.s.pullCounts as Record<Side, number>;
        const was = fx.data.counts as Record<Side, number>;
        const left = now.left - was.left;
        const right = now.right - was.right;
        fx.data.counts = { ...now };
        if (left === right) return;
        const side: Side = left > right ? 'left' : 'right';
        const moved = moveKnot(api, side, 1);
        if (moved > 0) api.feed(`Drumbeat! ${sideName(api, side)} pulled more (${Math.max(left, right)} to ${Math.min(left, right)}), so the knot moved ${spaces(moved)} their way.`, 'info');
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Drumbeat: out-pull the other side before each beat!', tone: 'info' }),
  },
  {
    id: 'tug-of-war.borrowed-heave',
    name: 'Borrowed Heave',
    category: 'round',
    description: `For 20 seconds the Heave rule is on in a game without it: every ${HEAVE_EVERY === 3 ? 'third' : `${HEAVE_EVERY}th`} correct answer in a row, by anyone, pulls the knot twice as far. Not in a game where Heave is already on.`,
    target: 'room',
    modes: [MODE],
    needs: ROPE,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, _c, fx) => {
      if (setting(api, 'heave')) return { error: 'Heave is already on in this game.' };
      watchPullers(api, fx);
    },
    hooks: {
      delta: {
        rope: (api, fx, d) => {
          const a = ropeActor(api, fx);
          if (a?.kind !== 'pull') return;
          const streak = pullers(api)[a.id]?.stream.streak ?? 0;
          if (streak === 0 || streak % HEAVE_EVERY !== 0) return;
          d.game = round6(d.game! * 2);
          addNote(api, a.id, 'borrowed heave: twice as far');
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Borrowed heave: three in a row pulls ×2', tone: 'info' }),
  },
  {
    id: 'tug-of-war.domino-slip',
    name: 'Rope Domino Slip',
    category: 'troll',
    description: 'For 20 seconds, every wrong answer from the other side breaks the streak of everyone on that side, not just the player who missed, so their heaves have to be built again. Needs Heave on.',
    target: 'enemy-team',
    modes: [MODE],
    needs: ['rope', 'teams', 'heave', 'meter:wrongAnswers', 'meter:streak'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c, fx) => keepSide(fx, enemySide(api, c)),
    hooks: {
      delta: {
        wrongAnswers: (api, fx, d) => {
          if (api.s.winner) return;
          const side = fxSide(fx);
          for (const [id, n] of Object.entries(d)) {
            if (n <= 0 || sideOf(api, id) !== side) continue;
            const broken = api.ids().filter((x) => x !== id && sideOf(api, x) === side && api.get('streak', x) > 0);
            for (const x of broken) api.set('streak', x, 0);
            if (broken.length) api.feed(`Domino slip: ${api.name(id)}'s wrong answer broke the streak of ${broken.map((x) => api.name(x)).join(', ')}.`, 'bad', [id, ...broken]);
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Domino slip: one miss breaks every streak on your side', tone: 'bad' }),
  },
  {
    id: GUARD,
    name: 'Knot Guard',
    category: 'advantage',
    description:
      'For 20 seconds, no cheat can drag the knot towards the other side\'s end: yanks, resets, flips, gambles, currents, wobbles, wagers, drumbeats and the like are refused, or their moves that way do not happen. Answers, and cheats that change how far answers pull, still move it as usual.',
    target: 'my-team',
    modes: [MODE],
    needs: TEAM_ROPE,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    apply: (api, c, fx) => keepSide(fx, casterSide(api, c)),
    overlay: () => ({ kind: 'badge', text: 'Knot guard: cheats cannot drag the knot back', tone: 'good' }),
  },
];

defineCheats([...instant, ...lasting, ...more]);
