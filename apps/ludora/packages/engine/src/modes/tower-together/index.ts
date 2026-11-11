/*
 * Tower Together: the whole class builds one lantern tower before dawn.
 *
 * Questions and building run side by side: a builder can answer, or place a
 * piece they hold, at any moment. Right answers earn generic pieces (up to
 * MAX_HOLD); the builder picks timber, stone or a lantern brace when placing.
 * Gusts land on a fixed schedule; each one's strength is drawn from the
 * game's seeded random source when it is announced, WARN_SEC ahead, with the
 * chances every screen prints (odds.ts). Everything else is what the class builds.
 *
 * A "crew" builds one tower: the whole class, or each team in Two Towers.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  GUST_TIMING,
  MAX_HOLD,
  MAX_SWAY,
  PIECES,
  POINTS,
  QUIET_END_SEC,
  SETTLE,
  STEADY_MS,
  STRENGTHS,
  WARN_SEC,
  braceGap,
  meta,
  settings,
  standingFloors,
  type GustStrength,
  type PieceKind,
  type TargetSetting,
  type WindSetting,
} from './meta.ts';
import { gustOdds, leverage, pickGust, pieceEffect, starsFor, swayFor, targetFloors, topples, towerSway, type PieceEffect, type TowerNow } from './odds.ts';

type Settings = {
  gusts: WindSetting;
  target: TargetSetting;
  twoTowers: boolean;
};

const CODE: Record<PieceKind, string> = { timber: 'T', stone: 'S', lantern: 'L' };

interface Piece {
  k: PieceKind;
  by: PlayerId;
}

/** The last piece placed on a tower, for the screens to animate and announce. */
interface Placed {
  seq: number;
  at: number;
  kind: PieceKind;
  by: PlayerId;
  /** The tower's height and sway after it went on. */
  height: number;
  sway: number;
}

/** What the last gust did to a tower. */
interface GustResult {
  seq: number;
  at: number;
  strength: GustStrength;
  sway: number;
  held: boolean;
  /** Floors that fell, and the height the tower fell from and to. */
  fell: number;
  from: number;
  to: number;
  /** The kinds of the pieces that fell, bottom up (for the picture). */
  kinds: string;
  /** Floors the highest brace kept standing, and who placed it. */
  saved: number;
  savedBy: PlayerId | null;
}

interface Tower {
  id: string;
  pieces: Piece[];
  height: number;
  /** Index in `pieces` of the highest brace, or -1. */
  brace: number;
  /** Height at the top of the highest brace (0 with none). */
  braceAt: number;
  /** Sway from the pieces themselves; the gauge adds leverage (odds.ts `towerSway`). */
  build: number;
  target: number;
  /** Builders the target was set for. */
  builtFor: number;
  peak: number;
  falls: number;
  fallen: number;
  saved: number;
  holds: number;
  seq: number;
  last: Placed | null;
  gust: GustResult | null;
  /** Stars already announced. */
  stars: number;
}

interface Builder {
  stream: StreamState;
  tower: string;
  held: number;
  placed: Record<PieceKind, number>;
  saved: number;
  /** Floors of this builder's pieces standing in the tower now (a brace counts as one). */
  standing: number;
  /** No question until then: a short pause after a wrong answer. */
  steadyUntil: number;
  seq: number;
  lastKind: PieceKind | null;
  lastAt: number;
}

interface Gust {
  landsAt: number;
  /** Drawn when it is announced. */
  strength: GustStrength | null;
}

interface State {
  builders: Record<PlayerId, Builder>;
  towers: Record<string, Tower>;
  startedAt: number;
  endsAt: number;
  gust: Gust | null;
  gustSeq: number;
  gustsLanded: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('place'), kind: z.enum(['timber', 'stone', 'lantern']) }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
/** Pieces of each tower sent in a view, from the top down (the rest is summed up). */
const KINDS_KEEP = 900;
/** Builders on the scaffolding in a player's view besides themselves, and on the big screen. */
const NEAR_MAX = 11;
const HOST_MAX = 36;
const CLASS = 'class';

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const floorsText = (n: number) => `${fmt(n)} ${n === 1 ? 'floor' : 'floors'}`;
export const pointsText = (n: number) => `${fmt(n)} ${n === 1 ? 'point' : 'points'}`;

/* --------------------------------- helpers --------------------------------- */

function findPlayer(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id) ?? ctx.everyone().find((p) => p.id === id);
}

function playerName(ctx: ModeContext, id: PlayerId) {
  return findPlayer(ctx, id)?.name ?? 'A builder';
}

function twoTowers(ctx: ModeContext<Settings>) {
  return ctx.settings.twoTowers && ctx.teams().length > 1;
}

function towerIdFor(ctx: ModeContext<Settings>, id: PlayerId) {
  const team = findPlayer(ctx, id)?.teamId ?? null;
  return twoTowers(ctx) && team ? `team:${team}` : CLASS;
}

function towerName(ctx: ModeContext, id: string) {
  if (id.startsWith('team:')) return ctx.teams().find((t) => `team:${t.id}` === id)?.name ?? 'A team';
  return 'The class';
}

function nightSec(ctx: ModeContext<Settings>) {
  return ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC;
}

/** Builders still in the game on a tower: the crew that sets how far each piece moves the gauge. */
function crewSize(s: State, ctx: ModeContext, tower: string): number {
  return Math.max(1, ctx.players().filter((p) => s.builders[p.id]?.tower === tower).length);
}

function newTower(id: string): Tower {
  return { id, pieces: [], height: 0, brace: -1, braceAt: 0, build: 0, target: 0, builtFor: 0, peak: 0, falls: 0, fallen: 0, saved: 0, holds: 0, seq: 0, last: null, gust: null, stars: 0 };
}

function join(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  if (s.builders[id]) return;
  const tower = towerIdFor(ctx, id);
  const t = (s.towers[tower] ??= newTower(tower));
  s.builders[id] = { stream: streamInit(ctx), tower, held: 0, placed: { timber: 0, stone: 0, lantern: 0 }, saved: 0, standing: 0, steadyUntil: 0, seq: 0, lastKind: null, lastAt: 0 };
  // A builder who joins once the night has begun raises the target by their share of what is left of it.
  const night = s.endsAt - s.startedAt;
  const left = Math.max(0, Math.min(1, (s.endsAt - ctx.now()) / Math.max(1, night)));
  const share = s.startedAt === ctx.now() ? 1 : left;
  t.builtFor += share;
  t.target = targetFloors(t.builtFor, nightSec(ctx), ctx.settings.target, ctx.settings.gusts);
}

function floorsSinceBrace(t: Tower) {
  return t.height - t.braceAt;
}

function towerNow(s: State, ctx: ModeContext, t: Tower): TowerNow {
  return { build: t.build, unbraced: floorsSinceBrace(t), target: t.target, crew: crewSize(s, ctx, t.id) };
}

/** What the gauge shows for a tower. */
function swayOf(t: Tower): number {
  return towerSway({ build: t.build, unbraced: floorsSinceBrace(t), target: t.target });
}

function braceNeeds(t: Tower) {
  return Math.max(0, braceGap(t.target) - floorsSinceBrace(t));
}

function points(s: State, id: PlayerId) {
  const b = s.builders[id];
  if (!b) return 0;
  const placed = b.placed.timber + b.placed.stone + b.placed.lantern;
  return placed * POINTS.piece + b.standing * POINTS.standing + b.saved * POINTS.saved;
}

/** Why a piece cannot go on now, or null. */
function refusal(s: State, ctx: ModeContext<Settings>, b: Builder, kind: PieceKind): string | null {
  const t = s.towers[b.tower]!;
  if (b.held < 1) return 'You have no pieces. Answer a question right to earn one.';
  if (kind === 'timber' && t.build + swayFor('timber', crewSize(s, ctx, t.id)) + leverage(floorsSinceBrace(t) + PIECES.timber.floors, t.target) > MAX_SWAY) return 'The tower is swaying too much for more timber. Steady it with stone first.';
  if (kind === 'lantern') {
    const needs = braceNeeds(t);
    if (needs > 0) return `A brace needs ${String(needs)} more ${needs === 1 ? 'floor' : 'floors'} above the last one.`;
  }
  return null;
}

/* ---------------------------------- gusts ---------------------------------- */

function scheduleGust(s: State, ctx: ModeContext<Settings>, landsAt: number) {
  if (ctx.settings.gusts === 'calm' || landsAt > s.endsAt - QUIET_END_SEC * 1000) {
    s.gust = null;
    return;
  }
  s.gust = { landsAt, strength: null };
  ctx.setTimer('warn', landsAt - WARN_SEC * 1000);
  ctx.setTimer('gust', landsAt);
}

function land(s: State, ctx: ModeContext<Settings>, strength: GustStrength) {
  const now = ctx.now();
  s.gustSeq++;
  s.gustsLanded++;
  const name = STRENGTHS[strength].name;
  const lines: string[] = [];
  for (const t of Object.values(s.towers)) {
    const sway = swayOf(t);
    const res: GustResult = { seq: s.gustSeq, at: now, strength, sway, held: true, fell: 0, from: t.height, to: t.height, kinds: '', saved: 0, savedBy: null };
    if (topples(sway, strength) && t.height > t.braceAt) {
      const fallen = t.pieces.slice(t.brace + 1);
      res.held = false;
      res.fell = t.height - t.braceAt;
      res.to = t.braceAt;
      res.kinds = fallen.map((p) => CODE[p.k]).join('');
      for (const p of fallen) {
        const by = s.builders[p.by];
        if (by) by.standing -= standingFloors(p.k);
      }
      t.pieces = t.pieces.slice(0, t.brace + 1);
      t.height = t.braceAt;
      t.falls++;
      t.fallen += res.fell;
      t.build = Math.round(t.build * SETTLE * 10) / 10;
      if (t.brace >= 0) {
        // Without the highest brace, everything down to the brace below (or the ground) would have gone.
        let below = 0;
        let h = 0;
        for (let i = 0; i < t.brace; i++) {
          h += PIECES[t.pieces[i]!.k].floors;
          if (t.pieces[i]!.k === 'lantern') below = h;
        }
        res.saved = t.braceAt - below;
        const by = t.pieces[t.brace]!.by;
        res.savedBy = by;
        if (res.saved > 0) {
          t.saved += res.saved;
          const b = s.builders[by];
          if (b) b.saved += res.saved;
        }
      }
      const who = Object.keys(s.towers).length > 1 ? `${towerName(ctx, t.id)}'s tower` : 'The tower';
      lines.push(`${who} was swaying too much: ${floorsText(res.fell)} fell${res.saved > 0 ? `, and the brace saved ${floorsText(res.saved)}` : ''}.`);
    } else {
      t.holds++;
      const who = Object.keys(s.towers).length > 1 ? `${towerName(ctx, t.id)}'s tower` : 'The tower';
      lines.push(`${who} held.`);
    }
    t.gust = res;
  }
  ctx.feed(`${name}! ${lines.join(' ')}`, { tone: lines.some((l) => l.includes('fell')) ? 'big' : 'info' });
}

/* ---------------------------------- views ---------------------------------- */

interface Row {
  playerId: PlayerId;
  name: string;
  teamId: string | null;
  points: number;
  pieces: number;
  rank: number;
  isYou: boolean;
}

/** Most points first; level on points, more pieces placed, then by name (the results table's order). */
function ranking(s: State, ctx: ModeContext, me: PlayerId | null): Row[] {
  const rows = ctx
    .players()
    .filter((p) => s.builders[p.id])
    .map((p) => {
      const b = s.builders[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, points: points(s, p.id), pieces: b.placed.timber + b.placed.stone + b.placed.lantern, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.points - a.points || b.pieces - a.pieces || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function towerView(s: State, ctx: ModeContext<Settings>, t: Tower) {
  const team = t.id.startsWith('team:') ? ctx.teams().find((x) => `team:${x.id}` === t.id) : undefined;
  const keep = t.pieces.slice(-KINDS_KEEP);
  let base = 0;
  for (let i = 0; i < t.pieces.length - keep.length; i++) base += PIECES[t.pieces[i]!.k].floors;
  const { stars, steps } = starsFor(t.height, t.target);
  const crew = crewSize(s, ctx, t.id);
  return {
    id: t.id,
    name: towerName(ctx, t.id),
    hue: team?.hue ?? null,
    crew,
    target: t.target,
    stars,
    steps,
    height: t.height,
    peak: t.peak,
    braceAt: t.braceAt,
    braceGap: braceGap(t.target),
    braceNeeds: braceNeeds(t),
    sway: swayOf(t),
    /** The pieces' own sway and the leverage of the floors above the highest brace, which make up `sway`. */
    build: t.build,
    leverage: leverage(floorsSinceBrace(t), t.target),
    /** Floors below the pieces listed in `kinds`. */
    base,
    /** One letter a piece, bottom up: T timber, S stone, L lantern brace. */
    kinds: keep.map((p) => CODE[p.k]).join(''),
    /** Index in `kinds` of the highest brace, or -1. */
    brace: t.brace - (t.pieces.length - keep.length),
    falls: t.falls,
    fallen: t.fallen,
    saved: t.saved,
    holds: t.holds,
    last: t.last ? { ...t.last, by: playerName(ctx, t.last.by) } : null,
    gust: t.gust ? { ...t.gust, name: STRENGTHS[t.gust.strength].name, limit: STRENGTHS[t.gust.strength].limit, savedBy: t.gust.savedBy ? playerName(ctx, t.gust.savedBy) : null } : null,
  };
}

/** A builder on the scaffolding, as the scenes draw them. */
function builderView(s: State, ctx: ModeContext, id: PlayerId, me: PlayerId | null) {
  const b = s.builders[id]!;
  return { playerId: id, name: playerName(ctx, id), tower: b.tower, seq: b.seq, kind: b.lastKind, isYou: id === me };
}

/** Builders of a tower, the most recent to place a piece first (you always included). */
function buildersOf(s: State, ctx: ModeContext, tower: string | null, me: PlayerId | null, max: number) {
  const ids = ctx
    .players()
    .filter((p) => s.builders[p.id] && (tower === null || s.builders[p.id]!.tower === tower) && p.id !== me)
    .map((p) => p.id)
    .sort((a, b) => s.builders[b]!.lastAt - s.builders[a]!.lastAt || a.localeCompare(b))
    .slice(0, max);
  return [...(me && s.builders[me] ? [builderView(s, ctx, me, me)] : []), ...ids.map((id) => builderView(s, ctx, id, me))];
}

function teamRows(s: State, ctx: ModeContext<Settings>) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.builders[p.id]);
    if (twoTowers(ctx)) {
      const tw = s.towers[`team:${t.id}`];
      const pct = tw && tw.target ? Math.floor((tw.height / tw.target) * 100) : 0;
      return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, score: pct, height: tw?.height ?? 0, target: tw?.target ?? 0 };
    }
    const total = members.reduce((n, p) => n + points(s, p.id), 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, score: members.length ? Math.round(total / members.length) : 0, height: 0, target: 0 };
  });
}

/* ----------------------------------- mode ---------------------------------- */

export const towerTogether = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const now = ctx.now();
    const endsAt = now + nightSec(ctx) * 1000;
    ctx.setTimer('dawn', endsAt);
    const s: State = { builders: {}, towers: {}, startedAt: now, endsAt, gust: null, gustSeq: 0, gustsLanded: 0 };
    if (twoTowers(ctx)) for (const t of ctx.teams()) s.towers[`team:${t.id}`] = newTower(`team:${t.id}`);
    else s.towers[CLASS] = newTower(CLASS);
    for (const p of ctx.players()) join(s, ctx, p.id);
    for (const t of Object.values(s.towers)) if (!t.target) t.target = targetFloors(1, nightSec(ctx), ctx.settings.target, ctx.settings.gusts);
    if (ctx.settings.gusts !== 'calm') scheduleGust(s, ctx, now + GUST_TIMING[ctx.settings.gusts].firstSec * 1000);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    join(s, ctx, p.id);
  },
  onAction(s, playerId, a, ctx) {
    const b = s.builders[playerId];
    if (!b) return { error: 'You are not in this game.' };
    const now = ctx.now();
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(b.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        const last = b.stream.last;
        if (res.correct) {
          if (b.held >= MAX_HOLD) {
            if (last) last.text = `Your hands are full: place a piece to earn more (you hold ${String(MAX_HOLD)}).`;
          } else {
            b.held++;
            if (last) last.text = `+1 piece (you hold ${String(b.held)})`;
          }
          streamNext(b.stream, ctx);
        } else {
          if (last) last.text = 'No piece this time. The next question comes in a moment.';
          b.steadyUntil = now + STEADY_MS;
          ctx.setTimer(`steady:${playerId}`, b.steadyUntil);
        }
        return;
      }
      case 'place': {
        const why = refusal(s, ctx, b, a.kind);
        if (why) return { error: why };
        const t = s.towers[b.tower]!;
        const effect = pieceEffect(a.kind, towerNow(s, ctx, t));
        b.held--;
        b.placed[a.kind]++;
        b.seq++;
        b.lastKind = a.kind;
        b.lastAt = now;
        t.pieces.push({ k: a.kind, by: playerId });
        b.standing += standingFloors(a.kind);
        t.height += effect.floors;
        t.build = effect.next.build;
        if (a.kind === 'lantern') {
          t.brace = t.pieces.length - 1;
          t.braceAt = t.height;
        }
        t.peak = Math.max(t.peak, t.height);
        t.last = { seq: ++t.seq, at: now, kind: a.kind, by: playerId, height: t.height, sway: swayOf(t) };
        const { stars } = starsFor(t.height, t.target);
        if (stars > t.stars) {
          t.stars = stars;
          const who = Object.keys(s.towers).length > 1 ? `${towerName(ctx, t.id)} reached` : 'The tower reached';
          ctx.feed(stars === 1 ? `${who} the target: ${floorsText(t.target)}! One star. Keep building for more.` : `${who} ${floorsText(t.height)}: ${String(stars)} stars!`, { tone: 'big' });
        }
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'dawn') {
      ctx.endGame();
      return;
    }
    if (id.startsWith('steady:')) {
      const b = s.builders[id.slice('steady:'.length)];
      if (b && !b.stream.iid) streamNext(b.stream, ctx);
      return;
    }
    if (id === 'warn' && s.gust && ctx.settings.gusts !== 'calm') {
      const odds = gustOdds(ctx.settings.gusts);
      s.gust.strength = pickGust(odds, ctx.rng.next());
      const st = STRENGTHS[s.gust.strength];
      ctx.feed(`${st.name} in ${String(WARN_SEC)} seconds! The tower holds if it is swaying ${String(st.limit)} or less.`, { tone: 'big' });
      return;
    }
    if (id === 'gust' && s.gust) {
      // A gust is always announced before it lands; draw now only if a pause swallowed the warning.
      const strength = s.gust.strength ?? pickGust(gustOdds(ctx.settings.gusts), ctx.rng.next());
      land(s, ctx, strength);
      if (ctx.settings.gusts !== 'calm') scheduleGust(s, ctx, s.gust.landsAt + GUST_TIMING[ctx.settings.gusts].everySec * 1000);
    }
  },
  view(s, viewer, ctx) {
    const now = ctx.now();
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const wind = ctx.settings.gusts;
    const gust = s.gust ? { landsAt: s.gust.landsAt, announced: s.gust.strength !== null && now >= s.gust.landsAt - WARN_SEC * 1000, strength: s.gust.strength, name: s.gust.strength ? STRENGTHS[s.gust.strength].name : null, limit: s.gust.strength ? STRENGTHS[s.gust.strength].limit : null } : null;
    const towers = Object.values(s.towers).map((t) => towerView(s, ctx, t));
    const base = {
      startedAt: s.startedAt,
      endsAt: s.endsAt,
      wind,
      odds: gustOdds(wind),
      warnSec: WARN_SEC,
      maxSway: MAX_SWAY,
      gust: gust && gust.announced ? gust : gust ? { ...gust, strength: null, name: null, limit: null } : null,
      gustSeq: s.gustSeq,
      towers,
      twoTowers: towers.length > 1,
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') return { ...base, builders: buildersOf(s, ctx, null, null, HOST_MAX) };
    const b = me ? s.builders[me] : undefined;
    if (!me || !b) return { ...base, builders: [], you: null };
    const t = s.towers[b.tower]!;
    const now_ = towerNow(s, ctx, t);
    const effects: (Omit<PieceEffect, 'next'> & { ok: boolean; why: string | null })[] = (['timber', 'stone', 'lantern'] as const).map((k) => {
      const why = b.held > 0 ? refusal(s, ctx, b, k) : null;
      const { next: _next, ...e } = pieceEffect(k, now_);
      return { ...e, ok: b.held > 0 && !why, why };
    });
    return {
      ...base,
      builders: buildersOf(s, ctx, b.tower, me, NEAR_MAX),
      you: {
        tower: b.tower,
        team: b.tower.startsWith('team:') ? towerName(ctx, b.tower) : null,
        held: b.held,
        maxHold: MAX_HOLD,
        effects,
        placed: b.placed,
        saved: b.saved,
        standing: b.standing,
        points: points(s, me),
        rank: mine?.rank ?? null,
        seq: b.seq,
        lastKind: b.lastKind,
        steadyUntil: b.steadyUntil > now ? b.steadyUntil : null,
        streak: b.stream.streak,
        question: streamQuestionView(b.stream, ctx),
        last: b.stream.last,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const b = s.builders[pl.id];
      const score = b ? points(s, pl.id) : 0;
      const n = b ? b.placed.timber + b.placed.stone + b.placed.lantern : 0;
      const label = b ? `${pointsText(score)} (${String(n)} ${n === 1 ? 'piece' : 'pieces'}, ${floorsText(b.standing)} standing${b.saved ? `, ${floorsText(b.saved)} saved` : ''})` : 'did not build';
      return { playerId: pl.id, score, label };
    });
    const towers = Object.values(s.towers);
    if (twoTowers(ctx)) {
      const teams = teamRows(s, ctx)!;
      const sorted = [...towers].sort((a, b) => b.height / Math.max(1, b.target) - a.height / Math.max(1, a.target));
      const [first, second] = sorted;
      const pct = (t: Tower) => Math.floor((t.height / Math.max(1, t.target)) * 100);
      const summary =
        first && second && pct(first) === pct(second)
          ? `Both towers reached ${String(pct(first))}% of their targets: a draw at dawn.`
          : first
            ? `${towerName(ctx, first.id)} built ${floorsText(first.height)} of ${String(first.target)} (${String(pct(first))}%) and won the night.`
            : 'Dawn came.';
      return {
        standings,
        teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.score, label: `${floorsText(t.height)} of ${String(t.target)} (${String(t.score)}%)` })),
        summary,
      };
    }
    const t = towers[0]!;
    const { stars } = starsFor(t.height, t.target);
    const won = t.height >= t.target;
    let summary = won ? `The class built ${floorsText(t.height)} by dawn, past the target of ${String(t.target)}: ${String(stars)} ${stars === 1 ? 'star' : 'stars'}!` : `Dawn came with the tower at ${floorsText(t.height)} of ${String(t.target)}.`;
    if (t.saved) summary += ` Braces saved ${floorsText(t.saved)}.`;
    const teams = teamRows(s, ctx);
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((x) => ({ teamId: x.teamId, score: x.score, label: `${pointsText(x.score)} on average` })) } : {}),
      outcome: won ? 'coop-win' : 'coop-loss',
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    if (you.held > 0) {
      const kind = choosePiece(view, ctx.rng.next());
      if (kind) return { type: 'place', kind };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you && you.held > 0) return 500 + rng.int(0, 1000);
    return 4000 + rng.int(0, 5000);
  },
});

/* ------------------------------------ bots --------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a sensible builder places, reading only what every player sees: a
 * brace as soon as one fits (it protects what stands and takes the leverage
 * away); in calm air, timber while the gauge stays low enough to bring back
 * under a gale's line in the seconds a warning gives; once a gust is
 * announced, whatever keeps the gauge under its line. `roll` adds a little
 * indecision, as a class would have.
 */
export function choosePiece(view: any, roll: number): PieceKind | null {
  const you = view.you;
  const ok = (k: PieceKind) => you.effects.find((e: any) => e.kind === k)?.ok === true;
  const after = (k: PieceKind) => you.effects.find((e: any) => e.kind === k)?.after ?? 0;
  if (ok('lantern')) return 'lantern';
  if (view.wind === 'calm') return ok('timber') ? 'timber' : 'stone';
  const line = view.gust?.announced ? (view.gust.limit as number) : CALM_LINE;
  if (roll < 0.08) return ok('timber') ? 'timber' : 'stone';
  return ok('timber') && after('timber') <= line - 2 ? 'timber' : 'stone';
}

/** The gauge a sensible class keeps under while no gust is announced. */
const CALM_LINE = 32;
