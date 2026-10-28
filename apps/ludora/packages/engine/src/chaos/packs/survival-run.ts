import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { FLOOR_MS } from '../../modes/survival-run/index.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { inGame, odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Survival Run: they work on hearts (never the
 * last one: losing that ends a run, which only the run itself may do), on
 * each runner's shrinking question timer, and on second-wind questions.
 * Hearts move through the 'hearts' meter, which keeps them between 1 and the
 * most the mode lets a runner hold.
 */

const MODE = 'survival-run';
/** Cheats that shorten a timer never leave a runner with less than this on the clock. */
const MIN_LEFT_MS = 3000;

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
    name: 'Survivor\'s Blood Pact',
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
      api.feed(`${api.name(c.caster)} sealed a blood pact with ${api.name(t)}: ${hearts(theirs)} for ${hearts(mine)}.`, 'big');
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
];

defineCheats(cheats);
