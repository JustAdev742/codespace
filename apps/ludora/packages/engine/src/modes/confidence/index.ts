/*
 * Confidence: a host-paced quiz with a wager before every question.
 *
 *   intro -> (wager -> question -> reveal -> [leaderboard])* -> done
 *
 * During the wager only the prompt (and its picture) is sent to players: no
 * choices, no question type, no instance id. The question is presented
 * (and its clock started) when the wager closes. Answers are graded with
 * ctx.questions.grade and recorded with ctx.recordAnswer as they arrive;
 * score changes are applied when the question closes, so nobody's score
 * gives the answer away early.
 */
import { z } from 'zod';
import { answerSchema, type Media } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { DEADLINE_GRACE_MS, leaderboard } from '../../mechanics/syncRounds.ts';
import { meta, settings } from './meta.ts';

export type Level = 1 | 2 | 3;
type Settings = { wagerSeconds: number; highStakes: boolean; autoAdvance: boolean; leaderboard: boolean; returning: boolean; risingStakes: boolean };
type Phase = 'intro' | 'wager' | 'question' | 'reveal' | 'leaderboard' | 'done';

interface Answered {
  responseMs: number;
  correct: boolean;
  partial: number;
  level: Level;
  /** The choice token picked, for the answer distribution. */
  token: string | null;
}

interface Outcome {
  level: Level;
  answered: boolean;
  correct: boolean;
  /** The actual change to the score (after the floor at 0). */
  change: number;
}

/** Picks and correct answers per confidence level (index 0 is level 1). */
interface Tally {
  picks: number[];
  right: number[];
}

interface State {
  phase: Phase;
  round: number;
  order: string[];
  iid: string | null;
  roundStartedAt: number;
  questionStartedAt: number;
  deadline: number;
  phaseEndsAt: number | null;
  wagers: Record<PlayerId, Level>;
  answers: Record<PlayerId, Answered>;
  outcomes: Record<PlayerId, Outcome>;
  scores: Record<PlayerId, number>;
  lastGain: Record<PlayerId, number>;
  tallies: Record<PlayerId, Tally>;
  /** Questions in the game before any came back; rounds from here on are returning questions. */
  baseRounds: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wager'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
]);
type Action = z.infer<typeof action>;

const TIMER = 'phase';
const INTRO_MS = 4000;
const REVEAL_MS = 6000;
const LEADERBOARD_MS = 5000;
export const LEVELS: readonly Level[] = [1, 2, 3];

const opts = (ctx: ModeContext) => ctx.settings as Settings;

/** Points gained (or lost) for an answer at a confidence level, before the floor at 0. */
export function confidenceChange(level: Level, correct: boolean, highStakes = false): number {
  if (correct) return 100 * level;
  return highStakes ? -100 * level : -50 * (level - 1);
}

/** Rising stakes: what every stake is multiplied by in a round (0-based). */
export function stakeMultiplier(round: number, rising: boolean): number {
  return rising ? 1 + Math.floor(Math.max(0, round) / 4) : 1;
}

/** The change for a level in this round, with rising stakes applied. */
function changeFor(s: State, ctx: ModeContext, level: Level, correct: boolean): number {
  const st = opts(ctx);
  return confidenceChange(level, correct, st.highStakes) * stakeMultiplier(s.round, st.risingStakes);
}

function setPhase(s: State, ctx: ModeContext, phase: Phase, endsAt: number | null, timerAt: number | null = endsAt) {
  s.phase = phase;
  s.phaseEndsAt = endsAt;
  if (timerAt !== null) ctx.setTimer(TIMER, timerAt);
  else ctx.clearTimer(TIMER);
}

function calibrationSummary(s: State): string {
  let guesses = 0;
  let guessesRight = 0;
  let middling = 0;
  let certain = 0;
  let certainRight = 0;
  for (const t of Object.values(s.tallies)) {
    guesses += t.picks[0] ?? 0;
    guessesRight += t.right[0] ?? 0;
    middling += t.picks[1] ?? 0;
    certain += t.picks[2] ?? 0;
    certainRight += t.right[2] ?? 0;
  }
  const pct = (right: number, of: number) => Math.round((100 * right) / of);
  if (certain && guesses) return `Certain answers were right ${pct(certainRight, certain)}% of the time, guesses ${pct(guessesRight, guesses)}%.`;
  if (certain) return `Certain answers were right ${pct(certainRight, certain)}% of the time.`;
  if (guesses + middling) return 'Nobody was certain this time. Final scores.';
  return 'Final scores.';
}

function finish(s: State, ctx: ModeContext) {
  s.phase = 'done';
  s.phaseEndsAt = null;
  s.iid = null;
  ctx.clearTimer(TIMER);
  // No summary here: results() writes one about how well confidence matched reality.
  ctx.endGame();
}

function startRound(s: State, ctx: ModeContext) {
  s.round++;
  if (s.round >= s.order.length) return finish(s, ctx);
  if (opts(ctx).risingStakes && s.round > 0 && s.round % 4 === 0) ctx.feed(`The stakes rise: every stake is now ×${stakeMultiplier(s.round, true)}.`, { tone: 'big' });
  if (s.round === s.baseRounds) ctx.feed('Returning questions: the ones most of you missed come round again.', { tone: 'big' });
  s.iid = null;
  s.wagers = {};
  s.answers = {};
  s.outcomes = {};
  s.roundStartedAt = ctx.now();
  setPhase(s, ctx, 'wager', ctx.now() + opts(ctx).wagerSeconds * 1000);
}

function openQuestion(s: State, ctx: ModeContext) {
  const qid = s.order[s.round]!;
  s.iid = ctx.questions.present(qid);
  s.questionStartedAt = ctx.now();
  s.deadline = s.questionStartedAt + ctx.questions.timeLimitMs(s.iid);
  setPhase(s, ctx, 'question', s.deadline, s.deadline + DEADLINE_GRACE_MS);
}

function closeRound(s: State, ctx: ModeContext) {
  const st = opts(ctx);
  s.lastGain = {};
  for (const p of ctx.players()) {
    const a = s.answers[p.id];
    const picked = s.wagers[p.id];
    // Players who were not really here for this question (offline without choosing, or joined after it began) are left out.
    if (!a && picked === undefined && (!p.connected || p.joinedAt > s.roundStartedAt)) continue;
    const level = picked ?? 1;
    const correct = a?.correct ?? false;
    const before = s.scores[p.id] ?? 0;
    const after = Math.max(0, before + changeFor(s, ctx, level, correct));
    s.scores[p.id] = after;
    s.lastGain[p.id] = after - before;
    s.outcomes[p.id] = { level, answered: Boolean(a), correct, change: after - before };
    const t = (s.tallies[p.id] ??= { picks: [0, 0, 0], right: [0, 0, 0] });
    t.picks[level - 1] = (t.picks[level - 1] ?? 0) + 1;
    if (correct) t.right[level - 1] = (t.right[level - 1] ?? 0) + 1;
  }
  if (st.returning && s.round < s.baseRounds) {
    const took = Object.values(s.outcomes);
    if (took.length && took.filter((o) => o.correct).length * 2 < took.length) {
      s.order.push(s.order[s.round]!);
      ctx.feed('Fewer than half got that one. It comes back at the end.', { tone: 'info' });
    }
  }
  setPhase(s, ctx, 'reveal', st.autoAdvance ? ctx.now() + REVEAL_MS : null);
}

function advance(s: State, ctx: ModeContext) {
  switch (s.phase) {
    case 'intro':
      return startRound(s, ctx);
    case 'wager':
      return openQuestion(s, ctx);
    case 'question':
      return closeRound(s, ctx);
    case 'reveal': {
      const last = s.round >= s.order.length - 1;
      if (!last && opts(ctx).leaderboard) return setPhase(s, ctx, 'leaderboard', opts(ctx).autoAdvance ? ctx.now() + LEADERBOARD_MS : null);
      return startRound(s, ctx);
    }
    case 'leaderboard':
      return startRound(s, ctx);
    case 'done':
      return;
  }
}

/** Every connected player has done something (chosen, answered). */
function everyone(ctx: ModeContext, done: (id: PlayerId) => boolean): boolean {
  const here = ctx.players().filter((p) => p.connected);
  return here.length > 0 && here.every((p) => done(p.id));
}

function teamScores(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const total = members.reduce((n, p) => n + (s.scores[p.id] ?? 0), 0);
    const avg = members.length ? Math.round(total / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: avg, members: members.length };
  });
}

const fmt = (n: number) => n.toLocaleString('en-GB');

export const confidence = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const ids = ctx.common.shuffleQuestions ? ctx.rng.shuffle(ctx.questions.ids()) : ctx.questions.ids().slice();
    const limit = Math.min(ids.length, ctx.common.questionLimit || Infinity);
    const scores: Record<PlayerId, number> = {};
    for (const p of ctx.players()) scores[p.id] = 0;
    const s: State = {
      phase: 'intro',
      round: -1,
      order: ids.slice(0, limit),
      iid: null,
      roundStartedAt: 0,
      questionStartedAt: 0,
      deadline: 0,
      phaseEndsAt: null,
      wagers: {},
      answers: {},
      outcomes: {},
      scores,
      lastGain: {},
      tallies: {},
      baseRounds: 0,
    };
    s.baseRounds = s.order.length;
    setPhase(s, ctx, 'intro', ctx.now() + INTRO_MS);
    return s;
  },
  onPlayerJoin(s, p) {
    s.scores[p.id] ??= 0;
  },
  onPlayerLeave(s, _p, ctx) {
    // Nobody left to wait for: move on rather than run the clock down.
    if (s.phase === 'wager' && everyone(ctx, (id) => s.wagers[id] !== undefined)) openQuestion(s, ctx);
    else if (s.phase === 'question' && everyone(ctx, (id) => Boolean(s.answers[id]))) closeRound(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    if (a.type === 'wager') {
      if (s.phase !== 'wager') return { error: s.phase === 'question' ? 'Your confidence is locked in for this question.' : 'Wait for the next question.' };
      // You can change your mind until everyone has chosen or time runs out.
      s.wagers[playerId] = a.level;
      if (everyone(ctx, (id) => s.wagers[id] !== undefined)) openQuestion(s, ctx);
      return;
    }
    if (s.phase !== 'question' || !s.iid) return { error: 'Answers are closed.' };
    if (a.iid !== s.iid) return { error: 'That question has closed.' };
    if (s.answers[playerId]) return { error: 'You already answered.' };
    const now = ctx.now();
    if (now > s.deadline + DEADLINE_GRACE_MS) return { error: 'Time is up.' };
    const grade = ctx.questions.grade(s.iid, a.answer);
    const responseMs = Math.max(0, Math.min(now - s.questionStartedAt, s.deadline - s.questionStartedAt));
    s.answers[playerId] = {
      responseMs,
      correct: grade.correct,
      partial: grade.partial,
      level: s.wagers[playerId] ?? 1,
      token: a.answer.type === 'mcq' ? a.answer.choiceId : a.answer.type === 'truefalse' ? String(a.answer.value) : null,
    };
    // A returning question is a second go: it counts for reports, not again for rewards.
    const kind = s.round >= s.baseRounds ? { kind: 'attempt' as const } : {};
    ctx.recordAnswer({ playerId, qid: ctx.questions.instance(s.iid).qid, correct: grade.correct, partial: grade.partial, responseMs, ...kind });
    if (everyone(ctx, (id) => Boolean(s.answers[id]))) closeRound(s, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === TIMER) advance(s, ctx);
  },
  onHostNext(s, ctx) {
    if (s.phase === 'done') return { error: 'The game is over.' };
    advance(s, ctx);
  },
  view(s, viewer, ctx) {
    const st = opts(ctx);
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const revealed = s.phase === 'reveal';
    const qid = s.round >= 0 ? s.order[s.round] : undefined;
    // Wager phase: the prompt and its picture only. Nothing else about the question leaves the server.
    let prompt: { prompt: string; media?: Media } | null = null;
    if (s.phase === 'wager' && qid) {
      const q = ctx.questions.get(qid);
      prompt = { prompt: q.prompt, ...(q.media ? { media: q.media } : {}) };
    }
    const question =
      (s.phase === 'question' || revealed) && s.iid
        ? { ...ctx.questions.view(s.iid, { deadline: s.deadline, index: s.round, total: s.order.length }), shownAt: s.questionStartedAt }
        : null;
    let levels: { level: Level; players: number; right: number }[] | null = null;
    let distribution: Record<string, number> | null = null;
    if (revealed) {
      const outcomes = Object.values(s.outcomes);
      levels = LEVELS.map((level) => ({
        level,
        players: outcomes.filter((o) => o.level === level).length,
        right: outcomes.filter((o) => o.level === level && o.correct).length,
      }));
      distribution = {};
      for (const a of Object.values(s.answers)) if (a.token) distribution[a.token] = (distribution[a.token] ?? 0) + 1;
    }
    const here = ctx.players().filter((p) => p.connected);
    return {
      // Read by the host controls to label the Next button.
      sync: { phase: s.phase, phaseEndsAt: s.phaseEndsAt },
      phase: s.phase,
      round: s.round,
      total: s.order.length,
      phaseEndsAt: s.phaseEndsAt,
      roundStartedAt: s.roundStartedAt,
      highStakes: st.highStakes,
      stakes: LEVELS.map((level) => ({ level, gain: changeFor(s, ctx, level, true), loss: -changeFor(s, ctx, level, false) })),
      prompt,
      question,
      reveal: revealed && s.iid ? ctx.questions.reveal(s.iid) : null,
      explanation: revealed && s.iid ? (ctx.questions.explanation(s.iid) ?? null) : null,
      levels,
      distribution,
      chosen: here.filter((p) => s.wagers[p.id] !== undefined).length,
      answered: Object.keys(s.answers).length,
      players: here.length,
      board: leaderboard(s.scores, s.lastGain, ctx, viewer, viewer.kind === 'host' ? 10 : 5),
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      you: me
        ? {
            wager: s.wagers[me] ?? null,
            answered: Boolean(s.answers[me]),
            // Hidden until the reveal so nobody can signal answers to friends.
            outcome: revealed ? (s.outcomes[me] ?? null) : null,
            score: s.scores[me] ?? 0,
            tally: s.tallies[me] ?? null,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const pts = s.scores[p.id] ?? 0;
      const t = s.tallies[p.id];
      const certain = t && (t.picks[2] ?? 0) > 0 ? `, right ${t.right[2] ?? 0} of ${t.picks[2]} when certain` : '';
      return { playerId: p.id, score: pts, label: `${fmt(pts)} pts${certain}` };
    });
    const teams = ctx.teams().length ? teamScores(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: `${fmt(t.score)} avg` })) : undefined;
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: calibrationSummary(s) };
  },
  bot(view, ctx) {
    if (view?.phase === 'wager' && view.you && view.you.wager === null) {
      // Bots cannot see the question yet, so they pick a level that roughly matches how good they are.
      const r = ctx.rng.next();
      const level: Level = r < ctx.skill * 0.5 ? 3 : r < ctx.skill ? 2 : 1;
      return { type: 'wager', level };
    }
    const q = view?.question;
    if (view?.phase === 'question' && q && view.you && !view.you.answered) return { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) };
    return null;
  },
  botDelay(view, rng) {
    if (view?.phase === 'wager') return 600 + rng.int(0, 3000);
    const q = view?.question;
    if (view?.phase === 'question' && q?.deadline) {
      const window = Math.max(800, (q.deadline - q.shownAt) * 0.7);
      return 900 + rng.int(0, Math.round(window));
    }
    return 1000;
  },
});
