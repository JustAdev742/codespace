import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { CROSSROADS, GATE, LOOP, SHORTCUT, SPACES, placeName } from '../../modes/lantern-trail/board.ts';
import { pathBetween, STEPS } from '../../modes/lantern-trail/index.ts';
import {
  EVENT_TIMING,
  FINALE,
  HOT_STREAK,
  MIN_PRICE,
  PAYOUTS,
  PICKPOCKET_COINS,
  ROOM_EVENTS,
  RUMOUR_STEPS,
  SHOWER_COINS,
  STALL_MOVE_MIN,
  TICKET_DISCOUNT,
  type EventId,
} from '../../modes/lantern-trail/meta.ts';

/*
 * Cheats that only make sense in Lantern Trail: they walk Glims round the
 * board, move the Golden Lantern stalls, hand out and steal Golden tickets,
 * start and stop room events, and bend what the trail's own spaces pay.
 *
 * The mode's rules, kept here as they are in modes/lantern-trail/index.ts:
 *  - A Glim is only moved while it is at rest: not halfway through a move or a
 *    choice (pending), so a move's path, notes and offers stay whole.
 *  - A Glim at rest never stands on a pier (landing there always ferries it
 *    across), so a chaos move that would stop on one goes a space further.
 *  - Stalls never stand on a pier, the Crossroads or another stall. When a
 *    stall moves away from someone deciding whether to buy from it, their
 *    15-second choice timer is set to fire at once, and the mode itself then
 *    tells them they missed it and carries on with their move.
 *  - Golden Lanterns go through the score meter, which stops one short of a
 *    lantern goal, so chaos never wins the game.
 * Cheats that write the state directly are not undoable (lasting effects are
 * stopped rather than undone).
 */

const MODE = 'lantern-trail';
const M = [MODE] as const;
const COINS = ['meter:currency'] as const;
const EVENTS = ['room events'] as const;
const PUDDLES = ['gloom puddles'] as const;
const TRICKS = ['trick cards'] as const;
const id = (slug: string) => `${MODE}.${slug}`;

/* ------------------------------- the board ------------------------------- */

interface Note {
  k: string;
  [field: string]: any;
}

const walkerOf = (api: ChaosApi, pid: string): any => api.s.walkers?.[pid] ?? null;

/** Not halfway through a move or a choice. */
function atRest(w: any): boolean {
  return Boolean(w) && !w.pending && (!w.move || w.move.endedAt !== null);
}

function restError(api: ChaosApi, pid: string, you = false): { error: string } | null {
  return atRest(walkerOf(api, pid)) ? null : { error: you ? 'Finish your move first.' : `${api.name(pid)} is in the middle of a move.` };
}

const isPier = (n: number) => SPACES[n]!.kind === 'ferry';
const stepAhead = (n: number) => SPACES[n]!.next[0]!;
/** The space a step back leads to: back along the shortcut to the Crossroads, or back round the loop. */
function stepBack(n: number): number {
  if (n === SHORTCUT[0]) return CROSSROADS;
  if (n > SHORTCUT[0]!) return n - 1;
  return (n + LOOP - 1) % LOOP;
}

/** Walk a Glim forward the long way round, paying the Town Gate's coins when it passes. No space is taken. */
function hopForward(api: ChaosApi, pid: string, steps: number): number {
  const w = walkerOf(api, pid);
  let pos = w.pos as number;
  let gates = 0;
  for (let k = 0; k < steps || isPier(pos); k++) {
    pos = stepAhead(pos);
    if (pos === GATE) gates++;
  }
  w.pos = pos;
  if (gates) api.add('currency', pid, gates * PAYOUTS.gate);
  return pos;
}

function slipBack(api: ChaosApi, pid: string, steps: number): number {
  const w = walkerOf(api, pid);
  let pos = w.pos as number;
  for (let k = 0; k < steps || isPier(pos); k++) pos = stepBack(pos);
  w.pos = pos;
  return pos;
}

/** Record a trick on a player the way the mode does, so their phone says who did it. */
function markHit(api: ChaosApi, victim: string, kind: 'pickpocket' | 'trade', by: string, coins: number) {
  const w = walkerOf(api, victim);
  w.hit = { kind, name: api.name(by), coins, to: w.pos, at: api.now(), n: (w.hit?.n ?? 0) + 1 };
}

function addPlay(api: ChaosApi, kind: 'buy' | 'steal' | 'trade' | 'shower' | 'rumour', pid: string, text: string) {
  const s = api.s;
  s.plays = [{ n: ++s.playSeq, kind, playerId: pid, text, at: api.now() }, ...s.plays].slice(0, 6);
}

/* -------------------------------- stalls -------------------------------- */

const NAILED = id('nailed-down');

function canStand(s: any, node: number, stallId: number): boolean {
  const k = SPACES[node]!.kind;
  return k !== 'ferry' && k !== 'fork' && !s.stalls.some((x: any) => x.id !== stallId && x.pos === node);
}

function nailedError(api: ChaosApi): { error: string } | null {
  return api.effects().some((e) => e.cheatId === NAILED) ? { error: 'The stalls are nailed down right now.' } : null;
}

function moveStall(api: ChaosApi, stall: any, to: number, why: 'parade' | 'rumour') {
  const from = stall.pos;
  if (to === from) return;
  stall.from = from;
  stall.pos = to;
  stall.movedAt = api.now();
  stall.why = why;
  stall.n++;
  // Anyone deciding whether to buy from it has missed it: let the mode settle that now.
  for (const [pid, w] of Object.entries<any>(api.s.walkers)) {
    const p = w.pending;
    if (p?.kind === 'buy' && p.stall === stall.id && p.node === from) api.ctx.setTimer(`choice:${pid}`, api.now());
  }
}

/** The stall fewest steps ahead of a space. */
function nearestStall(s: any, node: number): any {
  let best: any = null;
  for (const st of s.stalls) if (!best || STEPS[node]![st.pos]! < STEPS[node]![best.pos]!) best = st;
  return best;
}

/** A random space where this stall may stand, `min` to `max` steps ahead of `from` if there is one (as after a purchase). */
function stallSpot(api: ChaosApi, stall: any, from: number, min: number, max: number): number | null {
  const s = api.s;
  const free = SPACES.filter((sp) => canStand(s, sp.id, stall.id) && sp.id !== from && sp.id !== stall.pos).map((sp) => sp.id);
  if (!free.length) return null;
  const near = free.filter((n) => STEPS[from]![n]! >= min && STEPS[from]![n]! <= max);
  return api.rng.pick(near.length ? near : free);
}

/** Stall rumour, as the chance card does it: the nearest stall (either way round) moves 3 spaces towards the player. */
function rumour(api: ChaosApi, pid: string): number | null {
  const s = api.s;
  const w = walkerOf(api, pid);
  let best: { stall: any; route: number[] } | null = null;
  for (const stall of s.stalls) {
    const ahead = STEPS[w.pos]![stall.pos]!;
    const behind = STEPS[stall.pos]![w.pos]!;
    const route = ahead <= behind ? pathBetween(w.pos, stall.pos).reverse() : pathBetween(stall.pos, w.pos);
    if (!best || route.length < best.route.length) best = { stall, route };
  }
  if (!best || best.route.length < 2) return null;
  const { stall, route } = best;
  const want = Math.min(RUMOUR_STEPS, route.length - 1);
  const tries = [want, want + 1, ...Array.from({ length: want - 1 }, (_, k) => want - 1 - k)].filter((k) => k >= 1 && k < route.length);
  const k = tries.find((t) => canStand(s, route[t]!, stall.id));
  if (k === undefined) return null;
  moveStall(api, stall, route[k]!, 'rumour');
  return route[k]!;
}

function paradeHop(api: ChaosApi): number {
  const s = api.s;
  let moved = 0;
  for (const stall of s.stalls) {
    let to = stall.pos;
    for (let k = 0; k < EVENT_TIMING.paradeSteps; k++) to = stepAhead(to);
    for (let guard = 0; guard < SPACES.length && !canStand(s, to, stall.id); guard++) to = stepAhead(to);
    if (to !== stall.pos) {
      moveStall(api, stall, to, 'parade');
      moved++;
    }
  }
  return moved;
}

/* -------------------------------- prices -------------------------------- */

function roomPrice(api: ChaosApi): number {
  const base = Number(api.ctx.settings.price) || 20;
  if (api.s.last) return Math.min(base, FINALE.price);
  if (api.s.event?.kind === 'sale') return Math.max(MIN_PRICE, Math.ceil(base / 2));
  return base;
}

function priceFor(api: ChaosApi, w: any): { price: number; ticket: boolean } {
  const room = roomPrice(api);
  const off = Math.max(MIN_PRICE, room - TICKET_DISCOUNT);
  return w.tickets > 0 && off < room ? { price: off, ticket: true } : { price: room, ticket: false };
}

function puddleToll(api: ChaosApi): number {
  return PAYOUTS.gloom * (api.s.event?.kind === 'gloomy' ? 2 : 1);
}

/* -------------------------------- events -------------------------------- */

function eventLine(kind: EventId, stalls: number): string {
  const e = ROOM_EVENTS.find((x) => x.id === kind)!;
  const text = kind === 'parade' && stalls > 1 ? 'Both stalls hop 3 spaces forward every 10 seconds.' : e.text;
  return `${e.title}. ${text}`;
}

function eventRoom(api: ChaosApi): { error: string } | null {
  const s = api.s;
  if (s.event) return { error: 'A room event is already running.' };
  if (s.last || api.now() + EVENT_TIMING.minSec * 1000 > s.lastAt) return { error: 'It is too close to Last lanterns for a room event.' };
  return null;
}

function startEvent(api: ChaosApi, kind: EventId) {
  const s = api.s;
  const now = api.now();
  s.nextEventAt = null;
  s.event = { kind, startsAt: now, endsAt: Math.min(now + EVENT_TIMING.lengthSec * 1000, s.lastAt), hops: 0 };
  s.lastEvent = kind;
  api.ctx.setTimer('event', s.event.endsAt);
  api.feed(eventLine(kind, s.stalls.length), 'big');
  if (kind === 'parade') {
    paradeHop(api);
    s.event.hops++;
    const next = s.event.startsAt + s.event.hops * EVENT_TIMING.paradeEverySec * 1000;
    if (next < s.event.endsAt) api.ctx.setTimer('parade', next);
  }
}

/* --------------------------- watching the trail --------------------------- */

/**
 * The notes a player's move has gained since this effect last looked: what
 * the trail did to them (a space paid, a puddle took, the gate, a purchase).
 */
function freshNotes(api: ChaosApi, fx: ActiveEffect, pid: string): Note[] {
  const m = walkerOf(api, pid)?.move;
  if (!m) return [];
  const seen = (fx.data.seen ??= {}) as Record<string, [number, number]>;
  const prev = seen[pid];
  const start = prev && prev[0] === m.seq ? prev[1] : 0;
  seen[pid] = [m.seq, m.notes.length];
  return m.notes.slice(start);
}

/** Start watching from now, so notes from before the cast never count. */
function watchFromNow(api: ChaosApi, fx: ActiveEffect | null, ids: readonly string[]) {
  if (!fx) return;
  const seen = (fx.data.seen ??= {}) as Record<string, [number, number]>;
  for (const pid of ids) {
    const m = walkerOf(api, pid)?.move;
    if (m) seen[pid] = [m.seq, m.notes.length];
  }
}

const puddleLoss = (n: Note) => (n.k === 'space' && n.kind === 'gloom') || (n.k === 'card' && n.card === 'gloom') ? -Number(n.coins) : 0;

/** Watch a Glim's moves: `then` runs once for each move of theirs that has finished since the effect last looked. */
function onMoveDone(api: ChaosApi, fx: ActiveEffect, pid: string, then: (w: any) => void) {
  const w = walkerOf(api, pid);
  if (!w?.move || !atRest(w)) return;
  const key = `move:${pid}`;
  if (w.move.seq <= Number(fx.data[key] ?? 0)) return;
  fx.data[key] = w.move.seq;
  then(w);
}

function rememberMoves(api: ChaosApi, fx: ActiveEffect | null, pid: string) {
  if (fx) fx.data[`move:${pid}`] = walkerOf(api, pid)?.move?.seq ?? 0;
}

/* ------------------------------- the cheats ------------------------------ */

const board: CheatDef[] = [
  {
    id: id('glim-skip'),
    name: 'Glim Skip',
    category: 'advantage',
    description: 'Your Glim skips 1 to 3 spaces forward the long way round, without taking the space it lands on. A Glim never stops on a pier, so it goes one further there; passing the Town Gate still pays its 5 coins.',
    target: 'self',
    modes: M,
    params: [{ key: 'steps', label: 'Spaces', kind: 'int', min: 1, max: 3, default: 2 }],
    cost: 20,
    cooldownMs: 25_000,
    undoable: false,
    apply: (api, c) => {
      const no = restError(api, c.caster, true);
      if (no) return no;
      const to = hopForward(api, c.caster, Number(c.params.steps));
      api.feed(`${api.name(c.caster)}’s Glim skipped ahead to ${placeName(to)}.`, 'info');
    },
  },
  {
    id: id('gust-of-gloom'),
    name: 'Gust of Gloom',
    category: 'troll',
    description: 'A gust blows an opponent’s Glim 1 to 3 spaces back the way it came (off a pier, one further), without taking the space it lands on.',
    target: 'opponent',
    modes: M,
    params: [{ key: 'steps', label: 'Spaces', kind: 'int', min: 1, max: 3, default: 2 }],
    cost: 25,
    cooldownMs: 25_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = restError(api, t);
      if (no) return no;
      const to = slipBack(api, t, Number(c.params.steps));
      api.feed(`A gust of gloom blew ${api.name(t)}’s Glim back to ${placeName(to)}.`, 'bad');
    },
  },
  {
    id: id('moonlit-trade'),
    name: 'Moonlit Trade',
    category: 'troll',
    description: 'Swap places on the board with an opponent, like the Trade places card. Neither of you may be halfway through a move.',
    target: 'opponent',
    modes: M,
    needs: TRICKS,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = restError(api, c.caster, true) ?? restError(api, t);
      if (no) return no;
      const me = walkerOf(api, c.caster);
      const them = walkerOf(api, t);
      if (me.pos === them.pos) return { error: `You are already on the same space as ${api.name(t)}.` };
      [me.pos, them.pos] = [them.pos, me.pos];
      markHit(api, t, 'trade', c.caster, 0);
      const text = `${api.name(c.caster)} traded places with ${api.name(t)} by moonlight.`;
      api.feed(text, 'info');
      addPlay(api, 'trade', c.caster, text);
    },
  },
  {
    id: id('ferrymans-favour'),
    name: 'Ferryman’s Favour',
    category: 'advantage',
    description: 'The ferryman rows your Glim straight across the river to the matching space on the other side of the loop (Kite Field to Honey Lane, Story Tent to Owl Library, and so on). Not from the shortcut, the piers, the Town Gate or Lantern Square, which have no other side.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = restError(api, c.caster, true);
      if (no) return no;
      const w = walkerOf(api, c.caster);
      const to = (LOOP - w.pos) % LOOP;
      if (w.pos >= LOOP || to === w.pos || isPier(w.pos)) return { error: 'There is no space across the river from here.' };
      w.pos = to;
      api.feed(`The ferryman rowed ${api.name(c.caster)} across the river to ${placeName(to)}.`, 'info');
    },
  },
  {
    id: id('stall-sniffer'),
    name: 'Stall Sniffer',
    category: 'advantage',
    description: 'Your Glim sniffs out the nearest Golden Lantern stall ahead and jumps to the space just behind it (two behind if that one is a pier), so your next roll walks you past it.',
    target: 'self',
    modes: M,
    cost: 50,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = restError(api, c.caster, true);
      if (no) return no;
      const w = walkerOf(api, c.caster);
      const stall = nearestStall(api.s, w.pos);
      if (!stall) return { error: 'There is no stall on the trail.' };
      let to = stepBack(stall.pos);
      while (isPier(to)) to = stepBack(to);
      if (to === w.pos || stall.pos === w.pos) return { error: 'You are already right by the stall.' };
      w.pos = to;
      api.feed(`${api.name(c.caster)} sniffed out the stall and jumped to ${placeName(to)}.`, 'info');
    },
  },
  {
    id: id('puddle-splash'),
    name: 'Puddle Splash',
    category: 'troll',
    description: 'An opponent’s Glim slips back to the nearest gloom puddle behind it and the puddle takes its usual toll from them (3 coins, or 6 on a Gloomy night).',
    target: 'opponent',
    modes: M,
    needs: PUDDLES,
    cost: 30,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = restError(api, t);
      if (no) return no;
      const w = walkerOf(api, t);
      let pos = w.pos as number;
      for (let k = 0; k < SPACES.length; k++) {
        pos = stepBack(pos);
        if (SPACES[pos]!.kind === 'gloom') break;
      }
      w.pos = pos;
      const lost = -api.add('currency', t, -puddleToll(api));
      api.feed(`${api.name(t)} slipped back into ${placeName(pos)}${lost ? ` and lost ${lost} coins` : ''}.`, 'bad');
    },
  },
  {
    id: id('glim-scramble'),
    name: 'Glim Scramble',
    category: 'random',
    description: 'Every Glim that is not halfway through a move is dealt another of those Glims’ spaces at random, so the board is mixed up. Coins, lanterns and tickets stay where they are.',
    target: 'room',
    hostile: true,
    modes: M,
    cost: 55,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const ids = api.ids().filter((p) => atRest(walkerOf(api, p)));
      const spots = ids.map((p) => walkerOf(api, p).pos as number);
      if (ids.length < 2 || new Set(spots).size < 2) return { error: 'There are not two Glims on different spaces to mix up.' };
      let dealt = api.rng.shuffle(spots);
      for (let i = 0; i < 20 && dealt.every((v, k) => v === spots[k]); i++) dealt = api.rng.shuffle(spots);
      if (dealt.every((v, k) => v === spots[k])) dealt = [...spots.slice(1), spots[0]!];
      ids.forEach((p, i) => (walkerOf(api, p).pos = dealt[i]));
      api.feed('Glim Scramble! The Glims have been mixed up all over the trail.', 'big');
    },
  },
  {
    id: id('lantern-convoy'),
    name: 'Lantern Convoy',
    category: 'advantage',
    description: 'Your team forms a convoy: every teammate who is not halfway through a move jumps to the space of whichever of you (also at rest) is fewest steps behind a Golden Lantern stall.',
    target: 'my-team',
    modes: M,
    needs: ['teams'],
    cost: 45,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const crew = c.targets.filter((p) => atRest(walkerOf(api, p)));
      const steps = (p: string) => Math.min(...s.stalls.map((st: any) => STEPS[walkerOf(api, p).pos]![st.pos]!));
      if (crew.length < 2) return { error: 'Your team needs two Glims at rest to form a convoy.' };
      const lead = crew.reduce((a, b) => (steps(b) < steps(a) ? b : a));
      const to = walkerOf(api, lead).pos;
      const moved = crew.filter((p) => walkerOf(api, p).pos !== to);
      if (!moved.length) return { error: 'Your team is already together.' };
      for (const p of moved) walkerOf(api, p).pos = to;
      api.feed(`${api.name(c.caster)}’s team formed a convoy at ${placeName(to)}.`, 'info');
    },
  },
  {
    id: id('tailwind'),
    name: 'Tailwind',
    category: 'advantage',
    description: 'For 30 seconds, after each of your moves a tailwind carries your Glim 2 more spaces the long way round, without taking the space (passing the Town Gate still pays).',
    target: 'self',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => rememberMoves(api, fx, c.caster),
    hooks: {
      tick: (api, fx) =>
        onMoveDone(api, fx, fx.caster, () => {
          const to = hopForward(api, fx.caster, 2);
          api.feed(`A tailwind carried you on to ${placeName(to)}.`, 'good', [fx.caster]);
        }),
    },
    overlay: () => ({ kind: 'badge', text: 'Tailwind +2', tone: 'good' }),
  },
  {
    id: id('hitch-a-ride'),
    name: 'Hitch a Ride',
    category: 'advantage',
    description: 'For 30 seconds you ride along with an opponent: whenever one of their moves finishes, your Glim jumps to the space they reached (if you are not halfway through a move yourself). You do not take the space.',
    target: 'opponent',
    hostile: false,
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => rememberMoves(api, fx, target(c)),
    hooks: {
      tick: (api, fx) =>
        onMoveDone(api, fx, target(fx), (tw) => {
          const me = walkerOf(api, fx.caster);
          if (!atRest(me) || me.pos === tw.pos) return;
          me.pos = tw.pos;
          api.feed(`You hitched a ride with ${api.name(target(fx))} to ${placeName(tw.pos)}.`, 'good', [fx.caster]);
        }),
    },
    overlayFor: 'caster',
    overlay: () => ({ kind: 'badge', text: 'Hitching a ride', tone: 'good' }),
  },
];

const dice: CheatDef[] = [
  {
    id: id('hot-coals'),
    name: 'Hot Coals',
    category: 'advantage',
    description: `Your answer streak jumps to ${HOT_STREAK}, so you are on a hot streak at once: every right answer rolls two dice until your next wrong answer.`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const st = walkerOf(api, c.caster)?.stream;
      if (!st) return { error: 'You have no questions in this game.' };
      if (st.streak >= HOT_STREAK) return { error: 'You are already on a hot streak.' };
      st.streak = HOT_STREAK;
      st.bestStreak = Math.max(st.bestStreak, HOT_STREAK);
      api.feed(`${api.name(c.caster)} is on a hot streak: two dice!`, 'good');
    },
  },
  {
    id: id('cold-water'),
    name: 'Bucket of Cold Water',
    category: 'troll',
    description: 'An opponent’s answer streak drops to 0, putting out a hot streak: they roll one die again until they get three right in a row.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const st = walkerOf(api, t)?.stream;
      if (!st?.streak) return { error: `${api.name(t)} has no streak to put out.` };
      const hot = st.streak >= HOT_STREAK;
      st.streak = 0;
      api.feed(hot ? `A bucket of cold water put out ${api.name(t)}’s hot streak.` : `A bucket of cold water washed away ${api.name(t)}’s streak.`, 'bad');
    },
  },
  {
    id: id('steady-hands'),
    name: 'Steady Hands',
    category: 'advantage',
    description: 'For 40 seconds a wrong answer does not break your streak: it stays where it was (so a hot streak keeps rolling two dice), though a wrong answer still gives no roll.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const st = walkerOf(api, c.caster)?.stream;
      if (!st) return { error: 'You have no questions in this game.' };
      if (fx) Object.assign(fx.data, { streak: st.streak, answered: st.answered });
    },
    hooks: {
      tick: (api, fx) => {
        const st = walkerOf(api, fx.caster)?.stream;
        if (!st) return;
        const was = Number(fx.data.streak ?? 0);
        if (st.streak === 0 && was > 0 && st.answered > Number(fx.data.answered ?? 0)) {
          st.streak = was;
          api.feed(`Steady hands: your streak of ${was} survived that one.`, 'good', [fx.caster]);
        }
        fx.data.streak = st.streak;
        fx.data.answered = st.answered;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Steady hands', tone: 'good' }),
  },
];

const choices: CheatDef[] = [
  {
    id: id('bridge-closed'),
    name: 'Old Bridge Closed',
    category: 'troll',
    description: 'For 30 seconds the shortcut is closed to every other player: whoever reaches the Crossroads is sent the long way round at once, without a choice.',
    target: 'everyone-else',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    hooks: {
      gate: (_api, _fx, _p, a: any) => (a?.type === 'fork' && a.route === 'short' ? { block: 'The Old Bridge is closed. Take the long way round.' } : undefined),
      // A choice left open would let the player pick; the long way is the only way, so the mode takes it at once.
      tick: (api, fx) => {
        for (const t of fx.targets) if (walkerOf(api, t)?.pending?.kind === 'fork') api.ctx.setTimer(`choice:${t}`, api.now());
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Old Bridge closed', tone: 'bad' }),
  },
  {
    id: id('snap-decision'),
    name: 'Snap Decision',
    category: 'troll',
    description: 'An opponent’s open choice is made for them at once, the way the game makes it when their 15 seconds run out: the long way at the Crossroads, buy the Golden Lantern if they can afford it, or play their trick card on the leader.',
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = walkerOf(api, t)?.pending;
      if (!p) return { error: `${api.name(t)} has no choice to make right now.` };
      api.ctx.setTimer(`choice:${t}`, api.now());
      api.feed(`${api.name(t)} had to make a snap decision.`, 'bad');
    },
  },
  {
    id: id('shutters-down'),
    name: 'Shutters Down',
    category: 'troll',
    description: 'For 15 seconds every Golden Lantern stall pulls its shutters down on an opponent: they cannot buy. If they stop at a stall they can walk on, or wait: the offer stays open until at least 5 seconds after the shutters lift.',
    target: 'opponent',
    modes: M,
    needs: COINS,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: 250,
    hooks: {
      gate: (_api, _fx, _p, a: any) => (a?.type === 'buy' && a.buy ? { block: 'The stall’s shutters are down for you. Walk on, or wait for them to lift.' } : undefined),
      tick: (api, fx) => {
        const t = target(fx);
        const p = walkerOf(api, t)?.pending;
        const until = fx.endsAt + 5000;
        if (p?.kind !== 'buy' || p.deadline >= until) return;
        p.deadline = until;
        api.ctx.setTimer(`choice:${t}`, until);
      },
      end: (api, fx) => {
        const t = target(fx);
        const p = walkerOf(api, t)?.pending;
        const until = api.now() + 5000;
        if (p?.kind !== 'buy' || p.deadline <= until) return;
        p.deadline = until;
        api.ctx.setTimer(`choice:${t}`, until);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'The stalls will not sell to you', until: fx.endsAt }),
  },
];

const tickets: CheatDef[] = [
  {
    id: id('forged-ticket'),
    name: 'Forged Golden Ticket',
    category: 'economy',
    description: `You get a Golden ticket: your next Golden Lantern costs ${TICKET_DISCOUNT} less (never under ${MIN_PRICE}). You can hold up to 3.`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const w = walkerOf(api, c.caster);
      if (w.tickets >= 3) return { error: 'You already hold 3 Golden tickets.' };
      w.tickets++;
      api.feed(`${api.name(c.caster)} forged a Golden ticket.`, 'info');
    },
  },
  {
    id: id('ticket-snatch'),
    name: 'Ticket Snatch',
    category: 'economy',
    description: 'Snatch one Golden ticket from an opponent who holds one.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = walkerOf(api, t);
      if (!them.tickets) return { error: `${api.name(t)} has no Golden ticket.` };
      them.tickets--;
      walkerOf(api, c.caster).tickets++;
      api.feed(`${api.name(c.caster)} snatched a Golden ticket from ${api.name(t)}.`, 'bad');
    },
  },
  {
    id: id('lantern-delivery'),
    name: 'Lantern Delivery',
    category: 'economy',
    description: 'Buy a Golden Lantern from the nearest stall ahead without walking there: you pay what you would pay at the stall (a Golden ticket counts), and the stall then moves on as it does after any purchase. Not when one more lantern would reach the lantern goal.',
    target: 'self',
    modes: M,
    needs: COINS,
    cost: 45,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const w = walkerOf(api, c.caster);
      const stall = nearestStall(s, w.pos);
      if (!stall) return { error: 'There is no stall on the trail.' };
      const nailed = nailedError(api);
      if (nailed) return nailed;
      const deal = priceFor(api, w);
      if (w.coins < deal.price) return { error: `A Golden Lantern costs you ${deal.price} coins; you have ${w.coins}.` };
      if (api.add('score', c.caster, 1) !== 1) return { error: 'One more Golden Lantern would win you the game. Buy that one at the stall.' };
      api.add('currency', c.caster, -deal.price);
      if (deal.ticket) w.tickets--;
      s.sold++;
      const [min, max] = s.last ? [FINALE.minSteps, FINALE.maxSteps] : [STALL_MOVE_MIN, Infinity];
      const to = stallSpot(api, stall, w.pos, min, max);
      if (to !== null) moveStall(api, stall, to, 'rumour');
      const text = `${api.name(c.caster)} had a Golden Lantern delivered${to !== null ? `. The stall moved to ${placeName(to)}` : ''}.`;
      api.feed(text, 'big');
      addPlay(api, 'buy', c.caster, `${api.name(c.caster)} had a Golden Lantern delivered.`);
    },
  },
  {
    id: id('lantern-lottery'),
    name: 'Lantern Lottery',
    category: 'random',
    description: `Pay 8 coins for a lottery ticket. Odds: ${odds([['a Golden Lantern', 15], ['a Golden ticket', 35], ['nothing', 50]])}. If a lantern would reach the lantern goal, you win a Golden ticket instead.`,
    target: 'self',
    modes: M,
    needs: COINS,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const w = walkerOf(api, c.caster);
      if (w.coins < 8) return { error: 'A lottery ticket costs 8 coins.' };
      api.add('currency', c.caster, -8);
      const prize = rollOdds(api, [['lantern', 15], ['ticket', 35], ['nothing', 50]] as const);
      if (prize === 'lantern' && api.add('score', c.caster, 1) === 1) {
        api.feed(`${api.name(c.caster)} won a Golden Lantern in the lottery!`, 'big');
      } else if (prize !== 'nothing') {
        w.tickets++;
        api.feed(`${api.name(c.caster)} won a Golden ticket in the lottery.`, 'good');
      } else api.feed(`${api.name(c.caster)}’s lottery ticket won nothing.`, 'info');
    },
  },
  {
    id: id('pickpocket-glim'),
    name: 'Pickpocket Glim',
    category: 'economy',
    description: `Send a Pickpocket Glim after an opponent: it takes up to ${PICKPOCKET_COINS} of their coins for you, like the chance card.`,
    target: 'opponent',
    modes: M,
    needs: [...COINS, ...TRICKS],
    cost: 20,
    cooldownMs: 30_000,
    // It also marks the trick on the victim's phone and in the room's big plays.
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const got = transfer(api, 'currency', t, c.caster, PICKPOCKET_COINS);
      if (!got) return { error: `${api.name(t)}’s purse is empty.` };
      markHit(api, t, 'pickpocket', c.caster, got);
      const text = `${api.name(c.caster)}’s Pickpocket Glim took ${got} coins from ${api.name(t)}.`;
      api.feed(text, 'bad');
      addPlay(api, 'steal', c.caster, text);
    },
  },
  {
    id: id('coin-shower'),
    name: 'Festival Coin Shower',
    category: 'economy',
    description: `A coin shower, like the chance card: every other player gets ${SHOWER_COINS.others} coins and you get ${SHOWER_COINS.you}.`,
    target: 'room',
    modes: M,
    needs: COINS,
    cost: 25,
    cooldownMs: 45_000,
    // It also lists the shower among the room's big plays.
    undoable: false,
    apply: (api, c) => {
      for (const p of api.others(c.caster)) api.add('currency', p, SHOWER_COINS.others);
      api.add('currency', c.caster, SHOWER_COINS.you);
      const text = `${api.name(c.caster)}’s coin shower: everyone gets ${SHOWER_COINS.others} coins.`;
      api.feed(text, 'good');
      addPlay(api, 'shower', c.caster, text);
    },
  },
];

const purses: CheatDef[] = [
  {
    id: id('bumper-luck'),
    name: 'Bumper Luck',
    category: 'economy',
    description: 'For 30 seconds, coin spaces and lucky fairs you land on pay you double.',
    target: 'self',
    modes: M,
    needs: COINS,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, c, fx) => watchFromNow(api, fx, [c.caster]),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if (d[fx.caster] === undefined) return;
          let extra = 0;
          for (const n of freshNotes(api, fx, fx.caster)) if (n.k === 'space' && (n.kind === 'coins' || n.kind === 'fair')) extra += Number(n.coins);
          if (extra > 0) d[fx.caster]! += extra;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Spaces pay double', tone: 'good' }),
  },
  {
    id: id('puddle-boots'),
    name: 'Puddle Boots',
    category: 'economy',
    description: 'For 60 seconds, gloom puddles take nothing from you: coins lost to a puddle space or the Gloom puddle card are handed straight back.',
    target: 'self',
    modes: M,
    needs: [...COINS, ...PUDDLES],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    priority: 50,
    apply: (api, c, fx) => watchFromNow(api, fx, [c.caster]),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if (d[fx.caster] === undefined) return;
          const back = freshNotes(api, fx, fx.caster).reduce((n, x) => n + puddleLoss(x), 0);
          if (back > 0) d[fx.caster]! += back;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Puddle boots', tone: 'good' }),
  },
  {
    id: id('gate-toll'),
    name: 'Gate Toll',
    category: 'economy',
    description: 'For 60 seconds you collect at the Town Gate: whenever an opponent walks past it, its 5 coins go to you instead of them.',
    target: 'opponent',
    modes: M,
    needs: COINS,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    priority: 10,
    apply: (api, c, fx) => watchFromNow(api, fx, [target(c)]),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          if (d[t] === undefined) return;
          const owed = freshNotes(api, fx, t).filter((n) => n.k === 'gate').reduce((n, x) => n + Number(x.coins), 0);
          const take = Math.min(owed, Math.max(0, api.get('currency', t)));
          if (take <= 0) return;
          d[t]! -= take;
          d[fx.caster] = (d[fx.caster] ?? 0) + take;
          api.feed(`${api.name(t)} paid ${take} coins at ${api.name(fx.caster)}’s gate toll.`, 'info', [t, fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Gate toll ahead', tone: 'bad' }),
  },
  {
    id: id('gloom-collector'),
    name: 'Gloom Collector',
    category: 'economy',
    description: 'For 45 seconds, every coin another player loses to a gloom puddle (a puddle space or the Gloom puddle card) is paid to you as well.',
    target: 'room',
    modes: M,
    needs: [...COINS, ...PUDDLES],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 45_000,
    priority: 30,
    apply: (api, c, fx) => watchFromNow(api, fx, api.others(c.caster)),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          let got = 0;
          for (const p of Object.keys(d)) if (p !== fx.caster) got += freshNotes(api, fx, p).reduce((n, x) => n + puddleLoss(x), 0);
          if (got > 0) d[fx.caster] = (d[fx.caster] ?? 0) + got;
        },
      },
    },
    overlayFor: 'caster',
    overlay: () => ({ kind: 'badge', text: 'Collecting the gloom', tone: 'good' }),
  },
  {
    id: id('ferry-fare'),
    name: 'Ferry Fare',
    category: 'economy',
    description: 'For 60 seconds you run the ferry: every other player who rides it pays you a fare of 3 coins (or what they have, if less).',
    target: 'room',
    modes: M,
    needs: COINS,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    tickMs: 250,
    apply: (api, c, fx) => watchFromNow(api, fx, api.others(c.caster)),
    hooks: {
      tick: (api, fx) => {
        for (const p of api.others(fx.caster)) {
          const rides = freshNotes(api, fx, p).filter((n) => n.k === 'ferry').length;
          const paid = rides ? transfer(api, 'currency', p, fx.caster, 3 * rides) : 0;
          if (paid) api.feed(`${api.name(p)} paid ${api.name(fx.caster)} a ferry fare of ${paid} coins.`, 'info', [p, fx.caster]);
        }
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Ferry fare: 3 coins', tone: 'info' }),
  },
  {
    id: id('haggler'),
    name: 'Haggler',
    category: 'economy',
    description: 'For 60 seconds you haggle at the stalls: you get half of the price of every Golden Lantern you buy back (rounded down) straight after paying.',
    target: 'self',
    modes: M,
    needs: COINS,
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 60_000,
    priority: 50,
    apply: (api, c, fx) => watchFromNow(api, fx, [c.caster]),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if (d[fx.caster] === undefined) return;
          const back = freshNotes(api, fx, fx.caster).filter((n) => n.k === 'buy').reduce((n, x) => n + Math.floor(Number(x.price) / 2), 0);
          if (back <= 0) return;
          d[fx.caster]! += back;
          api.feed(`You haggled ${back} coins back.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Haggling', tone: 'good' }),
  },
  {
    id: id('lantern-levy'),
    name: 'Lantern Levy',
    category: 'economy',
    description: 'For 60 seconds, every Golden Lantern an opponent buys costs them up to 5 more coins, paid to you.',
    target: 'opponent',
    modes: M,
    needs: COINS,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    priority: 10,
    apply: (api, c, fx) => watchFromNow(api, fx, [target(c)]),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          if (d[t] === undefined) return;
          const bought = freshNotes(api, fx, t).filter((n) => n.k === 'buy').length;
          const take = Math.min(5 * bought, Math.max(0, api.get('currency', t)));
          if (take <= 0) return;
          d[t]! -= take;
          d[fx.caster] = (d[fx.caster] ?? 0) + take;
          api.feed(`${api.name(t)} paid a lantern levy of ${take} coins to ${api.name(fx.caster)}.`, 'info', [t, fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lantern levy: +5', tone: 'bad' }),
  },
];

const EVENT_CHOICES = [
  { value: 'random', label: 'A surprise' },
  ...ROOM_EVENTS.map((e) => ({ value: e.id, label: e.title })),
] as const;

const festival: CheatDef[] = [
  {
    id: id('festival-herald'),
    name: 'Festival Herald',
    category: 'round',
    description:
      'Start a room event of your choice right now (or a surprise, never the one just before): Double dice, Lantern sale, Coin rush, Stall parade or Gloomy night, for the usual 30 seconds (less if Last lanterns comes first). The next event then follows 90 seconds after it started. Only when no event is running.',
    target: 'room',
    modes: M,
    needs: EVENTS,
    params: [{ key: 'event', label: 'Event', kind: 'choice', options: EVENT_CHOICES, default: 'random' }],
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const no = eventRoom(api);
      if (no) return no;
      const puddles = api.ctx.settings.puddles !== false;
      let kind = String(c.params.event) as EventId | 'random';
      if (kind === 'random') kind = api.rng.pick(ROOM_EVENTS.filter((e) => e.id !== api.s.lastEvent && (e.id !== 'gloomy' || puddles))).id;
      if (kind === 'gloomy' && !puddles) return { error: 'There are no gloom puddles tonight, so there is no Gloomy night.' };
      if (kind === 'parade' && nailedError(api)) return nailedError(api)!;
      startEvent(api, kind);
    },
  },
  {
    id: id('rain-on-the-parade'),
    name: 'Rain on the Parade',
    category: 'round',
    description: 'The room event that is running ends at once. The next one still comes 90 seconds after this one started.',
    target: 'room',
    modes: M,
    needs: EVENTS,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (!s.event) return { error: 'No room event is running.' };
      const title = ROOM_EVENTS.find((e) => e.id === s.event.kind)!.title;
      const at = s.event.startsAt + EVENT_TIMING.everySec * 1000;
      s.event = null;
      api.ctx.clearTimer('parade');
      if (at + EVENT_TIMING.minSec * 1000 <= s.lastAt) {
        s.nextEventAt = at;
        api.ctx.setTimer('event', at);
      } else {
        s.nextEventAt = null;
        api.ctx.clearTimer('event');
      }
      api.feed(`Rain on the parade: ${title} is over early.`, 'bad');
    },
  },
  {
    id: id('encore'),
    name: 'Encore!',
    category: 'round',
    description: 'The room event that is running lasts 20 seconds longer (never past the start of Last lanterns).',
    target: 'room',
    modes: M,
    needs: EVENTS,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      const e = s.event;
      if (!e) return { error: 'No room event is running.' };
      const endsAt = Math.min(e.endsAt + 20_000, s.lastAt);
      if (endsAt <= e.endsAt) return { error: 'Last lanterns starts when this event ends, so it cannot run longer.' };
      e.endsAt = endsAt;
      api.ctx.setTimer('event', endsAt);
      // A parade whose next hop fell after the old end gets that hop back.
      const next = e.startsAt + e.hops * EVENT_TIMING.paradeEverySec * 1000;
      if (e.kind === 'parade' && !api.ctx.hasTimer('parade') && next < endsAt) api.ctx.setTimer('parade', Math.max(api.now(), next));
      api.feed(`Encore! ${ROOM_EVENTS.find((x) => x.id === e.kind)!.title} lasts 20 seconds longer.`, 'good');
    },
  },
  {
    id: id('parade-hop'),
    name: 'Stall Parade Hop',
    category: 'round',
    description: 'Every Golden Lantern stall hops 3 spaces forward round the loop at once, as in a Stall parade (further if it would land where a stall cannot stand).',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api) => {
      const no = nailedError(api);
      if (no) return no;
      if (!paradeHop(api)) return { error: 'The stalls have nowhere to hop to.' };
      api.feed('The stalls did a parade hop.', 'info');
    },
  },
];

const stalls: CheatDef[] = [
  {
    id: id('whispered-rumour'),
    name: 'Whispered Rumour',
    category: 'advantage',
    description: 'Whisper a stall rumour, like the chance card: the nearest Golden Lantern stall (either way round) moves 3 spaces towards you, stopping on your space at most.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = nailedError(api);
      if (no) return no;
      const to = rumour(api, c.caster);
      if (to === null) return { error: 'The nearest stall is already with you.' };
      const text = to === walkerOf(api, c.caster).pos ? `A whispered rumour brought the stall right to ${api.name(c.caster)}.` : `A whispered rumour moved the stall to ${placeName(to)}.`;
      api.feed(text, 'info');
      addPlay(api, 'rumour', c.caster, text);
    },
  },
  {
    id: id('shoo-the-stall'),
    name: 'Shoo the Stall',
    category: 'troll',
    description: `The Golden Lantern stall nearest ahead of an opponent is shooed away to a random space at least ${STALL_MOVE_MIN} steps ahead of them, as if someone had just bought from it.`,
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = nailedError(api);
      if (no) return no;
      const t = target(c);
      const from = walkerOf(api, t).pos;
      const stall = nearestStall(api.s, from);
      const to = stall ? stallSpot(api, stall, from, STALL_MOVE_MIN, Infinity) : null;
      if (to === null) return { error: 'There is nowhere to shoo the stall to.' };
      moveStall(api, stall, to, 'rumour');
      api.feed(`${api.name(c.caster)} shooed the stall away from ${api.name(t)} to ${placeName(to)}.`, 'bad');
    },
  },
  {
    id: id('stall-shuffle'),
    name: 'Stall Shuffle',
    category: 'random',
    description: 'Every Golden Lantern stall jumps to a random new space anywhere on the trail where a stall can stand.',
    target: 'room',
    hostile: true,
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const no = nailedError(api);
      if (no) return no;
      const s = api.s;
      const spots: string[] = [];
      for (const stall of s.stalls) {
        const free = SPACES.filter((sp) => canStand(s, sp.id, stall.id) && sp.id !== stall.pos).map((sp) => sp.id);
        if (!free.length) continue;
        const to = api.rng.pick(free);
        moveStall(api, stall, to, 'rumour');
        spots.push(placeName(to));
      }
      if (!spots.length) return { error: 'The stalls have nowhere to go.' };
      api.feed(`Stall shuffle! The stalls are now at ${spots.join(' and ')}.`, 'big');
    },
  },
  {
    id: id('popup-stall'),
    name: 'Pop-up Stall',
    category: 'economy',
    description: `For 40 seconds a second Golden Lantern stall pops up on a random space well away from the first (at least ${STALL_MOVE_MIN} steps either way where it can). It sells and moves on like any stall, then packs up when the time is over. Only in games with one stall.`,
    target: 'room',
    modes: M,
    cost: 40,
    cooldownMs: 90_000,
    durationMs: 40_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const s = api.s;
      if (s.stalls.length !== 1) return { error: 'There is already more than one stall.' };
      const first = s.stalls[0];
      const nid = first.id + 1;
      const free = SPACES.filter((sp) => canStand(s, sp.id, nid) && sp.id !== first.pos).map((sp) => sp.id);
      const apart = free.filter((n) => Math.min(STEPS[n]![first.pos]!, STEPS[first.pos]![n]!) >= STALL_MOVE_MIN);
      const pos = api.rng.pick(apart.length ? apart : free);
      s.stalls.push({ id: nid, pos, from: null, movedAt: api.now(), why: 'start', n: 0 });
      if (fx) fx.data.stall = nid;
      api.feed(`${api.name(c.caster)} opened a pop-up stall at ${placeName(pos)}.`, 'big');
    },
    hooks: {
      end: (api, fx) => {
        const s = api.s;
        const stall = s.stalls.find((x: any) => x.id === fx.data.stall);
        if (!stall) return;
        s.stalls = s.stalls.filter((x: any) => x !== stall);
        for (const [pid, w] of Object.entries<any>(s.walkers)) if (w.pending?.kind === 'buy' && w.pending.stall === stall.id) api.ctx.setTimer(`choice:${pid}`, api.now());
        api.feed('The pop-up stall packed up.', 'info');
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'countdown', label: 'Pop-up stall', until: fx.endsAt }),
  },
  {
    id: id('nailed-down'),
    name: 'Nailed Down',
    category: 'round',
    description: 'For 30 seconds every Golden Lantern stall is nailed to its space: after a purchase, a parade hop or a rumour it is put straight back where it was, so the room can keep buying there.',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, _c, fx) => {
      if (fx) fx.data.pos = Object.fromEntries(api.s.stalls.map((x: any) => [x.id, x.pos]));
    },
    hooks: {
      tick: (api, fx) => {
        const s = api.s;
        const pos = fx.data.pos as Record<string, number>;
        for (const stall of s.stalls) {
          const want = pos[stall.id];
          if (want === undefined) pos[stall.id] = stall.pos;
          else if (stall.pos !== want && canStand(s, want, stall.id)) {
            moveStall(api, stall, want, 'rumour');
            api.feed(`The stall is nailed down: it is back at ${placeName(want)}.`, 'info');
          }
        }
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Stalls nailed down', tone: 'info' }),
  },
  {
    id: id('wishing-well'),
    name: 'Wishing Well Coin',
    category: 'random',
    description: `Throw a coin in the wishing well. Odds: ${odds([['your Glim skips 3 spaces forward', 30], ['a Golden ticket', 20], ['the nearest stall moves 3 spaces towards you', 20], ['8 coins', 15], ['your Glim slips 2 spaces back', 15]])}. If the stall is already with you, you get the 8 coins instead. Only while you are not halfway through a move.`,
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = restError(api, c.caster, true);
      if (no) return no;
      const me = api.name(c.caster);
      const wish = rollOdds(api, [['skip', 30], ['ticket', 20], ['rumour', 20], ['coins', 15], ['slip', 15]] as const);
      if (wish === 'skip') return void api.feed(`The wishing well sent ${me} skipping ahead to ${placeName(hopForward(api, c.caster, 3))}.`, 'good');
      if (wish === 'slip') return void api.feed(`The wishing well tipped ${me} back to ${placeName(slipBack(api, c.caster, 2))}.`, 'bad');
      if (wish === 'ticket') {
        walkerOf(api, c.caster).tickets++;
        return void api.feed(`The wishing well gave ${me} a Golden ticket.`, 'good');
      }
      const to = wish === 'rumour' && !nailedError(api) ? rumour(api, c.caster) : null;
      if (to !== null) return void api.feed(`The wishing well moved the stall to ${placeName(to)}.`, 'good');
      api.add('currency', c.caster, 8);
      api.feed(`The wishing well gave ${me} 8 coins.`, 'good');
    },
  },
];

const cheats: CheatDef[] = [...board, ...dice, ...choices, ...tickets, ...purses, ...festival, ...stalls];

defineCheats(cheats);
