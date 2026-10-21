import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = { distance: number; boostEvery: number; slipstream: boolean; wrongSetback: boolean; finishers: number };

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

function finishersNeeded(s: State, ctx: ModeContext<Settings>) {
  return Math.min(ctx.settings.finishers, Object.keys(s.racers).length);
}

function checkEnd(s: State, ctx: ModeContext<Settings>) {
  const active = ctx.players().map((p) => p.id).filter((id) => s.racers[id]);
  const allDone = active.length > 0 && active.every((id) => s.racers[id]!.place !== null);
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
  defaults: { timeLimitSec: 300 },
  action,
  init(ctx) {
    const racers: Record<PlayerId, Racer> = {};
    for (const p of ctx.players()) racers[p.id] = newRacer(ctx);
    const endsAt = ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null;
    if (endsAt) ctx.setTimer('time', endsAt);
    return { racers, finishOrder: [], endsAt };
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
    const notes: string[] = [];
    let gain = 0;
    if (res.correct) {
      gain = 1;
      if (res.streak > 0 && res.streak % ctx.settings.boostEvery === 0) {
        gain++;
        notes.push('Boost');
      }
      if (ctx.settings.slipstream) {
        const drafting = Object.entries(s.racers).some(([id, o]) => id !== playerId && o.place === null && o.pos > r.pos && o.pos - r.pos <= 3);
        if (drafting) {
          gain++;
          notes.push('Slipstream');
        }
      }
    } else if (ctx.settings.wrongSetback && r.pos > 0) {
      gain = -1;
      notes.push('Knocked back');
    }
    r.pos = Math.max(0, Math.min(ctx.settings.distance, r.pos + gain));
    r.lastMove = { gain, notes };
    if (r.stream.last) r.stream.last.text = gain > 0 ? `+${gain} ${gain === 1 ? 'space' : 'spaces'}${notes.length ? ` (${notes.join(', ')})` : ''}` : gain < 0 ? 'Back one space' : 'No move';
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
    if (id === 'time') ctx.endGame(s.finishOrder.length ? 'Time is up.' : 'Time is up. Furthest along wins.');
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
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: 'The race is over.' };
  },
  bot(view, ctx) {
    const q = view?.you?.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 2500 + rng.int(0, 5000);
  },
});
