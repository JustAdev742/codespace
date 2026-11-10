/*
 * Spot Kick: right answers earn footballs; each football is a penalty. Pick
 * one of five places and a strength; the server rolls the outcome from the
 * same odds the player sees (odds.ts), at the moment of the shot, from the
 * game's seeded random source. The keeper learns each kicker's habits.
 *
 * Questions and shooting run side by side: a player can answer or shoot at
 * any moment. Goals are points.
 *
 * Rule options (all off by default except the keeper learning):
 * - houseMatch: team totals, not averages, and the keeper learns per team.
 * - keeperDuty: every shot is at a rival's goal, whose keeper guards the two
 *   places its owner picked.
 * - goldenGoal: a tie at the top when time runs out goes to golden goal.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { AIMS, AIM_INFO, FIRE_STREAK, GOLDEN_SEC, GUARD_COUNT, MAX_BALLS, POWERS, READ_MAX, meta, settings, type Aim, type Outcome, type Power } from './meta.ts';
import { allOdds, expectedPoints, learn, noReads, outcomeOf, shotOdds, type Reads, type ShotOdds } from './odds.ts';

type Settings = {
  keeperLearns: boolean;
  houseMatch: boolean;
  keeperDuty: boolean;
  goldenGoal: boolean;
};

/** How a save or a miss looked: decoration for the picture, drawn by the server so every screen agrees. */
export type ShotHow = 'catch' | 'parry' | 'tip' | 'post' | 'bar' | 'over' | 'wide' | 'net';

/** One penalty, for the kicker's result card and the scenes. */
export interface Shot {
  seq: number;
  at: number;
  aim: Aim;
  power: Power;
  outcome: Outcome;
  /** Where the keeper dived. */
  dive: Aim;
  how: ShotHow;
  points: number;
  /** This goal counted double. */
  fire: boolean;
  /** Goals in a row after this shot. */
  streak: number;
  /** The chance of a goal it had, for the words. */
  chance: number;
  /** Keeper duty: whose keeper faced it. */
  keeper: string | null;
}

interface Note {
  id: number;
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

interface Kicker {
  stream: StreamState;
  balls: number;
  points: number;
  shots: number;
  goals: number;
  saved: number;
  wide: number;
  streak: number;
  onFire: boolean;
  seq: number;
  last: Shot | null;
  /** Keeper duty: the places this player's own keeper guards, and how many shots it has saved. */
  guard: Aim[] | null;
  kept: number;
  /** Keeper duty: how many shots this player has taken at each rival, for taking turns. */
  faced: Record<PlayerId, number>;
  notes: Note[];
  best: number;
}

/** A shot on the big screen's highlights reel. */
interface ReelItem {
  id: number;
  at: number;
  by: PlayerId;
  aim: Aim;
  power: Power;
  outcome: Outcome;
  dive: Aim;
  how: ShotHow;
  points: number;
  fire: boolean;
  streak: number;
  keeper: PlayerId | null;
}

interface Golden {
  endsAt: number;
  /** The player ids, or team ids in a team game, level at the top. */
  leaders: string[];
  teams: boolean;
}

interface State {
  kickers: Record<PlayerId, Kicker>;
  /** What the keeper has learned, by player (or by team in a house match). */
  reads: Record<string, Reads>;
  endsAt: number;
  golden: Golden | null;
  reel: ReelItem[];
  seq: number;
  winner: { id: string; team: boolean } | null;
  draw: boolean;
  hottest: { by: PlayerId; streak: number } | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('shoot'), aim: z.enum(AIMS), power: z.enum(POWERS) }),
  z.object({ type: z.literal('guard'), places: z.array(z.enum(AIMS)).length(GUARD_COUNT) }),
]);
type Action = z.infer<typeof action>;

const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const REEL_KEEP = 8;
const NOTES_KEEP = 4;

export const goalsText = (n: number) => `${String(n)} ${n === 1 ? 'goal' : 'goals'}`;

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function teamOf(ctx: ModeContext, id: PlayerId): string | null {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function randomGuard(rng: Rng): Aim[] {
  const pool = [...AIMS];
  const out: Aim[] = [];
  while (out.length < GUARD_COUNT) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  return out;
}

function newKicker(ctx: ModeContext<Settings>): Kicker {
  return {
    stream: streamInit(ctx),
    balls: 0,
    points: 0,
    shots: 0,
    goals: 0,
    saved: 0,
    wide: 0,
    streak: 0,
    onFire: false,
    seq: 0,
    last: null,
    // Randomness stays behind the setting, so games without keeper duty replay as before.
    guard: ctx.settings.keeperDuty ? randomGuard(ctx.rng) : null,
    kept: 0,
    faced: {},
    notes: [],
    best: 0,
  };
}

function note(s: State, k: Kicker, at: number, text: string, tone: Note['tone']) {
  k.notes = [{ id: ++s.seq, at, text, tone }, ...k.notes].slice(0, NOTES_KEEP);
}

/** Whose habits the keeper learns: the player, or their team in a house match. */
function readKey(ctx: ModeContext<Settings>, id: PlayerId): string {
  const team = ctx.settings.houseMatch && ctx.teams().length ? teamOf(ctx, id) : null;
  return team ? `team:${team}` : id;
}

function readsOf(s: State, ctx: ModeContext<Settings>, id: PlayerId): Reads {
  return s.reads[readKey(ctx, id)] ?? noReads();
}

/**
 * Keeper duty: the rival whose goal this player shoots at next. Players take
 * turns at every rival (never a teammate), the one faced least first; with no
 * rival in the game, the house keeper stands in (null).
 */
function foeOf(s: State, ctx: ModeContext<Settings>, id: PlayerId): PlayerId | null {
  if (!ctx.settings.keeperDuty) return null;
  const k = s.kickers[id]!;
  const team = ctx.teams().length ? teamOf(ctx, id) : null;
  const rivals = ctx
    .players()
    .filter((p) => p.id !== id && s.kickers[p.id] && !(team !== null && p.teamId === team))
    .map((p) => p.id)
    .sort((a, b) => (k.faced[a] ?? 0) - (k.faced[b] ?? 0) || a.localeCompare(b));
  return rivals[0] ?? null;
}

function guardOf(s: State, ctx: ModeContext<Settings>, id: PlayerId): Aim[] | null {
  const foe = foeOf(s, ctx, id);
  return foe ? (s.kickers[foe]!.guard ?? null) : null;
}

/** Every shot a player could take now, with what the keeper has learned and any guard worked in. */
export function oddsFor(s: State, ctx: ModeContext<Settings>, id: PlayerId): ShotOdds[] {
  return allOdds(readsOf(s, ctx, id), guardOf(s, ctx, id));
}

/** Draw a shot's outcome, with exactly the chances shown, then how it looked. */
export function drawShot(o: ShotOdds, rng: Rng): { outcome: Outcome; dive: Aim; how: ShotHow } {
  const outcome = outcomeOf(o, rng.next());
  const others = AIMS.filter((a) => a !== o.aim);
  if (outcome === 'saved') {
    const how: ShotHow = o.power === 'blasted' ? (rng.next() < 0.6 ? 'parry' : 'tip') : rng.next() < 0.55 ? 'catch' : 'parry';
    return { outcome, dive: o.aim, how };
  }
  if (outcome === 'goal') return { outcome, dive: others[rng.int(0, others.length - 1)]!, how: 'net' };
  const top = o.aim === 'tl' || o.aim === 'tr' || o.aim === 'mid';
  const frame = rng.next() < 0.25;
  const how: ShotHow = frame ? (top ? 'bar' : 'post') : top ? 'over' : 'wide';
  return { outcome, dive: AIMS[rng.int(0, AIMS.length - 1)]!, how };
}

/* ---------------------------------- scores ---------------------------------- */

function teamRows(s: State, ctx: ModeContext<Settings>) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.kickers[p.id]);
    const goals = members.reduce((n, p) => n + s.kickers[p.id]!.points, 0);
    const average = members.length ? Math.round((goals / members.length) * 10) / 10 : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, goals, average, score: ctx.settings.houseMatch ? goals : average };
  });
}

function ranking(s: State, ctx: ModeContext<Settings>, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.kickers[p.id])
    .map((p) => {
      const k = s.kickers[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, points: k.points, shots: k.shots, goals: k.goals, onFire: k.onFire, rank: 0, isYou: p.id === me };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.rank : i + 1));
  return rows;
}

/** Who is level at the top when the whistle blows (two or more), or null. */
function levelAtTop(s: State, ctx: ModeContext<Settings>): Golden | null {
  const teams = teamRows(s, ctx);
  if (teams) {
    const live = teams.filter((t) => t.members > 0);
    const best = Math.max(...live.map((t) => t.score));
    const leaders = live.filter((t) => t.score === best).map((t) => t.teamId);
    return leaders.length >= 2 ? { endsAt: 0, leaders, teams: true } : null;
  }
  const rows = ctx.players().filter((p) => s.kickers[p.id]);
  if (rows.length < 2) return null;
  const best = Math.max(...rows.map((p) => s.kickers[p.id]!.points));
  const leaders = rows.filter((p) => s.kickers[p.id]!.points === best).map((p) => p.id);
  return leaders.length >= 2 ? { endsAt: 0, leaders, teams: false } : null;
}

function canShootNow(s: State, ctx: ModeContext<Settings>, id: PlayerId): boolean {
  if (!s.golden) return true;
  return s.golden.leaders.includes(s.golden.teams ? (teamOf(ctx, id) ?? '') : id);
}

/* ---------------------------------- shooting --------------------------------- */

function shoot(s: State, ctx: ModeContext<Settings>, id: PlayerId, aim: Aim, power: Power) {
  const k = s.kickers[id]!;
  const at = ctx.now();
  const foe = foeOf(s, ctx, id);
  const guard = foe ? s.kickers[foe]!.guard : null;
  const key = readKey(ctx, id);
  const reads = s.reads[key] ?? noReads();
  const odds = shotOdds({ aim, power, read: reads[aim], guarded: Boolean(guard?.includes(aim)) });
  const drawn = drawShot(odds, ctx.rng);
  k.balls--;
  k.shots++;
  if (ctx.settings.keeperLearns) s.reads[key] = learn(reads, aim);
  if (foe) k.faced[foe] = (k.faced[foe] ?? 0) + 1;

  let points = 0;
  let fire = false;
  if (drawn.outcome === 'goal') {
    fire = k.onFire;
    points = fire ? 2 : 1;
    k.points += points;
    k.goals++;
    k.streak = fire ? 0 : k.streak + 1;
    k.onFire = false;
    if (!fire && k.streak >= FIRE_STREAK) {
      k.onFire = true;
      k.streak = 0;
    }
  } else {
    if (k.onFire) note(s, k, at, 'The fire went out. Score three in a row to catch it again.', 'bad');
    k.onFire = false;
    k.streak = 0;
    if (drawn.outcome === 'saved') k.saved++;
    else k.wide++;
  }
  // `streak` on the shot is the run shown on the card: goals in a row, or "on fire" after the third.
  const run = drawn.outcome === 'goal' ? (k.onFire ? FIRE_STREAK : fire ? 0 : k.streak) : 0;
  k.last = { seq: ++k.seq, at, aim, power, outcome: drawn.outcome, dive: drawn.dive, how: drawn.how, points, fire, streak: run, chance: odds.goal, keeper: foe ? nameOf(ctx, foe) : null };
  k.best = Math.max(k.best, k.goals);
  if (k.onFire && (!s.hottest || s.hottest.streak < FIRE_STREAK)) s.hottest = { by: id, streak: FIRE_STREAK };

  if (foe && drawn.outcome === 'saved') {
    const keeper = s.kickers[foe]!;
    keeper.kept++;
    note(s, keeper, at, `Your keeper saved ${nameOf(ctx, id)}’s shot to the ${AIM_INFO[aim].label.toLowerCase()}.`, 'good');
  }
  s.reel = [{ id: ++s.seq, at, by: id, aim, power, outcome: drawn.outcome, dive: drawn.dive, how: drawn.how, points, fire, streak: run, keeper: foe }, ...s.reel].slice(0, REEL_KEEP);

  if (s.golden && points > 0) {
    const team = s.golden.teams ? teamOf(ctx, id) : null;
    s.winner = { id: team ?? id, team: Boolean(team) };
    const who = team ? (ctx.teams().find((t) => t.id === team)?.name ?? 'A team') : nameOf(ctx, id);
    ctx.feed(`Golden goal! ${nameOf(ctx, id)} wins it${team ? ` for ${who}` : ''}.`, { tone: 'big' });
    ctx.endGame(`Golden goal: ${nameOf(ctx, id)} scored the winner${team ? ` for ${who}` : ''}.`);
  }
}

/* ----------------------------------- mode ----------------------------------- */

export const spotKick = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const kickers: Record<PlayerId, Kicker> = {};
    for (const p of ctx.players()) kickers[p.id] = newKicker(ctx);
    const endsAt = ctx.now() + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    return { kickers, reads: {}, endsAt, golden: null, reel: [], seq: 0, winner: null, draw: false, hottest: null };
  },
  onPlayerJoin(s, p, ctx) {
    s.kickers[p.id] ??= newKicker(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const k = s.kickers[playerId];
    if (!k) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(k.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (res.correct) {
          const before = k.balls;
          k.balls = Math.min(MAX_BALLS, k.balls + 1);
          if (k.stream.last) k.stream.last.text = k.balls === before ? 'You already hold 3 footballs: take a penalty to make room' : '+1 football';
        } else if (k.stream.last) k.stream.last.text = 'No football';
        streamNext(k.stream, ctx);
        return;
      }
      case 'shoot': {
        if (k.balls <= 0) return { error: 'You have no footballs. Answer a question right to earn one.' };
        if (!canShootNow(s, ctx, playerId)) return { error: 'Golden goal: only the players level at the top can shoot now.' };
        shoot(s, ctx, playerId, a.aim, a.power);
        return;
      }
      case 'guard': {
        if (!ctx.settings.keeperDuty) return { error: 'There is no keeper duty in this game.' };
        if (a.places[0] === a.places[1]) return { error: 'Pick two different places for your keeper to guard.' };
        k.guard = [...a.places];
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      const level = ctx.settings.goldenGoal ? levelAtTop(s, ctx) : null;
      if (!level) {
        ctx.endGame();
        return;
      }
      s.golden = { ...level, endsAt: ctx.now() + GOLDEN_SEC * 1000 };
      ctx.setTimer('golden', s.golden.endsAt);
      ctx.feed('Level at the whistle: golden goal! The next goal by a leader wins.', { tone: 'big' });
      return;
    }
    if (id === 'golden') {
      s.draw = true;
      ctx.endGame('Nobody scored the golden goal, so it ends level.');
    }
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? 10 : 5);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const golden = s.golden ? { endsAt: s.golden.endsAt, teams: s.golden.teams, leaders: s.golden.teams ? s.golden.leaders : s.golden.leaders.map((id) => nameOf(ctx, id)) } : null;
    const base = {
      endsAt: s.endsAt,
      golden,
      houseMatch: ctx.settings.houseMatch && ctx.teams().length > 0,
      keeperDuty: ctx.settings.keeperDuty,
      keeperLearns: ctx.settings.keeperLearns,
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    if (viewer.kind === 'host') {
      return {
        ...base,
        reel: s.reel.map((r) => ({ ...r, name: nameOf(ctx, r.by), teamId: teamOf(ctx, r.by), keeper: r.keeper ? nameOf(ctx, r.keeper) : null })),
        totals: rows.reduce(
          (n, r) => {
            const k = s.kickers[r.playerId]!;
            return { shots: n.shots + k.shots, goals: n.goals + k.goals, saved: n.saved + k.saved, wide: n.wide + k.wide };
          },
          { shots: 0, goals: 0, saved: 0, wide: 0 },
        ),
      };
    }
    const k = me ? s.kickers[me] : undefined;
    if (!me || !k) return { ...base, you: null };
    const foe = foeOf(s, ctx, me);
    return {
      ...base,
      you: {
        points: k.points,
        balls: k.balls,
        maxBalls: MAX_BALLS,
        shots: k.shots,
        goals: k.goals,
        saved: k.saved,
        wide: k.wide,
        streak: k.streak,
        fireStreak: FIRE_STREAK,
        onFire: k.onFire,
        canShoot: canShootNow(s, ctx, me),
        rank: mine?.rank ?? null,
        teamId: teamOf(ctx, me),
        reads: readsOf(s, ctx, me),
        readMax: READ_MAX,
        odds: oddsFor(s, ctx, me),
        lastShot: k.last,
        guard: k.guard,
        kept: k.kept,
        foe: ctx.settings.keeperDuty ? (foe ? { name: nameOf(ctx, foe), guard: s.kickers[foe]!.guard ?? [] } : { name: null, guard: [] }) : null,
        notes: k.notes,
        question: streamQuestionView(k.stream, ctx),
        last: k.stream.last,
      },
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const n = s.kickers[p.id]?.points ?? 0;
      return { playerId: p.id, score: n, label: goalsText(n) };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best);
    let summary = 'The final whistle blew before anyone scored.';
    if (s.winner && !s.winner.team) summary = `Golden goal: ${nameOf(ctx, s.winner.id)} scored the winner.`;
    else if (s.winner && s.winner.team) summary = `Golden goal: ${ctx.teams().find((t) => t.id === s.winner!.id)?.name ?? 'A team'} won it.`;
    else if (teams && ctx.settings.houseMatch) {
      const sorted = [...teams].sort((a, b) => b.goals - a.goals);
      summary = sorted.length >= 2 && sorted[0]!.goals === sorted[1]!.goals ? `It finished level, ${sorted.map((t) => t.goals).join(' to ')}.` : `${sorted[0]!.name} won the house match, ${sorted.map((t) => t.goals).join(' to ')}.`;
    } else if (best > 0) summary = leaders.length === 1 ? `${nameOf(ctx, leaders[0]!.playerId)} scored the most: ${goalsText(best)}.` : `${String(leaders.length)} players finished level on ${goalsText(best)}.`;
    if (s.draw) summary += ' Nobody scored the golden goal.';
    // A golden goal winner ranks alone at the top even though the scores were level before it.
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.score, label: ctx.settings.houseMatch ? goalsText(t.goals) : `${String(t.average)} goals on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    // Keeper duty: now and then, move the keeper to cover something else.
    if (view.keeperDuty && you.balls === 0 && ctx.rng.next() < 0.08) {
      const pool = [...AIMS];
      const a = pool.splice(ctx.rng.int(0, pool.length - 1), 1)[0]!;
      const b = pool[ctx.rng.int(0, pool.length - 1)]!;
      return { type: 'guard', places: [a, b] };
    }
    if (you.balls > 0 && you.canShoot) {
      // Better bots pick the best chance shown, as people can; others pick near it.
      const rows = (you.odds as ShotOdds[]).map((o) => ({ o, v: expectedPoints(o, you.onFire) + (ctx.rng.next() - 0.5) * (1.1 - ctx.skill) * 0.5 }));
      rows.sort((a, b) => b.v - a.v);
      const pick = rows[0]!.o;
      return { type: 'shoot', aim: pick.aim, power: pick.power };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    if (you && you.balls > 0 && you.canShoot) return 1200 + rng.int(0, 1400);
    return 2200 + rng.int(0, 4300);
  },
});
