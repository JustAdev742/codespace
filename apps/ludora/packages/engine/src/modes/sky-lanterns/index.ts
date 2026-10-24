/*
 * Sky Lanterns: a push-your-luck race for the night sky.
 *
 * Correct answers earn oil, oil lights lanterns, and launching sends every
 * lit lantern up at once for (lanterns × the current wind). The wind changes
 * on a fixed beat; at each change there is a chance of a storm that blows
 * out every lantern still on the ground. Nobody can see the next wind (it is
 * not decided until the change), only the storm chance, which rises after
 * every change without a storm and resets after one.
 *
 * The oil can holds two lanterns' worth of oil, so oil cannot be hoarded
 * safely until a gust arrives: anything worth more than two lanterns has to
 * sit on the ground as lit lanterns, where storms can reach it.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = {
  lanternCost: number;
  windChangeSec: number;
  storms: boolean;
  stormChance: number;
  stormRise: number;
  gales: boolean;
  windPattern: string;
  spill: boolean;
  stormSafe: number;
};

export type WindKind = 'calm' | 'breezy' | 'gusty' | 'gale';

export const WINDS: Record<WindKind, { mult: number; label: string }> = {
  calm: { mult: 1, label: 'Calm' },
  breezy: { mult: 2, label: 'Breezy' },
  gusty: { mult: 3, label: 'Gusty' },
  gale: { mult: 4, label: 'Gale' },
};

/** Relative odds of each wind when a change brings no storm. */
const WIND_ODDS: Record<'normal' | 'gales', [WindKind, number][]> = {
  normal: [
    ['calm', 36],
    ['breezy', 40],
    ['gusty', 24],
  ],
  gales: [
    ['calm', 34],
    ['breezy', 36],
    ['gusty', 22],
    ['gale', 8],
  ],
};

/** The storm chance never quite reaches certainty. */
export const STORM_CHANCE_CAP = 90;
/** Every third correct answer in a row earns a bonus drop of oil. */
const BONUS_EVERY = 3;
/** Launches worth at least this many points are announced to the room. */
const BIG_LAUNCH = 10;
/** Used when the host sets no time limit: this mode has no other way to end. */
const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const RECENT_LAUNCHES = 6;

interface Flyer {
  stream: StreamState;
  oil: number;
  /** Lit lanterns waiting on the ground. */
  ground: number;
  /** Points from launched lanterns. Storms cannot touch these. */
  score: number;
  launched: number;
  /** Points from the best single launch. */
  best: number;
  lost: number;
  lastLaunch: { count: number; mult: number; points: number; at: number } | null;
  lastLoss: { count: number; at: number } | null;
}

interface Wind {
  kind: WindKind;
  since: number;
  /** Game time of the next change, or null when this wind lasts until the end. */
  changeAt: number | null;
  changes: number;
  /** Set when this wind followed a storm. */
  storm: { at: number; lost: number } | null;
}

interface State {
  flyers: Record<PlayerId, Flyer>;
  endsAt: number;
  wind: Wind;
  /** Chance of a storm at the next change, in percent. */
  stormChance: number;
  changesSinceStorm: number;
  storms: number;
  launches: { playerId: PlayerId; count: number; mult: number; points: number; at: number }[];
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('light') }),
  z.object({ type: z.literal('launch') }),
]);
type Action = z.infer<typeof action>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The oil can holds two lanterns' worth. */
export function oilCapacity(lanternCost: number): number {
  return lanternCost * 2;
}

/** Storm chance (percent) for the next change after `changesSinceStorm` changes without a storm. */
export function stormChanceAfter(changesSinceStorm: number, st: Pick<Settings, 'storms' | 'stormChance' | 'stormRise'>): number {
  if (!st.storms) return 0;
  return Math.min(STORM_CHANCE_CAP, st.stormChance + st.stormRise * changesSinceStorm);
}

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function newFlyer(ctx: ModeContext): Flyer {
  return { stream: streamInit(ctx), oil: 0, ground: 0, score: 0, launched: 0, best: 0, lost: 0, lastLaunch: null, lastLoss: null };
}

function scheduleChange(s: State, ctx: ModeContext<Settings>) {
  const at = s.wind.since + ctx.settings.windChangeSec * 1000;
  if (at < s.endsAt) {
    s.wind.changeAt = at;
    ctx.setTimer('wind', at);
  } else {
    s.wind.changeAt = null;
    ctx.clearTimer('wind');
  }
}

/** Gathering Winds: the wind after `kind`, one step stronger. Gusty only becomes a gale when gales are on. */
export function strongerWind(kind: WindKind, gales: boolean): WindKind {
  if (kind === 'calm') return 'breezy';
  if (kind === 'breezy') return 'gusty';
  return gales ? 'gale' : kind;
}

/** Festival finale: the change at game time `at` brings the last wind of the game. */
function isFinalChange(at: number, s: State, ctx: ModeContext<Settings>) {
  return at + ctx.settings.windChangeSec * 1000 >= s.endsAt;
}

/** Festival finale: the coming change brings the gale and no storm, so the forecast says so. */
function forecastFinale(s: State, ctx: ModeContext<Settings>) {
  if (ctx.settings.windPattern === 'finale' && s.wind.changeAt !== null && isFinalChange(s.wind.changeAt, s, ctx)) s.stormChance = 0;
}

function pickWind(ctx: ModeContext<Settings>): WindKind {
  const odds = WIND_ODDS[ctx.settings.gales ? 'gales' : 'normal'];
  const total = odds.reduce((n, [, w]) => n + w, 0);
  let roll = ctx.rng.next() * total;
  for (const [kind, w] of odds) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return odds[odds.length - 1]![0];
}

function changeWind(s: State, ctx: ModeContext<Settings>) {
  const at = s.wind.changeAt ?? ctx.now();
  const changes = s.wind.changes + 1;
  if (ctx.settings.windPattern === 'finale' && isFinalChange(at, s, ctx)) {
    s.changesSinceStorm++;
    s.wind = { kind: 'gale', since: at, changeAt: null, changes, storm: null };
    ctx.feed('Festival finale! The last wind is a gale: every lantern launched now scores ×4.', { tone: 'big' });
    s.stormChance = stormChanceAfter(s.changesSinceStorm, ctx.settings);
    scheduleChange(s, ctx);
    return;
  }
  // The storm roll only happens here, at the change, so the next wind is never in any state a view could show.
  const storm = ctx.settings.storms && ctx.rng.next() * 100 < s.stormChance;
  if (storm) {
    let lost = 0;
    let sheltered = 0;
    for (const f of Object.values(s.flyers)) {
      if (f.ground === 0) continue;
      // Lightning rods: small stacks are safe; only bigger ones draw the storm.
      if (f.ground <= ctx.settings.stormSafe) {
        sheltered += f.ground;
        continue;
      }
      lost += f.ground;
      f.lost += f.ground;
      f.lastLoss = { count: f.ground, at };
      f.ground = 0;
    }
    s.storms++;
    s.changesSinceStorm = 0;
    s.wind = { kind: 'calm', since: at, changeAt: null, changes, storm: { at, lost } };
    ctx.feed(
      lost
        ? `A storm blew out ${plural(lost, 'lantern')}!${sheltered ? ` ${plural(sheltered, 'lantern')} in small stacks came through safely.` : ''}`
        : sheltered
          ? 'A storm swept through, but every waiting stack was small enough to be safe.'
          : 'A storm swept through, but no lanterns were waiting.',
      { tone: 'bad' },
    );
  } else {
    const kind = ctx.settings.windPattern === 'rising' ? strongerWind(s.wind.kind, ctx.settings.gales) : pickWind(ctx);
    s.changesSinceStorm++;
    s.wind = { kind, since: at, changeAt: null, changes, storm: null };
    if (kind === 'gale') ctx.feed('A gale! Every lantern launched now scores ×4.', { tone: 'big' });
  }
  s.stormChance = stormChanceAfter(s.changesSinceStorm, ctx.settings);
  scheduleChange(s, ctx);
  forecastFinale(s, ctx);
}

function nameOf(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function board(s: State, ctx: ModeContext, me: PlayerId | null, limit: number) {
  const rows = ctx
    .players()
    .filter((p) => s.flyers[p.id])
    .map((p) => {
      const f = s.flyers[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, score: f.score, ground: f.ground, launched: f.launched, isYou: p.id === me, rank: 0 };
    })
    .sort((a, b) => b.score - a.score || b.ground - a.ground || a.name.localeCompare(b.name));
  // Equal scores share a rank.
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1));
  const top = rows.slice(0, limit);
  const mine = rows.find((r) => r.isYou);
  if (mine && !top.includes(mine)) top.push(mine);
  return top;
}

function teamRows(s: State, ctx: ModeContext) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.flyers[p.id]);
    const total = members.reduce((n, p) => n + s.flyers[p.id]!.score, 0);
    const average = members.length ? Math.round((total / members.length) * 10) / 10 : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average, total };
  });
}

export const skyLanterns = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const flyers: Record<PlayerId, Flyer> = {};
    for (const p of ctx.players()) flyers[p.id] = newFlyer(ctx);
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const s: State = {
      flyers,
      endsAt,
      wind: { kind: 'calm', since: now, changeAt: null, changes: 0, storm: null },
      stormChance: stormChanceAfter(0, ctx.settings),
      changesSinceStorm: 0,
      storms: 0,
      launches: [],
    };
    scheduleChange(s, ctx);
    forecastFinale(s, ctx);
    const st = ctx.settings;
    if (st.windPattern === 'finale' && s.wind.changeAt === null) s.wind.kind = 'gale';
    if (st.windPattern === 'rising') ctx.feed('Gathering winds: the wind grows stronger at every change until a storm resets it.', { tone: 'info' });
    if (st.windPattern === 'finale') ctx.feed('Festival finale: the last wind of the game is always a gale, with no storm.', { tone: 'info' });
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.flyers[p.id] ??= newFlyer(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const f = s.flyers[playerId];
    if (!f) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(f.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        let text = 'No oil this time';
        if (!res.correct && ctx.settings.spill && f.oil > 0) {
          f.oil--;
          text = 'Spilt 1 oil';
        }
        if (res.correct) {
          const bonus = res.streak > 0 && res.streak % BONUS_EVERY === 0;
          const gain = bonus ? 2 : 1;
          const kept = Math.max(0, Math.min(gain, oilCapacity(ctx.settings.lanternCost) - f.oil));
          f.oil += kept;
          if (kept === 0) text = 'Your oil can is full: light a lantern';
          else text = `+${kept} oil${bonus ? ' (streak bonus)' : ''}${kept < gain ? ', the rest spilt' : ''}`;
        }
        if (f.stream.last) f.stream.last.text = text;
        streamNext(f.stream, ctx);
        return;
      }
      case 'light': {
        const cost = ctx.settings.lanternCost;
        if (f.oil < cost) return { error: `You need ${cost} oil to light a lantern.` };
        f.oil -= cost;
        f.ground++;
        return;
      }
      case 'launch': {
        if (f.ground === 0) return { error: 'Light a lantern before you launch.' };
        const wind = WINDS[s.wind.kind];
        const count = f.ground;
        const points = count * wind.mult;
        const at = ctx.now();
        f.ground = 0;
        f.score += points;
        f.launched += count;
        f.best = Math.max(f.best, points);
        f.lastLaunch = { count, mult: wind.mult, points, at };
        s.launches = [{ playerId, count, mult: wind.mult, points, at }, ...s.launches].slice(0, RECENT_LAUNCHES);
        if (points >= BIG_LAUNCH) {
          ctx.feed(`${nameOf(ctx, playerId)} launched ${plural(count, 'lantern')} on a ${wind.label.toLowerCase()} wind for ${points} points.`, { tone: 'big' });
        }
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'wind') changeWind(s, ctx);
    if (id === 'time') {
      const grounded = Object.values(s.flyers).reduce((n, f) => n + f.ground, 0);
      if (grounded) ctx.feed(`Time is up! ${plural(grounded, 'lantern')} never left the ground.`, { tone: 'info' });
      ctx.endGame();
    }
  },
  view(s, viewer, ctx) {
    const st = ctx.settings;
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const f = me ? s.flyers[me] : undefined;
    const wind = WINDS[s.wind.kind];
    const present = ctx.players().map((p) => s.flyers[p.id]).filter((x): x is Flyer => Boolean(x));
    return {
      endsAt: s.endsAt,
      totals: {
        launched: Object.values(s.flyers).reduce((n, x) => n + x.launched, 0),
        waiting: present.reduce((n, x) => n + x.ground, 0),
      },
      cost: st.lanternCost,
      oilCap: oilCapacity(st.lanternCost),
      wind: { kind: s.wind.kind, label: wind.label, mult: wind.mult, since: s.wind.since, changeAt: s.wind.changeAt, changes: s.wind.changes, storm: s.wind.storm },
      forecast: { storms: st.storms, gales: st.gales, chance: s.stormChance, stormsSoFar: s.storms },
      board: board(s, ctx, me, viewer.kind === 'host' ? 10 : 6),
      launches: s.launches.map((l) => ({ ...l, name: nameOf(ctx, l.playerId) })),
      teams: teamRows(s, ctx),
      you: f
        ? {
            oil: f.oil,
            ground: f.ground,
            score: f.score,
            launched: f.launched,
            best: f.best,
            lost: f.lost,
            streak: f.stream.streak,
            question: streamQuestionView(f.stream, ctx),
            last: f.stream.last,
            lastLaunch: f.lastLaunch,
            lastLoss: f.lastLoss,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const f = s.flyers[p.id];
      const score = f?.score ?? 0;
      const from = f && f.launched ? ` from ${plural(f.launched, 'lantern')}` : '';
      return { playerId: p.id, score, label: `${plural(score, 'point')}${from}` };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best).map((r) => nameOf(ctx, r.playerId));
    let summary = 'Nobody launched a lantern this time.';
    if (best > 0) summary = leaders.length === 1 ? `${leaders[0]} lit up the sky with ${plural(best, 'point')}.` : `${leaders.length} players tied for the brightest sky with ${plural(best, 'point')}.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${t.average} points on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    if (you.ground > 0) {
      const mult: number = view.wind.mult;
      const chance: number = view.forecast.chance;
      const lastWind = view.wind.changeAt === null;
      const msLeft = view.endsAt - ctx.now;
      // Launch on a strong wind, when a storm looks likely, or when nothing better can come before the end.
      const launch =
        lastWind ||
        msLeft < 12_000 ||
        mult >= 3 ||
        (mult === 2 && (chance >= 30 || you.ground >= 5)) ||
        (mult === 1 && chance >= 60 && you.ground >= 2);
      if (launch) return { type: 'launch' };
    }
    if (you.oil >= view.cost) return { type: 'light' };
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    // Lighting and launching are quick taps; answering takes a while.
    if (you && (you.oil >= view.cost || (you.ground > 0 && view.wind?.mult >= 3))) return 700 + rng.int(0, 1300);
    return 2200 + rng.int(0, 4500);
  },
});
