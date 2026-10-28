import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { BASE_POINTS, multiplierFor, overdriveMultiplier } from '../../modes/time-attack/index.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { Answer } from '@ludora/shared';
import type { PlayerId } from '../../sdk/types.ts';
import { CLOCK_FLOOR_S } from '../adapters/time-attack.ts';
import { inGame, odds, rollOdds, share, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Time Attack: they work on each run's
 * personal clock (the 'clock' meter, in seconds: never run out by a cheat,
 * never above the time the run started with), on the streak multiplier (the
 * 'multiplier' meter, which keeps the run's count of answers in a row in
 * step with it), and on the penalty and bonus seconds the clock trades in.
 */

const MODE = 'time-attack';

interface Run {
  stream: StreamState;
  endsAt: number;
  score: number;
  multiplier: number;
  inRow: number;
  over: 'time' | 'mistake' | null;
}

const runOf = (api: ChaosApi, id: PlayerId): Run | undefined => api.s.runs[id];
const clockMs = (api: ChaosApi) => (Number(api.ctx.settings.clock) || 60) * 1000;

/** A run still going, with time left on it. */
function live(api: ChaosApi, id: PlayerId): Run | null {
  const r = runOf(api, id);
  return r && !r.over && inGame(api, id) && api.now() <= r.endsAt + DEADLINE_GRACE_MS ? r : null;
}

function needLive(api: ChaosApi, id: PlayerId, self: boolean): Run | { error: string } {
  return live(api, id) ?? { error: self ? 'Your run is over.' : `${api.name(id)}'s run is over.` };
}

const isErr = (x: unknown): x is { error: string } => Boolean(x && typeof x === 'object' && 'error' in x);
const left = (api: ChaosApi, id: PlayerId) => api.get('clock', id);
const room = (api: ChaosApi, id: PlayerId) => clockMs(api) / 1000 - left(api, id);
const secs = (s: number) => `${Math.round(Math.abs(s) * 10) / 10} s`;
const multiplierOf = (api: ChaosApi, inRow: number) => (api.ctx.settings.overdrive ? overdriveMultiplier(inRow) : multiplierFor(inRow));

/** The answer action a gate is looking at, if it answers the question on this run's screen. */
function answering(r: Run, action: unknown): { iid: string; answer: Answer } | null {
  const a = action as { type?: string; iid?: string; answer?: Answer } | null;
  return a?.type === 'answer' && a.iid === r.stream.iid && a.answer ? { iid: a.iid, answer: a.answer } : null;
}

const cheats: CheatDef[] = [
  /* --------------------------------- the clock -------------------------------- */
  {
    id: 'time-attack.borrowed-time',
    name: 'Borrowed Stopwatch Time',
    category: 'economy',
    description: 'Borrow 10 seconds for your clock now (never above its starting time). After 20 seconds the loan comes due and 12 seconds are taken back, never leaving you under 3 seconds.',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 20_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (room(api, c.caster) < 10) return { error: 'Your clock is too full to borrow 10 seconds.' };
      api.add('clock', c.caster, 10);
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason !== 'expired' || !live(api, fx.caster)) return;
        const paid = -api.add('clock', fx.caster, -12);
        if (paid > 0) api.feed(`${api.name(fx.caster)} paid back ${secs(paid)} of borrowed time.`, 'info');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Loan due: 12 s', until: fx.endsAt }),
    overlayFor: 'caster',
  },
  {
    id: 'time-attack.chrono-heist',
    name: 'Stopwatch Heist',
    category: 'troll',
    description: 'Steal 4 seconds from an opponent\'s clock and add them to yours. They are never left under 3 seconds, and your clock never goes above its starting time.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      if (room(api, c.caster) < 0.5) return { error: 'Your clock is already full.' };
      const got = transfer(api, 'clock', t, c.caster, 4);
      if (got < 0.5) return { error: `${api.name(t)} has no seconds to spare.` };
      api.feed(`${api.name(c.caster)} stole ${secs(got)} from ${api.name(t)}'s clock.`, 'info');
    },
  },
  {
    id: 'time-attack.clock-freeze',
    name: 'Stopwatch Freeze',
    category: 'advantage',
    description: 'Your clock stands still for 8 seconds. Seconds won or lost by your answers still count.',
    target: 'self',
    modes: [MODE],
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 8_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      fx!.data.left = left(api, c.caster);
    },
    hooks: {
      tick: (api, fx) => {
        if (live(api, fx.caster)) api.set('clock', fx.caster, Number(fx.data.left));
      },
      delta: {
        // Follow the run's own penalties and bonuses, so the freeze holds the clock where the answers put it.
        clock: (api, fx, d) => {
          if (d[fx.caster] !== undefined && live(api, fx.caster)) fx.data.left = Number(fx.data.left) + d[fx.caster]!;
        },
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Clock frozen', until: fx.endsAt }),
  },
  {
    id: 'time-attack.clock-sprint',
    name: 'Racing Stopwatch',
    category: 'troll',
    description: 'For 10 seconds an opponent\'s clock runs at double speed. It stops speeding once they are down to 3 seconds.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 10_000,
    tickMs: 500,
    apply: (api, c) => {
      const t = target(c);
      const r = needLive(api, t, false);
      if (isErr(r)) return r;
      if (left(api, t) <= CLOCK_FLOOR_S + 1) return { error: `${api.name(t)} is nearly out of time already.` };
    },
    hooks: {
      tick: (api, fx) => {
        if (live(api, target(fx))) api.add('clock', target(fx), -0.5);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Clock ×2 speed', tone: 'bad' }),
  },
  {
    id: 'time-attack.clock-swap',
    name: 'Stopwatch Swap',
    category: 'troll',
    description: 'You and an opponent swap the time left on your clocks (nobody is left under 3 seconds).',
    target: 'opponent',
    modes: [MODE],
    cost: 45,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const [mine, theirs] = [left(api, c.caster), left(api, t)];
      if (Math.abs(mine - theirs) < 1) return { error: `You and ${api.name(t)} have about the same time left.` };
      api.set('clock', c.caster, theirs);
      api.set('clock', t, mine);
      api.feed(`${api.name(c.caster)} swapped clocks with ${api.name(t)}.`, 'big');
    },
  },
  {
    id: 'time-attack.penalty-box',
    name: 'Stopwatch Penalty Box',
    category: 'troll',
    description: 'For 20 seconds, every wrong answer an opponent gives costs them double the seconds (never leaving them under 3 seconds).',
    target: 'opponent',
    modes: [MODE],
    needs: ['penalties'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        clock: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) < 0 && live(api, t)) d[t]! *= 2;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Penalties ×2', tone: 'bad' }),
  },
  {
    id: 'time-attack.time-shield',
    name: 'Stopwatch Shield',
    category: 'advantage',
    description: 'For 20 seconds, wrong answers cost you no seconds. They still reset your multiplier.',
    target: 'self',
    modes: [MODE],
    needs: ['penalties'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 50,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        clock: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) < 0 && live(api, fx.caster)) d[fx.caster] = 0;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Clock shield', tone: 'good' }),
  },
  {
    id: 'time-attack.fuse-splice',
    name: 'Stopwatch Fuse Splice',
    category: 'advantage',
    description: 'For 20 seconds, every correct answer adds 2 seconds to your clock (never above its starting time).',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) > 0 && live(api, fx.caster)) api.add('clock', fx.caster, 2);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: '+2 s per right answer', tone: 'good' }),
  },
  {
    id: 'time-attack.fuse-snuffer',
    name: 'Stopwatch Fuse Snuffer',
    category: 'troll',
    description: 'For 20 seconds, an opponent\'s correct answers win them no bonus seconds.',
    target: 'opponent',
    modes: [MODE],
    needs: ['bonus-time'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 40,
    hooks: {
      delta: {
        clock: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) > 0 && live(api, t)) d[t] = 0;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'No bonus seconds', tone: 'bad' }),
  },
  {
    id: 'time-attack.time-is-money',
    name: 'Sell the Stopwatch',
    category: 'economy',
    description: 'Sell 10 seconds of your clock for the points of two correct answers at your current multiplier. You need at least 13 seconds left.',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (left(api, c.caster) < 13) return { error: 'You need at least 13 seconds left to sell 10.' };
      api.add('clock', c.caster, -10);
      const points = 2 * BASE_POINTS * r.multiplier;
      api.add('score', c.caster, points);
      api.feed(`${api.name(c.caster)} sold 10 seconds for ${points} points.`, 'info');
    },
  },
  {
    id: 'time-attack.buy-time',
    name: 'Buy Back the Stopwatch',
    category: 'economy',
    description: 'Pay 15% of your points to put 6 seconds back on your clock (only when it has room for all 6).',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.score <= 0) return { error: 'You have no points to pay with.' };
      if (room(api, c.caster) < 6) return { error: 'Your clock has no room for 6 more seconds.' };
      api.add('score', c.caster, -share(r.score, 15));
      api.add('clock', c.caster, 6);
    },
  },
  {
    id: 'time-attack.brain-freeze',
    name: 'Stopwatch Brain Freeze',
    category: 'troll',
    description: 'An opponent cannot answer for 6 seconds while their clock keeps running. Only on a run with at least 10 seconds left.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 6_000,
    apply: (api, c) => {
      const t = target(c);
      const r = needLive(api, t, false);
      if (isErr(r)) return r;
      if (left(api, t) < 10) return { error: `${api.name(t)} has less than 10 seconds left.` };
    },
    hooks: {
      gate: (api, _fx, id, action) => {
        const r = live(api, id);
        if (!r || !answering(r, action)) return;
        return { block: 'Brain freeze! You cannot answer for a moment.' };
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Brain freeze', until: fx.endsAt }),
  },
  {
    id: 'time-attack.clock-roulette',
    name: 'Stopwatch Roulette',
    category: 'random',
    description: `Spin the stopwatch. Odds: ${odds([['+10 seconds', 40], ['+4 seconds', 35], ['−6 seconds', 25]])}. Only with room for 10 more seconds and more than 9 left.`,
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (room(api, c.caster) < 10) return { error: 'Your clock has no room for 10 more seconds.' };
      if (left(api, c.caster) <= 9) return { error: 'You have too little time left to gamble with.' };
      const s = rollOdds(api, [[10, 40], [4, 35], [-6, 25]]);
      api.add('clock', c.caster, s);
      api.feed(`Stopwatch roulette: ${api.name(c.caster)} ${s > 0 ? `won ${s}` : `lost ${-s}`} seconds.`, s > 0 ? 'good' : 'bad');
    },
  },

  /* ------------------------------- the multiplier ------------------------------- */
  {
    id: 'time-attack.multiplier-lock',
    name: 'Stopwatch Multiplier Lock',
    category: 'advantage',
    description: 'For 20 seconds, a wrong answer does not reset your multiplier (the count towards its next step starts again). Only when your multiplier is above ×1.',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 50,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.multiplier <= 1) return { error: 'Your multiplier is ×1: there is nothing to lock yet.' };
    },
    hooks: {
      delta: {
        multiplier: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) >= 0 || !live(api, fx.caster)) return;
          d[fx.caster] = 0;
          api.feed(`${api.name(fx.caster)}'s multiplier lock held.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Multiplier locked', tone: 'good' }),
  },
  {
    id: 'time-attack.multiplier-crash',
    name: 'Stopwatch Multiplier Crash',
    category: 'troll',
    description: 'An opponent\'s multiplier crashes to ×1, and their run of correct answers towards the next step starts again from zero.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const r = needLive(api, t, false);
      if (isErr(r)) return r;
      if (r.multiplier === 1 && r.inRow === 0) return { error: `${api.name(t)} has no multiplier or streak to crash.` };
      r.multiplier = 1;
      r.inRow = 0;
      api.feed(`${api.name(t)}'s multiplier crashed to ×1.`, 'bad');
    },
  },
  {
    id: 'time-attack.multiplier-bump',
    name: 'Stopwatch Multiplier Bump',
    category: 'advantage',
    description: 'Your multiplier goes up one step straight away (up to ×3, or ×9 in overdrive), as if you had answered enough in a row to earn it.',
    target: 'self',
    modes: [MODE],
    cost: 35,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (!api.add('multiplier', c.caster, 1)) return { error: 'Your multiplier is already at its top.' };
      api.feed(`${api.name(c.caster)} bumped their multiplier to ×${r.multiplier}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'time-attack.multiplier-swap',
    name: 'Stopwatch Multiplier Swap',
    category: 'troll',
    description: 'You and an opponent swap multipliers, along with each of your runs of correct answers towards the next step.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.multiplier === me.multiplier && them.inRow === me.inRow) return { error: `You and ${api.name(t)} have the same multiplier and streak.` };
      [me.multiplier, them.multiplier] = [them.multiplier, me.multiplier];
      [me.inRow, them.inRow] = [them.inRow, me.inRow];
      api.feed(`${api.name(c.caster)} swapped multipliers with ${api.name(t)}: ×${me.multiplier} for ×${them.multiplier}.`, 'info');
    },
  },
  {
    id: 'time-attack.streak-jinx',
    name: 'Stopwatch Streak Jinx',
    category: 'troll',
    description: 'For 15 seconds, an opponent\'s correct answers still score but do not count towards their multiplier.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 15_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const r = live(api, t);
          if (!r || (d[t] ?? 0) <= 0 || r.inRow <= 0) return;
          r.inRow -= 1;
          r.multiplier = multiplierOf(api, r.inRow);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Jinxed: no streak', tone: 'bad' }),
  },

  /* ------------------------------- questions ------------------------------- */
  {
    id: 'time-attack.safety-net',
    name: 'Stopwatch Safety Net',
    category: 'advantage',
    description: 'Within the next 30 seconds, your first wrong answer is caught before it counts: you are told it is wrong and can answer again, losing no seconds and keeping your multiplier.',
    target: 'self',
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const r = live(api, id);
        const a = r && answering(r, action);
        if (!a || api.ctx.questions.grade(a.iid, a.answer).correct) return;
        api.endEffect(fx.eid, 'used');
        return { block: 'Safety net! That answer is wrong. Try again.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Safety net', tone: 'good' }),
  },
  {
    id: 'time-attack.skip-ticket',
    name: 'Stopwatch Skip Ticket',
    category: 'advantage',
    description: 'Skip the question on your screen for the next one in your pile. No seconds lost, and your multiplier stays.',
    target: 'self',
    modes: [MODE],
    cost: 15,
    cooldownMs: 25_000,
    undoable: false,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (!r.stream.iid) return { error: 'There is no question on your screen.' };
      const old = api.ctx.questions.instance(r.stream.iid).qid;
      let qid = draw(r.stream.deck, api.rng);
      if (qid === old && api.ctx.questions.count() > 1) qid = draw(r.stream.deck, api.rng);
      r.stream.iid = api.ctx.questions.present(qid);
    },
  },
];

defineCheats(cheats);
