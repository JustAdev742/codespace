import type { Answer } from '@ludora/shared';
import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { FLOOR_MS, RETURN_AFTER } from '../../modes/survival-run/index.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { inGame, odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Survival Run: they work on hearts (never the
 * last one: losing that ends a run, which only the run itself may do), on
 * each runner's shrinking question timer, and on second-wind questions.
 * Hearts move through the 'hearts' meter, which keeps them between 1 and the
 * most the mode lets a runner hold.
 *
 * Lasting cheats that heal as the run goes are tagged 'heal'; the heart seal,
 * which stops a runner winning hearts back, cannot share a runner with them.
 */

const MODE = 'survival-run';
/** Cheats that shorten a timer never leave a runner with less than this on the clock. */
const MIN_LEFT_MS = 3000;
/** Correct answers a heart is worth in the heart shop, either way. */
const HEART_PRICE = 3;

interface Runner {
  stream: StreamState;
  hearts: number;
  timerMs: number;
  deadline: number | null;
  phase: 'question' | 'result' | 'over';
  returns: { qid: string; after: number }[];
  returning: boolean;
}

const runnerOf = (api: ChaosApi, id: PlayerId): Runner | undefined => api.s.runners[id];
const maxHearts = (api: ChaosApi) => Math.max(Number(api.ctx.settings.hearts), Number(api.ctx.settings.heartCap));

/** A runner whose run is still going. */
function running(api: ChaosApi, id: PlayerId): Runner | null {
  const r = runnerOf(api, id);
  return r && r.phase !== 'over' && inGame(api, id) ? r : null;
}

function needRunning(api: ChaosApi, id: PlayerId, self: boolean): Runner | { error: string } {
  return running(api, id) ?? { error: self ? 'Your run is over.' : `${api.name(id)}'s run is over.` };
}

/** A runner with a question on screen and its timer running. */
function needQuestion(api: ChaosApi, id: PlayerId, self: boolean): Runner | { error: string } {
  const r = needRunning(api, id, self);
  if ('error' in r) return r;
  if (r.phase !== 'question' || !r.stream.iid || r.deadline === null) return { error: self ? 'You have no question on screen right now.' : `${api.name(id)} has no question on screen right now.` };
  return r;
}

const isErr = (x: unknown): x is { error: string } => Boolean(x && typeof x === 'object' && 'error' in x);

/** Move a runner's question deadline (and the timer that closes it). */
function setDeadline(api: ChaosApi, id: PlayerId, r: Runner, at: number) {
  r.deadline = at;
  api.ctx.setTimer(`q:${id}`, at + DEADLINE_GRACE_MS);
}

const secs = (ms: number) => `${Math.round(ms / 100) / 10} s`;
const hearts = (n: number) => `${n} ${n === 1 ? 'heart' : 'hearts'}`;

/** The answer action a gate is looking at, if it answers the question on this runner's screen. */
function answering(r: Runner, action: unknown): { iid: string; answer: Answer } | null {
  const a = action as { type?: string; iid?: string; answer?: Answer } | null;
  return r.phase === 'question' && a?.type === 'answer' && a.iid === r.stream.iid && a.answer ? { iid: a.iid, answer: a.answer } : null;
}

/**
 * Whether this runner has just answered a question right, in the transaction a score hook is looking
 * at. Each answer counts once: the effect remembers the last one it saw in `seen:<id>`.
 */
function justAnsweredRight(api: ChaosApi, fx: ActiveEffect, id: PlayerId, d: Record<string, number>): boolean {
  const last = runnerOf(api, id)?.stream.last;
  if (!(id in d) || !last?.correct || last.iid === fx.data[`seen:${id}`]) return false;
  fx.data[`seen:${id}`] = last.iid;
  return true;
}

/** Remember each runner's last answer when an effect starts, so only answers after it count. */
function seenNow(api: ChaosApi, fx: ActiveEffect, ids: PlayerId[]) {
  for (const id of ids) fx.data[`seen:${id}`] = runnerOf(api, id)?.stream.last?.iid ?? null;
}

/** Heart duel: the winner takes a heart from the other runner, outside any mode move (so no other heart cheat bends it). */
function settleDuel(api: ChaosApi, fx: ActiveEffect) {
  const winner = fx.data.winner as PlayerId | undefined;
  if (!winner || fx.data.settled) return;
  fx.data.settled = true;
  const loser = winner === fx.caster ? target(fx) : fx.caster;
  const lost = running(api, loser) ? -api.add('hearts', loser, -1) : 0;
  const won = lost > 0 && running(api, winner) ? api.add('hearts', winner, 1) : 0;
  const head = `${api.name(winner)} won the heart duel against ${api.name(loser)}`;
  if (!lost) api.feed(`${head}, but ${api.name(loser)} was on their last heart.`, 'info');
  else api.feed(won ? `${head} and took a heart.` : `${head}: ${api.name(loser)} lost a heart, and ${api.name(winner)} had no room for it.`, 'big');
}

const cheats: CheatDef[] = [
  /* --------------------------------- hearts -------------------------------- */
  {
    id: 'survival-run.first-aid',
    name: 'Survivor\'s First Aid',
    category: 'advantage',
    description: 'Patch yourself up: win back one heart, up to the most hearts this run lets you hold.',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (!api.add('hearts', c.caster, 1)) return { error: 'You already have every heart you can hold.' };
    },
  },
  {
    id: 'survival-run.heartbreak',
    name: 'Survival Heartbreak Hex',
    category: 'troll',
    description: 'An opponent loses one heart. Never their last one.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const r = needRunning(api, t, false);
      if (isErr(r)) return r;
      if (!api.add('hearts', t, -1)) return { error: `${api.name(t)} is down to their last heart.` };
    },
  },
  {
    id: 'survival-run.vampire-bite',
    name: 'Runner\'s Vampire Bite',
    category: 'troll',
    description: 'Take one heart from an opponent (never their last one) and add it to yours. You need room for it.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 45,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const them = needRunning(api, t, false);
      if (isErr(them)) return them;
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.hearts <= 1) return { error: `${api.name(t)} is down to their last heart.` };
      if (me.hearts >= maxHearts(api)) return { error: 'You have no room for another heart.' };
      transfer(api, 'hearts', t, c.caster, 1);
    },
  },
  {
    id: 'survival-run.blood-pact',
    name: 'Survivor\'s Pinky Swap',
    category: 'troll',
    description: 'You and an opponent swap how many hearts you each have.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 40,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const them = needRunning(api, t, false);
      if (isErr(them)) return them;
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.hearts === me.hearts) return { error: `You and ${api.name(t)} have the same number of hearts.` };
      const [mine, theirs] = [me.hearts, them.hearts];
      api.set('hearts', c.caster, theirs);
      api.set('hearts', t, mine);
      api.feed(`${api.name(c.caster)} made a pinky swap with ${api.name(t)}: ${hearts(theirs)} for ${hearts(mine)}.`, 'big');
    },
  },
  {
    id: 'survival-run.guardian-heart',
    name: 'Survival Guardian Heart',
    category: 'advantage',
    description: 'The next heart you would lose in the next 40 seconds, to a wrong answer or the timer, is kept. Your last heart is not covered: losing it still ends your run.',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    priority: 50,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        hearts: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) >= 0 || !running(api, fx.caster)) return;
          d[fx.caster] = 0;
          api.feed(`${api.name(fx.caster)}'s guardian heart took the hit.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Guardian heart', tone: 'good' }),
  },
  {
    id: 'survival-run.lifesteal',
    name: 'Survival Lifesteal Sprint',
    category: 'advantage',
    description: 'For 25 seconds, every correct answer you give wins back a heart, up to the most hearts this run lets you hold. Only when you are missing a heart.',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 40,
    cooldownMs: 75_000,
    durationMs: 25_000,
    tags: ['heal'],
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts >= maxHearts(api)) return { error: 'You already have every heart you can hold.' };
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0 || !running(api, fx.caster)) return;
          if (api.add('hearts', fx.caster, 1)) api.feed(`Lifesteal: ${api.name(fx.caster)} won back a heart.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lifesteal', tone: 'good' }),
  },
  {
    id: 'survival-run.glass-heart',
    name: 'Survivor\'s Glass Heart',
    category: 'troll',
    description: 'For 20 seconds, every heart an opponent loses breaks a second one with it. It never breaks their last heart. Only on an opponent with at least 3 hearts.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 30,
    apply: (api, c) => {
      const t = target(c);
      const r = needRunning(api, t, false);
      if (isErr(r)) return r;
      if (r.hearts < 3) return { error: `${api.name(t)} has too few hearts for a second one to break.` };
    },
    hooks: {
      delta: {
        hearts: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) >= 0 || !running(api, t)) return;
          d[t]! -= 1;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Glass heart', tone: 'bad' }),
  },
  {
    id: 'survival-run.ticking-heart',
    name: 'Survival Ticking Heart',
    category: 'troll',
    description: 'An opponent has 15 seconds to answer a question correctly. If they do not, they lose a heart (never their last one).',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    priority: 60,
    apply: (api, c) => {
      const t = target(c);
      const r = needRunning(api, t, false);
      if (isErr(r)) return r;
      if (r.hearts <= 1) return { error: `${api.name(t)} is down to their last heart.` };
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[target(fx)] ?? 0) <= 0) return;
          fx.data.defused = true;
          api.feed(`${api.name(target(fx))} stopped the ticking heart.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
      end: (api, fx, reason) => {
        if (reason !== 'expired' || fx.data.defused || !running(api, target(fx))) return;
        if (api.add('hearts', target(fx), -1)) api.feed(`The ticking heart went off: ${api.name(target(fx))} lost a heart.`, 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Answer one right or lose a heart', until: fx.endsAt }),
  },
  {
    id: 'survival-run.heart-roulette',
    name: 'Survival Heart Roulette',
    category: 'random',
    description: `Spin for a heart. Odds: ${odds([['win a heart', 55], ['lose a heart', 45]])}. Only when you have room for another heart and more than one to lose.`,
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts <= 1) return { error: 'You cannot bet your last heart.' };
      if (r.hearts >= maxHearts(api)) return { error: 'You have no room to win a heart.' };
      const win = rollOdds(api, [[true, 55], [false, 45]]);
      api.add('hearts', c.caster, win ? 1 : -1);
      api.feed(win ? `${api.name(c.caster)} won a heart on the roulette.` : `${api.name(c.caster)} lost a heart on the roulette.`, win ? 'good' : 'bad');
    },
  },
  {
    id: 'survival-run.last-stand',
    name: 'Survivor\'s Last Stand',
    category: 'advantage',
    description: 'Only on your last heart: your next correct answer in the next 40 seconds wins back two hearts (up to the most you can hold).',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    stacking: 'reject',
    tags: ['heal'],
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts !== 1) return { error: 'Last Stand only works on your last heart.' };
      if (maxHearts(api) < 2) return { error: 'This run never lets you hold more than one heart.' };
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0 || !running(api, fx.caster)) return;
          const won = api.add('hearts', fx.caster, 2);
          api.feed(`${api.name(fx.caster)} made a last stand: +${hearts(won)}.`, 'big');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Last stand', tone: 'good' }),
  },

  /* ------------------------------ the question timer ------------------------------ */
  {
    id: 'survival-run.slow-motion',
    name: 'Survival Slow-Motion Run',
    category: 'advantage',
    description: 'For 25 seconds, every question you are asked (the one on screen now included) gets 4 extra seconds on its timer.',
    target: 'self',
    modes: [MODE],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 25_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.phase === 'question' && r.stream.iid && r.deadline !== null) {
        setDeadline(api, c.caster, r, r.deadline + 4000);
        fx!.data.iid = r.stream.iid;
      }
    },
    hooks: {
      tick: (api, fx) => {
        const r = running(api, fx.caster);
        if (!r || r.phase !== 'question' || !r.stream.iid || r.deadline === null || fx.data.iid === r.stream.iid) return;
        setDeadline(api, fx.caster, r, r.deadline + 4000);
        fx.data.iid = r.stream.iid;
      },
    },
    overlay: () => ({ kind: 'badge', text: '+4 s per question', tone: 'good' }),
  },
  {
    id: 'survival-run.shrink-ray',
    name: 'Survival Timer Shrink Ray',
    category: 'troll',
    description: 'An opponent\'s question timer shrinks to the 6-second floor for every new question until they next answer one correctly. Not on a runner down to their last heart.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const r = needRunning(api, t, false);
      if (isErr(r)) return r;
      if (r.hearts <= 1) return { error: `${api.name(t)} is on their last heart.` };
      if (r.timerMs <= FLOOR_MS) return { error: `${api.name(t)}'s timer is already as short as it gets.` };
      r.timerMs = FLOOR_MS;
      api.feed(`${api.name(t)}'s timer was shrunk to ${secs(FLOOR_MS)}.`, 'bad');
    },
  },
  {
    id: 'survival-run.seconds-thief',
    name: 'Survival Seconds Thief',
    category: 'troll',
    description: 'Steal up to 4 seconds from the timer on an opponent\'s question and add them to yours. They always keep at least 3 seconds. Not from a runner down to their last heart.',
    target: 'opponent',
    modes: [MODE],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = needQuestion(api, t, false);
      if (isErr(them)) return them;
      const me = needQuestion(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.hearts <= 1) return { error: `${api.name(t)} is on their last heart.` };
      const take = Math.min(4000, them.deadline! - api.now() - MIN_LEFT_MS);
      if (take < 500) return { error: `${api.name(t)} is nearly out of time already.` };
      setDeadline(api, t, them, them.deadline! - take);
      setDeadline(api, c.caster, me, me.deadline! + take);
      api.feed(`${api.name(c.caster)} stole ${secs(take)} from ${api.name(t)}'s timer.`, 'info');
    },
  },
  {
    id: 'survival-run.hourglass-swap',
    name: 'Survival Hourglass Swap',
    category: 'troll',
    description: 'You and an opponent swap question timers: each of you gets the other\'s time per question, starting from your next question and lasting until your next correct answer resets it. Not onto a runner down to their last heart if it would shorten theirs.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = needRunning(api, t, false);
      if (isErr(them)) return them;
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      if (them.timerMs === me.timerMs) return { error: `You and ${api.name(t)} have the same timer.` };
      if (them.hearts <= 1 && me.timerMs < them.timerMs) return { error: `${api.name(t)} is on their last heart.` };
      [me.timerMs, them.timerMs] = [them.timerMs, me.timerMs];
      api.feed(`${api.name(c.caster)} swapped hourglasses with ${api.name(t)}: ${secs(me.timerMs)} for ${secs(them.timerMs)}.`, 'info');
    },
  },
  {
    id: 'survival-run.tripwire',
    name: 'Survival Run Tripwire',
    category: 'troll',
    description: 'An opponent trips and cannot answer for 6 seconds. Their timer keeps running, but it will not run out while they are down.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 6_000,
    apply: (api, c, fx) => {
      const t = target(c);
      const r = needRunning(api, t, false);
      if (isErr(r)) return r;
      // New questions get at least 6 seconds, so only the one on screen needs room.
      if (r.phase === 'question' && r.deadline !== null && r.deadline < fx!.endsAt + 1000) setDeadline(api, t, r, fx!.endsAt + 1000);
    },
    hooks: {
      gate: (api, _fx, id, action) => {
        const r = running(api, id);
        const a = action as { type?: string; iid?: string };
        if (!r || r.phase !== 'question' || a?.type !== 'answer' || a.iid !== r.stream.iid) return;
        return { block: 'You tripped! Get up first.' };
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Tripped', until: fx.endsAt }),
  },
  {
    id: 'survival-run.sidestep',
    name: 'Survival Sidestep',
    category: 'advantage',
    description: 'Dodge the question on your screen: you get the next one from your pile with a fresh timer, and no heart is lost. Not for a second-wind question coming back.',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const r = needQuestion(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.returning) return { error: 'A second-wind question cannot be dodged.' };
      const old = api.ctx.questions.instance(r.stream.iid!).qid;
      let qid = draw(r.stream.deck, api.rng);
      if (qid === old && api.ctx.questions.count() > 1) qid = draw(r.stream.deck, api.rng);
      r.stream.iid = api.ctx.questions.present(qid);
      setDeadline(api, c.caster, r, api.now() + r.timerMs);
    },
  },

  /* ------------------------------- second wind ------------------------------- */
  {
    id: 'survival-run.second-wind-rush',
    name: 'Survival Second Wind Rush',
    category: 'advantage',
    description: 'Every missed question waiting to come back to you is due straight away, so you can win back its heart sooner.',
    target: 'self',
    modes: [MODE],
    needs: ['second-wind'],
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      const waiting = r.returns.filter((x) => x.after > r.stream.answered);
      if (!waiting.length) return { error: 'No missed question is waiting to come back to you.' };
      for (const x of waiting) x.after = r.stream.answered;
      api.feed(`${waiting.length === 1 ? 'A missed question comes' : `${waiting.length} missed questions come`} back to ${api.name(c.caster)} next.`, 'good', [c.caster]);
    },
  },
  {
    id: 'survival-run.second-wind-swipe',
    name: 'Survival Second Wind Swipe',
    category: 'troll',
    description: `Swipe the missed question due back to an opponent soonest: it comes back to you instead, ${RETURN_AFTER} questions from now, and answering it right wins you a heart if you have room. They lose that chance to win one back.`,
    target: 'opponent',
    modes: [MODE],
    needs: ['second-wind'],
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = needRunning(api, t, false);
      if (isErr(them)) return them;
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      if (!them.returns.length) return { error: `${api.name(t)} has no missed question waiting to come back.` };
      const i = them.returns.reduce((best, x, k) => (x.after < them.returns[best]!.after ? k : best), 0);
      const qid = them.returns[i]!.qid;
      if (me.returns.some((x) => x.qid === qid)) return { error: 'That question is already waiting to come back to you.' };
      them.returns.splice(i, 1);
      me.returns.push({ qid, after: me.stream.answered + RETURN_AFTER });
      api.feed(`${api.name(c.caster)} swiped a second-wind question from ${api.name(t)}.`, 'info');
    },
  },

  /* ------------------------------- trading hearts ------------------------------- */
  {
    id: 'survival-run.heart-bank',
    name: 'Survival Heart Piggy Bank',
    category: 'economy',
    description:
      'Put one of your hearts in the piggy bank (you need at least two). After 30 seconds it comes back with another one, up to the most you can hold, if your run is still going. Stop it early and you get back just the heart you put in.',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts < 2) return { error: 'You need at least two hearts to put one in the bank.' };
      api.add('hearts', c.caster, -1);
    },
    hooks: {
      end: (api, fx, reason) => {
        // An undo has already put the heart back; a runner who left has no run.
        if (reason === 'undone' || reason === 'left' || !running(api, fx.caster)) return;
        const back = api.add('hearts', fx.caster, reason === 'expired' ? 2 : 1);
        if (reason === 'expired') api.feed(`${api.name(fx.caster)}'s piggy bank paid out ${hearts(back)}.`, 'good', [fx.caster]);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Heart in the bank', until: fx.endsAt }),
  },
  {
    id: 'survival-run.heart-loan',
    name: 'Survival Heart Loan',
    category: 'economy',
    description: 'Borrow a heart now (you need room for it). After 30 seconds, or sooner if the loan ends early, two hearts are taken back, never your last one.',
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 30_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (!api.add('hearts', c.caster, 1)) return { error: 'You have no room to borrow a heart.' };
    },
    hooks: {
      end: (api, fx, reason) => {
        if (reason === 'undone' || reason === 'left' || !running(api, fx.caster)) return;
        const paid = -api.add('hearts', fx.caster, -2);
        api.feed(paid ? `${api.name(fx.caster)}'s heart loan came due: −${hearts(paid)}.` : `${api.name(fx.caster)}'s heart loan came due, but they were on their last heart.`, 'info');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Loan due: 2 hearts', until: fx.endsAt }),
  },
  {
    id: 'survival-run.heart-shop',
    name: 'Survival Heart Shop',
    category: 'economy',
    description: `Buy a heart with ${HEART_PRICE} of your correct answers: your score goes down by ${HEART_PRICE} and you win a heart (you need room for it). Your timer and heart restores follow your correct answers, so they move back to match.`,
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 25,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.stream.correct < HEART_PRICE) return { error: `You need ${HEART_PRICE} correct answers to pay with.` };
      if (r.hearts >= maxHearts(api)) return { error: 'You already have every heart you can hold.' };
      api.add('score', c.caster, -HEART_PRICE);
      api.add('hearts', c.caster, 1);
    },
  },
  {
    id: 'survival-run.heart-sale',
    name: 'Survival Heart Sale',
    category: 'economy',
    description: `Sell one of your hearts (never your last) for ${HEART_PRICE} correct answers on your score. Your timer and heart restores follow your correct answers, so they move on to match, and a sale can jump you past a restore.`,
    target: 'self',
    modes: [MODE],
    needs: ['hearts'],
    cost: 25,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts < 2) return { error: 'You cannot sell your last heart.' };
      api.add('hearts', c.caster, -1);
      api.add('score', c.caster, HEART_PRICE);
    },
  },
  {
    id: 'survival-run.heart-gift',
    name: 'Survival Heart Gift',
    category: 'advantage',
    description: 'Give one of your hearts (never your last) to another runner who has room for it.',
    target: 'player',
    modes: [MODE],
    needs: ['hearts'],
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      if (t === c.caster) return { error: 'Pick another runner to give a heart to.' };
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needRunning(api, t, false);
      if (isErr(them)) return them;
      if (me.hearts < 2) return { error: 'You cannot give away your last heart.' };
      if (them.hearts >= maxHearts(api)) return { error: `${api.name(t)} already has every heart they can hold.` };
      transfer(api, 'hearts', c.caster, t, 1);
      api.feed(`${api.name(c.caster)} gave ${api.name(t)} a heart.`, 'good');
    },
  },

  /* ------------------------------- hearts that move as you play ------------------------------- */
  {
    id: 'survival-run.heart-seal',
    name: 'Survival Heart Seal',
    category: 'troll',
    description: 'For 30 seconds, the hearts an opponent\'s run would give back are lost: no restored hearts and no second-wind hearts. Not while a lasting healing cheat is running on them.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    tags: ['heart-seal'],
    conflicts: ['heal'],
    // A cap. Lasting healers on the same runner are refused (they heal from a score hook, which may run
    // before or after this one); Heartstrings hearts come later, at 52, and are not the run's to seal.
    priority: 40,
    apply: (api, c) => {
      const r = needRunning(api, target(c), false);
      if (isErr(r)) return r;
    },
    hooks: {
      delta: {
        hearts: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !running(api, t)) return;
          d[t] = 0;
          api.feed(`The heart seal kept ${api.name(t)} from winning a heart back.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Hearts sealed', tone: 'bad' }),
  },
  {
    id: 'survival-run.heartstrings',
    name: 'Survival Heartstrings',
    category: 'advantage',
    description: 'For 25 seconds, every heart an opponent loses, you win one, up to the most you can hold. It costs them nothing extra.',
    target: 'opponent',
    hostile: false,
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 25_000,
    // After glass hearts (which break more) and guardian hearts (which keep one), so it follows what they really lost.
    priority: 52,
    apply: (api, c) => {
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needRunning(api, target(c), false);
      if (isErr(them)) return them;
      if (me.hearts >= maxHearts(api)) return { error: 'You already have every heart you can hold.' };
    },
    hooks: {
      delta: {
        hearts: (api, fx, d) => {
          const lost = -(d[target(fx)] ?? 0);
          if (lost <= 0 || !running(api, fx.caster)) return;
          // Only as many as the caster has room for, so the feed says what really happened.
          const won = Math.min(lost, maxHearts(api) - api.get('hearts', fx.caster) - (d[fx.caster] ?? 0));
          if (won <= 0) return;
          d[fx.caster] = (d[fx.caster] ?? 0) + won;
          api.feed(`Heartstrings: ${api.name(target(fx))} lost ${hearts(lost)}, so ${api.name(fx.caster)} won ${hearts(won)}.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Heartstrings', tone: 'good' }),
    overlayFor: 'caster',
  },
  {
    id: 'survival-run.heart-duel',
    name: 'Survival Heart Duel',
    category: 'troll',
    description: 'You and an opponent race to the next right answer. Within 30 seconds, whoever answers one right first takes a heart from the other: the other loses one (never their last) and the winner wins it if they have room.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hearts'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const me = needRunning(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needRunning(api, target(c), false);
      if (isErr(them)) return them;
      seenNow(api, fx!, [c.caster, target(c)]);
    },
    hooks: {
      delta: {
        // The first right answer decides the duel; the heart moves on the next tick, outside the answer.
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
        settleDuel(api, fx);
        api.endEffect(fx.eid, 'used');
      },
      // A right answer in the last moments still counts.
      end: (api, fx, reason) => {
        if (reason === 'expired' || reason === 'stopped') settleDuel(api, fx);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Heart duel: first right answer wins', until: fx.endsAt }),
  },
  {
    id: 'survival-run.safety-rope',
    name: 'Survivor\'s Safety Rope',
    category: 'advantage',
    description: 'Only on your last heart: within the next 30 seconds, your first wrong answer while you are on your last heart is caught before it counts, so you can answer again. Running out of time is not caught.',
    target: 'self',
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    stacking: 'reject',
    apply: (api, c) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      if (r.hearts !== 1) return { error: 'The safety rope only works on your last heart.' };
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const r = running(api, id);
        const a = r && answering(r, action);
        if (!a || r.hearts !== 1 || api.ctx.questions.grade(a.iid, a.answer).correct) return;
        api.endEffect(fx.eid, 'used');
        return { block: 'Safety rope! That answer is wrong. Try again.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Safety rope', tone: 'good' }),
  },

  /* ------------------------------- the question timer, again ------------------------------- */
  {
    id: 'survival-run.tempo-lock',
    name: 'Survival Tempo Lock',
    category: 'advantage',
    description: 'For 30 seconds, your right answers do not shorten your question timer.',
    target: 'self',
    modes: [MODE],
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const r = needRunning(api, c.caster, true);
      if (isErr(r)) return r;
      fx!.data.timerMs = r.timerMs;
      seenNow(api, fx!, [c.caster]);
    },
    hooks: {
      // Follow changes other cheats make to the timer between answers.
      tick: (api, fx) => {
        const r = running(api, fx.caster);
        if (r) fx.data.timerMs = r.timerMs;
      },
      delta: {
        score: (api, fx, d) => {
          const r = running(api, fx.caster);
          if (!r || !justAnsweredRight(api, fx, fx.caster, d)) return;
          r.timerMs = Math.max(r.timerMs, Number(fx.data.timerMs));
          fx.data.timerMs = r.timerMs;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Timer locked', tone: 'good' }),
  },
];

defineCheats(cheats);
