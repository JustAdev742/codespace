import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = {
  distance: number;
  boostEvery: number;
  slipstream: boolean;
  wrongSetback: boolean;
  finishers: number;
  momentum: boolean;
  starGates: number;
  tailwind: boolean;
  wormholes: boolean;
  together: boolean;
};

/** Momentum: the most spaces one correct answer can move you. */
export const MOMENTUM_CAP = 3;
/** Wormholes: how far one throws you. */
export const WORMHOLE_JUMP = 3;

interface Racer {
  pos: number;
  stream: StreamState;
  place: number | null;
  lastMove: { gain: number; notes: string[] } | null;
}

interface State {
  racers: Record<PlayerId, Racer>;
  finishOrder: PlayerId[];
  endsAt: number | null;
  /** Hidden wormhole spaces (empty unless wormholes are on). Never sent to a client. */
  wormholes: number[];
  /** Race together: every racer made it home in time. */
  allHome: boolean;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function newRacer(ctx: ModeContext): Racer {
  return { pos: 0, stream: streamInit(ctx), place: null, lastMove: null };
}

const activeRacers = (s: State, ctx: ModeContext) => ctx.players().map((p) => p.id).filter((id) => s.racers[id]);

function finishersNeeded(s: State, ctx: ModeContext<Settings>) {
  // Racing together, the race is only over when everyone is home.
  if (ctx.settings.together) return activeRacers(s, ctx).length;
  return Math.min(ctx.settings.finishers, Object.keys(s.racers).length);
}

/** Wormhole spaces for a track: about one for every seven spaces, never near the start or the line. */
export function placeWormholes(distance: number, rng: ModeContext['rng']): number[] {
  const spaces = Array.from({ length: Math.max(0, distance - 5) }, (_, i) => i + 2);
  const count = Math.min(spaces.length, Math.max(1, Math.floor(distance / 7)));
  return rng
    .shuffle(spaces)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** Tailwind: is this racer in the back half of the field (finished racers count as ahead)? */
function inBackHalf(s: State, id: PlayerId, ctx: ModeContext): boolean {
  const ids = activeRacers(s, ctx);
  const me = s.racers[id];
  if (!me || ids.length < 2) return false;
  const ahead = ids.filter((o) => o !== id && (s.racers[o]!.place !== null || s.racers[o]!.pos > me.pos)).length;
  return ahead + 1 > Math.ceil(ids.length / 2);
}

function checkEnd(s: State, ctx: ModeContext<Settings>) {
  const active = activeRacers(s, ctx);
  const allDone = active.length > 0 && active.every((id) => s.racers[id]!.place !== null);
  if (ctx.settings.together) {
    if (!allDone) return;
    s.allHome = true;
    ctx.endGame('Every racer crossed the line. The room wins together.');
    return;
  }
  if (s.finishOrder.length >= finishersNeeded(s, ctx) || allDone) {
    const winner = ctx.player(s.finishOrder[0]!)?.name;
    ctx.endGame(winner ? `${winner} crossed the line first.` : 'The race is over.');
  }
}

function lanes(s: State, ctx: ModeContext, me: PlayerId | null, limit: number) {
  const all = ctx
    .players()
    .filter((p) => s.racers[p.id])
    .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, pos: s.racers[p.id]!.pos, place: s.racers[p.id]!.place, isYou: p.id === me }))
    .sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9) || b.pos - a.pos || a.name.localeCompare(b.name));
  const top = all.slice(0, limit);
  const mine = all.find((l) => l.isYou);
  if (mine && !top.includes(mine)) top.push(mine);
  return top;
}

export const cometDash = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const racers: Record<PlayerId, Racer> = {};
    for (const p of ctx.players()) racers[p.id] = newRacer(ctx);
    const endsAt = ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null;
    if (endsAt) ctx.setTimer('time', endsAt);
    const wormholes = ctx.settings.wormholes ? placeWormholes(ctx.settings.distance, ctx.rng) : [];
    if (ctx.settings.together) ctx.feed('Race together: the room wins if every racer crosses the line before time runs out.', { tone: 'info' });
    return { racers, finishOrder: [], endsAt, wormholes, allHome: false };
  },
  onPlayerJoin(s, p, ctx) {
    s.racers[p.id] ??= newRacer(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const r = s.racers[playerId];
    if (!r) return { error: 'You are not racing.' };
    if (r.place !== null) return { error: 'You already finished.' };
    const res = streamSubmit(r.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    const st = ctx.settings;
    const notes: string[] = [];
    let gain = 0;
    let setback: string | null = null;
    if (res.correct) {
      if (st.momentum) {
        gain = Math.min(MOMENTUM_CAP, Math.max(1, res.streak));
        if (gain > 1) notes.push('Momentum');
      } else {
        gain = 1;
        if (res.streak > 0 && res.streak % st.boostEvery === 0) {
          gain++;
          notes.push('Boost');
        }
      }
      if (st.slipstream) {
        const drafting = Object.entries(s.racers).some(([id, o]) => id !== playerId && o.place === null && o.pos > r.pos && o.pos - r.pos <= 3);
        if (drafting) {
          gain++;
          notes.push('Slipstream');
        }
      }
      if (st.tailwind && inBackHalf(s, playerId, ctx)) {
        gain++;
        notes.push('Tailwind');
      }
      if (st.together && s.finishOrder.length > 0) {
        gain++;
        notes.push('Towed');
      }
    } else if (st.starGates > 0) {
      const gate = Math.floor(r.pos / st.starGates) * st.starGates;
      if (gate < r.pos) {
        gain = gate - r.pos;
        setback = gate > 0 ? `Back to the star gate at space ${gate}` : 'Back to the start';
      }
    } else if (st.wrongSetback && r.pos > 0) {
      gain = -1;
      notes.push('Knocked back');
    }
    r.pos = Math.max(0, Math.min(st.distance, r.pos + gain));
    if (gain > 0 && s.wormholes.includes(r.pos)) {
      const from = r.pos;
      r.pos = Math.min(st.distance, from + WORMHOLE_JUMP);
      gain += r.pos - from;
      notes.push('Wormhole');
      ctx.feed(`${ctx.player(playerId)?.name ?? 'A racer'} found a wormhole at space ${from}.`, { tone: 'good' });
    }
    r.lastMove = { gain, notes };
    if (r.stream.last) r.stream.last.text = gain > 0 ? `+${gain} ${gain === 1 ? 'space' : 'spaces'}${notes.length ? ` (${notes.join(', ')})` : ''}` : gain < 0 ? (setback ?? 'Back one space') : 'No move';
    if (r.pos >= ctx.settings.distance) {
      s.finishOrder.push(playerId);
      r.place = s.finishOrder.length;
      ctx.feed(`${ctx.player(playerId)?.name ?? 'A player'} finished ${ordinal(r.place)}.`, { tone: 'big' });
      checkEnd(s, ctx);
      return;
    }
    streamNext(r.stream, ctx);
  },
  onTimer(s, id, ctx) {
    if (id !== 'time') return;
    if (ctx.settings.together) {
      const home = activeRacers(s, ctx).filter((r) => s.racers[r]!.place !== null).length;
      ctx.endGame(`Time is up with ${home} of ${activeRacers(s, ctx).length} racers home.`);
      return;
    }
    ctx.endGame(s.finishOrder.length ? 'Time is up.' : 'Time is up. Furthest along wins.');
  },
  onPlayerLeave(s, _p, ctx) {
    if (s.finishOrder.length) checkEnd(s, ctx);
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const r = me ? s.racers[me] : undefined;
    return {
      distance: ctx.settings.distance,
      endsAt: s.endsAt,
      finished: s.finishOrder.length,
      finishersNeeded: finishersNeeded(s, ctx),
      lanes: lanes(s, ctx, me, viewer.kind === 'host' ? 40 : 8),
      you: r
        ? {
            pos: r.pos,
            place: r.place,
            streak: r.stream.streak,
            question: streamQuestionView(r.stream, ctx),
            last: r.stream.last,
            lastMove: r.lastMove,
          }
        : null,
    };
  },
  results(s, ctx) {
    const d = ctx.settings.distance;
    const played = new Set(ctx.everyone().map((p) => p.id));
    const standings = Object.entries(s.racers)
      .filter(([id]) => played.has(id))
      .map(([id, r]) => ({
        playerId: id,
        score: r.place !== null ? 1_000_000 - r.place : r.pos * 1000 + r.stream.correct,
        label: r.place !== null ? `Finished ${ordinal(r.place)}` : `${r.pos} of ${d} spaces`,
      }));
    const teams = ctx.teams().length
      ? ctx.teams().map((t) => {
          const members = ctx.players().filter((p) => p.teamId === t.id && s.racers[p.id]);
          const avg = members.length ? members.reduce((n, p) => n + s.racers[p.id]!.pos, 0) / members.length : 0;
          return { teamId: t.id, score: Math.round(avg * 10), label: `${avg.toFixed(1)} spaces on average` };
        })
      : undefined;
    const outcome = ctx.settings.together ? { outcome: s.allHome ? ('coop-win' as const) : ('coop-loss' as const) } : {};
    return { standings, ...(teams ? { teamStandings: teams } : {}), ...outcome, summary: 'The race is over.' };
  },
  bot(view, ctx) {
    const q = view?.you?.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 2500 + rng.int(0, 5000);
  },
});
