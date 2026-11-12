import { POINTS_USUAL, pointsWeight, readingGraceMs, type Answer, type AnswerReveal, type Question } from '@ludora/shared';
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
  /** A poll vote: no right answer, no points, and the streak is left as it was. */
  ungraded?: boolean;
}

export interface SyncState {
  phase: SyncPhase;
  round: number;
  order: string[];
  iid: string | null;
  startedAt: number;
  /** The question's shared deadline: what everyone without extra time (and the big screen) sees. */
  deadline: number;
  /** The open question's own time limit, before any time the host added. */
  limit?: number;
  /** Time the host added to the open question for everyone. */
  added?: number;
  /** Players with extra time on the open question (a share of its limit), fixed as it opened. */
  extra?: Record<PlayerId, number>;
  phaseEndsAt: number | null;
  answers: Record<PlayerId, SyncAnswer>;
  scores: Record<PlayerId, number>;
  streaks: Record<PlayerId, number>;
  /** Points each player gained in the last closed round, for the leaderboard animation. */
  lastGain: Record<PlayerId, number>;
  roundsPlayed: number;
  /**
   * How many could answer the round that just closed, counted as it closed. The reveal keeps
   * showing it: by then the round's results may have knocked players out (or relit them), and
   * "4 of 3 answered" is not what happened.
   */
  closedEligible?: number;
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

/** Who the open round is waiting on: everyone who may answer, plus anyone who already has (and has since dropped out). */
function roundPool<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext): number {
  return new Set([...eligible(s, cfg, ctx), ...Object.keys(s.sync.answers)]).size;
}

function startRound<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  const sync = s.sync;
  sync.round++;
  if (sync.round >= sync.order.length || cfg.isOver?.(s, ctx)) return finish(s, cfg, ctx);
  sync.iid = ctx.questions.present(sync.order[sync.round]!);
  sync.answers = {};
  sync.startedAt = ctx.now();
  sync.limit = ctx.questions.timeLimitMs(sync.iid);
  sync.added = 0;
  sync.extra = {};
  for (const p of ctx.players()) {
    const e = p.extraTime ?? 0;
    if (e > 0 && e <= 1) sync.extra[p.id] = e;
  }
  sync.deadline = sync.startedAt + sync.limit;
  sync.phase = 'question';
  sync.phaseEndsAt = sync.deadline;
  ctx.setTimer(TIMER, closeAt(s, cfg, ctx) + DEADLINE_GRACE_MS);
}

/** Reading time is at most this share of a question's limit, so a short limit still leaves time to race. */
export const READING_SHARE_MAX = 0.4;

/**
 * The clock speed scoring sees for an answer: the question's reading time (see readingGraceMs in
 * @ludora/shared) comes off the start, so an answer given while still reading scores as instant
 * and the rest of the limit is what counts.
 */
export function speedClock(q: Question, responseMs: number, limitMs: number): { responseMs: number; limitMs: number } {
  const grace = Math.min(readingGraceMs(q), Math.floor(limitMs * READING_SHARE_MAX));
  if (grace <= 0) return { responseMs, limitMs };
  return { responseMs: Math.max(0, responseMs - grace), limitMs: Math.max(1, limitMs - grace) };
}

/** The open question's limit for everyone, before added time. */
function baseLimit(sync: SyncState): number {
  return sync.limit ?? sync.deadline - sync.startedAt - (sync.added ?? 0);
}

/** When the open question closes for one player: the shared deadline, plus their extra time if the host gave them some. */
export function syncPlayerDeadline(s: { sync: SyncState }, playerId: PlayerId): number {
  const extra = s.sync.extra?.[playerId] ?? 0;
  return extra ? s.sync.deadline + Math.round(baseLimit(s.sync) * extra) : s.sync.deadline;
}

/**
 * When the open round closes: the shared deadline, or later while a player with extra time who
 * has not answered is still within theirs. With no extra time in the room this is the deadline.
 */
function closeAt<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext): number {
  let at = s.sync.deadline;
  for (const pid of eligible(s, cfg, ctx)) if (!s.sync.answers[pid]) at = Math.max(at, syncPlayerDeadline(s, pid));
  return at;
}

function closeRound<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext) {
  const sync = s.sync;
  sync.lastGain = {};
  for (const [pid, a] of Object.entries(sync.answers)) sync.lastGain[pid] = a.points;
  // Players who could answer and did not lose their streak (a poll left unanswered costs nothing).
  const poll = sync.iid !== null && !ctx.questions.isGraded(sync.iid);
  if (!poll) for (const pid of eligible(s, cfg, ctx)) if (!sync.answers[pid]) sync.streaks[pid] = 0;
  sync.closedEligible = roundPool(s, cfg, ctx);
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
  const mine = syncPlayerDeadline(s, playerId);
  if (now > mine + DEADLINE_GRACE_MS) return { error: 'Time is up.' };
  const grade = ctx.questions.grade(sync.iid, answer);
  // With extra time, speed counts against the player's own longer limit, given in the shared limit's terms
  // so every mode's speed scoring stays the same: half their time used scores as half the time used.
  const ownLimit = mine - sync.startedAt;
  const sharedLimit = sync.deadline - sync.startedAt;
  const responseMs = Math.round((Math.min(now - sync.startedAt, ownLimit) * sharedLimit) / Math.max(1, ownLimit));
  const streak = grade.ungraded ? (sync.streaks[playerId] ?? 0) : grade.correct ? (sync.streaks[playerId] ?? 0) + 1 : 0;
  sync.streaks[playerId] = streak;
  const limitMs = sync.deadline - sync.startedAt;
  // Double points: a question its author marked, or the final question when the host chose that
  // (players were told before it). The two do not stack: double is double.
  const authored = ctx.questions.get(ctx.questions.instance(sync.iid).qid);
  const double = authored.doublePoints || isDoubleRound(s, ctx) ? 2 : 1;
  // The author's Points field scales the mode's own score: 2,000 is twice a usual question, 0 scores nothing.
  const weight = pointsWeight(authored.points);
  // Reading time: a long question (or one with a sound to hear) gives everyone time to read it before
  // speed starts to count. Scoring sees the clock from then on; the recorded response time stays as it was.
  const speed = speedClock(authored, responseMs, limitMs);
  const points = grade.ungraded ? 0 : Math.max(0, Math.round(cfg.score(s, playerId, { correct: grade.correct, partial: grade.partial, responseMs: speed.responseMs, limitMs: speed.limitMs, streak }, ctx) * double * weight));
  sync.scores[playerId] = (sync.scores[playerId] ?? 0) + points;
  sync.answers[playerId] = {
    at: now,
    responseMs,
    correct: grade.correct,
    partial: grade.partial,
    points,
    token: answer.type === 'mcq' || answer.type === 'poll' ? answer.choiceId : answer.type === 'truefalse' ? String(answer.value) : null,
    ...(grade.ungraded ? { ungraded: true } : {}),
  };
  // A poll vote is not right or wrong, so it stays out of accuracy and reports.
  if (!grade.ungraded) ctx.recordAnswer({ playerId, qid: ctx.questions.instance(sync.iid).qid, correct: grade.correct, partial: grade.partial, responseMs });
  const everyone = eligible(s, cfg, ctx);
  if ((cfg.closeOnFirstCorrect && grade.correct) || everyone.every((pid) => sync.answers[pid])) return closeRound(s, cfg, ctx);
  // Someone with extra time answered: the round may now close sooner (straight away if only players whose time is up are left).
  const at = closeAt(s, cfg, ctx);
  if (now > at + DEADLINE_GRACE_MS) closeRound(s, cfg, ctx);
  else ctx.setTimer(TIMER, at + DEADLINE_GRACE_MS);
}


/** The open (or just closed) round is the last one and the host chose double points for it. */
export function isDoubleRound(s: { sync: SyncState }, ctx: ModeContext): boolean {
  return Boolean(ctx.common.doubleFinal) && s.sync.round >= 0 && s.sync.round === s.sync.order.length - 1;
}

/** Who the open question still waits for: connected players who may answer and have not. Null between questions. */
export function syncWaitingOn<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, ctx: ModeContext): PlayerId[] | null {
  if (s.sync.phase !== 'question' || !s.sync.iid) return null;
  return eligible(s, cfg, ctx).filter((pid) => !s.sync.answers[pid]);
}

/** The host gives everyone more time on the open question. Speed points are measured against the longer time. */
export function syncAddTime(s: { sync: SyncState }, ms: number, ctx: ModeContext): ActionResult {
  const sync = s.sync;
  if (sync.phase !== 'question' || !sync.iid) return { error: 'There is no question open to add time to.' };
  if (ctx.now() > sync.deadline) return { error: 'Time is already up on this question.' };
  sync.limit = baseLimit(sync);
  sync.added = (sync.added ?? 0) + ms;
  sync.deadline += ms;
  sync.phaseEndsAt = sync.deadline;
  // Everyone's time moves on together, extra time included.
  let at = sync.deadline;
  for (const p of ctx.players()) if (!sync.answers[p.id]) at = Math.max(at, syncPlayerDeadline(s, p.id));
  ctx.setTimer(TIMER, at + DEADLINE_GRACE_MS);
}

/** A late joiner starts level with the lowest score of the players already in the game. */
export function syncCatchUp(s: { sync: SyncState }, playerId: PlayerId, ctx: ModeContext): ActionResult {
  const others = ctx.players().filter((p) => p.id !== playerId).map((p) => s.sync.scores[p.id] ?? 0);
  if (!others.length) return;
  s.sync.scores[playerId] = Math.max(s.sync.scores[playerId] ?? 0, Math.min(...others));
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
  /** The last question is worth double (the host chose it). */
  doubleFinal: boolean;
  /** `joinedLate`: joined after the open question started, so a missed answer is not held against them. */
  you: { eligible: boolean; answered: boolean; joinedLate: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number } | null;
}

export function syncView<S extends { sync: SyncState }>(s: S, cfg: SyncConfig<S>, viewer: Viewer, ctx: ModeContext): SyncView {
  const sync = s.sync;
  const live = sync.phase === 'question' || sync.phase === 'reveal';
  const revealed = sync.phase === 'reveal';
  // A player with extra time sees their own longer clock; everyone else, and the big screen, the shared one.
  const deadline = viewer.kind === 'player' ? syncPlayerDeadline(s, viewer.playerId) : sync.deadline;
  let question = live && sync.iid ? ctx.questions.view(sync.iid, { deadline, index: sync.round, total: sync.order.length }) : null;
  // Players are told what the author made the question worth before they answer (these rounds score it).
  const worth = sync.iid ? ctx.questions.get(ctx.questions.instance(sync.iid).qid).points : undefined;
  if (question && worth !== undefined && worth !== POINTS_USUAL) question = { ...question, q: { ...question.q, points: worth } };
  let distribution: Record<string, number> | null = null;
  if (revealed) {
    distribution = {};
    for (const a of Object.values(sync.answers)) if (a.token) distribution[a.token] = (distribution[a.token] ?? 0) + 1;
  }
  let you: SyncView['you'] = null;
  if (viewer.kind === 'player') {
    const a = sync.answers[viewer.playerId];
    const joinedAt = ctx.player(viewer.playerId)?.joinedAt ?? 0;
    you = {
      eligible: cfg.canAnswer ? cfg.canAnswer(s, viewer.playerId, ctx) : true,
      answered: Boolean(a),
      joinedLate: live && joinedAt > sync.startedAt,
      // Correctness stays hidden until the reveal so nobody can signal answers to friends.
      correct: revealed && a && !a.ungraded ? a.correct : null,
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
    eligible: sync.phase !== 'question' && sync.closedEligible !== undefined ? sync.closedEligible : roundPool(s, cfg, ctx),
    distribution,
    doubleFinal: Boolean(ctx.common.doubleFinal),
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
