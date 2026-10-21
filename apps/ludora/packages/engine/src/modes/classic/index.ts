import { z } from 'zod';
import { answerSchema, type Difficulty } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ActionResult, ModeContext, PlayerId } from '../../sdk/types.ts';
import {
  leaderboard,
  syncAddPlayer,
  syncAdvance,
  syncAnswer,
  syncBegin,
  syncHostNext,
  syncInit,
  syncOnTimer,
  syncView,
  type SyncConfig,
  type SyncState,
} from '../../mechanics/syncRounds.ts';
import { bottomHalf, listNames, recordingAs, roundTo10 } from '../rules.ts';
import { meta, settings } from './meta.ts';

type Scoring = 'standard' | 'streak' | 'pot' | 'climb';

type Settings = {
  speedBonus: boolean;
  streakBonus: boolean;
  autoAdvance: boolean;
  leaderboard: boolean;
  scale: string;
  suddenDeath: boolean;
  scoring: string;
  wrongPenalty: number;
  comeback: boolean;
  knockout: boolean;
  encore: boolean;
  halfClose: boolean;
  unisonBonus: number;
};

interface State {
  sync: SyncState;
  /** Round in which each knocked-out player went out (sudden death or the knockout). */
  out: Record<PlayerId, number>;
  startedWith: number;
  /** Questions in the game before any encores were added; rounds from here on are encores. */
  baseRounds: number;
  /** Points each player lost to the wrong-answer penalty in the current round. */
  penalties: Record<PlayerId, number>;
  /** Players scoring double in the current round (comeback points). */
  boosted: PlayerId[];
  /** Bonus points each team has earned by answering in unison. */
  teamBonus: Record<string, number>;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

type RoundResult = { correct: boolean; partial: number; responseMs: number; limitMs: number; streak: number };

const creditOf = (r: { correct: boolean; partial: number }) => (r.correct ? 1 : r.partial >= 0.5 ? r.partial : 0);

export function classicPoints(r: RoundResult, opts: { speedBonus: boolean; streakBonus: boolean; scale: number }): number {
  const credit = creditOf(r);
  if (credit === 0) return 0;
  const speedShare = opts.speedBonus ? Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs)) : 1;
  const streak = opts.streakBonus && r.correct ? Math.min(5, Math.max(0, r.streak - 1)) * 50 : 0;
  const raw = (500 + 500 * speedShare) * credit + streak;
  return Math.round((raw * opts.scale) / 10) * 10;
}

/** Glim Chain: the largest streak multiplier. */
export const CHAIN_CAP = 4;

/** Glim Chain: the usual points times the streak (×2 for a second correct answer in a row, up to ×4), with no streak bonus on top. */
export function chainPoints(r: RoundResult, opts: { speedBonus: boolean; scale: number }): number {
  const credit = creditOf(r);
  if (credit === 0) return 0;
  const speedShare = opts.speedBonus ? Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs)) : 1;
  const mult = r.correct ? Math.min(CHAIN_CAP, Math.max(1, r.streak)) : 1;
  return roundTo10((500 + 500 * speedShare) * credit * mult * opts.scale);
}

/** Ladder of Lights: what a question's difficulty multiplies its points by. No difficulty counts as medium. */
export function climbFactor(d: Difficulty | undefined): number {
  return d === 'easy' ? 1 : d === 'hard' ? 2 : 1.5;
}
const climbRank = (d: Difficulty | undefined) => (d === 'easy' ? 0 : d === 'hard' ? 2 : 1);

/** Rare Light: the pot for one question is this much for every player still in the game. */
export const POT_PER_PLAYER = 1000;

/** Rare Light: share a pot between the players with credit for an answer, in proportion to it. Rounded to 10. */
export function potShares(pot: number, credits: Readonly<Record<PlayerId, number>>): Record<PlayerId, number> {
  const total = Object.values(credits).reduce((n, c) => n + Math.max(0, c), 0);
  const shares: Record<PlayerId, number> = {};
  if (total <= 0) return shares;
  for (const [id, c] of Object.entries(credits)) if (c > 0) shares[id] = roundTo10((pot * c) / total);
  return shares;
}

const opts = (ctx: ModeContext) => ctx.settings as Settings;
const scoringOf = (ctx: ModeContext): Scoring => {
  const v = opts(ctx).scoring;
  return v === 'streak' || v === 'pot' || v === 'climb' ? v : 'standard';
};
const isOut = (s: State, id: PlayerId) => s.out[id] !== undefined;
const isEncore = (s: State) => s.sync.round >= s.baseRounds;
const eliminating = (ctx: ModeContext) => opts(ctx).suddenDeath || opts(ctx).knockout;
const fmt = (n: number) => n.toLocaleString('en-US');
const difficultyOf = (ctx: ModeContext, qid: string | undefined) => (qid ? ctx.questions.get(qid).difficulty : undefined);

function sharePot(s: State, ctx: ModeContext) {
  const st = opts(ctx);
  const inGame = ctx.players().filter((p) => !isOut(s, p.id)).length;
  const pot = POT_PER_PLAYER * Math.max(1, inGame) * (Number(st.scale) || 1) * (isEncore(s) ? 0.5 : 1);
  const credits: Record<PlayerId, number> = {};
  for (const [pid, a] of Object.entries(s.sync.answers)) credits[pid] = creditOf(a);
  const shares = potShares(pot, credits);
  const winners = Object.keys(shares);
  for (const pid of winners) {
    const share = st.comeback && s.boosted.includes(pid) ? shares[pid]! * 2 : shares[pid]!;
    s.sync.answers[pid]!.points = share;
    s.sync.scores[pid] = (s.sync.scores[pid] ?? 0) + share;
    s.sync.lastGain[pid] = share;
  }
  if (!winners.length) ctx.feed('Nobody got that one, so nobody shares the pot.', { tone: 'info' });
  else if (winners.length === 1) ctx.feed(`${ctx.player(winners[0]!)?.name ?? 'One player'} took the whole pot of ${fmt(pot)} points!`, { tone: 'big' });
  else ctx.feed(`${winners.length} players shared the pot of ${fmt(pot)} points.`, { tone: 'good' });
}

/** In Unison: a team whose players (here and in the game) all answered correctly earns the bonus. */
function awardUnison(s: State, ctx: ModeContext) {
  const bonus = opts(ctx).unisonBonus;
  const names: string[] = [];
  for (const t of ctx.teams()) {
    const members = ctx.players().filter((p) => p.teamId === t.id && p.connected && !isOut(s, p.id) && p.joinedAt <= s.sync.startedAt);
    if (!members.length || !members.every((p) => s.sync.answers[p.id]?.correct)) continue;
    s.teamBonus[t.id] = (s.teamBonus[t.id] ?? 0) + bonus;
    names.push(t.name);
  }
  if (names.length) ctx.feed(`In unison! +${fmt(bonus)} for the ${listNames(names)}.`, { tone: 'good' });
}

/** Encore: a question fewer than half the players got right comes back at the end (once). */
function maybeEncore(s: State, ctx: ModeContext) {
  if (isEncore(s)) return;
  const could = ctx.players().filter((p) => !isOut(s, p.id) && p.joinedAt <= s.sync.startedAt);
  if (!could.length) return;
  const right = could.filter((p) => s.sync.answers[p.id]?.correct).length;
  if (right * 2 >= could.length) return;
  s.sync.order.push(s.sync.order[s.sync.round]!);
  ctx.feed('Fewer than half got that one. It comes back at the end.', { tone: 'info' });
}

/** Fading Lights: the lowest score is out; ties go to fewer points this question, then the slower answer (no answer is slowest). */
function knockOutLowest(s: State, ctx: ModeContext) {
  const inGame = ctx.players().filter((p) => !isOut(s, p.id));
  if (inGame.length < 2) return;
  const rows = inGame
    .map((p) => {
      const a = s.sync.answers[p.id];
      return { p, score: s.sync.scores[p.id] ?? 0, gained: a?.points ?? 0, slow: a ? a.responseMs : Number.MAX_SAFE_INTEGER };
    })
    .sort((x, y) => x.score - y.score || x.gained - y.gained || y.slow - x.slow);
  const w = rows[0]!;
  const tied = rows.filter((r) => r.score === w.score && r.gained === w.gained && r.slow === w.slow);
  // Everyone dead level: nobody can be singled out, so nobody goes this time.
  if (tied.length >= inGame.length) return;
  for (const r of tied) {
    s.out[r.p.id] = s.sync.round;
    ctx.feed(`${r.p.name} had the lowest score and is out.`, { tone: 'bad' });
  }
}

const cfg: SyncConfig<State> = {
  introMs: 4000,
  revealMs: 5000,
  leaderboardMs: 5000,
  autoAdvance: (_s, ctx) => opts(ctx).autoAdvance,
  showLeaderboard: (_s, ctx) => opts(ctx).leaderboard,
  canAnswer: (s, id) => !isOut(s, id),
  score: (s, id, r, ctx) => {
    const st = opts(ctx);
    const scale = Number(st.scale) || 1;
    let pts = 0;
    switch (scoringOf(ctx)) {
      case 'standard':
        pts = classicPoints(r, { speedBonus: st.speedBonus, streakBonus: st.streakBonus, scale });
        break;
      case 'streak':
        pts = chainPoints(r, { speedBonus: st.speedBonus, scale });
        break;
      case 'climb':
        pts = roundTo10(classicPoints(r, { speedBonus: st.speedBonus, streakBonus: st.streakBonus, scale }) * climbFactor(difficultyOf(ctx, s.sync.order[s.sync.round])));
        break;
      case 'pot':
        // Shared out when the question closes, once everyone's answer is in.
        break;
    }
    if (pts > 0 && isEncore(s)) pts = roundTo10(pts / 2);
    if (pts > 0 && st.comeback && s.boosted.includes(id)) pts *= 2;
    if (st.wrongPenalty > 0 && creditOf(r) === 0) {
      // syncRounds only ever adds points, so the penalty comes off here, at submission.
      const lost = Math.min(s.sync.scores[id] ?? 0, st.wrongPenalty);
      if (lost > 0) {
        s.sync.scores[id] = (s.sync.scores[id] ?? 0) - lost;
        s.penalties[id] = (s.penalties[id] ?? 0) + lost;
      }
    }
    return pts;
  },
  onClosed: (s, ctx) => {
    const st = opts(ctx);
    if (scoringOf(ctx) === 'pot') sharePot(s, ctx);
    for (const [pid, lost] of Object.entries(s.penalties)) if (!((s.sync.lastGain[pid] ?? 0) > 0)) s.sync.lastGain[pid] = -lost;
    if (st.unisonBonus > 0) awardUnison(s, ctx);
    if (st.encore) maybeEncore(s, ctx);
    if (st.suddenDeath) {
      for (const p of ctx.players()) {
        if (isOut(s, p.id)) continue;
        const a = s.sync.answers[p.id];
        if (!a || !a.correct) {
          s.out[p.id] = s.sync.round;
          ctx.feed(`${p.name} is out.`, { tone: 'bad' });
        }
      }
    }
    if (st.knockout) knockOutLowest(s, ctx);
  },
  isOver: (s, ctx) => {
    if (!eliminating(ctx)) return false;
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    return alive === 0 || (s.startedWith > 1 && alive <= 1);
  },
  onFinished: (s, ctx) => {
    if (eliminating(ctx)) {
      const alive = ctx.players().filter((p) => !isOut(s, p.id));
      if (alive.length === 1) ctx.endGame(`${alive[0]!.name} is the last one standing.`);
      else if (alive.length === 0) ctx.endGame('Nobody survived the last question. Scores decide it.');
      else ctx.endGame(`${alive.length} players survived every question.`);
      return;
    }
    ctx.endGame('That was the last question.');
  },
};

/** Set up the round that just opened: comeback boosts, penalties, and lines announcing what it is worth. */
function roundStarted(s: State, ctx: ModeContext) {
  const st = opts(ctx);
  s.penalties = {};
  s.boosted = [];
  if (st.comeback) {
    s.boosted = bottomHalf(
      s.sync.scores,
      ctx.players().filter((p) => !isOut(s, p.id)).map((p) => p.id),
    );
    if (s.boosted.length) ctx.feed('You are in the bottom half: double points for this question.', { to: s.boosted, tone: 'good' });
  }
  if (s.sync.round === s.baseRounds && s.baseRounds > 0) ctx.feed('Encore: the questions most of you missed, for half points.', { tone: 'big' });
  if (scoringOf(ctx) === 'climb' && !isEncore(s)) {
    const now = climbFactor(difficultyOf(ctx, s.sync.order[s.sync.round]));
    const before = s.sync.round > 0 ? climbFactor(difficultyOf(ctx, s.sync.order[s.sync.round - 1])) : 1;
    if (now > before) ctx.feed(now >= 2 ? 'Hard questions now: double points!' : 'Medium questions now: one and a half times the points.', { tone: 'big' });
  }
}

/** Run a step of the round machine and catch the start of a new round. */
function step(s: State, ctx: ModeContext, fn: () => ActionResult): ActionResult {
  const before = s.sync.round;
  const result = fn();
  if (s.sync.round !== before && s.sync.phase === 'question') roundStarted(s, ctx);
  return result;
}

function teamScores(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const total = members.reduce((n, p) => n + (s.sync.scores[p.id] ?? 0), 0);
    const avg = members.length ? Math.round(total / members.length) : 0;
    const bonus = s.teamBonus[t.id] ?? 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: avg + bonus, average: avg, bonus, members: members.length };
  });
}

export const classic = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const st = ctx.settings;
    const s: State = { sync: syncInit(ctx), out: {}, startedWith: ctx.players().length, baseRounds: 0, penalties: {}, boosted: [], teamBonus: {} };
    if (scoringOf(ctx) === 'climb') {
      // The selection is still random (or the set's own); only its order changes. sort() is stable.
      s.sync.order = s.sync.order
        .map((qid, i) => ({ qid, i, rank: climbRank(difficultyOf(ctx, qid)) }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .map((x) => x.qid);
    }
    s.baseRounds = s.sync.order.length;
    if (st.wrongPenalty > 0) ctx.feed(`Careful: a wrong answer costs ${fmt(st.wrongPenalty)} points. Not answering costs nothing.`, { tone: 'info' });
    if (st.knockout) ctx.feed('After each question, the lowest score is knocked out.', { tone: 'info' });
    if (st.halfClose) ctx.feed('Each question closes as soon as half of you have answered.', { tone: 'info' });
    if (st.unisonBonus > 0 && ctx.teams().length) ctx.feed(`A team whose players all get a question right earns ${fmt(st.unisonBonus)} bonus points.`, { tone: 'info' });
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    syncAddPlayer(s, p.id);
    // Late joiners in an elimination game would have dodged earlier questions, so they watch instead.
    if (eliminating(ctx) && s.sync.round >= 0) s.out[p.id] ??= -1;
  },
  onAction(s, playerId, a, ctx) {
    if (a.iid !== s.sync.iid) return { error: 'That question has closed.' };
    // An encore is a second go at a question: it counts for reports, not again for rewards.
    const c = isEncore(s) ? recordingAs(ctx, 'attempt') : ctx;
    const refused = syncAnswer(s, cfg, playerId, a.answer, c);
    if (refused) return refused;
    if (opts(ctx).halfClose && s.sync.phase === 'question') {
      const here = ctx.players().filter((p) => p.connected && !isOut(s, p.id));
      const answered = here.filter((p) => s.sync.answers[p.id]).length;
      if (answered >= Math.ceil(here.length / 2)) syncAdvance(s, cfg, c);
    }
  },
  onTimer(s, id, ctx) {
    step(s, ctx, () => syncOnTimer(s, cfg, id, ctx));
  },
  onHostNext(s, ctx) {
    return step(s, ctx, () => syncHostNext(s, cfg, ctx));
  },
  view(s, viewer, ctx) {
    const board = leaderboard(s.sync.scores, s.sync.lastGain, ctx, viewer, viewer.kind === 'host' ? 10 : 5);
    const elim = eliminating(ctx);
    return {
      sync: syncView(s, cfg, viewer, ctx),
      board,
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      // Read by the screens as "players can be knocked out": shows who is still standing.
      suddenDeath: elim,
      alive: elim ? ctx.players().filter((p) => !isOut(s, p.id)).length : null,
      out: viewer.kind === 'player' ? isOut(s, viewer.playerId) : false,
      score: viewer.kind === 'player' ? (s.sync.scores[viewer.playerId] ?? 0) : null,
      // Optional extras (screens may ignore them): the open question is an encore; the viewer scores double for it.
      encore: s.sync.round >= 0 && isEncore(s),
      boosted: viewer.kind === 'player' && s.boosted.includes(viewer.playerId),
    };
  },
  results(s, ctx) {
    const elim = eliminating(ctx);
    const standings = ctx.everyone().map((p) => {
      const score = s.sync.scores[p.id] ?? 0;
      if (!elim) return { playerId: p.id, score, label: `${fmt(score)} pts` };
      // Survivors rank above everyone who went out; later exits rank above earlier ones.
      const outRound = s.out[p.id];
      const survivalBonus = outRound === undefined ? 1_000_000_000 : (outRound + 1) * 1_000_000;
      return {
        playerId: p.id,
        score: survivalBonus + score,
        label: outRound === undefined ? `Survived, ${fmt(score)} pts` : outRound < 0 ? 'Joined late' : `Out on question ${outRound + 1}`,
      };
    });
    const teams = ctx.teams().length
      ? teamScores(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: t.bonus ? `${fmt(t.average)} avg + ${fmt(t.bonus)} bonus` : `${fmt(t.score)} avg` }))
      : undefined;
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: 'Final scores.' };
  },
  bot(view, ctx) {
    const sync = view?.sync;
    if (sync?.phase !== 'question' || !sync.question || !sync.you?.eligible || sync.you.answered) return null;
    return { type: 'answer', iid: sync.question.iid, answer: ctx.answer(sync.question.iid) };
  },
  botDelay(view, rng) {
    const q = view?.sync?.question;
    if (view?.sync?.phase === 'question' && q?.deadline) {
      const window = Math.max(800, (q.deadline - q.shownAt) * 0.7);
      return 900 + rng.int(0, Math.round(window));
    }
    return 1000;
  },
});
