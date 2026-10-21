import type { Answer, AnswerReveal } from '@ludora/shared';
import type { ActionResult, ModeContext, PlayerId, QuestionView, Viewer } from '../sdk/types.ts';

/*
 * Host-paced rounds: everyone gets the same question at the same moment,
 * answers close at a shared deadline, then the answer is revealed and
 * (optionally) a leaderboard is shown. Used by Classic, Survival, Quick
 * Draw and any other mode built on synchronized questions.
 *
 * The helpers keep their data under `state.sync` and leave everything else
 * in the mode's state alone.
 */

export type SyncPhase = 'intro' | 'question' | 'reveal' | 'leaderboard' | 'done';

export interface SyncAnswer {
  at: number;
  responseMs: number;
  correct: boolean;
  partial: number;
  points: number;
  /** The choice token picked, for the answer distribution chart. */
  token: string | null;
}

export interface SyncState {
  phase: SyncPhase;
  round: number;
  order: string[];
  iid: string | null;
  startedAt: number;
  deadline: number;
  phaseEndsAt: number | null;
  answers: Record<PlayerId, SyncAnswer>;
  scores: Record<PlayerId, number>;
  streaks: Record<PlayerId, number>;
  /** Points each player gained in the last closed round, for the leaderboard animation. */
  lastGain: Record<PlayerId, number>;
  roundsPlayed: number;
}

export interface SyncConfig<S extends { sync: SyncState }> {
  introMs: number;
  revealMs: number;
  leaderboardMs: number;
  autoAdvance: (s: S, ctx: ModeContext) => boolean;
  showLeaderboard: (s: S, ctx: ModeContext) => boolean;
  /** Whether this player may answer the current question. Defaults to everyone. */
  canAnswer?: (s: S, playerId: PlayerId, ctx: ModeContext) => boolean;
  /** Points for an answer. Called once per answer, at submission. */
  score: (s: S, playerId: PlayerId, r: { correct: boolean; partial: number; responseMs: number; limitMs: number; streak: number }, ctx: ModeContext) => number;
  /** Runs after a round closes and before the reveal. */
  onClosed?: (s: S, ctx: ModeContext) => void;
  /** Extra end condition checked between rounds. */
  isOver?: (s: S, ctx: ModeContext) => boolean;
  /** Close the round as soon as one answer arrives (buzzer modes). */
  closeOnFirstCorrect?: boolean;
  /** Called when the last round is done; the mode ends the game. */
  onFinished: (s: S, ctx: ModeContext) => void;
}

/** Answers count up to this long after the visible deadline, to absorb network delay. */
export const DEADLINE_GRACE_MS = 600;
const TIMER = 'sync';

export function syncInit(ctx: ModeContext, maxRounds?: number): SyncState {
  const ids = ctx.common.shuffleQuestions ? ctx.rng.shuffle(ctx.questions.ids()) : ctx.questions.ids().slice();
  const limit = Math.min(ids.length, maxRounds ?? Infinity, ctx.common.questionLimit || Infinity);
  const scores: Record<PlayerId, number> = {};
  const streaks: Record<PlayerId, number> = {};
  for (const p of ctx.players()) {
    scores[p.id] = 0;
    streaks[p.id] = 0;
  }
  return {
    phase: 'intro',
    round: -1,
    order: ids.slice(0, limit),
    iid: null,
    startedAt: 0,
    deadline: 0,
    phaseEndsAt: null,
    answers: {},
    scores,
    streaks,
    lastGain: {},
    roundsPlayed: 0,
  };
}

export function syncBegin<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  s.sync.phase = 'intro';
  s.sync.phaseEndsAt = ctx.now() + cfg.introMs;
  ctx.setTimer(TIMER, s.sync.phaseEndsAt);
}

export function syncAddPlayer(s: { sync: SyncState }, playerId: PlayerId) {
  s.sync.scores[playerId] ??= 0;
  s.sync.streaks[playerId] ??= 0;
}

function eligible<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext): PlayerId[] {
  return ctx
    .players()
    .filter((p) => p.connected && (cfg.canAnswer ? cfg.canAnswer(s, p.id, ctx) : true))
    .map((p) => p.id);
}

function startRound<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  const sync = s.sync;
  sync.round++;
  if (sync.round >= sync.order.length || cfg.isOver?.(s, ctx)) return finish(s, cfg, ctx);
  sync.iid = ctx.questions.present(sync.order[sync.round]!);
  sync.answers = {};
  sync.startedAt = ctx.now();
  sync.deadline = sync.startedAt + ctx.questions.timeLimitMs(sync.iid);
  sync.phase = 'question';
  sync.phaseEndsAt = sync.deadline;
  ctx.setTimer(TIMER, sync.deadline + DEADLINE_GRACE_MS);
}

function closeRound<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  const sync = s.sync;
  sync.lastGain = {};
  for (const [pid, a] of Object.entries(sync.answers)) sync.lastGain[pid] = a.points;
  // Players who could answer and did not lose their streak.
  for (const pid of eligible(s, cfg, ctx)) if (!sync.answers[pid]) sync.streaks[pid] = 0;
  sync.roundsPlayed++;
  cfg.onClosed?.(s, ctx);
  sync.phase = 'reveal';
  sync.phaseEndsAt = cfg.autoAdvance(s, ctx) ? ctx.now() + cfg.revealMs : null;
  if (sync.phaseEndsAt !== null) ctx.setTimer(TIMER, sync.phaseEndsAt);
  else ctx.clearTimer(TIMER);
}

function finish<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  s.sync.phase = 'done';
  s.sync.phaseEndsAt = null;
  ctx.clearTimer(TIMER);
  cfg.onFinished(s, ctx);
}

/** Move to the next phase. Called by the timer, or by the host pressing next. */
export function syncAdvance<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  const sync = s.sync;
  switch (sync.phase) {
    case 'intro':
      return startRound(s, cfg, ctx);
    case 'question':
      return closeRound(s, cfg, ctx);
    case 'reveal': {
      const last = sync.round >= sync.order.length - 1 || cfg.isOver?.(s, ctx);
      if (!last && cfg.showLeaderboard(s, ctx)) {
        sync.phase = 'leaderboard';
        sync.phaseEndsAt = cfg.autoAdvance(s, ctx) ? ctx.now() + cfg.leaderboardMs : null;
        if (sync.phaseEndsAt !== null) ctx.setTimer(TIMER, sync.phaseEndsAt);
        else ctx.clearTimer(TIMER);
        return;
      }
      return startRound(s, cfg, ctx);
    }
    case 'leaderboard':
      return startRound(s, cfg, ctx);
    case 'done':
      return;
  }
}

export function syncOnTimer<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, id: string, ctx: ModeContext) {
  if (id === TIMER) syncAdvance(s, cfg, ctx);
}

export function syncHostNext<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext): ActionResult {
  if (s.sync.phase === 'done') return { error: 'The game is over.' };
  syncAdvance(s, cfg, ctx);
}

export function syncAnswer<S extends { sync: SyncState }>(
  s: S,
  cfg: SyncConfig<S>,
  playerId: PlayerId,
  answer: Answer,
  ctx: ModeContext,
): ActionResult {
  const sync = s.sync;
  if (sync.phase !== 'question' || !sync.iid) return { error: 'Answers are closed.' };
  if (cfg.canAnswer && !cfg.canAnswer(s, playerId, ctx)) return { error: 'You are out of this round.' };
  if (sync.answers[playerId]) return { error: 'You already answered.' };
  const now = ctx.now();
  if (now > sync.deadline + DEADLINE_GRACE_MS) return { error: 'Time is up.' };
  const grade = ctx.questions.grade(sync.iid, answer);
  const responseMs = Math.min(now - sync.startedAt, sync.deadline - sync.startedAt);
  const streak = grade.correct ? (sync.streaks[playerId] ?? 0) + 1 : 0;
  sync.streaks[playerId] = streak;
  const limitMs = sync.deadline - sync.startedAt;
  const points = Math.max(0, Math.round(cfg.score(s, playerId, { correct: grade.correct, partial: grade.partial, responseMs, limitMs, streak }, ctx)));
  sync.scores[playerId] = (sync.scores[playerId] ?? 0) + points;
  sync.answers[playerId] = {
    at: now,
    responseMs,
    correct: grade.correct,
    partial: grade.partial,
    points,
    token: answer.type === 'mcq' ? answer.choiceId : answer.type === 'truefalse' ? String(answer.value) : null,
  };
  ctx.recordAnswer({ playerId, qid: ctx.questions.instance(sync.iid).qid, correct: grade.correct, partial: grade.partial, responseMs });
  const everyone = eligible(s, cfg, ctx);
  if ((cfg.closeOnFirstCorrect && grade.correct) || everyone.every((pid) => sync.answers[pid])) closeRound(s, cfg, ctx);
}

export interface SyncView {
  phase: SyncPhase;
  round: number;
  total: number;
  phaseEndsAt: number | null;
  question: QuestionView | null;
  reveal: AnswerReveal | null;
  explanation: string | null;
  answered: number;
  eligible: number;
  /** How many picked each choice. Only after the reveal. */
  distribution: Record<string, number> | null;
  you: { eligible: boolean; answered: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number } | null;
}

export function syncView<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, viewer: Viewer, ctx: ModeContext): SyncView {
  const sync = s.sync;
  const live = sync.phase === 'question' || sync.phase === 'reveal';
  const revealed = sync.phase === 'reveal';
  const question = live && sync.iid ? ctx.questions.view(sync.iid, { deadline: sync.deadline, index: sync.round, total: sync.order.length }) : null;
  let distribution: Record<string, number> | null = null;
  if (revealed) {
    distribution = {};
    for (const a of Object.values(sync.answers)) if (a.token) distribution[a.token] = (distribution[a.token] ?? 0) + 1;
  }
  let you: SyncView['you'] = null;
  if (viewer.kind === 'player') {
    const a = sync.answers[viewer.playerId];
    you = {
      eligible: cfg.canAnswer ? cfg.canAnswer(s, viewer.playerId, ctx) : true,
      answered: Boolean(a),
      // Correctness stays hidden until the reveal so nobody can signal answers to friends.
      correct: revealed && a ? a.correct : null,
      points: revealed && a ? a.points : null,
      partial: revealed && a ? a.partial : null,
      streak: sync.streaks[viewer.playerId] ?? 0,
    };
  }
  return {
    phase: sync.phase,
    round: sync.round,
    total: sync.order.length,
    phaseEndsAt: sync.phaseEndsAt,
    question,
    reveal: revealed && sync.iid ? ctx.questions.reveal(sync.iid) : null,
    explanation: revealed && sync.iid ? (ctx.questions.explanation(sync.iid) ?? null) : null,
    answered: Object.keys(sync.answers).length,
    eligible: eligible(s, cfg, ctx).length,
    distribution,
    you,
  };
}

export interface LeaderRow {
  playerId: PlayerId;
  name: string;
  score: number;
  gain: number;
  rank: number;
  teamId: string | null;
}

/** Top rows plus the viewer's own row if they are further down. */
export function leaderboard(scores: Record<PlayerId, number>, gains: Record<PlayerId, number>, ctx: ModeContext, viewer: Viewer, top = 8): { rows: LeaderRow[]; you: LeaderRow | null } {
  const rows = ctx
    .players()
    .map((p) => ({ playerId: p.id, name: p.name, score: scores[p.id] ?? 0, gain: gains[p.id] ?? 0, teamId: p.teamId, rank: 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let lastScore = Number.NaN;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.score !== lastScore) {
      lastRank = i + 1;
      lastScore = r.score;
    }
    r.rank = lastRank;
  });
  const you = viewer.kind === 'player' ? (rows.find((r) => r.playerId === viewer.playerId) ?? null) : null;
  return { rows: rows.slice(0, top), you };
}
