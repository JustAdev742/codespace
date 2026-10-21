/*
 * Lantern Out: survival on top of the synced-round helpers. Every player has
 * a few lanterns; a wrong or missed answer blows one out and at zero the
 * player is out. Every `reviveEvery` questions is a revival round in which
 * only knocked-out players may answer, and a correct answer relights one
 * lantern. Whether a round is a revival round is decided as it starts and
 * stored, so eligibility cannot change halfway through a question.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
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
import { listNames } from '../rules.ts';
import { meta, settings } from './meta.ts';

type Settings = { lives: number; reviveEvery: number; autoAdvance: boolean; kindling: boolean; slowest: boolean; lastTeam: boolean; vigil: boolean };

/** Kindling: every this many correct answers in a row relights a lantern. */
export const KINDLING_EVERY = 3;

interface State {
  sync: SyncState;
  /** Lanterns still lit per player. 0 means out. */
  lanterns: Record<PlayerId, number>;
  /** Round index on which each knocked-out player's last lantern went out. Cleared when they relight one. */
  outAt: Record<PlayerId, number>;
  /** Round index on which a player still in the game left it (they rank as if they went out then). */
  leftAt: Record<PlayerId, number>;
  startedWith: number;
  /** Whether the current round is a revival round, fixed as the round starts. */
  revival: { round: number; on: boolean };
  /** What the last closed round did, for the reveal. `kindled` and `slow` are only used by the rule options. */
  last: { round: number; blown: PlayerId[]; out: PlayerId[]; relit: PlayerId[]; kindled: PlayerId[]; slow: PlayerId[] } | null;
  /** Last team standing: teams with players at the start, and the round each team's last lantern went out. */
  startTeams: number;
  teamOutAt: Record<string, number>;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

const opts = (ctx: ModeContext) => ctx.settings as Settings;
const isOut = (s: State, id: PlayerId) => (s.lanterns[id] ?? 0) <= 0;
const isRevival = (s: State) => s.revival.on && s.revival.round === s.sync.round;

/** 100 points for a correct answer plus up to 100 more for speed, in steps of 10. */
export function lanternPoints(r: { correct: boolean; responseMs: number; limitMs: number }): number {
  if (!r.correct) return 0;
  const speed = Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs));
  return Math.round((100 + 100 * speed) / 10) * 10;
}

/** Whether question number `question` (1-based) is due to be a revival round. */
export function revivalDue(question: number, every: number): boolean {
  return every > 0 && question > 0 && question % every === 0;
}

/** Teams with at least one player still in the game holding a lit lantern. */
function litTeams(s: State, ctx: ModeContext) {
  return ctx.teams().filter((t) => ctx.players().some((p) => p.teamId === t.id && !isOut(s, p.id)));
}

const lastTeamOn = (s: State, ctx: ModeContext) => opts(ctx).lastTeam && s.startTeams >= 2;

/** Last team standing: note when a team's last lantern goes out (or a revival brings it back). */
function trackTeams(s: State, ctx: ModeContext) {
  const lit = new Set(litTeams(s, ctx).map((t) => t.id));
  for (const t of ctx.teams()) {
    if (!ctx.players().some((p) => p.teamId === t.id)) continue;
    if (!lit.has(t.id) && s.teamOutAt[t.id] === undefined) {
      s.teamOutAt[t.id] = s.sync.round;
      ctx.feed(`The ${t.name} have no lanterns left!`, { tone: 'bad' });
    } else if (lit.has(t.id) && s.teamOutAt[t.id] !== undefined) {
      delete s.teamOutAt[t.id];
      ctx.feed(`The ${t.name} are back in the game!`, { tone: 'good' });
    }
  }
}

const cfg: SyncConfig<State> = {
  introMs: 4000,
  revealMs: 5000,
  leaderboardMs: 0,
  autoAdvance: (_s, ctx) => opts(ctx).autoAdvance,
  showLeaderboard: () => false,
  canAnswer: (s, id) => (isRevival(s) ? isOut(s, id) : !isOut(s, id)),
  score: (_s, _id, r) => lanternPoints(r),
  onClosed: (s, ctx) => {
    const round = s.sync.round;
    const revival = isRevival(s);
    const st = opts(ctx);
    const last: NonNullable<State['last']> = { round, blown: [], out: [], relit: [], kindled: [], slow: [] };
    const blowOut = (p: { id: PlayerId; name: string }) => {
      s.lanterns[p.id] = Math.max(0, (s.lanterns[p.id] ?? 0) - 1);
      last.blown.push(p.id);
      if (s.lanterns[p.id] === 0) {
        s.outAt[p.id] = round;
        last.out.push(p.id);
        ctx.feed(`${p.name}'s last lantern went out.`, { tone: 'bad' });
      }
    };
    for (const p of ctx.players()) {
      const a = s.sync.answers[p.id];
      if (revival) {
        if (isOut(s, p.id) && a?.correct) {
          s.lanterns[p.id] = 1;
          delete s.outAt[p.id];
          last.relit.push(p.id);
          ctx.feed(`${p.name} relit a lantern.`, { tone: 'good' });
        }
        continue;
      }
      // Someone who joined after this question appeared has not had a fair go at it.
      if (isOut(s, p.id) || a?.correct || p.joinedAt > s.sync.startedAt) continue;
      blowOut(p);
    }
    const right = revival ? [] : ctx.players().filter((p) => !isOut(s, p.id) && s.sync.answers[p.id]?.correct && p.joinedAt <= s.sync.startedAt);
    if (st.slowest && right.length >= 2) {
      // Slowest flame: the slowest correct answer loses a lantern too, unless everyone right was exactly as quick.
      const slowMs = Math.max(...right.map((p) => s.sync.answers[p.id]!.responseMs));
      const slow = right.filter((p) => s.sync.answers[p.id]!.responseMs === slowMs);
      if (slow.length < right.length) {
        for (const p of slow) {
          last.slow.push(p.id);
          blowOut(p);
        }
        ctx.feed(`${listNames(slow.map((p) => p.name))} answered right but slowest, and lost a lantern.`, { tone: 'bad' });
      }
    }
    if (st.kindling) {
      const kindled = right.filter((p) => !isOut(s, p.id) && (s.sync.streaks[p.id] ?? 0) % KINDLING_EVERY === 0 && (s.lanterns[p.id] ?? 0) < st.lives);
      for (const p of kindled) {
        s.lanterns[p.id] = (s.lanterns[p.id] ?? 0) + 1;
        last.kindled.push(p.id);
      }
      if (kindled.length) ctx.feed(`Three in a row relit a lantern for ${listNames(kindled.map((p) => p.name))}.`, { tone: 'good' });
    }
    if (lastTeamOn(s, ctx)) trackTeams(s, ctx);
    s.last = last;
  },
  isOver: (s, ctx) => {
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    if (alive === 0) return true;
    // Playing together, the room keeps going to the last question.
    if (opts(ctx).vigil) return false;
    if (lastTeamOn(s, ctx)) return litTeams(s, ctx).length <= 1;
    return s.startedWith > 1 && alive <= 1;
  },
  onFinished: (s, ctx) => {
    const alive = ctx.players().filter((p) => !isOut(s, p.id));
    if (opts(ctx).vigil) {
      const n = ctx.players().length;
      ctx.endGame(vigilWon(s, ctx) ? `${alive.length} of ${n} still have a lantern lit: the room wins together!` : `Only ${alive.length} of ${n} still have a lantern lit: the room needed half.`);
      return;
    }
    if (lastTeamOn(s, ctx)) {
      const lit = litTeams(s, ctx);
      if (lit.length === 1) ctx.endGame(`The ${lit[0]!.name} are the last team with a lantern lit.`);
      else if (lit.length === 0) ctx.endGame('Every lantern has gone out.');
      else ctx.endGame(`${lit.length} teams still had a lantern lit at the end.`);
      return;
    }
    if (alive.length === 0) ctx.endGame('Every lantern has gone out.');
    else if (alive.length === 1) ctx.endGame(s.startedWith > 1 ? `${alive[0]!.name} kept the last lantern burning.` : 'Your lantern stayed lit to the end.');
    else ctx.endGame(`${alive.length} players still had a lantern lit at the end.`);
  },
};

/** Night vigil: at least half the players still in the room have a lantern lit. */
function vigilWon(s: State, ctx: ModeContext): boolean {
  const here = ctx.players();
  return here.length > 0 && here.filter((p) => !isOut(s, p.id)).length * 2 >= here.length;
}

/** Decide, as a round starts, whether it is a revival round. */
function roundStarted(s: State, ctx: ModeContext) {
  // Never on the last question: reviving players with nothing left to play for would just undo the game.
  const last = s.sync.round >= s.sync.order.length - 1;
  const due = !last && revivalDue(s.sync.round + 1, opts(ctx).reviveEvery);
  // A revival round with nobody out (or nobody out who is connected) would be a question nobody can answer.
  const waiting = ctx.players().some((p) => p.connected && isOut(s, p.id));
  s.revival = { round: s.sync.round, on: due && waiting };
  if (s.revival.on) ctx.feed('Revival round: players who are out can relight a lantern.', { tone: 'big' });
}

/** Run a step of the round machine and catch the start of a new round. */
function step(s: State, ctx: ModeContext, fn: () => ActionResult): ActionResult {
  const before = s.sync.round;
  const result = fn();
  if (s.sync.round !== before && s.sync.phase === 'question') roundStarted(s, ctx);
  return result;
}

/** 1-based number of the next question that is due to be a revival round, or null. */
function nextRevival(s: State, ctx: ModeContext): number | null {
  const every = opts(ctx).reviveEvery;
  if (every <= 0) return null;
  // A revival round in progress counts as "next"; otherwise look past the current question.
  const current = s.sync.round + 1;
  const from = s.sync.phase === 'question' && isRevival(s) ? current : current + 1;
  const n = Math.ceil(Math.max(1, from) / every) * every;
  return n < s.sync.order.length ? n : null;
}

function teamScores(s: State, ctx: ModeContext) {
  const lives = opts(ctx).lives;
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const lit = members.reduce((n, p) => n + (s.lanterns[p.id] ?? 0), 0);
    const share = members.length ? Math.round((100 * lit) / (members.length * lives)) : 0;
    const points = members.length ? Math.round(members.reduce((n, p) => n + (s.sync.scores[p.id] ?? 0), 0) / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: share, points, members: members.length };
  });
}

const fmt = (n: number) => n.toLocaleString('en-GB');
const lanternsText = (n: number) => `${n} ${n === 1 ? 'lantern' : 'lanterns'}`;

export const lanternOut = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const lanterns: Record<PlayerId, number> = {};
    for (const p of ctx.players()) lanterns[p.id] = ctx.settings.lives;
    const s: State = {
      sync: syncInit(ctx),
      lanterns,
      outAt: {},
      leftAt: {},
      startedWith: ctx.players().length,
      revival: { round: -1, on: false },
      last: null,
      startTeams: ctx.teams().filter((t) => ctx.players().some((p) => p.teamId === t.id)).length,
      teamOutAt: {},
    };
    if (ctx.settings.vigil) ctx.feed('Play together: the room wins if at least half of you still have a lantern lit at the end.', { tone: 'info' });
    if (ctx.settings.lastTeam && s.startTeams >= 2) ctx.feed('The last team with a lantern lit wins.', { tone: 'info' });
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    syncAddPlayer(s, p.id);
    // Players who return keep what they had; new arrivals after the start get one lantern.
    s.lanterns[p.id] ??= s.sync.round >= 0 ? 1 : ctx.settings.lives;
    delete s.leftAt[p.id];
  },
  onPlayerLeave(s, p, ctx) {
    if (!isOut(s, p.id)) s.leftAt[p.id] = Math.max(0, s.sync.round);
    if (s.sync.phase !== 'question') return;
    const waiting = ctx.players().filter((x) => x.connected && cfg.canAnswer!(s, x.id, ctx));
    if (waiting.length && waiting.every((x) => s.sync.answers[x.id])) step(s, ctx, () => syncAdvance(s, cfg, ctx));
  },
  onAction(s, playerId, a, ctx) {
    if (a.iid !== s.sync.iid) return { error: 'That question has closed.' };
    if (s.sync.phase === 'question' && !cfg.canAnswer!(s, playerId, ctx)) {
      return { error: isRevival(s) ? 'This is a revival round: only players who are out can answer.' : 'Your lanterns are out. Wait for a revival round.' };
    }
    return syncAnswer(s, cfg, playerId, a.answer, ctx);
  },
  onTimer(s, id, ctx) {
    step(s, ctx, () => syncOnTimer(s, cfg, id, ctx));
  },
  onHostNext(s, ctx) {
    return step(s, ctx, () => syncHostNext(s, cfg, ctx));
  },
  view(s, viewer, ctx) {
    const st = opts(ctx);
    const players = ctx.players();
    const revealed = s.sync.phase === 'reveal';
    const live = s.sync.phase === 'question' || revealed;
    const last = revealed && s.last && s.last.round === s.sync.round ? s.last : null;
    const names = (ids: PlayerId[]) => ids.map((id) => ctx.player(id)?.name ?? 'A player');
    const roster = players
      .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, lanterns: s.lanterns[p.id] ?? 0, outAt: s.outAt[p.id] ?? null, points: s.sync.scores[p.id] ?? 0 }))
      .sort((a, b) => b.lanterns - a.lanterns || (b.outAt ?? -1) - (a.outAt ?? -1) || b.points - a.points || a.name.localeCompare(b.name));
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    return {
      sync: syncView(s, cfg, viewer, ctx),
      lives: st.lives,
      reviveEvery: st.reviveEvery,
      revival: live && isRevival(s),
      nextRevival: nextRevival(s, ctx),
      alive: players.filter((p) => !isOut(s, p.id)).length,
      out: players.filter((p) => isOut(s, p.id)).length,
      roster: viewer.kind === 'host' ? roster.slice(0, 60) : roster.slice(0, 8),
      last: last ? { blown: last.blown.length, out: names(last.out), relit: names(last.relit), kindled: names(last.kindled), slow: names(last.slow) } : null,
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      board: leaderboard(s.sync.scores, s.sync.lastGain, ctx, viewer, 5),
      you: me
        ? {
            lanterns: s.lanterns[me] ?? 0,
            out: isOut(s, me),
            outAt: s.outAt[me] ?? null,
            points: s.sync.scores[me] ?? 0,
            lost: Boolean(last?.blown.includes(me)),
            knockedOut: Boolean(last?.out.includes(me)),
            relit: Boolean(last?.relit.includes(me)),
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const lit = s.lanterns[p.id] ?? 0;
      const pts = s.sync.scores[p.id] ?? 0;
      if (lit > 0 && !p.left) return { playerId: p.id, score: 1_000_000_000 + lit * 10_000_000 + pts, label: `${lanternsText(lit)} lit, ${fmt(pts)} pts` };
      // Knocked out (or left while still in): later is better.
      const at = lit > 0 ? (s.leftAt[p.id] ?? 0) : (s.outAt[p.id] ?? 0);
      return { playerId: p.id, score: (at + 2) * 100_000 + pts, label: lit > 0 ? `Left on question ${at + 1}` : `Out on question ${at + 1}` };
    });
    const lastTeam = lastTeamOn(s, ctx);
    const teams = ctx.teams().length
      ? teamScores(s, ctx).map((t) => {
          if (!lastTeam) return { teamId: t.teamId, score: t.score * 1_000_000 + t.points, label: `${t.score}% of lanterns lit` };
          // Teams still lit rank first, then teams that went out later; the share of lanterns lit breaks ties.
          const outAt = s.teamOutAt[t.teamId];
          const base = outAt === undefined ? 10_000_000_000 : (outAt + 2) * 10_000_000;
          return { teamId: t.teamId, score: base + t.score * 10_000 + Math.min(9_999, t.points), label: outAt === undefined ? `Still lit: ${t.score}% of lanterns` : `Out on question ${outAt + 1}` };
        })
      : undefined;
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    const vigil = opts(ctx).vigil ? { outcome: vigilWon(s, ctx) ? ('coop-win' as const) : ('coop-loss' as const) } : {};
    return {
      standings,
      ...(teams ? { teamStandings: teams } : {}),
      ...vigil,
      summary: alive ? `${alive} ${alive === 1 ? 'lantern holder' : 'lantern holders'} made it to the end.` : 'Every lantern went out.',
    };
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
