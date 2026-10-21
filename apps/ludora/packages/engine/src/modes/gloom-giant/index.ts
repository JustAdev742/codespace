/*
 * Gloom Giant: the whole room against one boss.
 *
 * Every player answers their own stream of questions. Correct answers damage
 * the giant (more on a streak, more on a seeded critical hit); wrong answers
 * let it strike the shield the room shares, twice as hard once it is enraged
 * below half health. Health 0 is a win for everyone; a broken shield or the
 * clock running out is a loss for everyone. Standings rank damage dealt.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = { hpPerPlayer: number; shieldBase: number; shieldPerPlayer: string; regen: boolean; mending: boolean; swift: boolean };

export const CRIT_CHANCE = 0.1;
/** A streak of this many correct answers or more adds 1 damage. */
export const STREAK_FROM = 3;
/** Healing giant: how often it heals (1 health for every player). */
export const REGEN_EVERY_MS = 15_000;
/** Shield mending: every this many correct answers in a row mends the shield by 1. */
export const MEND_EVERY = 5;
/** Swift strikes: a correct answer this quick is a critical hit. */
export const SWIFT_MS = 6_000;
const LOG_KEEP = 10;

interface Fighter {
  stream: StreamState;
  damage: number;
  hits: number;
  crits: number;
  misses: number;
}

interface Blow {
  seq: number;
  playerId: PlayerId;
  kind: 'hit' | 'crit' | 'strike';
  amount: number;
  at: number;
}

interface State {
  fighters: Record<PlayerId, Fighter>;
  /** Players whose share of health has been added to the giant, so a rejoin does not add it twice. */
  counted: Record<PlayerId, true>;
  maxHp: number;
  hp: number;
  enraged: boolean;
  shieldMax: number;
  shield: number;
  cracked: boolean;
  endsAt: number | null;
  result: 'win' | 'loss' | null;
  reason: 'defeated' | 'shield' | 'time' | null;
  finalBlow: PlayerId | null;
  log: Blow[];
  seq: number;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

/** The shield the room starts with: the base plus one for every two players (or more, if the host chose a sturdier shield). */
export function startingShield(shieldBase: number, players: number, perPlayer = 'half'): number {
  const n = Math.max(1, players);
  return shieldBase + (perPlayer === 'half' ? Math.ceil(n / 2) : n * (Number(perPlayer) || 0));
}

function newFighter(ctx: ModeContext): Fighter {
  return { stream: streamInit(ctx), damage: 0, hits: 0, crits: 0, misses: 0 };
}

function nameOf(ctx: ModeContext, id: PlayerId | null) {
  if (!id) return 'Someone';
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'Someone';
}

function log(s: State, blow: Omit<Blow, 'seq'>) {
  s.seq++;
  s.log = [...s.log, { ...blow, seq: s.seq }].slice(-LOG_KEEP);
}

function finish(s: State, result: 'win' | 'loss', reason: NonNullable<State['reason']>, ctx: ModeContext) {
  s.result = result;
  s.reason = reason;
  ctx.endGame();
}

function ranked(s: State, ctx: ModeContext, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.fighters[p.id])
    .map((p) => ({ playerId: p.id, name: p.name, damage: s.fighters[p.id]!.damage, isYou: p.id === me, rank: 0 }))
    .sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name));
  let last = Number.NaN;
  let rank = 0;
  rows.forEach((r, i) => {
    if (r.damage !== last) {
      rank = i + 1;
      last = r.damage;
    }
    r.rank = rank;
  });
  return rows;
}

export const gloomGiant = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const fighters: Record<PlayerId, Fighter> = {};
    const counted: Record<PlayerId, true> = {};
    for (const p of ctx.players()) {
      fighters[p.id] = newFighter(ctx);
      counted[p.id] = true;
    }
    const n = Math.max(1, ctx.players().length);
    const maxHp = ctx.settings.hpPerPlayer * n;
    const shield = startingShield(ctx.settings.shieldBase, n, ctx.settings.shieldPerPlayer);
    const endsAt = ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null;
    if (endsAt) ctx.setTimer('time', endsAt);
    if (ctx.settings.regen) ctx.setTimer('regen', ctx.now() + REGEN_EVERY_MS);
    return { fighters, counted, maxHp, hp: maxHp, enraged: false, shieldMax: shield, shield, cracked: false, endsAt, result: null, reason: null, finalBlow: null, log: [], seq: 0 };
  },
  onPlayerJoin(s, p, ctx) {
    s.fighters[p.id] ??= newFighter(ctx);
    if (s.counted[p.id] || s.result) return;
    s.counted[p.id] = true;
    s.maxHp += ctx.settings.hpPerPlayer;
    s.hp += ctx.settings.hpPerPlayer;
    ctx.feed(`The Gloom Giant grows: +${ctx.settings.hpPerPlayer} health for ${p.name}.`, { tone: 'info' });
  },
  onAction(s, playerId, a, ctx) {
    const f = s.fighters[playerId];
    if (!f) return { error: 'You are not in this battle.' };
    if (s.result) return { error: 'The battle is over.' };
    const res = streamSubmit(f.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    const at = ctx.now();
    const name = nameOf(ctx, playerId);
    if (res.correct) {
      const st = ctx.settings;
      const streak = res.streak >= STREAK_FROM;
      const crit = st.swift ? res.responseMs <= SWIFT_MS : ctx.rng.chance(CRIT_CHANCE);
      const dealt = Math.min(1 + (streak ? 1 : 0) + (crit ? 1 : 0), s.hp);
      s.hp -= dealt;
      f.damage += dealt;
      f.hits++;
      if (crit) f.crits++;
      log(s, { playerId, kind: crit ? 'crit' : 'hit', amount: dealt, at });
      const mended = st.mending && s.hp > 0 && res.streak % MEND_EVERY === 0 && s.shield < s.shieldMax;
      if (mended) {
        s.shield++;
        // Mended out of danger: a new crack will be announced again.
        if (s.shield > 2) s.cracked = false;
      }
      const notes = [streak ? 'streak' : null, crit ? 'critical hit' : null, mended ? 'shield mended' : null].filter(Boolean);
      if (f.stream.last) f.stream.last.text = `Hit for ${dealt}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      if (s.hp <= 0) {
        s.finalBlow = playerId;
        ctx.feed(`${name} landed the final blow${crit ? ' with a critical hit' : ''}!`, { tone: 'big' });
        return finish(s, 'win', 'defeated', ctx);
      }
      if (mended) ctx.feed(`${name} mended the shield.`, { tone: 'good' });
      // Swift critical hits are common, so only lucky ones are announced to the room.
      if (crit && !st.swift) ctx.feed(`${name} landed a critical hit!`, { tone: 'good' });
      if (!s.enraged && s.hp < s.maxHp / 2) {
        s.enraged = true;
        ctx.feed('The Gloom Giant is enraged! Wrong answers now cost 2 shield.', { tone: 'bad' });
      }
    } else {
      const strike = s.enraged ? 2 : 1;
      s.shield = Math.max(0, s.shield - strike);
      f.misses++;
      log(s, { playerId, kind: 'strike', amount: strike, at });
      if (f.stream.last) f.stream.last.text = `The giant struck the shield (−${strike})`;
      if (s.shield <= 0) {
        ctx.feed('The shield shattered!', { tone: 'bad' });
        return finish(s, 'loss', 'shield', ctx);
      }
      if (!s.cracked && s.shield <= 2) {
        s.cracked = true;
        ctx.feed(`The shield is cracking: ${s.shield} left!`, { tone: 'bad' });
      }
    }
    streamNext(f.stream, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === 'regen') {
      if (s.result) return;
      const heal = Math.min(s.maxHp - s.hp, Math.max(1, ctx.players().length));
      if (heal > 0) {
        s.hp += heal;
        ctx.feed(`The Gloom Giant heals ${heal}.`, { tone: 'bad' });
      }
      ctx.setTimer('regen', ctx.now() + REGEN_EVERY_MS);
      return;
    }
    if (id !== 'time' || s.result) return;
    ctx.feed('Time is up! The Gloom Giant still stands.', { tone: 'bad' });
    finish(s, 'loss', 'time', ctx);
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const f = me ? s.fighters[me] : undefined;
    const rows = ranked(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 6 : 3);
    const mine = rows.find((r) => r.isYou) ?? null;
    return {
      endsAt: s.endsAt,
      hp: s.hp,
      maxHp: s.maxHp,
      enraged: s.enraged,
      shield: s.shield,
      shieldMax: s.shieldMax,
      fighters: rows.length,
      result: s.result,
      top,
      recent: s.log
        .slice()
        .reverse()
        .slice(0, viewer.kind === 'host' ? 8 : 4)
        .map((b) => ({ seq: b.seq, name: nameOf(ctx, b.playerId), kind: b.kind, amount: b.amount, at: b.at, isYou: b.playerId === me })),
      you: f
        ? {
            damage: f.damage,
            hits: f.hits,
            crits: f.crits,
            misses: f.misses,
            rank: mine?.rank ?? null,
            streak: f.stream.streak,
            question: streamQuestionView(f.stream, ctx),
            last: f.stream.last,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const damage = s.fighters[p.id]?.damage ?? 0;
      return { playerId: p.id, score: damage, label: `${damage} damage` };
    });
    const left = `${s.hp} of ${s.maxHp} health`;
    let summary: string;
    if (s.result === 'win') summary = `The Gloom Giant is down! ${nameOf(ctx, s.finalBlow)} landed the final blow.`;
    else if (s.reason === 'shield') summary = `The shield broke with the Gloom Giant on ${left}.`;
    else if (s.reason === 'time') summary = `Time ran out with the Gloom Giant on ${left}.`;
    else summary = `The battle ended with the Gloom Giant on ${left}.`;
    return { standings, outcome: s.result === 'win' ? 'coop-win' : 'coop-loss', summary };
  },
  bot(view, ctx) {
    const q = view?.you?.question;
    return q && !view.result ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 2200 + rng.int(0, 4500);
  },
});
