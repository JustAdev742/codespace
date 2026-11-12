/*
 * Glim Garden: the calm, co-operative one. The class grows a night garden
 * together. Every player has a plot; a right answer is a drop of water (hold
 * 3), a wrong answer costs nothing. A drop plants a seed or waters your plant,
 * or goes to a neighbour's plant as a gift. Blooms bring fireflies; a gift
 * brings one straight away. The class fills the garden with fireflies before
 * morning. Nothing is ever lost, and there is no chance in it at all.
 *
 * Time-driven changes (a plant drooping, a plant growing in a lantern tree's
 * light, night and day) run on one `grow` timer set for the next thing due,
 * so the game stays quiet when nothing is happening.
 *
 * Rule options (base: a morning deadline, drooping on):
 * - morning: off ends only when the garden is full (or the host ends it).
 * - droop: off means plants never droop.
 * - teamGardens: one garden and goal per team; neighbours are teammates.
 * - nightBloom: night and day take turns; flowers grow only in the dark,
 *   lantern trees shine only at night.
 * - showTable: whether the results show the table (the screens read it).
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { BotContext, BotMind, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { DAY_SEC, DROOP_SEC, GIFT_FIREFLIES, GIFT_POINTS, GIFT_POINTS_TO, KINDS, LIGHT_SEC, MAX_DROPS, NIGHT_SEC, PLANTS, PLOT_FIREFLIES, goalFor, meta, settings, type GardenSize, type Kind } from './meta.ts';
import { neighboursOf } from './layout.ts';

type Settings = {
  size: GardenSize;
  morning: boolean;
  droop: boolean;
  teamGardens: boolean;
  nightBloom: boolean;
  showTable: boolean;
};

/** What last happened to a plot, for the pictures. */
export type PlotEvent = 'plant' | 'water' | 'gift' | 'bloom' | 'droop' | 'perk' | 'light';

interface Plot {
  owner: PlayerId;
  garden: number;
  kind: Kind | null;
  growth: number;
  bloomed: boolean;
  drooping: boolean;
  /** Game time of the last drop (or planting): the droop clock. */
  careAt: number;
  /** Game time it next grows in a lantern tree's light, or null. */
  lightAt: number | null;
  /** Blooms this plot has had, by kind (flower, bush, tree): the ring of flowers round its edge. */
  border: [number, number, number];
  /** Fireflies that came to this plot (its blooms and the gifts it was given). */
  jar: number;
  seq: number;
  ev: PlotEvent | null;
  by: PlayerId | null;
}

interface Note {
  id: number;
  at: number;
  text: string;
  tone: 'good' | 'info';
}

interface Gardener {
  stream: StreamState;
  drops: number;
  points: number;
  blooms: number;
  fireflies: number;
  gifts: number;
  received: number;
  helped: PlayerId[];
  notes: Note[];
}

interface Garden {
  /** The team's id in team gardens, or null for the class garden. */
  teamId: string | null;
  plots: PlayerId[];
  fireflies: number;
  /** Plots glowing now, and how many must glow. */
  glowing: number;
  goal: number;
  metAt: number | null;
}

interface News {
  id: number;
  at: number;
  text: string;
  garden: number;
}

interface State {
  gardens: Garden[];
  plots: Record<PlayerId, Plot>;
  folk: Record<PlayerId, Gardener>;
  endsAt: number | null;
  dark: boolean;
  phaseEndsAt: number | null;
  news: News[];
  seq: number;
  ending: boolean;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('plant'), kind: z.enum(KINDS) }),
  z.object({ type: z.literal('water') }),
  z.object({ type: z.literal('give'), to: z.string().max(64) }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const NOTES_KEEP = 4;
const NEWS_KEEP = 6;
/** After the last garden fills, a moment to enjoy it before the results. */
export const FULL_PAUSE_MS = 4000;

type Ctx = ModeContext<Settings>;

function nameOf(ctx: Ctx, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function teamOf(ctx: Ctx, id: PlayerId): string | null {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

const teamGardens = (ctx: Ctx) => ctx.settings.teamGardens && ctx.teams().length > 0;

export const firefliesText = (n: number) => `${String(n)} ${n === 1 ? 'firefly' : 'fireflies'}`;
export const pointsText = (n: number) => `${String(n)} ${n === 1 ? 'point' : 'points'}`;
const KIND_WORD: Record<Kind, string> = { flower: 'flower', bush: 'bush', tree: 'lantern tree' };

/* ---------------------------------- plants ---------------------------------- */

const growing = (p: Plot) => p.kind !== null && !p.bloomed;

/** Night Bloom: flowers sleep in daylight. */
function asleep(s: State, ctx: Ctx, p: Plot) {
  return ctx.settings.nightBloom && !s.dark && p.kind === 'flower';
}

/** A plant that can take a drop now. */
const canGrow = (s: State, ctx: Ctx, p: Plot) => growing(p) && !asleep(s, ctx, p);

function neighbourIds(s: State, p: Plot): PlayerId[] {
  const g = s.gardens[p.garden]!;
  const i = g.plots.indexOf(p.owner);
  return neighboursOf(i, g.plots.length).map((j) => g.plots[j]!);
}

/** In the light of a grown lantern tree next door (only at night in Night Bloom). */
function isLit(s: State, ctx: Ctx, p: Plot): boolean {
  if (ctx.settings.nightBloom && !s.dark) return false;
  return neighbourIds(s, p).some((id) => {
    const n = s.plots[id]!;
    return n.kind === 'tree' && n.bloomed;
  });
}

function touch(s: State, p: Plot, ev: PlotEvent, by: PlayerId | null = null) {
  p.seq++;
  p.ev = ev;
  p.by = by;
}

function note(s: State, g: Gardener, at: number, text: string, tone: Note['tone'] = 'info') {
  g.notes = [{ id: ++s.seq, at, text, tone }, ...g.notes].slice(0, NOTES_KEEP);
}

function news(s: State, at: number, garden: number, text: string) {
  s.news = [{ id: ++s.seq, at, text, garden }, ...s.news].slice(0, NEWS_KEEP);
}

/** One step of growth (a drop, a gift or the light). Blooms when it has had enough. */
function grow(s: State, ctx: Ctx, p: Plot, ev: PlotEvent, by: PlayerId | null) {
  const now = ctx.now();
  p.careAt = now;
  if (p.drooping) {
    // A drooping plant spends the drop perking up; the light perks it up for free.
    p.drooping = false;
    touch(s, p, 'perk', by);
    if (ev !== 'light') return;
  }
  p.growth++;
  const kind = p.kind!;
  if (p.growth < PLANTS[kind].need) {
    touch(s, p, ev, by);
    return;
  }
  p.bloomed = true;
  p.lightAt = null;
  const n = PLANTS[kind].fireflies;
  p.border[KINDS.indexOf(kind)] = p.border[KINDS.indexOf(kind)]! + 1;
  touch(s, p, 'bloom', by);
  const owner = s.folk[p.owner]!;
  owner.points += n;
  owner.blooms++;
  owner.fireflies += n;
  const word = KIND_WORD[kind];
  note(s, owner, now, `Your ${word} opened! ${firefliesText(n)} came.${kind === 'tree' ? ' It lights the plots next to it.' : ''}`, 'good');
  news(s, now, p.garden, `${nameOf(ctx, p.owner)}’s ${word} opened: ${firefliesText(n)}.`);
  addFireflies(s, ctx, p, n);
}

const need = (ctx: Ctx) => PLOT_FIREFLIES[ctx.settings.size];

/** Fireflies come to a plot: it glows once it has enough, and the garden fills when enough plots glow. */
function addFireflies(s: State, ctx: Ctx, p: Plot, n: number) {
  const g = s.gardens[p.garden]!;
  const before = p.jar;
  p.jar += n;
  g.fireflies += n;
  if (before >= need(ctx) || p.jar < need(ctx)) return;
  g.glowing++;
  const owner = s.folk[p.owner]!;
  note(s, owner, ctx.now(), 'Your plot is glowing!', 'good');
  news(s, ctx.now(), p.garden, `${nameOf(ctx, p.owner)}’s plot is glowing.`);
  if (g.metAt !== null || g.glowing < g.goal) return;
  g.metAt = ctx.now();
  const team = g.teamId ? (ctx.teams().find((t) => t.id === g.teamId)?.name ?? 'A team') : null;
  const keepGoing = ctx.settings.morning ? ' Keep growing until morning.' : '';
  ctx.feed(team ? `${team}’s garden is full of fireflies!${keepGoing}` : `The garden is full of fireflies!${keepGoing}`, { tone: 'big' });
  // With a morning to come, the garden keeps growing until then; with none, it ends once every garden is full.
  if (!ctx.settings.morning && s.gardens.every((x) => x.metAt !== null) && !s.ending) {
    s.ending = true;
    ctx.setTimer('full', ctx.now() + FULL_PAUSE_MS);
  }
}

/** When a growing plant will droop, or null. */
function droopAt(s: State, ctx: Ctx, p: Plot): number | null {
  if (!ctx.settings.droop || !growing(p) || p.drooping || p.lightAt !== null || asleep(s, ctx, p)) return null;
  return p.careAt + DROOP_SEC * 1000;
}

/**
 * Bring every plot's light up to date (trees bloom, night falls) and set the
 * `grow` timer for the next thing due.
 */
function refresh(s: State, ctx: Ctx) {
  const now = ctx.now();
  let next = Infinity;
  for (const p of Object.values(s.plots)) {
    const lit = canGrow(s, ctx, p) && isLit(s, ctx, p);
    if (lit && p.lightAt === null) {
      p.lightAt = now + LIGHT_SEC * 1000;
      if (p.drooping) {
        p.drooping = false;
        p.careAt = now;
        touch(s, p, 'perk');
      }
    } else if (!lit) p.lightAt = null;
    if (p.lightAt !== null) next = Math.min(next, p.lightAt);
    const d = droopAt(s, ctx, p);
    if (d !== null) next = Math.min(next, d);
  }
  if (Number.isFinite(next)) ctx.setTimer('grow', Math.max(now, next));
  else ctx.clearTimer('grow');
}

function onGrowTimer(s: State, ctx: Ctx) {
  const now = ctx.now();
  // Plot order is fixed (by garden, then plot), so the same game always plays the same way.
  for (const g of s.gardens) {
    for (const id of g.plots) {
      const p = s.plots[id]!;
      if (p.lightAt !== null && p.lightAt <= now && canGrow(s, ctx, p)) {
        grow(s, ctx, p, 'light', null);
        p.lightAt = growing(p) ? now + LIGHT_SEC * 1000 : null;
      }
      const d = droopAt(s, ctx, p);
      if (d !== null && d <= now) {
        p.drooping = true;
        touch(s, p, 'droop');
        note(s, s.folk[p.owner]!, now, `Your ${KIND_WORD[p.kind!]} is drooping. A drop will perk it up.`);
      }
    }
  }
  refresh(s, ctx);
}

/* --------------------------------- gardeners --------------------------------- */

function newGardener(ctx: Ctx): Gardener {
  return { stream: streamInit(ctx), drops: 0, points: 0, blooms: 0, fireflies: 0, gifts: 0, received: 0, helped: [], notes: [] };
}

function newPlot(owner: PlayerId, garden: number, now: number): Plot {
  return { owner, garden, kind: null, growth: 0, bloomed: false, drooping: false, careAt: now, lightAt: null, border: [0, 0, 0], jar: 0, seq: 0, ev: null, by: null };
}

function gardenFor(s: State, ctx: Ctx, id: PlayerId): number {
  if (!teamGardens(ctx)) return 0;
  const t = teamOf(ctx, id);
  const i = s.gardens.findIndex((g) => g.teamId === t);
  return i >= 0 ? i : 0;
}

function addPlayer(s: State, ctx: Ctx, id: PlayerId) {
  if (s.plots[id]) return;
  const gi = gardenFor(s, ctx, id);
  const g = s.gardens[gi]!;
  g.plots.push(id);
  s.plots[id] = newPlot(id, gi, ctx.now());
  s.folk[id] = newGardener(ctx);
  // A late joiner makes the garden a little bigger, unless it is already full.
  if (g.metAt === null) g.goal = goalFor(g.plots.length);
}

/** The neighbours worth a gift now, most in need first: plots not glowing yet; then drooping, nearly open, the rest. */
export function giftOrder(s: State, ctx: Ctx, id: PlayerId): { id: PlayerId; why: 'drooping' | 'nearly' | 'growing'; glowing: boolean }[] {
  const p = s.plots[id];
  if (!p) return [];
  return neighbourIds(s, p)
    .map((nid) => s.plots[nid]!)
    .filter((n) => canGrow(s, ctx, n))
    .map((n) => ({ id: n.owner, dim: n.jar < need(ctx), left: PLANTS[n.kind!].need - n.growth, why: n.drooping ? ('drooping' as const) : PLANTS[n.kind!].need - n.growth <= 1 ? ('nearly' as const) : ('growing' as const) }))
    .sort((a, b) => Number(b.dim) - Number(a.dim) || Number(b.why === 'drooping') - Number(a.why === 'drooping') || a.left - b.left || a.id.localeCompare(b.id))
    .map(({ id: nid, why, dim }) => ({ id: nid, why, glowing: !dim }));
}

/* ---------------------------------- actions ---------------------------------- */

function plant(s: State, ctx: Ctx, id: PlayerId, kind: Kind): { error: string } | void {
  const p = s.plots[id]!;
  if (growing(p)) return { error: 'Something is already growing in your plot. Water it, or wait until it blooms.' };
  // In Night Bloom a flower can be planted by day: it waits for the dark to grow.
  p.kind = kind;
  p.growth = 0;
  p.bloomed = false;
  p.drooping = false;
  p.careAt = ctx.now();
  p.lightAt = null;
  touch(s, p, 'plant');
}

function give(s: State, ctx: Ctx, from: PlayerId, to: PlayerId): { error: string } | void {
  const p = s.plots[from]!;
  const target = s.plots[to];
  if (!target || to === from || !neighbourIds(s, p).includes(to)) return { error: 'You can only give drops to the plots next to yours.' };
  if (!growing(target)) return { error: 'Nothing is growing there yet.' };
  if (asleep(s, ctx, target)) return { error: 'Flowers sleep in the daytime. Wait for night.' };
  const giver = s.folk[from]!;
  const getter = s.folk[to]!;
  giver.gifts++;
  giver.points += GIFT_POINTS;
  giver.fireflies += GIFT_FIREFLIES;
  if (!giver.helped.includes(to)) giver.helped.push(to);
  getter.points += GIFT_POINTS_TO;
  getter.received++;
  const now = ctx.now();
  note(s, getter, now, `${nameOf(ctx, from)} gave your plant a drop.`, 'good');
  news(s, now, p.garden, `${nameOf(ctx, from)} gave ${nameOf(ctx, to)} a drop.`);
  grow(s, ctx, target, 'gift', from);
  addFireflies(s, ctx, target, GIFT_FIREFLIES);
}

/* ----------------------------------- views ----------------------------------- */

/** A plot as every screen sees it. Short keys: views carry every plot. */
export interface PlotView {
  id: PlayerId;
  /** Kind, or null for bare earth. */
  k: Kind | null;
  /** Growth so far (drops after the seed). */
  g: number;
  /** 1 when bloomed. */
  b?: 1;
  /** 1 when drooping. */
  d?: 1;
  /** 1 when lit by a lantern tree. */
  l?: 1;
  /** Earlier blooms: flowers, bushes, trees. */
  r: [number, number, number];
  /** Fireflies at this plot. */
  j: number;
  /** Changes so far, and the last one. */
  s: number;
  e: PlotEvent | null;
  /** Who gave the last gift. */
  by?: PlayerId;
}

function plotView(s: State, ctx: Ctx, p: Plot): PlotView {
  const v: PlotView = { id: p.owner, k: p.kind, g: p.growth, r: p.border, j: p.jar, s: p.seq, e: p.ev };
  if (p.bloomed) v.b = 1;
  if (p.drooping) v.d = 1;
  if (p.kind !== null && isLit(s, ctx, p)) v.l = 1;
  if (p.ev === 'gift' && p.by) v.by = p.by;
  return v;
}

function ranking(s: State, ctx: Ctx, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.folk[p.id])
    .map((p) => {
      const f = s.folk[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, points: f.points, blooms: f.blooms, gifts: f.gifts, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: Ctx) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.folk[p.id]);
    const points = members.reduce((n, p) => n + s.folk[p.id]!.points, 0);
    const garden = teamGardens(ctx) ? s.gardens.find((g) => g.teamId === t.id) : undefined;
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, points, fireflies: garden?.fireflies ?? null, glowing: garden?.glowing ?? null, goal: garden?.goal ?? null };
  });
}

/* ------------------------------------ mode ------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A practice bot with a mind gardens with a temperament: it weighs a gift to a drooping or nearly
 * grown neighbour against planting or watering its own, and some bots are more giving than others
 * (steady, careful bots share more; bold ones look after their own plot first).
 */
function mindedBot(view: any, ctx: BotContext, mind: BotMind): Action | null {
  const you = view?.you;
  if (!you) return null;
  if (you.drops > 0) {
    const giftTo = you.giftTo as { id: string; why: string }[];
    const giving = mind.traits.consistency * 0.5 + (1 - mind.boldness()) * 0.5;
    const mine = (view.gardens[you.garden].plots as PlotView[]).find((pl) => pl.id === ctx.playerId);
    const keepTree = mine?.k === 'tree' && mine.b === 1 && you.neighbours.length >= 2 && giftTo.length > 0;
    type Move = { a: Action | null; v: number };
    const moves: Move[] = giftTo.map((g) => ({ a: { type: 'give', to: g.id }, v: (g.why === 'drooping' ? 1.5 : g.why === 'nearly' ? 1.2 : 0.4) * (0.5 + giving) }));
    if (you.canPlant && !keepTree) moves.push({ a: { type: 'plant', kind: chooseKind(view, you, mine, { rng: { next: () => mind.random() }, now: ctx.now }) }, v: 1.1 });
    if (you.canWater) moves.push({ a: { type: 'water' }, v: 0.9 });
    if (you.drops < you.maxDrops) moves.push({ a: null, v: 0.1 });
    const pick = mind.choose(moves, (m) => m.v, 0.7);
    if (pick?.a) return pick.a;
  }
  const q = you.question;
  return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
}

export const glimGarden = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const gardens: Garden[] = teamGardens(ctx) ? ctx.teams().map((t) => ({ teamId: t.id, plots: [], fireflies: 0, glowing: 0, goal: 0, metAt: null })) : [{ teamId: null, plots: [], fireflies: 0, glowing: 0, goal: 0, metAt: null }];
    const s: State = { gardens, plots: {}, folk: {}, endsAt: null, dark: true, phaseEndsAt: null, news: [], seq: 0, ending: false };
    for (const p of ctx.players()) addPlayer(s, ctx, p.id);
    for (const g of s.gardens) g.goal = goalFor(g.plots.length);
    if (ctx.settings.morning) {
      s.endsAt = ctx.now() + (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
      ctx.setTimer('morning', s.endsAt);
    }
    if (ctx.settings.nightBloom) {
      s.phaseEndsAt = ctx.now() + NIGHT_SEC * 1000;
      ctx.setTimer('phase', s.phaseEndsAt);
    }
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    addPlayer(s, ctx, p.id);
  },
  onAction(s, playerId, a, ctx) {
    const f = s.folk[playerId];
    const p = s.plots[playerId];
    if (!f || !p) return { error: 'You are not in this game.' };
    if (a.type === 'answer') {
      const res = streamSubmit(f.stream, playerId, a.iid, a.answer, ctx);
      if ('error' in res) return res;
      const last = f.stream.last;
      if (res.correct) {
        if (f.drops < MAX_DROPS) {
          f.drops++;
          if (last) last.text = '+1 drop';
        } else if (canGrow(s, ctx, p)) {
          // A full can never wastes a right answer when something of yours can drink it.
          grow(s, ctx, p, 'water', null);
          if (last) last.text = 'Your can was full, so the drop went to your plant';
        } else if (last) last.text = 'Your can is full. Use a drop!';
      } else if (last) last.text = 'No drop this time. Here is the right answer.';
      streamNext(f.stream, ctx);
      refresh(s, ctx);
      return;
    }
    if (f.drops <= 0) return { error: 'Your can is empty. Answer a question to get a drop.' };
    let res: { error: string } | void = undefined;
    if (a.type === 'plant') res = plant(s, ctx, playerId, a.kind);
    else if (a.type === 'water') {
      if (!growing(p)) return { error: 'Plant a seed first.' };
      if (asleep(s, ctx, p)) return { error: 'Flowers sleep in the daytime. Wait for night.' };
      grow(s, ctx, p, 'water', null);
    } else res = give(s, ctx, playerId, a.to);
    if (res) return res;
    f.drops--;
    refresh(s, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === 'grow') onGrowTimer(s, ctx);
    else if (id === 'phase') {
      s.dark = !s.dark;
      const now = ctx.now();
      s.phaseEndsAt = now + (s.dark ? NIGHT_SEC : DAY_SEC) * 1000;
      ctx.setTimer('phase', s.phaseEndsAt);
      // Sleeping flowers start their droop clock again when they wake.
      if (s.dark) for (const p of Object.values(s.plots)) if (p.kind === 'flower' && growing(p)) p.careAt = now;
      ctx.feed(s.dark ? 'Night falls. Flowers wake up and the lantern trees shine.' : 'Day comes. Flowers sleep until dark.', { tone: 'info' });
      refresh(s, ctx);
    } else if (id === 'morning') {
      ctx.endGame();
    } else if (id === 'full') ctx.endGame();
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const base = {
      gardens: s.gardens.map((g) => ({ teamId: g.teamId, goal: g.goal, glowing: g.glowing, fireflies: g.fireflies, full: g.metAt !== null, plots: g.plots.map((id) => plotView(s, ctx, s.plots[id]!)) })),
      plotFireflies: need(ctx),
      endsAt: s.endsAt,
      nightBloom: ctx.settings.nightBloom,
      dark: s.dark,
      phaseEndsAt: s.phaseEndsAt,
      droop: ctx.settings.droop,
      showTable: ctx.settings.showTable,
      ending: s.ending,
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      return { ...base, news: s.news, gifts: Object.values(s.folk).reduce((n, f) => n + f.gifts, 0), blooms: Object.values(s.folk).reduce((n, f) => n + f.blooms, 0) };
    }
    const f = me ? s.folk[me] : undefined;
    const p = me ? s.plots[me] : undefined;
    if (!me || !f || !p) return { ...base, you: null };
    const order = giftOrder(s, ctx, me);
    return {
      ...base,
      news: s.news.filter((n) => n.garden === p.garden).slice(0, 3),
      you: {
        garden: p.garden,
        drops: f.drops,
        maxDrops: MAX_DROPS,
        points: f.points,
        blooms: f.blooms,
        fireflies: f.fireflies,
        gifts: f.gifts,
        helped: f.helped.length,
        received: f.received,
        rank: mine?.rank ?? null,
        neighbours: neighbourIds(s, p),
        /** Neighbours a drop can go to now, most in need first. */
        giftTo: order,
        canPlant: !growing(p),
        canWater: canGrow(s, ctx, p),
        asleep: asleep(s, ctx, p),
        notes: f.notes,
        question: streamQuestionView(f.stream, ctx),
        last: f.stream.last,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const f = s.folk[p.id];
      const pts = f?.points ?? 0;
      return { playerId: p.id, score: pts, label: `${pointsText(pts)}: ${String(f?.blooms ?? 0)} ${f?.blooms === 1 ? 'bloom' : 'blooms'}, ${String(f?.gifts ?? 0)} ${f?.gifts === 1 ? 'gift' : 'gifts'}` };
    });
    const full = s.gardens.every((g) => g.metAt !== null);
    const teams = teamRows(s, ctx);
    let summary: string;
    if (teamGardens(ctx)) {
      const done = s.gardens.filter((g) => g.metAt !== null).length;
      summary = full ? 'Every team’s garden filled with fireflies.' : `${String(done)} of ${String(s.gardens.length)} team gardens filled with fireflies.`;
    } else {
      const g = s.gardens[0]!;
      summary = full ? `The garden filled with fireflies: ${firefliesText(g.fireflies)}, and ${String(g.glowing)} of ${String(g.plots.length)} plots glowing.` : `${String(g.glowing)} of the ${String(g.goal)} plots needed are glowing, with ${firefliesText(g.fireflies)}. A lovely garden all the same.`;
    }
    return {
      standings,
      ...(teams
        ? {
            teamStandings: teams.map((t) => {
              if (t.goal !== null && t.glowing !== null) return { teamId: t.teamId, score: Math.round((t.glowing / Math.max(1, t.goal)) * 100), label: `${String(t.glowing)} of ${String(t.goal)} plots glowing` };
              return { teamId: t.teamId, score: t.members ? Math.round((t.points / t.members) * 10) / 10 : 0, label: `${String(t.members ? Math.round((t.points / t.members) * 10) / 10 : 0)} points each` };
            }),
          }
        : {}),
      outcome: full ? 'coop-win' : 'coop-loss',
      summary,
    };
  },
  bot(view, ctx) {
    if (ctx.mind) return mindedBot(view, ctx, ctx.mind);
    const you = view?.you;
    if (!you) return null;
    const giftTo = you.giftTo as { id: string; why: string }[];
    const keen = ctx.rng.next();
    if (you.drops > 0) {
      const needy = giftTo.find((g) => g.why !== 'growing');
      if (needy && keen < 0.85) return { type: 'give', to: needy.id };
      const mine = (view.gardens[you.garden].plots as PlotView[]).find((pl) => pl.id === ctx.playerId);
      const keepTree = mine?.k === 'tree' && mine.b === 1 && you.neighbours.length >= 2 && giftTo.length > 0;
      if (you.canPlant && !keepTree) return { type: 'plant', kind: chooseKind(view, you, mine, ctx) };
      if (you.canWater) return giftTo.length && keen < 0.3 ? { type: 'give', to: giftTo[0]!.id } : { type: 'water' };
      if (giftTo.length) return { type: 'give', to: giftTo[0]!.id };
      if (you.drops >= you.maxDrops && you.canPlant) return { type: 'plant', kind: 'bush' };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    // People take a while to read and answer; garden moves are quick.
    if (you && you.drops > 0 && (you.canPlant || you.canWater || you.giftTo.length)) return 1000 + rng.int(0, 1500);
    return 5000 + rng.int(0, 7000);
  },
});

/** What a sensible bot plants: a quick flower near the end, a lantern tree among neighbours early on, otherwise mostly bushes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chooseKind(view: any, you: any, mine: PlotView | undefined, ctx: { rng: { next(): number }; now: number }): Kind {
  const left = view.endsAt === null ? Infinity : view.endsAt - ctx.now;
  const plots = view.gardens[you.garden].plots as PlotView[];
  const treeNear = (you.neighbours as string[]).some((id) => plots.find((pl) => pl.id === id)?.k === 'tree');
  const day = view.nightBloom && !view.dark;
  if (left < 45_000 && !day) return 'flower';
  // Alone, with no gifts or light to come, a bush is the best value for each drop.
  if (!you.neighbours.length) return day || left > 75_000 ? 'bush' : 'flower';
  if (you.neighbours.length >= 2 && !treeNear && mine?.k !== 'tree' && left > 150_000 && ctx.rng.next() < 0.5) return 'tree';
  if (day) return 'bush';
  return ctx.rng.next() < 0.65 ? 'bush' : 'flower';
}
