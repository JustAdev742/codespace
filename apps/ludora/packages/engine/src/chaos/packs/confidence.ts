import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { confidenceChange, stakeMultiplier, type Level } from '../../modes/confidence/index.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { odds, target, transfer } from '../cheats/kit.ts';
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

/** What rising stakes multiply every stake by in the question being played. */
const mult = (api: ChaosApi): number => stakeMultiplier(api.s.round, Boolean(opts(api).risingStakes));
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
const outcomes = (api: ChaosApi) => api.s.outcomes as Record<PlayerId, Outcome>;

/** Add to one player's result for the question just scored (their score and the reveal's record of it). Returns what changed. */
function addToResult(api: ChaosApi, id: PlayerId, amount: number): number {
  const o = outcomes(api)[id];
  if (!o) return api.addScore(id, amount);
  const was = o.change;
  return rescore(api, id, was + amount) - was;
}

/** Keep the reveal's record of a result in step after points moved for it. */
function shift(api: ChaosApi, id: PlayerId, delta: number) {
  const o = outcomes(api)[id];
  if (!o || !delta) return;
  o.change += delta;
  api.s.lastGain[id] = o.change;
}

/** A private note to the caster when a "when it is scored" effect turned out to have nothing to do. */
const nothing = (api: ChaosApi, fx: ActiveEffect, why: string) => api.feed(why, 'info', [fx.caster]);

/** End a wager-window effect once the choices appear (or the question it was for has gone). */
function endWithWager(api: ChaosApi, fx: ActiveEffect): boolean {
  if (api.s.phase === 'wager' && api.s.round === Number(fx.data.round)) return false;
  api.endEffect(fx.eid, 'used');
  return true;
}

/** Every other player's confidence right now, or a count per level in a big room. */
function roomText(api: ChaosApi, fx: ActiveEffect) {
  const others = api.others(fx.caster);
  const say = (id: PlayerId): string => (api.s.wagers[id] ? (LEVEL_NAMES[api.s.wagers[id]] ?? 'guessing') : 'not chosen yet');
  if (others.length <= 8) {
    fx.data.text = `How sure they are: ${others.map((id) => `${api.name(id)} ${say(id)}`).join(', ')}.`;
    return;
  }
  const counts = new Map<string, number>();
  for (const id of others) counts.set(say(id), (counts.get(say(id)) ?? 0) + 1);
  fx.data.text = `How sure the room is: ${['certain', 'fairly sure', 'guessing', 'not chosen yet'].map((l) => `${l} ${counts.get(l) ?? 0}`).join(', ')}.`;
}

const CALLS = [
  { value: 'most', label: 'More than half get it right' },
  { value: 'few', label: 'Half or fewer get it right' },
] as const;

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
  /* ------------------------------ more wagers ----------------------------- */
  {
    id: 'confidence.confidence-swap',
    name: 'Confidence Swap',
    category: 'troll',
    description: 'You and an opponent swap how sure you are for the question being played now: while players are choosing, or after the choices appear if neither of you has answered. Not choosing counts as guessing. In the wager window either of you can still change it.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = liveRound(api);
      if (no) return no;
      const t = target(c);
      if (api.s.phase === 'question' && (api.s.answers[c.caster] || api.s.answers[t])) return { error: `${api.s.answers[c.caster] ? 'You have' : `${api.name(t)} has`} already answered this question.` };
      const mine = levelOf(api, c.caster);
      const theirs = levelOf(api, t);
      if (mine === theirs) return { error: `You and ${api.name(t)} are both ${LEVEL_NAMES[mine]} already.` };
      api.s.wagers[c.caster] = theirs;
      api.s.wagers[t] = mine;
      api.feed(`Confidence swap: you are now ${LEVEL_NAMES[theirs]} (level ${theirs}).`, 'info', [c.caster]);
      api.feed(`${api.name(c.caster)} swapped confidence with you: you are now ${LEVEL_NAMES[mine]} (level ${mine}).`, 'bad', [t]);
    },
  },
  {
    id: 'confidence.butterflies',
    name: 'Butterflies',
    category: 'troll',
    description: 'For 40 seconds, an opponent cannot choose to be certain: picking level 3 is refused, and if they are certain in the wager window open now, they drop to fairly sure. Other cheats can still make them certain.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (api.s.phase === 'wager' && api.s.wagers[t] === 3) {
        api.s.wagers[t] = 2;
        api.feed('Butterflies! You are only fairly sure now, not certain.', 'bad', [t]);
      }
    },
    hooks: {
      gate: (_api, _fx, _id, action) => {
        const a = action as { type?: string; level?: number } | null;
        if (a?.type === 'wager' && a.level === 3) return { block: 'Butterflies: you cannot choose to be certain right now.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Butterflies: you cannot be certain', tone: 'bad' }),
  },
  /* ---------------------------- seeing more ----------------------------- */
  {
    id: 'confidence.read-the-room',
    name: 'Read the Room',
    category: 'advantage',
    description: 'While the wager window is open, see how sure every other player is, and watch it change as they choose, until the choices appear.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 60_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      if (api.s.phase !== 'wager') return { error: 'Only while players are choosing how sure they are.' };
      if (!api.others(c.caster).length) return { error: 'Nobody else is in the game.' };
      forThisRound(api, fx);
      if (fx) roomText(api, fx);
    },
    hooks: {
      tick: (api, fx) => {
        if (!endWithWager(api, fx)) roomText(api, fx);
      },
    },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
  {
    id: 'confidence.choice-glimpse',
    name: 'Choice Glimpse',
    category: 'advantage',
    description: 'While the wager window is open, see the choices of the multiple-choice question coming up (in no particular order) before you choose how sure you are. Only for a question with choices to pick from.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 60_000,
    tickMs: 250,
    apply: (api, _c, fx) => {
      if (api.s.phase !== 'wager') return { error: 'Only while players are choosing how sure they are.' };
      const q = api.ctx.questions.get(api.s.order[api.s.round]);
      if (q.type !== 'mcq' && q.type !== 'multi') return { error: 'The question coming up has no choices to preview.' };
      const list = q.choices.map((ch) => ch.text || ch.media?.alt || 'a picture').sort((a, b) => a.localeCompare(b));
      forThisRound(api, fx);
      if (fx) fx.data.text = `Coming up${q.type === 'multi' ? ' (more than one may be right)' : ''}: ${list.join(' · ')}`;
    },
    hooks: { tick: (api, fx) => void endWithWager(api, fx) },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
  {
    id: 'confidence.scout-report',
    name: 'Scout Report',
    category: 'advantage',
    description: 'For 15 seconds, see how sure an opponent has been on the questions scored so far and how often they were right at each level (only you see it).',
    target: 'opponent',
    hostile: false,
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    durationMs: 15_000,
    overlayFor: 'caster',
    apply: (api, c, fx) => {
      const t = target(c);
      const tally = api.s.tallies[t] as { picks: number[]; right: number[] } | undefined;
      if (!tally || !tally.picks.some((n) => n > 0)) return { error: `${api.name(t)} has not been scored on a question yet.` };
      const at = (i: number) => `${LEVEL_NAMES[i + 1]} ${tally.picks[i] ?? 0} (${tally.right[i] ?? 0} right)`;
      if (fx) fx.data.text = `${api.name(t)} so far: ${[0, 1, 2].map(at).join(', ')}.`;
    },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
  /* --------------------------- more scoring ----------------------------- */
  {
    id: 'confidence.honest-guess',
    name: 'Honest Guess',
    category: 'score',
    description: 'For the question being played now: if you are guessing (level 1) and turn out to be wrong, or do not answer, you still score what a right guess would (100, more with rising stakes). It changes nothing when you are right, fairly sure or certain.',
    target: 'self',
    modes: M,
    needs: S,
    cost: 25,
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
          const o = outcomes(api)[fx.caster];
          api.endEffect(fx.eid, 'used');
          if (!o) return;
          if (o.correct) return nothing(api, fx, 'You were right, so Honest Guess was not needed.');
          if (o.level !== 1) return nothing(api, fx, `You were ${LEVEL_NAMES[o.level]}, not guessing, so Honest Guess changed nothing.`);
          const now = rescore(api, fx.caster, 100 * mult(api));
          api.feed(`Honest guess: ${api.name(fx.caster)} knew it was only a guess, and scored ${signed(now)} anyway.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Honest guess: a wrong guess still scores', tone: 'good' }),
  },
  {
    id: 'confidence.danger-round',
    name: 'Danger Round',
    category: 'round',
    description: 'When the question being played now is scored, every wrong or missed answer costs what it would in High Stakes: 100 points for each level of confidence, so even a guess costs 100 (rising stakes multiply it; scores never drop below 0). Not in a High Stakes game, where that is already the rule.',
    target: 'room',
    hostile: true,
    modes: M,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      if (opts(api).highStakes) return { error: 'This game is already High Stakes.' };
      const no = liveRound(api);
      if (no) return no;
      forThisRound(api, fx);
      api.feed('Danger round: a wrong answer to this question costs High Stakes points.', 'big');
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          api.endEffect(fx.eid, 'used');
          let hit = 0;
          for (const [id, o] of Object.entries(outcomes(api))) {
            if (o.correct) continue;
            const was = o.change;
            if (rescore(api, id, -100 * o.level * mult(api)) !== was) hit++;
          }
          if (hit) api.feed(`Danger round: ${hit} wrong ${hit === 1 ? 'answer' : 'answers'} cost High Stakes points.`, 'bad');
        },
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Danger round: wrong answers cost High Stakes points', tone: 'bad' }),
  },
  {
    id: 'confidence.phone-a-friend',
    name: 'Phone a Friend',
    category: 'score',
    description: 'When the question being played now is scored, you score as if you were right or wrong just as a player you choose was, at your own confidence. Their score is not touched, and your own answer is still the one the teacher sees.',
    target: 'player',
    modes: M,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 60_000,
    stacking: 'reject',
    overlayFor: 'caster',
    apply: (api, c, fx) => {
      if (target(c) === c.caster) return { error: 'Pick someone other than yourself.' };
      const no = liveRound(api);
      if (no) return no;
      forThisRound(api, fx);
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          const me = fx.caster;
          const friend = target(fx);
          const o = outcomes(api)[me];
          const f = outcomes(api)[friend];
          api.endEffect(fx.eid, 'used');
          if (!o) return;
          if (!f) return nothing(api, fx, `${api.name(friend)} was not scored on that question, so Phone a Friend changed nothing.`);
          if (o.correct === f.correct) return nothing(api, fx, `${api.name(friend)} was ${f.correct ? 'right' : 'wrong'} too, so Phone a Friend changed nothing.`);
          const now = rescore(api, me, confidenceChange(o.level as Level, f.correct, Boolean(opts(api).highStakes)) * mult(api));
          api.feed(`Phone a Friend: ${api.name(friend)} was ${f.correct ? 'right' : 'wrong'}, so ${api.name(me)} scored ${signed(now)} as if they were too.`, f.correct ? 'good' : 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Phoning a friend for this question', tone: 'info' }),
  },
  {
    id: 'confidence.against-the-crowd',
    name: 'Against the Crowd',
    category: 'score',
    description: 'When the question being played now is scored, if you got it right and fewer than half of the players scored on it did, what you won for it is doubled.',
    target: 'self',
    modes: M,
    needs: S,
    cost: 30,
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
          const o = outcomes(api)[fx.caster];
          api.endEffect(fx.eid, 'used');
          if (!o) return;
          const took = Object.values(outcomes(api));
          const right = took.filter((x) => x.correct).length;
          if (!o.correct) return nothing(api, fx, 'You did not get that one right, so Against the Crowd changed nothing.');
          if (right * 2 >= took.length) return nothing(api, fx, `${right} of ${took.length} got it right, so you were not against the crowd.`);
          const now = rescore(api, fx.caster, o.change * 2);
          api.feed(`Against the crowd: only ${right} of ${took.length} got it right, and ${api.name(fx.caster)} was one of them (${signed(now)}).`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Against the crowd: a lonely right answer pays double', tone: 'good' }),
  },
  {
    id: 'confidence.side-bet',
    name: 'Side Bet',
    category: 'score',
    description: 'Bet against an opponent on the question being played now. When it is scored, if they got it wrong (or did not answer) you take 100 points from them, and if they got it right you pay them 100 (rising stakes multiply the bet; nobody pays more than they have). Both of you need points to bet.',
    target: 'opponent',
    modes: M,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const no = liveRound(api);
      if (no) return no;
      if (api.score(c.caster) <= 0 || api.score(target(c)) <= 0) return { error: 'Both of you need points to bet.' };
      forThisRound(api, fx);
      api.feed(`${api.name(c.caster)} made a side bet that you get this question wrong.`, 'info', [target(c)]);
    },
    hooks: {
      delta: {
        scored: (api, fx, d) => {
          if (!scoredNow(api, fx, d)) return;
          const me = fx.caster;
          const t = target(fx);
          const f = outcomes(api)[t];
          api.endEffect(fx.eid, 'used');
          if (!api.ids().includes(me)) return;
          if (!f) return nothing(api, fx, `${api.name(t)} was not scored on that question, so the side bet is off.`);
          const [from, to] = f.correct ? [me, t] : [t, me];
          const moved = transfer(api, 'score', from, to, 100 * mult(api));
          shift(api, from, -moved);
          shift(api, to, moved);
          if (!moved) return nothing(api, fx, `${api.name(from)} had no points left to pay the side bet.`);
          api.feed(`Side bet: ${api.name(t)} was ${f.correct ? 'right' : 'wrong'}, so ${api.name(from)} paid ${api.name(to)} ${moved} points.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Someone bet against you', tone: 'bad' }),
  },
  {
    id: 'confidence.called-it',
    name: 'Called It',
    category: 'score',
    description: 'Call how the room does on the question being played now: more than half of the players scored on it get it right, or half or fewer do (a missed answer counts as wrong). When it is scored, a right call wins you 100 points and a wrong one costs you 50 (rising stakes multiply both; scores never drop below 0).',
    target: 'self',
    modes: M,
    needs: S,
    params: [{ key: 'call', label: 'Your call', kind: 'choice', options: CALLS, default: 'most' }],
    cost: 25,
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
          api.endEffect(fx.eid, 'used');
          const took = Object.values(outcomes(api));
          if (!took.length || !api.ids().includes(fx.caster)) return;
          const right = took.filter((o) => o.correct).length;
          const most = right * 2 > took.length;
          const ok = (fx.params.call === 'most') === most;
          const got = addToResult(api, fx.caster, (ok ? 100 : -50) * mult(api));
          api.feed(`${api.name(fx.caster)} called it ${ok ? 'right' : 'wrong'}: ${right} of ${took.length} got it right (${signed(got)}).`, ok ? 'good' : 'bad');
        },
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: fx.params.call === 'most' ? 'Called it: most get it right' : 'Called it: most get it wrong', tone: 'info' }),
  },
];

defineCheats(cheats);
