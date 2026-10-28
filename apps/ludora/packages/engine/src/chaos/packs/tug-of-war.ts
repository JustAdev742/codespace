import { defineCheats } from '../registry.ts';
import type { ActiveEffect, CastInput, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target } from '../cheats/kit.ts';
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
 */

const MODE = 'tug-of-war';
const EPS = 1e-6;

interface Puller {
  stream: { streak: number; correct: number; answered: number; last: { text?: string } | null };
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

/** Move the knot towards a side's end (negative: away from it). Returns how far it actually moved towards that end. */
function moveKnot(api: ChaosApi, side: Side, by: number): number {
  return round6(dirOf(side) * api.add('rope', 'game', dirOf(side) * by));
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
    hooks: { tick: (api) => void api.add('rope', 'game', api.rng.chance(0.5) ? -0.5 : 0.5) },
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

defineCheats([...instant, ...lasting]);
