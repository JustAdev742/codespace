import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { stakeMultiplier, type Level } from '../../modes/confidence/index.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { odds, target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Confidence: before every question each
 * player wagers how sure they are (1 guessing, 2 fairly sure, 3 certain),
 * with only the prompt on screen; then the choices appear; then every score
 * changes at once when the question is scored. Confidence runs its own
 * phases (wager, question, reveal) rather than syncRounds, so its clock is
 * bent here.
 *
 * Confidence's state as cheats see it: `s.phase`, `s.round`, `s.order`,
 * `s.baseRounds` (questions before returning ones), `s.wagers`, `s.answers`,
 * `s.outcomes` (filled when a question is scored), `s.scores`, `s.lastGain`.
 * The adapter's read-only `scored` meter jumps at the moment of scoring, so
 * "when this question is scored" effects hook it.
 */

const MODE = 'confidence';
const M = [MODE] as const;
const S = ['meter:score'] as const;
const TIMER = 'phase';

type Settings = { highStakes?: boolean; risingStakes?: boolean };
interface Outcome {
  level: Level;
  answered: boolean;
  correct: boolean;
  change: number;
}

const LEVEL_NAMES: Record<number, string> = { 1: 'guessing', 2: 'fairly sure', 3: 'certain' };
const LEVEL_OPTIONS = [
  { value: '1', label: '1: guessing' },
  { value: '2', label: '2: fairly sure' },
  { value: '3', label: '3: certain' },
] as const;

const opts = (api: ChaosApi) => api.ctx.settings as Settings;
const levelOf = (api: ChaosApi, id: PlayerId): number => api.s.wagers[id] ?? 1;

/** Error unless the wager window or the question is running, and returns which. */
function liveRound(api: ChaosApi): { error: string } | null {
  return api.s.phase === 'wager' || api.s.phase === 'question' ? null : { error: 'Wait for the next question to begin.' };
}

/** A "this question" effect: remember which round it belongs to. */
function forThisRound(api: ChaosApi, fx: ActiveEffect | null) {
  if (fx) fx.data.round = api.s.round;
}

/**
 * Change one player's score for the question just scored, keeping the
 * mode's floor at 0 and its own record of the outcome (shown at the reveal)
 * honest. Returns the new change.
 */
function rescore(api: ChaosApi, id: PlayerId, change: number): number {
  const o = api.s.outcomes[id] as Outcome;
  const before = api.get('score', id) - o.change;
  const after = Math.max(0, before + change);
  api.set('score', id, after);
  o.change = after - before;
  api.s.lastGain[id] = o.change;
  return o.change;
}

/** Whether the question this effect belongs to has just been scored; ends the effect if its question went by. */
function scoredNow(api: ChaosApi, fx: ActiveEffect, d: Record<string, number>): boolean {
  if (api.s.round !== Number(fx.data.round)) {
    api.endEffect(fx.eid, 'expired');
    return false;
  }
  return (d.game ?? 0) > 0 && api.s.phase === 'reveal';
}

/** Move the end of the running phase (wager window or question clock), keeping the mode's timer in step. */
function moveClock(api: ChaosApi, endsAt: number) {
  const s = api.s;
  const at = Math.max(api.now(), endsAt);
  if (s.phase === 'question') {
    s.deadline = at;
    s.phaseEndsAt = at;
    api.ctx.setTimer(TIMER, at + DEADLINE_GRACE_MS);
  } else {
    s.phaseEndsAt = at;
    api.ctx.setTimer(TIMER, at);
  }
}

const phaseEnd = (api: ChaosApi): number => (api.s.phase === 'question' ? api.s.deadline : (api.s.phaseEndsAt ?? api.now()));

const cheats: CheatDef[] = [
  /* ------------------------------- wagers ------------------------------- */
  {
    id: 'confidence.second-thoughts',
    name: 'Second Thoughts',
    category: 'advantage',
    description: 'Change how sure you are after the choices have appeared (normally your confidence is locked by then). Only before you answer.',
    target: 'self',
    modes: M,
    params: [{ key: 'level', label: 'New confidence', kind: 'choice', options: LEVEL_OPTIONS, default: '3' }],
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      if (api.s.phase !== 'question') return { error: 'The choices are not on screen yet: you can still change your confidence the normal way.' };
      if (api.s.answers[c.caster]) return { error: 'You have already answered this question.' };
      const level = Number(c.params.level);
      if (levelOf(api, c.caster) === level) return { error: `You are already ${LEVEL_NAMES[level]}.` };
      api.s.wagers[c.caster] = level;
      api.feed(`Second thoughts: you are now ${LEVEL_NAMES[level]} (level ${level}).`, 'info', [c.caster]);
    },
  },
  {
    id: 'confidence.whisper-campaign',
    name: 'Whisper Campaign',
    category: 'troll',
    description: 'While the wager window is open, set how sure an opponent is (guessing, fairly sure or certain: you choose) and lock it, so they cannot change it for this question.',
    target: 'opponent',
    modes: M,
    params: [{ key: 'level', label: 'Their confidence', kind: 'choice', options: LEVEL_OPTIONS, default: '3' }],
    cost: 35,
    cooldownMs: 45_000,
    durationMs: 20_000,
    undoable: false,
    apply: (api, c, fx) => {
      if (api.s.phase !== 'wager') return { error: 'Only while players are choosing how sure they are.' };
      const t = target(c);
      const level = Number(c.params.level);
      if (api.s.wagers[t] === level) return { error: `${api.name(t)} is already ${LEVEL_NAMES[level]}.` };
      api.s.wagers[t] = level;
      forThisRound(api, fx);
      fx!.endsAt = Math.min(fx!.endsAt, api.s.phaseEndsAt ?? fx!.endsAt);
      api.feed(`A whisper campaign made you ${LEVEL_NAMES[level]} (level ${level}) for this question, and it is locked.`, 'bad', [t]);
    },
    hooks: {
      gate: (api, fx, _id, action) => {
        const a = action as { type?: string } | null;
        if (a?.type === 'wager' && api.s.phase === 'wager' && api.s.round === Number(fx.data.round)) return { block: 'A whisper campaign has locked your confidence for this question.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Confidence locked', tone: 'bad' }),
  },
  {
    id: 'confidence.nerve-shake-up',
    name: 'Nerve Shake-Up',
    category: 'random',
    description: `While the wager window is open, every other player's confidence jumps to a different level, picked at random (${odds([['each of the two levels they did not have', 50]])}; not choosing counts as guessing). They can still change it before the choices appear.`,
    target: 'everyone-else',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      if (api.s.phase !== 'wager') return { error: 'Only while players are choosing how sure they are.' };
      for (const t of c.targets) {
        const was = levelOf(api, t);
        api.s.wagers[t] = api.rng.pick([1, 2, 3].filter((l) => l !== was));
        api.feed(`Your nerves were shaken: you are now ${LEVEL_NAMES[api.s.wagers[t]]}. You can still change it.`, 'bad', [t]);
      }
    },
  },
  /* ------------------------------- clock -------------------------------- */
  {
    id: 'confidence.snap-decision',
    name: 'Confidence Crunch',
    category: 'round',
    description: 'The wager window (or, once the choices are up, the question) closes 3 seconds from now. Anyone who has not chosen counts as guessing; anyone who has not answered misses the question.',
    target: 'room',
    hostile: true,
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const no = liveRound(api);
      if (no) return no;
      if (phaseEnd(api) - api.now() <= 3000) return { error: 'It is about to close anyway.' };
      moveClock(api, api.now() + 3000);
      api.feed(api.s.phase === 'wager' ? 'Snap decision: 3 seconds to choose how sure you are!' : 'Snap decision: 3 seconds left to answer!', 'big');
    },
  },
  {
    id: 'confidence.mull-it-over',
    name: 'Mull It Over',
    category: 'round',
    description: 'Adds 3 to 10 seconds (you choose) to the wager window, or to the question clock once the choices are up.',
    target: 'room',
    hostile: false,
    modes: M,
    params: [{ key: 'seconds', label: 'Extra seconds', kind: 'int', min: 3, max: 10, default: 6, unit: 's' }],
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const no = liveRound(api);
      if (no) return no;
      moveClock(api, phaseEnd(api) + Number(c.params.seconds) * 1000);
      api.feed(`More time to think: +${Number(c.params.seconds)} seconds.`, 'info');
    },
  },
  /* ------------------------------ scoring ------------------------------- */
  {
    id: 'confidence.all-in',
    name: 'All In',
    category: 'score',
    description: 'For the question being played now, your confidence counts one level higher when it is scored: guessing scores like fairly sure, fairly sure like certain, and certain becomes a fourth level, worth 400 if right and costing 150 if wrong (400 with high stakes; rising stakes multiply both).',
    target: 'self',
    modes: M,
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const no = liveRound(api);
      if (no) return no;
      forThisRound(api, fx);
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          const o = api.s.outcomes[fx.caster] as Outcome | undefined;
          api.endEffect(fx.eid, 'used');
          if (!o) return;
          const up = o.level + 1;
          const mult = stakeMultiplier(api.s.round, Boolean(opts(api).risingStakes));
          const change = (o.correct ? 100 * up : opts(api).highStakes ? -100 * up : -50 * (up - 1)) * mult;
          const now = rescore(api, fx.caster, change);
          api.feed(`All in: ${api.name(fx.caster)}'s answer counted at level ${up} (${now >= 0 ? '+' : ''}${now}).`, o.correct ? 'good' : 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'All in: one level higher', tone: 'info' }),
  },
  {
    id: 'confidence.tied-fates',
    name: 'Tied Fates',
    category: 'score',
    description: 'When the question being played now is scored, you and an opponent swap what it did to your scores: you get their gain or loss and they get yours. Scores still never drop below 0.',
    target: 'opponent',
    modes: M,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const no = liveRound(api);
      if (no) return no;
      forThisRound(api, fx);
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          const t = target(fx);
          const mine = api.s.outcomes[fx.caster] as Outcome | undefined;
          const theirs = api.s.outcomes[t] as Outcome | undefined;
          api.endEffect(fx.eid, 'used');
          if (!mine || !theirs) return;
          if (mine.change === theirs.change) {
            api.feed(`Tied Fates: ${api.name(fx.caster)} and ${api.name(t)} got the same result, so nothing changed hands.`, 'info');
            return;
          }
          const a = mine.change;
          const b = theirs.change;
          rescore(api, fx.caster, b);
          rescore(api, t, a);
          api.feed(`Tied Fates: ${api.name(fx.caster)} and ${api.name(t)} swapped their results for that question.`, 'big');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Fates tied', tone: 'bad' }),
  },
  {
    id: 'confidence.doubt-collector',
    name: 'Doubt Collector',
    category: 'economy',
    description: 'When the question being played now is scored, the points every other player loses to a wrong wager are paid to you.',
    target: 'self',
    modes: M,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const no = liveRound(api);
      if (no) return no;
      forThisRound(api, fx);
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          api.endEffect(fx.eid, 'used');
          if (!api.ids().includes(fx.caster)) return;
          let lost = 0;
          for (const [id, o] of Object.entries(api.s.outcomes as Record<PlayerId, Outcome>)) if (id !== fx.caster && o.change < 0) lost += -o.change;
          if (!lost) return;
          const got = api.addScore(fx.caster, lost);
          const mine = api.s.outcomes[fx.caster] as Outcome | undefined;
          if (mine) {
            mine.change += got;
            api.s.lastGain[fx.caster] = mine.change;
          }
          api.feed(`${api.name(fx.caster)} collected ${got} points of everyone else's doubt.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Collecting lost wagers', tone: 'good' }),
  },
  /* -------------------------- returning questions ------------------------ */
  {
    id: 'confidence.comet-return',
    name: 'Call the Comet Back',
    category: 'round',
    description: 'Returning Comets only: the question being played now (or just scored) comes back once at the end of the game, with a fresh choice of how sure you are.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['returning'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (!['wager', 'question', 'reveal'].includes(s.phase)) return { error: 'Wait for a question to be on screen.' };
      if (s.round >= s.baseRounds) return { error: 'This question is already a returning one.' };
      const qid = s.order[s.round];
      if (s.order.slice(s.round + 1).includes(qid)) return { error: 'This question is already coming back.' };
      s.order.push(qid);
      api.feed('This question will come round again at the end.', 'info');
    },
  },
  {
    id: 'confidence.comet-deflect',
    name: 'Deflect the Comet',
    category: 'round',
    description: 'Returning Comets only: the last returning question waiting at the end of the game is knocked away and will not come back. Never the last question left.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['returning'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (s.phase === 'done') return { error: 'The game is over.' };
      const last = s.order.length - 1;
      if (last <= s.round || last < s.baseRounds) return { error: 'No returning question is waiting.' };
      if (last - s.round < 2) return { error: 'That is the last question left, so it stays.' };
      s.order.pop();
      api.feed('A returning question was knocked off course: one question fewer at the end.', 'info');
    },
  },
];

defineCheats(cheats);
