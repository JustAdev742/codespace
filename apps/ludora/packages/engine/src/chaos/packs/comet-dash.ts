import { draw } from '../../questions/deck.ts';
import { MOMENTUM_CAP, WORMHOLE_JUMP } from '../../modes/comet-dash/index.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { inGame, odds, rollOdds, target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Comet Dash: they work on the comet trail
 * itself (spaces, star gates, wormholes) and on the race's own rules (boosts,
 * momentum, slipstream, tailwind, setbacks). Positions move through the
 * 'score' meter, which stops a space short of the line: only an answer can
 * carry a comet across it, because finishing hands out places and may end
 * the race.
 */

const MODE = 'comet-dash';

interface Racer {
  pos: number;
  stream: StreamState;
  place: number | null;
  lastMove: { gain: number; notes: string[] } | null;
}

interface RaceSettings {
  distance: number;
  boostEvery: number;
  slipstream: boolean;
  wrongSetback: boolean;
  momentum: boolean;
  starGates: number;
  tailwind: boolean;
  wormholes: boolean;
}

const settingsOf = (api: ChaosApi) => api.ctx.settings as unknown as RaceSettings;
const distance = (api: ChaosApi) => Number(settingsOf(api).distance);
const racerOf = (api: ChaosApi, id: PlayerId): Racer | undefined => api.s.racers[id];

/** A racer still on the track (in the game and not yet over the line). */
function racing(api: ChaosApi, id: PlayerId): Racer | null {
  const r = racerOf(api, id);
  return r && r.place === null && inGame(api, id) ? r : null;
}

function needRacing(api: ChaosApi, id: PlayerId, self: boolean): Racer | { error: string } {
  const r = racing(api, id);
  if (r) return r;
  return { error: self ? 'You have already crossed the line.' : `${api.name(id)} has already crossed the line.` };
}

const isErr = (x: unknown): x is { error: string } => Boolean(x && typeof x === 'object' && 'error' in x);

/** Ids of every racer still on the track. */
const onTrack = (api: ChaosApi) => api.ids().filter((id) => racing(api, id));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Whether this move (the racer's last, made in the transaction a delta hook is looking at) carried a note. */
const noted = (r: Racer, note: string) => Boolean(r.lastMove?.notes.includes(note));

/** The mode's tailwind test, on positions from before the move being bent. */
function inBackHalf(api: ChaosApi, id: PlayerId, myPos: number): boolean {
  const ids = api.ids().filter((x) => racerOf(api, x));
  if (ids.length < 2) return false;
  const ahead = ids.filter((o) => o !== id && (racerOf(api, o)!.place !== null || racerOf(api, o)!.pos > myPos)).length;
  return ahead + 1 > Math.ceil(ids.length / 2);
}

/** The star gate at or behind a space (0 is the start). */
const gateAtOrBehind = (pos: number, every: number) => Math.floor(pos / every) * every;

/** Spaces where the mode itself may put a wormhole: never near the start or the line. */
const wormholeSpace = (api: ChaosApi, space: number) => space >= 2 && space <= distance(api) - 4;

/** Counters to notice answers between ticks. */
function answersSince(fx: ActiveEffect, r: Racer): { wrong: number; right: number } {
  const a = Number(fx.data.answered ?? r.stream.answered);
  const c = Number(fx.data.correct ?? r.stream.correct);
  const right = r.stream.correct - c;
  const wrong = r.stream.answered - a - right;
  fx.data.answered = r.stream.answered;
  fx.data.correct = r.stream.correct;
  return { wrong: Math.max(0, wrong), right: Math.max(0, right) };
}

function remember(fx: ActiveEffect, r: Racer) {
  fx.data.answered = r.stream.answered;
  fx.data.correct = r.stream.correct;
}

function setStreak(r: Racer, streak: number) {
  r.stream.streak = streak;
  r.stream.bestStreak = Math.max(r.stream.bestStreak, streak);
}

const cheats: CheatDef[] = [
  /* ------------------------------ moving comets ----------------------------- */
  {
    id: 'comet-dash.afterburner',
    name: 'Comet Afterburner',
    category: 'advantage',
    description: 'Your comet jumps 2 spaces forward along the trail. It always stops at least one space short of the finish line.',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 35_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      if (!api.add('score', c.caster, 2)) return { error: 'You are one space from the line: only an answer can carry you over it.' };
    },
  },
  {
    id: 'comet-dash.tractor-beam',
    name: 'Comet Tractor Beam',
    category: 'troll',
    description: 'Drags an opponent\'s comet 2 spaces back along the trail (never behind the start).',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 35_000,
    apply: (api, c) => {
      const t = target(c);
      const r = needRacing(api, t, false);
      if (isErr(r)) return r;
      if (!api.add('score', t, -2)) return { error: `${api.name(t)} is still on the start line.` };
    },
  },
  {
    id: 'comet-dash.slingshot',
    name: 'Comet Slingshot',
    category: 'advantage',
    description: 'If a comet is up to 3 spaces ahead of you (slipstream range), you whip around it and land one space in front of it.',
    target: 'self',
    modes: [MODE],
    cost: 35,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const me = needRacing(api, c.caster, true);
      if (isErr(me)) return me;
      const ahead = onTrack(api)
        .filter((id) => id !== c.caster && racerOf(api, id)!.pos > me.pos && racerOf(api, id)!.pos - me.pos <= 3)
        .sort((a, b) => racerOf(api, a)!.pos - racerOf(api, b)!.pos);
      const rival = ahead[0];
      if (!rival) return { error: 'No comet is within 3 spaces ahead of you to slingshot around.' };
      const to = racerOf(api, rival)!.pos + 1;
      if (to > distance(api) - 1) return { error: `${api.name(rival)} is right at the line: there is no room to land in front.` };
      api.set('score', c.caster, to);
      api.feed(`${api.name(c.caster)} slingshot around ${api.name(rival)}.`, 'info');
    },
  },
  {
    id: 'comet-dash.gravity-well',
    name: 'Comet Gravity Well',
    category: 'troll',
    description: 'Every other comet still racing within 3 spaces of you (ahead or behind) is pulled onto your space.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    cost: 45,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const me = needRacing(api, c.caster, true);
      if (isErr(me)) return me;
      const near = onTrack(api).filter((id) => id !== c.caster && racerOf(api, id)!.pos !== me.pos && Math.abs(racerOf(api, id)!.pos - me.pos) <= 3);
      if (!near.length) return { error: 'No comet is within 3 spaces of you.' };
      for (const id of near) api.set('score', id, me.pos);
      api.feed(`${api.name(c.caster)}'s gravity well pulled in ${near.map((id) => api.name(id)).join(', ')}.`, 'big');
    },
  },
  {
    id: 'comet-dash.supernova',
    name: 'Comet Supernova',
    category: 'troll',
    description: 'Your comet flares: every other comet still racing within 2 spaces of you (ahead, level or behind) is blasted 2 spaces back.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    cost: 45,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const me = needRacing(api, c.caster, true);
      if (isErr(me)) return me;
      const near = onTrack(api).filter((id) => id !== c.caster && Math.abs(racerOf(api, id)!.pos - me.pos) <= 2);
      const hit = near.filter((id) => api.add('score', id, -2) !== 0);
      if (!hit.length) return { error: 'No comet within 2 spaces of you has anywhere to be blasted back to.' };
      api.feed(`${api.name(c.caster)} went supernova: ${hit.map((id) => api.name(id)).join(', ')} blasted back.`, 'big');
    },
  },
  {
    id: 'comet-dash.solar-flare',
    name: 'Comet Solar Flare',
    category: 'random',
    description: `A flare washes over the whole trail: every comet still racing is pushed one space. Odds for each comet: ${odds([['one space forward', 60], ['one space back', 40]])}. Nobody is pushed over the line or behind the start.`,
    target: 'room',
    hostile: false,
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api) => {
      const moved: string[] = [];
      for (const id of onTrack(api)) {
        const step = rollOdds(api, [[1, 60], [-1, 40]]);
        if (api.add('score', id, step)) moved.push(`${api.name(id)} ${step > 0 ? '+1' : '−1'}`);
      }
      if (!moved.length) return { error: 'Nobody on the trail could be pushed either way.' };
      api.feed(`Solar flare: ${moved.join(', ')}.`, 'info');
    },
  },
  {
    id: 'comet-dash.blind-jump',
    name: 'Comet Blind Hyperjump',
    category: 'random',
    description: `Your comet jumps blind to a new point on the trail. Odds: ${odds([['back to the start', 35], ['the middle of the trail', 45], ['three spaces short of the line', 20]])}. If you are already there, you go one space on instead.`,
    target: 'self',
    modes: [MODE],
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const me = needRacing(api, c.caster, true);
      if (isErr(me)) return me;
      const d = distance(api);
      const where = rollOdds(api, [['start', 35], ['middle', 45], ['near', 20]] as const);
      let to = where === 'start' ? 0 : where === 'middle' ? Math.floor(d / 2) : d - 3;
      if (to === me.pos) to = me.pos + 1;
      if (!api.set('score', c.caster, to)) return { error: 'The jump would land you where you already are.' };
      api.feed(`${api.name(c.caster)} hyperjumped blind to space ${racerOf(api, c.caster)!.pos}.`, where === 'start' ? 'bad' : 'good');
    },
  },
  {
    id: 'comet-dash.space-mine',
    name: 'Comet Asteroid Patch',
    category: 'troll',
    description: 'Puts an asteroid patch on the space just ahead of an opponent for 30 seconds. The first time they reach or pass it, it bumps them back to two spaces behind the patch.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 30_000,
    priority: 5,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const t = target(c);
      const r = needRacing(api, t, false);
      if (isErr(r)) return r;
      const mine = r.pos + 1;
      if (mine >= distance(api)) return { error: `${api.name(t)} is right at the line: there is no space ahead for an asteroid patch.` };
      fx!.data.mine = mine;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const r = racing(api, t);
          const move = d[t] ?? 0;
          if (!r || move <= 0) return;
          const mine = Number(fx.data.mine);
          // This hook runs first, so d is still the mode's own move.
          const from = r.pos - move;
          if (from >= mine || r.pos < mine) return;
          d[t] = Math.max(0, mine - 2) - from;
          api.feed(`${api.name(t)} bumped into an asteroid patch at space ${mine}.`, 'bad');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Asteroids at space ${Number(fx.data.mine)}`, tone: 'bad' }),
  },

  /* ------------------------------ streaks and boosts ----------------------------- */
  {
    id: 'comet-dash.ignition',
    name: 'Comet Ignition Sequence',
    category: 'advantage',
    description: 'Your answer streak jumps to one short of your next boost, so your next correct answer boosts. With momentum on, it jumps to 2, so your next correct answer flies the full 3 spaces. A streak can never be longer than your correct answers so far.',
    target: 'self',
    modes: [MODE],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      const st = settingsOf(api);
      const s = r.stream.streak;
      const want = st.momentum ? MOMENTUM_CAP - 1 : (Math.floor(s / st.boostEvery) + 1) * st.boostEvery - 1;
      const to = Math.min(want, r.stream.correct);
      if (to <= s) return { error: s >= want ? 'Your streak is already primed for the next boost.' : 'You need more correct answers before your streak can be primed.' };
      setStreak(r, to);
      api.feed(`${api.name(c.caster)}'s engines are primed: streak ${to}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'comet-dash.flameout',
    name: 'Comet Flameout',
    category: 'troll',
    description: 'Snuffs out an opponent\'s answer streak: it drops to 0, so their next boost (or momentum) has to be built again from scratch.',
    target: 'opponent',
    modes: [MODE],
    cost: 25,
    cooldownMs: 35_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const r = needRacing(api, t, false);
      if (isErr(r)) return r;
      if (r.stream.streak <= 0) return { error: `${api.name(t)} has no streak to snuff out.` };
      r.stream.streak = 0;
      api.feed(`${api.name(t)}'s comet flamed out. Streak lost.`, 'bad');
    },
  },
  {
    id: 'comet-dash.tail-grab',
    name: 'Comet Tail Grab',
    category: 'troll',
    description: 'Grab an opponent\'s answer streak: your streak becomes theirs (no longer than your own correct answers so far) and theirs drops to 0.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = needRacing(api, t, false);
      if (isErr(them)) return them;
      const me = needRacing(api, c.caster, true);
      if (isErr(me)) return me;
      const got = Math.min(them.stream.streak, me.stream.correct);
      if (got <= me.stream.streak) return { error: `${api.name(t)}'s streak is no longer than yours.` };
      setStreak(me, got);
      them.stream.streak = 0;
      api.feed(`${api.name(c.caster)} grabbed ${api.name(t)}'s tail: a streak of ${got}.`, 'big');
    },
  },
  {
    id: 'comet-dash.hair-trigger',
    name: 'Comet Hair-Trigger Boost',
    category: 'advantage',
    description: 'For 25 seconds your boost comes every 2 correct answers in a row instead of the race\'s usual number: one extra space on every second answer of a streak.',
    target: 'self',
    modes: [MODE],
    needs: ['boost'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 25_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      if (settingsOf(api).boostEvery <= 2) return { error: 'Boosts already come every 2 answers in this race.' };
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const r = racing(api, fx.caster);
          if (!r || (d[fx.caster] ?? 0) <= 0 || r.stream.streak % 2 !== 0 || noted(r, 'Boost')) return;
          d[fx.caster]! += 1;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Boost every 2', tone: 'good' }),
  },
  {
    id: 'comet-dash.full-throttle',
    name: 'Comet Full Throttle',
    category: 'advantage',
    description: 'For 20 seconds your momentum is always full: every correct answer moves you 3 spaces, whatever your streak.',
    target: 'self',
    modes: [MODE],
    needs: ['momentum'],
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 20_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const r = racing(api, fx.caster);
          if (!r || (d[fx.caster] ?? 0) <= 0 || !r.lastMove || r.lastMove.gain <= 0) return;
          const base = Math.min(MOMENTUM_CAP, Math.max(1, r.stream.streak));
          if (base < MOMENTUM_CAP) d[fx.caster]! += MOMENTUM_CAP - base;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Full throttle', tone: 'good' }),
  },
  {
    id: 'comet-dash.boost-hijack',
    name: 'Comet Boost Hijack',
    category: 'troll',
    description: 'For 25 seconds, the extra spaces an opponent earns from boosts or momentum go to your comet instead of theirs.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 25_000,
    priority: 10,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const r = racing(api, t);
          if (!r || (d[t] ?? 0) <= 0) return;
          let extra = 0;
          if (noted(r, 'Boost')) extra += 1;
          if (noted(r, 'Momentum')) extra += Math.min(MOMENTUM_CAP, r.stream.streak) - 1;
          extra = Math.min(extra, d[t]! - 1);
          if (extra <= 0) return;
          d[t]! -= extra;
          if (racing(api, fx.caster)) d[fx.caster] = (d[fx.caster] ?? 0) + extra;
          api.feed(`${api.name(fx.caster)} hijacked ${plural(extra, 'space', 'spaces')} of ${api.name(t)}'s boost.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Boost hijacked', tone: 'bad' }),
  },
  {
    id: 'comet-dash.streak-saver',
    name: 'Comet Streak Stabiliser',
    category: 'advantage',
    description: 'Within the next 40 seconds, your first wrong answer does not break your answer streak (any setback it causes still happens).',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 40_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      remember(fx!, r);
      fx!.data.streak = r.stream.streak;
    },
    hooks: {
      tick: (api, fx) => {
        const r = racing(api, fx.caster);
        if (!r) return;
        const saved = Number(fx.data.streak ?? 0);
        const { wrong } = answersSince(fx, r);
        if (wrong > 0 && saved > 0 && r.stream.streak < saved) {
          setStreak(r, saved + r.stream.streak);
          api.feed(`${api.name(fx.caster)}'s stabiliser kept a streak of ${r.stream.streak} alive.`, 'good');
          api.endEffect(fx.eid, 'used');
          return;
        }
        fx.data.streak = r.stream.streak;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Streak safe', tone: 'good' }),
  },

  /* ------------------------------ slipstream and tailwind ----------------------------- */
  {
    id: 'comet-dash.slipstream-lock',
    name: 'Comet Slipstream Lock',
    category: 'advantage',
    description: 'For 25 seconds you always get the slipstream space when you answer correctly, even with no comet just ahead of you (never twice for one answer).',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 25_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const r = racing(api, fx.caster);
          if (!r || (d[fx.caster] ?? 0) <= 0 || !r.lastMove || r.lastMove.gain <= 0 || noted(r, 'Slipstream')) return;
          d[fx.caster]! += 1;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Slipstream locked', tone: 'good' }),
  },
  {
    id: 'comet-dash.wake-turbulence',
    name: 'Comet Wake Turbulence',
    category: 'troll',
    description: 'For 20 seconds, an opponent gets no extra space from slipstream or tailwind: your wake knocks it out of every answer that would have earned one.',
    target: 'opponent',
    modes: [MODE],
    needs: ['drafting'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const r = racing(api, t);
          if (!r || (d[t] ?? 0) <= 0) return;
          const lost = (noted(r, 'Slipstream') ? 1 : 0) + (noted(r, 'Tailwind') ? 1 : 0);
          if (lost) d[t] = Math.max(0, d[t]! - lost);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'No slipstream', tone: 'bad' }),
  },
  {
    id: 'comet-dash.rubber-band',
    name: 'Comet Trail Rubber Band',
    category: 'round',
    description: 'For 30 seconds the race has tailwind: comets in the back half of the field move one extra space for every correct answer. Only works when the race does not already have tailwind.',
    target: 'room',
    hostile: false,
    modes: [MODE],
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 30_000,
    apply: (api) => (settingsOf(api).tailwind ? { error: 'This race already has tailwind.' } : undefined),
    hooks: {
      delta: {
        score: (api, _fx, d) => {
          for (const id of Object.keys(d)) {
            const r = racing(api, id);
            if (!r || d[id]! <= 0 || !r.lastMove || r.lastMove.gain <= 0) continue;
            if (inBackHalf(api, id, r.pos - d[id]!)) d[id]! += 1;
          }
        },
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Tailwind for the back half', tone: 'info' }),
  },

  /* ------------------------------ wrong answers and setbacks ----------------------------- */
  {
    id: 'comet-dash.meteor-shower',
    name: 'Comet Meteor Shower',
    category: 'troll',
    description: 'For 25 seconds, every wrong answer an opponent gives knocks their comet one space back, on top of any setback the race itself gives.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 25_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const r = needRacing(api, target(c), false);
      if (isErr(r)) return r;
      remember(fx!, r);
    },
    hooks: {
      tick: (api, fx) => {
        const t = target(fx);
        const r = racing(api, t);
        if (!r) return;
        const { wrong } = answersSince(fx, r);
        if (wrong > 0 && api.add('score', t, -wrong)) api.feed(`A meteor knocked ${api.name(t)} back.`, 'bad');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Meteor shower', tone: 'bad' }),
  },
  {
    id: 'comet-dash.rewind',
    name: 'Comet Trail Rewind',
    category: 'advantage',
    description: 'Undo your last setback: if your last answer knocked you back, your comet gets those spaces back.',
    target: 'self',
    modes: [MODE],
    needs: ['setbacks'],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      const lost = r.lastMove && r.lastMove.gain < 0 ? -r.lastMove.gain : 0;
      if (!lost) return { error: 'Your last answer did not knock you back.' };
      const back = api.add('score', c.caster, lost);
      if (!back) return { error: 'There is no room to rewind.' };
      r.lastMove = { gain: back, notes: ['Rewind'] };
      api.feed(`${api.name(c.caster)} rewound the trail: +${plural(back, 'space', 'spaces')}.`, 'good');
    },
  },
  {
    id: 'comet-dash.gate-anchor',
    name: 'Comet Star Gate Anchor',
    category: 'advantage',
    description: 'For 30 seconds, a wrong answer only sends you back one space instead of all the way to your last star gate.',
    target: 'self',
    modes: [MODE],
    needs: ['star-gates'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 50,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if (!racing(api, fx.caster) || (d[fx.caster] ?? 0) >= -1) return;
          d[fx.caster] = -1;
          api.feed(`${api.name(fx.caster)}'s anchor held: back one space, not to the gate.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Anchored', tone: 'good' }),
  },
  {
    id: 'comet-dash.gate-collapse',
    name: 'Comet Star Gate Collapse',
    category: 'troll',
    description: 'Sends an opponent straight back to the last star gate they passed (or the start), as if they had just answered wrong.',
    target: 'opponent',
    modes: [MODE],
    needs: ['star-gates'],
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const r = needRacing(api, t, false);
      if (isErr(r)) return r;
      const gate = gateAtOrBehind(r.pos, settingsOf(api).starGates);
      if (gate === r.pos) return { error: `${api.name(t)} is sitting on a star gate already.` };
      api.set('score', t, gate);
      api.feed(`The star gate collapsed under ${api.name(t)}: back to ${gate > 0 ? `space ${gate}` : 'the start'}.`, 'bad');
    },
  },
  {
    id: 'comet-dash.gate-hop',
    name: 'Comet Star Gate Hop',
    category: 'advantage',
    description: 'Your comet hops forward to the next star gate on the trail, where a wrong answer can no longer send you behind it. Not when the next gate is the finish line.',
    target: 'self',
    modes: [MODE],
    needs: ['star-gates'],
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      const every = settingsOf(api).starGates;
      const next = gateAtOrBehind(r.pos, every) + every;
      if (next >= distance(api)) return { error: 'The next star gate is the finish line: only an answer can take you there.' };
      api.set('score', c.caster, next);
    },
  },

  /* ------------------------------ wormholes ----------------------------- */
  {
    id: 'comet-dash.plant-wormhole',
    name: 'Comet Wormhole Seeder',
    category: 'advantage',
    description: 'Plants a new hidden wormhole on a random free space 1 to 3 spaces ahead of you. Only you are told where. Anyone who lands on it by answering is thrown 3 spaces ahead, as with any wormhole.',
    target: 'self',
    modes: [MODE],
    needs: ['wormholes'],
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      const holes: number[] = api.s.wormholes;
      const free = [1, 2, 3].map((k) => r.pos + k).filter((x) => wormholeSpace(api, x) && !holes.includes(x));
      if (!free.length) return { error: 'There is no free space 1 to 3 spaces ahead where a wormhole can open.' };
      const at = api.rng.pick(free);
      holes.push(at);
      holes.sort((a, b) => a - b);
      api.feed(`You planted a wormhole at space ${at}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'comet-dash.collapse-wormhole',
    name: 'Comet Wormhole Collapse',
    category: 'troll',
    description: 'Collapses the nearest hidden wormhole ahead of an opponent, so it is gone for everyone. The trail always keeps at least one wormhole.',
    target: 'opponent',
    modes: [MODE],
    needs: ['wormholes'],
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const r = needRacing(api, t, false);
      if (isErr(r)) return r;
      const holes: number[] = api.s.wormholes;
      const next = holes.find((w) => w > r.pos);
      if (next === undefined) return { error: `There is no wormhole left ahead of ${api.name(t)}.` };
      if (holes.length <= 1) return { error: 'That is the last wormhole on the trail.' };
      holes.splice(holes.indexOf(next), 1);
      api.feed(`A wormhole ahead of ${api.name(t)} collapsed.`, 'info');
    },
  },
  {
    id: 'comet-dash.wormhole-dowsing',
    name: 'Comet Wormhole Dowsing',
    category: 'advantage',
    description: 'Moves your comet to one space short of the nearest hidden wormhole ahead of you, if it is 2 to 5 spaces away, so a one-space move lands you on it.',
    target: 'self',
    modes: [MODE],
    needs: ['wormholes'],
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      const next = (api.s.wormholes as number[]).find((w) => w > r.pos);
      if (next === undefined || next - r.pos < 2 || next - r.pos > 5) return { error: 'No wormhole is 2 to 5 spaces ahead of you.' };
      api.set('score', c.caster, next - 1);
      api.feed(`Your dowsing rod twitches: a wormhole is one space ahead.`, 'good', [c.caster]);
    },
  },
  {
    id: 'comet-dash.wormhole-shuffle',
    name: 'Comet Wormhole Reshuffle',
    category: 'round',
    description: `Every hidden wormhole on the trail closes and the same number open again on new random spaces (never near the start or the line). Each jump still throws a comet ${WORMHOLE_JUMP} spaces ahead.`,
    target: 'room',
    hostile: false,
    modes: [MODE],
    needs: ['wormholes'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const old: number[] = api.s.wormholes;
      const spaces = Array.from({ length: Math.max(0, distance(api) - 5) }, (_, i) => i + 2);
      for (let i = 0; i < 10; i++) {
        const fresh = api.rng.shuffle(spaces).slice(0, old.length);
        if (fresh.length && fresh.sort((a, b) => a - b).join() !== old.join()) {
          api.s.wormholes = fresh;
          api.feed('The wormholes on the trail have moved.', 'info');
          return;
        }
      }
      return { error: 'The wormholes could not find anywhere new to go.' };
    },
  },

  /* ------------------------------ questions and the clock ----------------------------- */
  {
    id: 'comet-dash.reroute',
    name: 'Comet Nav Reroute',
    category: 'advantage',
    description: 'Swaps the question on your screen for the next one in your pile, with no penalty and no move.',
    target: 'self',
    modes: [MODE],
    cost: 15,
    cooldownMs: 25_000,
    undoable: false,
    apply: (api, c) => {
      const r = needRacing(api, c.caster, true);
      if (isErr(r)) return r;
      if (!r.stream.iid) return { error: 'There is no question on your screen.' };
      const old = api.ctx.questions.instance(r.stream.iid).qid;
      let qid = draw(r.stream.deck, api.rng);
      if (qid === old && api.ctx.questions.count() > 1) qid = draw(r.stream.deck, api.rng);
      r.stream.iid = api.ctx.questions.present(qid);
    },
  },
  {
    id: 'comet-dash.engine-stall',
    name: 'Comet Engine Stall',
    category: 'troll',
    description: 'An opponent\'s engine stalls for 8 seconds: they cannot answer until it restarts.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 8_000,
    apply: (api, c) => {
      const r = needRacing(api, target(c), false);
      if (isErr(r)) return r;
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const r = racing(api, id);
        const a = action as { type?: string; iid?: string };
        if (!r || a?.type !== 'answer' || a.iid !== r.stream.iid) return;
        return { block: 'Engine stall! Your comet cannot answer until it restarts.' };
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Engine stalled', until: fx.endsAt }),
  },
  {
    id: 'comet-dash.time-dilation',
    name: 'Comet Time Dilation',
    category: 'round',
    description: 'Adds 30 seconds to the race clock, never leaving more time than the race started with. Only in races with a time limit.',
    target: 'room',
    hostile: false,
    modes: [MODE],
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const endsAt: number | null = api.s.endsAt;
      if (endsAt === null) return { error: 'This race has no clock to stretch.' };
      const most = api.now() + api.ctx.common.timeLimitSec * 1000;
      const to = Math.min(endsAt + 30_000, most);
      if (to <= endsAt) return { error: 'The race clock is already as long as it can be.' };
      api.s.endsAt = to;
      api.ctx.setTimer('time', to);
      api.feed(`Time dilation: the race clock gained ${Math.round((to - endsAt) / 1000)} seconds.`, 'info');
    },
  },
];

defineCheats(cheats);
