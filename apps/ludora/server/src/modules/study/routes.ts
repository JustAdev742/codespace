import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { soloBlocker } from '@ludora/engine/catalog';
import type { AppDeps } from '../../app.ts';
import { gameParticipants, gameSessions, inventory, items, ledger, practiceRuns, questionSets, userAchievements, achievements, userStats } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { parse } from '../../lib/validate.ts';
import { addDays, nextWeeklyReset, utcDay, weekStart } from '../../lib/time.ts';
import { modeTitle } from '../profiles/routes.ts';
import { canView } from '../sets/access.ts';
import { readExtras } from '../player/service.ts';
import { monthDays, mostImproved } from './logic.ts';
import { dailyChallenge, dailyHistory, listMistakes, startDaily, startMistakes } from './service.ts';

/** Ledger reasons that count as earning, for the weekly recap. Spending and recycling are left out. */
const EARN_REASONS = ['game_reward', 'streak_reward', 'level_reward', 'quest_reward', 'achievement_reward', 'collection_reward'];

export async function studyRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ---------------------------------- mistakes -------------------------------- */

  app.get('/api/me/mistakes', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const list = await listMistakes(db, auth.user.id);
    // The prompt and type only: the answers stay on the server, as in a game.
    return { total: list.length, mistakes: list.map(({ question: _q, ...m }) => m) };
  });

  app.post('/api/me/mistakes/play', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAuth(req);
    return startMistakes(deps, auth);
  });

  /* ------------------------------- daily challenge ---------------------------- */

  app.get('/api/me/daily', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const today = utcDay();
    const [challenge, history] = await Promise.all([dailyChallenge(db, today), dailyHistory(db, auth.user.id, today)]);
    return {
      day: today,
      resets: new Date(`${addDays(today, 1)}T00:00:00Z`).toISOString(),
      challenge: challenge ? { set: challenge.set, modeId: challenge.modeId, mode: modeTitle(challenge.modeId, null), questions: challenge.questions.length } : null,
      streak: history.streak,
      longest: history.longest,
      doneToday: history.doneToday,
      recent: history.days.filter((d) => d > addDays(today, -7)),
    };
  });

  app.post('/api/me/daily/play', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAuth(req);
    return startDaily(deps, auth);
  });

  /* ---------------------------------- calendar -------------------------------- */

  /** The days in a month the player finished a game, with the daily challenges they did, and their streaks. */
  app.get('/api/me/calendar', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month.').optional() }), req.query);
    const m = month ?? utcDay().slice(0, 7);
    const days = monthDays(m);
    const from = new Date(`${days[0]}T00:00:00Z`);
    const to = new Date(`${addDays(days[days.length - 1]!, 1)}T00:00:00Z`);
    const day = sql<string>`to_char(${gameSessions.endedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const [played, daily, statsRows, first] = await Promise.all([
      db
        .select({ day, games: sql<number>`count(*)::int`, correct: sql<number>`coalesce(sum(${gameParticipants.correct}),0)::int`, answered: sql<number>`coalesce(sum(${gameParticipants.answered}),0)::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(and(eq(gameParticipants.userId, auth.user.id), gte(gameSessions.endedAt, from), lt(gameSessions.endedAt, to)))
        .groupBy(day),
      db
        .selectDistinct({ day: practiceRuns.day })
        .from(practiceRuns)
        .where(and(eq(practiceRuns.userId, auth.user.id), eq(practiceRuns.kind, 'daily'), isNotNull(practiceRuns.completedAt), gte(practiceRuns.day, days[0]!), lt(practiceRuns.day, utcDay(to)))),
      db.select().from(userStats).where(eq(userStats.userId, auth.user.id)).limit(1),
      db
        .select({ at: sql<string | null>`min(${gameSessions.endedAt})` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(eq(gameParticipants.userId, auth.user.id)),
    ]);
    const s = statsRows[0];
    const today = utcDay();
    const byDay = new Map(played.map((p) => [p.day, p]));
    const dailyDays = new Set(daily.map((d) => d.day));
    return {
      month: m,
      today,
      firstPlayed: first[0]?.at ? new Date(first[0].at).toISOString().slice(0, 7) : null,
      days: days.map((d) => ({ day: d, games: byDay.get(d)?.games ?? 0, correct: byDay.get(d)?.correct ?? 0, answered: byDay.get(d)?.answered ?? 0, daily: dailyDays.has(d) })),
      streak: s && (s.lastPlayDay === today || s.lastPlayDay === addDays(today, -1)) ? s.dailyStreak : 0,
      longest: s?.longestDailyStreak ?? 0,
    };
  });

  /* ------------------------------- personal bests ----------------------------- */

  /** Your best game in each mode: top score (with the mode's own wording for it), best accuracy, longest streak, best place. */
  app.get('/api/me/bests', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    return { bests: await personalBests(deps, auth.user.id) };
  });

  /* ---------------------------------- insights -------------------------------- */

  /** Accuracy by question type over the last six months, and the mode played most. */
  app.get('/api/me/insights', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const since = new Date(Date.now() - 180 * 86_400_000);
    const byType = await db.execute<{ type: string; answered: number; correct: number }>(sql`
      select q->>'type' as type, count(*)::int as answered, count(*) filter (where ae.correct)::int as correct
      from answer_events ae
      join question_sets s on s.id = ae.set_id
      cross join lateral jsonb_array_elements(s.questions) q
      where ae.user_id = ${auth.user.id} and ae.kind <> 'self' and ae.created_at > ${since.toISOString()} and q->>'id' = ae.question_id
      group by 1 order by 2 desc`);
    const [stats] = await db.select({ modes: userStats.modesPlayed }).from(userStats).where(eq(userStats.userId, auth.user.id)).limit(1);
    const modes = Object.entries((stats?.modes as Record<string, number>) ?? {}).sort((a, b) => b[1] - a[1]);
    const fav = modes[0];
    return {
      byType: byType.rows,
      favouriteMode: fav ? { modeId: fav[0], title: modeTitle(fav[0], null), games: fav[1], share: fav[1] / modes.reduce((n, [, v]) => n + v, 0) } : null,
    };
  });

  /* -------------------------------- weekly recap ------------------------------ */

  /** Last week (Monday to Sunday, UTC): what you played, what you got better at and what you earned. */
  app.get('/api/me/recap', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const uid = auth.user.id;
    const thisWeek = weekStart(new Date());
    const start = new Date(thisWeek.getTime() - 7 * 86_400_000);
    const before = new Date(start.getTime() - 7 * 86_400_000);
    const inWeek = (from: Date, to: Date) => and(eq(gameParticipants.userId, uid), gte(gameSessions.endedAt, from), lt(gameSessions.endedAt, to));
    const subjectRows = (from: Date, to: Date) =>
      db
        .select({ subject: questionSets.subject, correct: sql<number>`coalesce(sum(${gameParticipants.correct}),0)::int`, answered: sql<number>`coalesce(sum(${gameParticipants.answered}),0)::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .innerJoin(questionSets, eq(questionSets.id, gameSessions.setId))
        .where(inWeek(from, to))
        .groupBy(questionSets.subject);
    const [games, subjectsNow, subjectsBefore, earned, unlocked, glims] = await Promise.all([
      db
        .select({ modeId: gameSessions.modeId, variantId: gameSessions.variantId, correct: gameParticipants.correct, answered: gameParticipants.answered, rank: gameParticipants.rank, players: gameSessions.playerCount })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(inWeek(start, thisWeek)),
      subjectRows(start, thisWeek),
      subjectRows(before, start),
      db
        .select({ currency: ledger.currency, total: sql<number>`coalesce(sum(${ledger.delta}),0)::int` })
        .from(ledger)
        .where(and(eq(ledger.userId, uid), gte(ledger.createdAt, start), lt(ledger.createdAt, thisWeek), sql`${ledger.delta} > 0`, sql`${ledger.reason} in (${sql.join(EARN_REASONS.map((r) => sql`${r}`), sql`, `)})`))
        .groupBy(ledger.currency),
      db
        .select({ title: achievements.title })
        .from(userAchievements)
        .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
        .where(and(eq(userAchievements.userId, uid), gte(userAchievements.unlockedAt, start), lt(userAchievements.unlockedAt, thisWeek))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(inventory)
        .innerJoin(items, eq(items.id, inventory.itemId))
        .where(and(eq(inventory.userId, uid), eq(items.type, 'glim'), gte(inventory.firstAcquiredAt, start), lt(inventory.firstAcquiredAt, thisWeek))),
    ]);
    const modeCounts = new Map<string, number>();
    for (const g of games) modeCounts.set(modeTitle(g.modeId, g.variantId), (modeCounts.get(modeTitle(g.modeId, g.variantId)) ?? 0) + 1);
    const correct = games.reduce((n, g) => n + g.correct, 0);
    const answered = games.reduce((n, g) => n + g.answered, 0);
    return {
      weekOf: utcDay(start),
      weekEnds: utcDay(new Date(thisWeek.getTime() - 86_400_000)),
      games: games.length,
      wins: games.filter((g) => g.players >= 3 && g.rank === 1).length,
      correct,
      answered,
      modes: [...modeCounts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, n]) => ({ title, games: n })),
      improved: mostImproved(subjectsBefore, subjectsNow),
      earned: Object.fromEntries(earned.map((e) => [e.currency, e.total])),
      achievements: unlocked.map((a) => a.title),
      newGlims: glims[0]?.n ?? 0,
    };
  });

  /* ------------------------------------ goal ---------------------------------- */

  /** The weekly goal you set and how far through it you are this week (Monday 00:00 UTC onwards). */
  app.get('/api/me/goal', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { goal } = await readExtras(db, auth.user.id);
    const since = weekStart(new Date());
    const [row] = await db
      .select({ games: sql<number>`count(*)::int`, correct: sql<number>`coalesce(sum(${gameParticipants.correct}),0)::int` })
      .from(gameParticipants)
      .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
      .where(and(eq(gameParticipants.userId, auth.user.id), gte(gameSessions.endedAt, since)));
    return { goal, progress: goal ? (goal.metric === 'games' ? (row?.games ?? 0) : (row?.correct ?? 0)) : 0, week: { games: row?.games ?? 0, correct: row?.correct ?? 0 }, resets: nextWeeklyReset().toISOString() };
  });

  /* ------------------------------- recently played ---------------------------- */

  /** Your last few different games (mode and set), newest first, with what Play again can do for each. */
  app.get('/api/me/recent', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const rows = await db
      .select({ modeId: gameSessions.modeId, variantId: gameSessions.variantId, setId: gameSessions.setId, setTitle: gameSessions.setTitle, endedAt: gameSessions.endedAt, isSolo: gameSessions.isSolo, assignmentId: gameSessions.assignmentId, correct: gameParticipants.correct, answered: gameParticipants.answered })
      .from(gameParticipants)
      .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
      .where(and(eq(gameParticipants.userId, auth.user.id), isNotNull(gameSessions.setId)))
      .orderBy(desc(gameSessions.endedAt))
      .limit(60);
    const seen = new Set<string>();
    const picked = rows.filter((r) => {
      const key = `${r.variantId ?? r.modeId}|${r.setId}`;
      if (seen.has(key) || r.assignmentId) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
    const sets = picked.length ? await db.select().from(questionSets).where(sql`${questionSets.id} in (${sql.join(picked.map((p) => sql`${p.setId}`), sql`, `)})`) : [];
    const setById = new Map(sets.map((s) => [s.id, s]));
    return {
      games: picked
        .filter((p) => {
          const s = setById.get(p.setId!);
          return s && canView(s, auth);
        })
        .map((p) => {
          const s = setById.get(p.setId!)!;
          return { modeId: p.modeId, variantId: p.variantId, title: modeTitle(p.modeId, p.variantId), setId: p.setId!, setTitle: s.title, subject: s.subject, cover: s.cover, endedAt: p.endedAt.toISOString(), correct: p.correct, answered: p.answered, solo: !soloBlocker(p.modeId, p.variantId, {}) };
        }),
    };
  });
}

export interface PersonalBest {
  modeId: string;
  title: string;
  games: number;
  bestScore: number;
  bestLabel: string;
  bestScoreAt: string;
  bestAccuracy: number | null;
  bestStreak: number;
  bestRank: number | null;
}

/** Bests per mode from saved games. Accuracy counts games of five answers or more; places count games of three people or more. */
export async function personalBests(deps: AppDeps, userId: string): Promise<PersonalBest[]> {
  const rows = await deps.db.execute<{ mode_id: string; games: number; best_score: number; best_label: string; best_at: string; best_accuracy: number | null; best_streak: number; best_rank: number | null }>(sql`
    with mine as (
      select gs.mode_id, gp.score, gp.label, gs.ended_at, gp.correct, gp.answered, gp.best_streak, gp.rank, gs.player_count
      from game_participants gp join game_sessions gs on gs.id = gp.game_id
      where gp.user_id = ${userId}
    ), top as (
      select distinct on (mode_id) mode_id, score, label, ended_at from mine order by mode_id, score desc, ended_at asc
    )
    select m.mode_id, count(*)::int as games, t.score::float8 as best_score, t.label as best_label, t.ended_at as best_at,
      max(case when m.answered >= 5 then m.correct::float8 / m.answered end) as best_accuracy,
      max(m.best_streak)::int as best_streak,
      min(case when m.player_count >= 3 then m.rank end)::int as best_rank
    from mine m join top t on t.mode_id = m.mode_id
    group by m.mode_id, t.score, t.label, t.ended_at
    order by count(*) desc, m.mode_id`);
  return rows.rows.map((r) => ({
    modeId: r.mode_id,
    title: modeTitle(r.mode_id, null),
    games: r.games,
    bestScore: Number(r.best_score),
    bestLabel: r.best_label,
    bestScoreAt: new Date(r.best_at).toISOString(),
    bestAccuracy: r.best_accuracy === null ? null : Number(r.best_accuracy),
    bestStreak: r.best_streak,
    bestRank: r.best_rank,
  }));
}
