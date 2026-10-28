import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { BASE_POINTS, MAX_MULTIPLIER, multiplierFor, overdriveMultiplier } from '../../modes/time-attack/index.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { Answer } from '@ludora/shared';
import type { PlayerId } from '../../sdk/types.ts';
import { CLOCK_FLOOR_S, OVERDRIVE_CHEAT_CAP } from '../adapters/time-attack.ts';
import { inGame, odds, rollOdds, share, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Time Attack: they work on each run's
 * personal clock (the 'clock' meter, in seconds: never run out by a cheat,
 * never above the time the run started with), on the streak multiplier (the
 * 'multiplier' meter, which keeps the run's count of answers in a row in
 * step with it), and on the penalty and bonus seconds the clock trades in.
 */

const MODE = 'time-attack';
/** Seconds the stopwatch wager is played for. */
const WAGER_S = 5;
/** Seconds put in the savings jar, and the interest they come back with. */
const SAVE_S = 8;
const INTEREST_S = 4;
/** The last-second save fires when a clock gets down to this, and puts this much back. */
const RESCUE_AT_S = 2;
const RESCUE_S = 6;

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

const topMultiplier = (api: ChaosApi) => (api.ctx.settings.overdrive ? OVERDRIVE_CHEAT_CAP : MAX_MULTIPLIER);

/** Remember each run's last answer when an effect starts, so only answers after it count. */
function seenNow(api: ChaosApi, fx: ActiveEffect, ids: PlayerId[]) {
  for (const id of ids) fx.data[`seen:${id}`] = runOf(api, id)?.stream.last?.iid ?? null;
}

/** Whether this run has just answered a question right, in the transaction a score hook is looking at. Each answer counts once. */
function justAnsweredRight(api: ChaosApi, fx: ActiveEffect, id: PlayerId, d: Record<string, number>): boolean {
  const last = runOf(api, id)?.stream.last;
  if (!(id in d) || !last?.correct || last.iid === fx.data[`seen:${id}`]) return false;
  fx.data[`seen:${id}`] = last.iid;
  return true;
}

/**
 * Seconds a hook has taken away from (or for) one run, to be moved to another run's clock on the
 * effect's next tick. Moving them outside the answer that caused them keeps other clock cheats
 * (penalty boxes, shields) from bending seconds that were never that run's own penalty or bonus.
 */
function owe(fx: ActiveEffect, s: number) {
  fx.data.owed = Number(fx.data.owed ?? 0) + s;
}

function takeOwed(fx: ActiveEffect): number {
  const s = Number(fx.data.owed ?? 0);
  fx.data.owed = 0;
  return s;
}

/** Stopwatch wager: the winner takes up to 5 seconds of the other run's clock. */
function settleWager(api: ChaosApi, fx: ActiveEffect) {
  const winner = fx.data.winner as PlayerId | undefined;
  if (!winner || fx.data.settled) return;
  fx.data.settled = true;
  const loser = winner === fx.caster ? target(fx) : fx.caster;
  const got = live(api, winner) && live(api, loser) ? transfer(api, 'clock', loser, winner, WAGER_S) : 0;
  const head = `${api.name(winner)} won the stopwatch wager against ${api.name(loser)}`;
  api.feed(got >= 0.05 ? `${head} and took ${secs(got)}.` : `${head}, but there were no seconds to take.`, 'big');
}

const cheats: CheatDef[] = [
  /* --------------------------------- the clock -------------------------------- */
  {
    id: 'time-attack.borrowed-time',
    name: 'Borrowed Stopwatch Time',
    category: 'economy',
    description: 'Borrow 10 seconds for your clock now (never above its starting time). After 20 seconds, or sooner if the loan ends early, 12 seconds are taken back, never leaving you under 3 seconds.',
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
        // Stopping the loan early must not cancel it; an undo has already taken the borrowed seconds back.
        if (reason === 'undone' || reason === 'left' || !live(api, fx.caster)) return;
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

  /* ------------------------------- more of the clock ------------------------------- */
  {
    id: 'time-attack.stopwatch-flip',
    name: 'Stopwatch Flip',
    category: 'advantage',
    description: 'Turn your stopwatch over: the seconds left swap with the seconds used, out of the clock\'s starting time. On a 60-second clock, 15 left becomes 45, and 50 left becomes 10. Never under 3 seconds.',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      const now = left(api, c.caster);
      const flipped = clockMs(api) / 1000 - now;
      if (Math.abs(flipped - now) < 1) return { error: 'Your stopwatch reads the same either way up.' };
      const moved = api.set('clock', c.caster, flipped);
      api.feed(`${api.name(c.caster)} flipped their stopwatch: ${moved > 0 ? '+' : '−'}${secs(moved)}.`, moved > 0 ? 'good' : 'bad', [c.caster]);
    },
  },
  {
    id: 'time-attack.time-savings',
    name: 'Stopwatch Savings Jar',
    category: 'economy',
    description: `Put ${SAVE_S} seconds of your clock in the savings jar (you need at least ${SAVE_S + 4} left). After 20 seconds they come back with ${INTEREST_S} more, never above the clock's starting time. Stop it early and you get back just the ${SAVE_S}.`,
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 20_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (left(api, c.caster) < SAVE_S + 4) return { error: `You need at least ${SAVE_S + 4} seconds left to save ${SAVE_S}.` };
      api.add('clock', c.caster, -SAVE_S);
    },
    hooks: {
      end: (api, fx, reason) => {
        // An undo has already put the seconds back; a player who left has no run.
        if (reason === 'undone' || reason === 'left' || !live(api, fx.caster)) return;
        const back = api.add('clock', fx.caster, reason === 'expired' ? SAVE_S + INTEREST_S : SAVE_S);
        if (reason === 'expired') api.feed(`${api.name(fx.caster)}'s savings jar paid out ${secs(back)}.`, 'good', [fx.caster]);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: `${SAVE_S} s in the savings jar`, until: fx.endsAt }),
  },
  {
    id: 'time-attack.last-second-save',
    name: 'Last-Second Stopwatch Save',
    category: 'advantage',
    description: `Once in the next 60 seconds, when your clock gets down to ${RESCUE_AT_S} seconds, ${RESCUE_S} seconds are put back on it. A wrong answer that takes it straight past zero still ends your run.`,
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 60_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (left(api, c.caster) <= RESCUE_AT_S) return { error: 'Too late: your clock is already down to its last seconds.' };
    },
    hooks: {
      tick: (api, fx) => {
        if (!live(api, fx.caster) || left(api, fx.caster) > RESCUE_AT_S) return;
        const got = api.add('clock', fx.caster, RESCUE_S);
        api.feed(`A last-second save put ${secs(got)} back on ${api.name(fx.caster)}'s clock.`, 'good');
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Last-second save ready', tone: 'good' }),
  },
  {
    id: 'time-attack.time-gift',
    name: 'Stopwatch Time Gift',
    category: 'advantage',
    description: 'Give 5 seconds of your clock to another player\'s run. You keep at least 3 seconds, and their clock never goes above its starting time.',
    target: 'player',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (t === c.caster) return { error: 'Pick another player to give seconds to.' };
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      if (room(api, t) < 0.5) return { error: `${api.name(t)}'s clock is already full.` };
      const got = transfer(api, 'clock', c.caster, t, 5);
      if (got < 0.5) return { error: 'You have no seconds to spare.' };
      api.feed(`${api.name(c.caster)} gave ${api.name(t)} ${secs(got)} of their clock.`, 'good');
    },
  },
  {
    id: 'time-attack.time-wager',
    name: 'Stopwatch Wager',
    category: 'troll',
    description: `You and an opponent race to the next right answer. Within 30 seconds, whoever answers one right first takes ${WAGER_S} seconds from the other's clock. The loser keeps at least 3 seconds, and the winner's clock never goes above its starting time.`,
    target: 'opponent',
    modes: [MODE],
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needLive(api, target(c), false);
      if (isErr(them)) return them;
      seenNow(api, fx!, [c.caster, target(c)]);
    },
    hooks: {
      delta: {
        // The first right answer decides the wager; the seconds move on the next tick, outside the answer.
        score: (api, fx, d) => {
          if (fx.data.winner) return;
          for (const id of [fx.caster, target(fx)]) {
            if (justAnsweredRight(api, fx, id, d)) {
              fx.data.winner = id;
              return;
            }
          }
        },
      },
      tick: (api, fx) => {
        if (!fx.data.winner) return;
        settleWager(api, fx);
        api.endEffect(fx.eid, 'used');
      },
      // A right answer in the last moments still counts.
      end: (api, fx, reason) => {
        if (reason === 'expired' || reason === 'stopped') settleWager(api, fx);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: `Wager: first right answer wins ${WAGER_S} s`, until: fx.endsAt }),
  },
  {
    id: 'time-attack.penalty-pass',
    name: 'Stopwatch Penalty Pass',
    category: 'troll',
    description: 'For 20 seconds, the seconds your wrong answers cost come off an opponent\'s clock instead of yours (never leaving them under 3 seconds). A wrong answer that would take your clock past zero still ends your run.',
    target: 'opponent',
    modes: [MODE],
    needs: ['penalties'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tickMs: 250,
    priority: 10,
    apply: (api, c) => {
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needLive(api, target(c), false);
      if (isErr(them)) return them;
    },
    hooks: {
      delta: {
        clock: (api, fx, d) => {
          const lost = d[fx.caster] ?? 0;
          if (lost >= 0 || !live(api, fx.caster)) return;
          d[fx.caster] = 0;
          owe(fx, -lost);
        },
      },
      tick: (api, fx) => passPenalty(api, fx),
      end: (api, fx) => passPenalty(api, fx),
    },
    overlay: () => ({ kind: 'badge', text: 'Penalties passed on', tone: 'good' }),
    overlayFor: 'caster',
  },
  {
    id: 'time-attack.bonus-heist',
    name: 'Stopwatch Bonus Heist',
    category: 'troll',
    description: 'For 20 seconds, the bonus seconds an opponent\'s right answers win go onto your clock instead of theirs. Your clock never goes above its starting time; seconds that do not fit are lost.',
    target: 'opponent',
    modes: [MODE],
    needs: ['bonus-time'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 250,
    priority: 10,
    apply: (api, c) => {
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needLive(api, target(c), false);
      if (isErr(them)) return them;
    },
    hooks: {
      delta: {
        clock: (api, fx, d) => {
          const t = target(fx);
          const won = d[t] ?? 0;
          if (won <= 0 || !live(api, t)) return;
          d[t] = 0;
          owe(fx, won);
        },
      },
      tick: (api, fx) => pocketBonus(api, fx),
      end: (api, fx) => pocketBonus(api, fx),
    },
    overlay: () => ({ kind: 'badge', text: 'Bonus seconds stolen', tone: 'bad' }),
  },
  {
    id: 'time-attack.clock-pressure',
    name: 'Stopwatch Pressure',
    category: 'troll',
    description: 'For 20 seconds, every right answer you give takes 1 second off an opponent\'s clock. They are never left under 3 seconds.',
    target: 'opponent',
    modes: [MODE],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const t = target(c);
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      if (left(api, t) <= CLOCK_FLOOR_S + 0.5) return { error: `${api.name(t)} is nearly out of time already.` };
      seenNow(api, fx!, [c.caster]);
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if (justAnsweredRight(api, fx, fx.caster, d)) owe(fx, 1);
        },
      },
      tick: (api, fx) => applyPressure(api, fx),
      end: (api, fx) => applyPressure(api, fx),
    },
    overlay: () => ({ kind: 'badge', text: 'Under pressure: −1 s per rival answer', tone: 'bad' }),
  },

  /* ------------------------------- more of the multiplier ------------------------------- */
  {
    id: 'time-attack.multiplier-pinch',
    name: 'Stopwatch Multiplier Pinch',
    category: 'troll',
    description: 'Pinch one step of an opponent\'s multiplier: theirs goes down a step and yours goes up one (up to ×3, or ×9 in overdrive). Each run\'s count of answers in a row is set to match.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 55_000,
    apply: (api, c) => {
      const t = target(c);
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.multiplier <= 1) return { error: `${api.name(t)}'s multiplier is ×1: there is no step to pinch.` };
      if (!transfer(api, 'multiplier', t, c.caster, 1)) return { error: 'Your multiplier is already at its top.' };
      api.feed(`${api.name(c.caster)} pinched a multiplier step from ${api.name(t)}: ×${me.multiplier} for ×${them.multiplier}.`, 'info');
    },
  },
  {
    id: 'time-attack.multiplier-dice',
    name: 'Stopwatch Multiplier Dice',
    category: 'random',
    description: `Roll the dice for your multiplier. Odds: ${odds([['up one step', 55], ['down one step', 45]])}. Only when it can go either way: from ×2, and below the top (×3, or ×9 in overdrive).`,
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const r = needLive(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.multiplier < 2) return { error: 'Your multiplier is ×1: it has nowhere to fall.' };
      if (r.multiplier >= topMultiplier(api)) return { error: 'Your multiplier is at its top: it has nowhere to rise.' };
      const up = rollOdds(api, [[true, 55], [false, 45]]);
      api.add('multiplier', c.caster, up ? 1 : -1);
      api.feed(`Multiplier dice: ${api.name(c.caster)} rolled ${up ? 'up' : 'down'} to ×${r.multiplier}.`, up ? 'good' : 'bad', [c.caster]);
    },
  },
  {
    id: 'time-attack.multiplier-mute',
    name: 'Stopwatch Multiplier Mute',
    category: 'troll',
    description: 'For 15 seconds, an opponent\'s right answers score as if their multiplier were ×1. They keep their multiplier, and it still builds.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 15_000,
    // Before other score cheats, so they bend the muted points.
    priority: 15,
    apply: (api, c) => {
      const t = target(c);
      const r = needLive(api, t, false);
      if (isErr(r)) return r;
      if (r.multiplier <= 1) return { error: `${api.name(t)}'s multiplier is ×1: there is nothing to mute.` };
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const last = runOf(api, t)?.stream.last;
          // The mode scores a right answer as 100 times the multiplier the run had when it answered.
          const m = (last?.points ?? BASE_POINTS) / BASE_POINTS;
          if ((d[t] ?? 0) <= 0 || !last?.correct || m <= 1) return;
          d[t] = Math.round(d[t]! / m);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Multiplier muted', tone: 'bad' }),
  },
  {
    id: 'time-attack.multiplier-echo',
    name: 'Stopwatch Multiplier Echo',
    category: 'advantage',
    description: 'For 25 seconds, every time an opponent\'s multiplier steps up, yours steps up too (up to ×3, or ×9 in overdrive). It costs them nothing.',
    target: 'opponent',
    hostile: false,
    modes: [MODE],
    cost: 30,
    cooldownMs: 55_000,
    durationMs: 25_000,
    apply: (api, c) => {
      const t = target(c);
      const me = needLive(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needLive(api, t, false);
      if (isErr(them)) return them;
      if (me.multiplier >= topMultiplier(api)) return { error: 'Your multiplier is already at its top.' };
      if (them.multiplier >= topMultiplier(api)) return { error: `${api.name(t)}'s multiplier is at its top: it has no step left to echo.` };
    },
    hooks: {
      delta: {
        multiplier: (api, fx, d) => {
          const r = live(api, fx.caster);
          // Only as far as the caster's top, so the feed says what really happened.
          const up = Math.min(d[target(fx)] ?? 0, r ? topMultiplier(api) - r.multiplier - (d[fx.caster] ?? 0) : 0);
          if (up <= 0) return;
          d[fx.caster] = (d[fx.caster] ?? 0) + up;
          api.feed(`Multiplier echo: ${api.name(target(fx))} stepped up, so ${api.name(fx.caster)} did too.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Multiplier echo', tone: 'good' }),
    overlayFor: 'caster',
  },
];

/** Penalty pass: the seconds the caster's wrong answers would have cost come off the target's clock. */
function passPenalty(api: ChaosApi, fx: ActiveEffect) {
  const s = takeOwed(fx);
  const t = target(fx);
  if (s <= 0 || !live(api, t)) return;
  const taken = -api.add('clock', t, -s);
  if (taken > 0) api.feed(`${api.name(fx.caster)}'s wrong answer cost ${api.name(t)} ${secs(taken)} instead.`, 'info');
}

/** Bonus heist: the target's bonus seconds go to the caster's clock, as far as it has room. */
function pocketBonus(api: ChaosApi, fx: ActiveEffect) {
  const s = takeOwed(fx);
  if (s <= 0) return;
  const got = live(api, fx.caster) ? api.add('clock', fx.caster, s) : 0;
  api.feed(got > 0 ? `${api.name(fx.caster)} stole ${secs(got)} of bonus time from ${api.name(target(fx))}.` : `${api.name(target(fx))}'s bonus seconds were stolen, but ${api.name(fx.caster)}'s clock had no room for them.`, 'info');
}

/** Stopwatch pressure: one second off the target's clock for each right answer the caster gave. */
function applyPressure(api: ChaosApi, fx: ActiveEffect) {
  const s = takeOwed(fx);
  const t = target(fx);
  if (s <= 0 || !live(api, t)) return;
  const taken = -api.add('clock', t, -s);
  if (taken > 0) api.feed(`${api.name(fx.caster)}'s right answer took ${secs(taken)} off ${api.name(t)}'s clock.`, 'info');
}

defineCheats(cheats);
