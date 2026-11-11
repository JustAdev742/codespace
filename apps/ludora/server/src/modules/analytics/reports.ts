import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { cleanText, questionSetInputSchema, SUBJECTS, type Question } from '@ludora/shared';
import { getMode, getVariant, MODES } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { answerEvents, classMembers, classes, gameParticipants, gameSessions, questionSets, reportNotes, reportSettings } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { assertUploadsUsable } from '../uploads/service.ts';
import { loadSet } from '../sets/access.ts';
import { questionsById } from './report.ts';
import { analyseQuestions, firstTries, retentionCutoff, setPerformance, shownAnswer, type SetQuestionPlay } from './analysis.ts';
import { gameAccess, loadGame, promptOf } from './gameData.ts';

/*
 * Reports for the teacher who hosted the games: the reports home with search and filters, one
 * student or one set across your games, the term overview, notes, reteach sets, the answers
 * download, deleting reports and the retention setting, and a download of everything.
 *
 * Every route checks on the server whose games these are: a game's routes go through
 * gameAccess (host, the class's teacher, or staff; everyone else a 404), and the lists only
 * ever read games where host_user_id is the caller. Players appear by display name only.
 */

const modeTitle = (modeId: string, variantId: string | null) => (variantId ? getVariant(variantId)?.meta.title : null) ?? getMode(modeId)?.meta.title ?? modeId;
const idParam = z.object({ id: z.string().uuid('No game with that id.') });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.');
const PAGE = 25;
export const RETENTION_CHOICES = [3, 6, 12, 24] as const;
const PURGE_EVERY_MS = 6 * 3_600_000;

/** Games this person hosted for a group: never solo games or assignments. */
const hostedBy = (userId: string) => and(eq(gameSessions.hostUserId, userId), eq(gameSessions.isSolo, false));

/** Accuracy over people (not bots) in a game, 0-1, or null with no answers. */
const accuracySql = sql<number | null>`(select sum(p.correct)::float / nullif(sum(p.answered), 0) from game_participants p where p.game_id = ${gameSessions.id} and not p.is_bot)`;

/**
 * A student's key in a teacher's reports: a keyed hash of the teacher and the student, so the
 * address names nobody's account and means nothing to anyone else.
 */
export function studentKey(secret: string, teacherId: string, userId: string): string {
  return createHmac('sha256', secret).update(`reports:${teacherId}:${userId}`).digest('base64url').slice(0, 22);
}

/** Removes games past each host's retention setting. Returns how many went. */
export async function purgeExpiredReports(db: DbOrTx): Promise<number> {
  const res = await db.execute(sql`
    delete from game_sessions g using report_settings s
    where g.host_user_id = s.user_id and s.retention_months is not null and not g.is_solo
      and g.ended_at < now() - make_interval(months => s.retention_months)
    returning g.id`);
  return res.rows.length;
}

async function deleteHostedBefore(db: DbOrTx, userId: string, before: Date): Promise<number> {
  const gone = await db.delete(gameSessions).where(and(hostedBy(userId), lt(gameSessions.endedAt, before))).returning({ id: gameSessions.id });
  return gone.length;
}

async function teacherStudents(db: DbOrTx, teacherId: string) {
  return db
    .select({ userId: classMembers.userId, classId: classes.id, className: classes.name })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classes.ownerId, teacherId), eq(classMembers.role, 'student')));
}

export async function reportRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  const secret = deps.config.IP_HASH_KEY;

  // The retention setting is enforced here, on the server, every six hours (and when it changes).
  const run = () => void purgeExpiredReports(db as Db).catch((err) => deps.log?.error?.({ err }, 'report retention purge failed'));
  const first = setTimeout(run, 90_000);
  const every = setInterval(run, PURGE_EVERY_MS);
  first.unref?.();
  every.unref?.();
  app.addHook('onClose', async () => {
    clearTimeout(first);
    clearInterval(every);
  });

  /* ------------------------------- reports home ------------------------------- */

  app.get('/api/reports/games', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(
      z.object({
        q: z.string().trim().max(80).optional(),
        classId: z.string().uuid().optional(),
        setId: z.string().uuid().optional(),
        modeId: z.string().max(60).optional(),
        from: day.optional(),
        to: day.optional(),
        sort: z.enum(['newest', 'oldest', 'accuracy', 'players']).default('newest'),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
      }),
      req.query,
    );
    const me = auth.user.id;
    const where: SQL[] = [hostedBy(me)!];
    if (q.classId) where.push(eq(gameSessions.classId, q.classId));
    if (q.setId) where.push(eq(gameSessions.setId, q.setId));
    if (q.modeId) where.push(eq(gameSessions.modeId, q.modeId));
    if (q.from) where.push(gte(gameSessions.endedAt, new Date(`${q.from}T00:00:00`)));
    if (q.to) where.push(lt(gameSessions.endedAt, new Date(new Date(`${q.to}T00:00:00`).getTime() + 86_400_000)));
    if (q.q) {
      const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const needle = q.q.toLowerCase();
      const modeIds = MODES.filter((m) => m.meta.title.toLowerCase().includes(needle)).map((m) => m.meta.id);
      where.push(or(ilike(gameSessions.setTitle, like), ilike(classes.name, like), ...(modeIds.length ? [inArray(gameSessions.modeId, modeIds)] : []))!);
    }
    const order =
      q.sort === 'oldest' ? [asc(gameSessions.endedAt)] : q.sort === 'accuracy' ? [sql`${accuracySql} asc nulls last`, desc(gameSessions.endedAt)] : q.sort === 'players' ? [desc(gameSessions.playerCount), desc(gameSessions.endedAt)] : [desc(gameSessions.endedAt)];
    const [rows, [total], filterRows] = await Promise.all([
      db
        .select({ g: gameSessions, className: classes.name, accuracy: accuracySql, questions: sql<number>`(select count(distinct a.question_id)::int from answer_events a where a.game_id = ${gameSessions.id})` })
        .from(gameSessions)
        .leftJoin(classes, eq(classes.id, gameSessions.classId))
        .where(and(...where))
        .orderBy(...order)
        .limit(PAGE)
        .offset(q.offset),
      db.select({ n: count() }).from(gameSessions).leftJoin(classes, eq(classes.id, gameSessions.classId)).where(and(...where)),
      db
        .selectDistinct({ classId: gameSessions.classId, className: classes.name, setId: gameSessions.setId, setTitle: gameSessions.setTitle, modeId: gameSessions.modeId })
        .from(gameSessions)
        .leftJoin(classes, eq(classes.id, gameSessions.classId))
        .where(hostedBy(me))
        .limit(2000),
    ]);
    const uniq = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()];
    return {
      games: rows.map(({ g, className, accuracy, questions }) => ({
        id: g.id,
        mode: modeTitle(g.modeId, g.variantId),
        modeId: g.modeId,
        setTitle: g.setTitle,
        setId: g.setId,
        classId: g.classId,
        className: className ?? null,
        players: g.playerCount,
        accuracy: accuracy === null ? null : Number(accuracy),
        questions: questions ?? 0,
        endedAt: g.endedAt.toISOString(),
        durationMs: g.durationMs,
      })),
      total: total?.n ?? 0,
      pageSize: PAGE,
      filters: {
        classes: uniq(filterRows.filter((r) => r.classId && r.className).map((r) => ({ id: r.classId!, name: r.className! }))).sort((a, b) => a.name.localeCompare(b.name)),
        sets: uniq(filterRows.filter((r) => r.setId).map((r) => ({ id: r.setId!, title: r.setTitle }))).sort((a, b) => a.title.localeCompare(b.title)),
        modes: uniq(filterRows.map((r) => ({ id: r.modeId, title: modeTitle(r.modeId, null) }))).sort((a, b) => a.title.localeCompare(b.title)),
      },
    };
  });

  /* ------------------------------ one game's extras ------------------------------ */

  /** Every answer in a game, for the CSV download: player by display name, the question, the answer in words. */
  app.get('/api/games/:id/answers', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { game } = await gameAccess(db, auth, id);
    const data = await loadGame(db, game);
    const names = new Map(data.players.map((p) => [p.playerKey, { name: p.name, membership: p.membership, team: p.team }]));
    const seen = new Map<string, number>();
    return {
      answers: data.answers.map((a) => {
        const key = `${a.playerKey}:${a.questionId}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        const who = names.get(a.playerKey);
        return {
          playerKey: a.playerKey,
          player: who?.name ?? 'Player',
          membership: who?.membership ?? 'guest',
          team: who?.team ?? null,
          ...promptOf(data.questions, a.questionId),
          questionId: a.questionId,
          given: a.correct ? (a.given?.slice(0, 80) ?? null) : shownAnswer(a.given),
          correct: a.correct,
          kind: a.kind,
          tryNumber: n,
          responseMs: a.responseMs,
        };
      }),
    };
  });

  /** One player's answers in one game: how a guest (or anyone) did, question by question. */
  app.get('/api/games/:id/players/:key', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { id, key } = parse(z.object({ id: z.string().uuid(), key: z.string().regex(/^[a-z]\d{1,6}$/, 'No player with that key.') }), req.params);
    const { game } = await gameAccess(db, auth, id);
    const data = await loadGame(db, game);
    const p = data.players.find((x) => x.playerKey === key && !x.isBot);
    if (!p) throw notFound('That player is not in this game.');
    const mine = data.answers.filter((a) => a.playerKey === key);
    const tries = new Map<string, number>();
    for (const a of mine) if (a.kind !== 'self') tries.set(a.questionId, (tries.get(a.questionId) ?? 0) + 1);
    return {
      player: { name: p.name, membership: p.membership, team: p.team, rank: p.rank, score: p.score, leftEarly: p.leftEarly },
      answers: firstTries(mine).map((a) => ({ questionId: a.questionId, ...promptOf(data.questions, a.questionId), given: a.correct ? (a.given ?? null) : shownAnswer(a.given), correct: a.correct, responseMs: a.responseMs, tries: tries.get(a.questionId) ?? 1 })),
    };
  });

  /** Your private note on a report. Only its author ever sees it; an empty note deletes it. */
  app.put('/api/games/:id/note', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = cleanText(parse(z.object({ body: z.string().max(2400) }), req.body).body);
    if (body.length > 2000) throw new AppError(400, 'validation_failed', 'Notes can be up to 2,000 characters.', { body: 'Use at most 2,000 characters.' });
    await gameAccess(db, auth, id);
    if (!body) {
      await db.delete(reportNotes).where(and(eq(reportNotes.gameId, id), eq(reportNotes.authorId, auth.user.id)));
      return { ok: true, note: null };
    }
    const [row] = await db
      .insert(reportNotes)
      .values({ gameId: id, authorId: auth.user.id, body })
      .onConflictDoUpdate({ target: [reportNotes.gameId, reportNotes.authorId], set: { body, updatedAt: new Date() } })
      .returning();
    return { ok: true, note: { body: row!.body, updatedAt: row!.updatedAt.toISOString() } };
  });

  /** Reteach: a new private set in your library from this game's most-missed questions, hardest first. */
  app.post('/api/games/:id/reteach', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ count: z.number().int().min(1).max(30).default(10) }), req.body ?? {});
    const { game, host, teacher } = await gameAccess(db, auth, id);
    if (!host && !teacher) throw forbidden('Only the host or the class teacher can make a reteach set from this game.');
    if (!auth.permissions.has('sets.create')) throw forbidden('Your account cannot make question sets.');
    const set = game.setId ? await loadSet(db, game.setId) : null;
    if (!set || set.deletedAt) throw conflict('The set this game used has been deleted, so its questions cannot be copied.');
    if (set.hiddenAt) throw conflict('The set this game used has been hidden by moderators, so its questions cannot be copied.');
    const data = await loadGame(db, game);
    const missed = analyseQuestions(data.answers).filter((q) => q.wrong > 0);
    const byId = questionsById(set);
    const picked: Question[] = [];
    for (const m of missed) {
      if (picked.length >= body.count) break;
      const q = byId.get(m.questionId);
      if (q) picked.push({ ...q, id: `q${picked.length + 1}` });
    }
    if (!picked.length) throw conflict('Nobody got a question wrong in this game, so there is nothing to reteach.');
    const input = questionSetInputSchema.safeParse({
      title: `Reteach: ${game.setTitle}`.slice(0, 80),
      description: `The questions players found hardest when they played ${modeTitle(game.modeId, game.variantId)} on ${game.endedAt.toISOString().slice(0, 10)}, hardest first.`.slice(0, 500),
      subject: (SUBJECTS as readonly string[]).includes(set.subject) ? set.subject : 'other',
      visibility: 'private',
      questions: picked,
    });
    if (!input.success) throw conflict('Those questions could not be copied into a new set.');
    await assertUploadsUsable(db, input.data.questions);
    const [owned] = await db.select({ n: count() }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id));
    if ((owned?.n ?? 0) >= 500) throw conflict('You have reached the limit of 500 sets. Delete some you no longer use.');
    const d = input.data;
    const [row] = await db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: d.title, description: d.description, subject: d.subject, language: d.language, tags: d.tags, visibility: 'private', questions: d.questions, questionCount: d.questions.length })
      .returning({ id: questionSets.id, title: questionSets.title });
    return { ok: true, set: { id: row!.id, title: row!.title, questionCount: d.questions.length } };
  });

  /** Delete one report: the game's results and every answer in it. Only the host can. */
  app.delete('/api/games/:id/report', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const { game, host } = await gameAccess(db, auth, id);
    if (!host || game.isSolo) throw forbidden('Only the person who hosted this game can delete its report.');
    await db.delete(gameSessions).where(and(eq(gameSessions.id, id), hostedBy(auth.user.id)));
    return { ok: true };
  });

  /* ------------------------------- your report data ------------------------------- */

  app.post('/api/reports/delete-older', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { before } = parse(z.object({ before: day }), req.body);
    const date = new Date(`${before}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new AppError(400, 'validation_failed', 'Choose a real date.', { before: 'Choose a real date.' });
    if (date.getTime() > Date.now() + 86_400_000) throw new AppError(400, 'validation_failed', 'Choose a date that is not in the future.', { before: 'Choose today or an earlier date.' });
    return { ok: true, deleted: await deleteHostedBefore(db, auth.user.id, date) };
  });

  app.get('/api/reports/settings', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [row] = await db.select().from(reportSettings).where(eq(reportSettings.userId, auth.user.id)).limit(1);
    const [games] = await db.select({ n: count(), oldest: sql<string | null>`min(${gameSessions.endedAt})` }).from(gameSessions).where(hostedBy(auth.user.id));
    return { retentionMonths: row?.retentionMonths ?? null, choices: RETENTION_CHOICES, games: games?.n ?? 0, oldest: games?.oldest ? new Date(games.oldest).toISOString() : null };
  });

  app.put('/api/reports/settings', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { retentionMonths } = parse(z.object({ retentionMonths: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24), z.null()]) }), req.body);
    await db
      .insert(reportSettings)
      .values({ userId: auth.user.id, retentionMonths })
      .onConflictDoUpdate({ target: reportSettings.userId, set: { retentionMonths, updatedAt: new Date() } });
    const deleted = retentionMonths ? await deleteHostedBefore(db, auth.user.id, retentionCutoff(retentionMonths)) : 0;
    return { ok: true, retentionMonths, deleted };
  });

  /** Everything Ludora holds about the games you hosted, as one JSON file. Display names only. */
  app.get('/api/reports/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const games = await db.select().from(gameSessions).where(hostedBy(auth.user.id)).orderBy(desc(gameSessions.endedAt)).limit(1000);
    const notes = games.length ? await db.select().from(reportNotes).where(and(eq(reportNotes.authorId, auth.user.id), inArray(reportNotes.gameId, games.map((g) => g.id)))) : [];
    const noteBy = new Map(notes.map((n) => [n.gameId, n]));
    const [settings] = await db.select().from(reportSettings).where(eq(reportSettings.userId, auth.user.id)).limit(1);
    const out = [];
    for (const g of games) {
      const data = await loadGame(db, g);
      const names = new Map(data.players.map((p) => [p.playerKey, p.name]));
      out.push({
        id: g.id,
        mode: modeTitle(g.modeId, g.variantId),
        setTitle: g.setTitle,
        startedAt: g.startedAt.toISOString(),
        endedAt: g.endedAt.toISOString(),
        durationMs: g.durationMs,
        endedBy: g.endedBy,
        roomCode: g.roomCode,
        settings: g.settings,
        common: g.common,
        options: g.options,
        teams: data.teams,
        players: data.players.map((p) => ({ rank: p.rank, name: p.name, guest: p.isGuest, bot: p.isBot, membership: p.membership, team: p.team, score: p.score, result: p.label, answered: p.answered, correct: p.correct, averageMs: p.avgResponseMs, bestStreak: p.bestStreak, leftEarly: p.leftEarly })),
        answers: data.answers.map((a) => ({ player: names.get(a.playerKey) ?? 'Player', question: promptOf(data.questions, a.questionId).prompt, given: a.given, correct: a.correct, kind: a.kind, responseMs: a.responseMs })),
        note: noteBy.get(g.id)?.body ?? null,
      });
    }
    reply.header('content-disposition', `attachment; filename="ludora-hosted-games-${new Date().toISOString().slice(0, 10)}.json"`);
    return {
      about: 'Every game you hosted for a group that Ludora still keeps (newest first, at most 1,000), with its players by display name, every answer, and your private notes.',
      exportedAt: new Date().toISOString(),
      retentionMonths: settings?.retentionMonths ?? null,
      games: out,
    };
  });

  /* --------------------------------- term overview --------------------------------- */

  app.get('/api/reports/overview', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ from: day, to: day.optional() }), req.query);
    const from = new Date(`${q.from}T00:00:00`);
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00`).getTime() + 86_400_000) : new Date(Date.now() + 60_000);
    const inRange = and(hostedBy(auth.user.id), gte(gameSessions.endedAt, from), lt(gameSessions.endedAt, to));
    const week = sql`date_trunc('week', ${gameSessions.endedAt})`;
    const people = sql`(select coalesce(sum(p.correct), 0)::int from game_participants p where p.game_id = ${gameSessions.id} and not p.is_bot)`;
    const answered = sql`(select coalesce(sum(p.answered), 0)::int from game_participants p where p.game_id = ${gameSessions.id} and not p.is_bot)`;
    const [weekly, modes, sets, [totals], [students]] = await Promise.all([
      db
        .select({ weekOf: sql<string>`to_char(${week}, 'YYYY-MM-DD')`, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${people})::int`, answered: sql<number>`sum(${answered})::int` })
        .from(gameSessions)
        .where(inRange)
        .groupBy(week)
        .orderBy(week),
      db.select({ modeId: gameSessions.modeId, games: sql<number>`count(*)::int` }).from(gameSessions).where(inRange).groupBy(gameSessions.modeId).orderBy(desc(sql`count(*)`)).limit(6),
      db
        .select({ setId: gameSessions.setId, title: sql<string>`max(${gameSessions.setTitle})`, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${people})::int`, answered: sql<number>`sum(${answered})::int` })
        .from(gameSessions)
        .where(and(inRange, isNotNull(gameSessions.setId)))
        .groupBy(gameSessions.setId)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
      db.select({ games: sql<number>`count(*)::int`, players: sql<number>`coalesce(sum(${gameSessions.playerCount}), 0)::int`, minutes: sql<number>`coalesce(round(sum(${gameSessions.durationMs}) / 60000.0), 0)::int` }).from(gameSessions).where(inRange),
      db
        .select({ n: sql<number>`count(distinct ${gameParticipants.userId})::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(and(inRange, eq(gameParticipants.isBot, false), eq(gameParticipants.isGuest, false), isNotNull(gameParticipants.userId))),
    ]);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: { games: totals?.games ?? 0, players: totals?.players ?? 0, minutes: totals?.minutes ?? 0, students: students?.n ?? 0 },
      weekly: weekly.map((w) => ({ weekOf: w.weekOf, games: w.games, correct: w.correct ?? 0, answered: w.answered ?? 0 })),
      modes: modes.map((m) => ({ modeId: m.modeId, mode: modeTitle(m.modeId, null), games: m.games })),
      sets: sets.map((s) => ({ setId: s.setId!, title: s.title, games: s.games, correct: s.correct ?? 0, answered: s.answered ?? 0 })),
    };
  });

  /* ------------------------------ one set across games ------------------------------ */

  app.get('/api/reports/sets/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid('No set with that id.') }), req.params);
    const games = await db.select().from(gameSessions).where(and(hostedBy(auth.user.id), eq(gameSessions.setId, id))).orderBy(asc(gameSessions.endedAt)).limit(200);
    // Only sets you have hosted: anything else is "not found", whether or not it exists.
    if (!games.length) throw notFound('You have not hosted a game with that set.');
    const set = await loadSet(db, id);
    const byId = questionsById(set);
    const rows = games.length ? await db.select().from(answerEvents).where(inArray(answerEvents.gameId, games.map((g) => g.id))).orderBy(asc(answerEvents.id)) : [];
    const plays: SetQuestionPlay[] = [];
    for (const g of games) {
      const mine = rows.filter((r) => r.gameId === g.id).map((r) => ({ id: r.id, playerKey: r.playerKey, questionId: r.questionId, correct: r.correct, responseMs: r.responseMs, kind: r.kind, given: r.given }));
      for (const q of analyseQuestions(mine)) plays.push({ gameId: g.id, endedAt: g.endedAt.toISOString(), questionId: q.questionId, players: q.players, right: q.right, avgResponseMs: q.avgResponseMs, commonWrong: q.commonWrong });
    }
    const summary = setPerformance(plays);
    const played = new Set(summary.map((s) => s.questionId));
    return {
      set: { id, title: set?.title ?? games[games.length - 1]!.setTitle, exists: Boolean(set && !set.deletedAt), editable: Boolean(set && set.ownerId === auth.user.id && !set.deletedAt) },
      games: games.map((g) => ({ id: g.id, mode: modeTitle(g.modeId, g.variantId), endedAt: g.endedAt.toISOString(), players: g.playerCount })),
      questions: summary.map((s) => ({ ...s, ...promptOf(byId, s.questionId), inSet: byId.has(s.questionId) })),
      // Questions in the set now that none of your games has asked yet.
      unplayed: [...byId.values()].filter((q) => !played.has(q.id)).map((q) => ({ questionId: q.id, prompt: q.prompt, type: q.type })),
    };
  });

  /* ------------------------------ one student across games ------------------------------ */

  app.get('/api/reports/students', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const roster = await teacherStudents(db, auth.user.id);
    const ids = [...new Set(roster.map((r) => r.userId))];
    const [names, played] = ids.length
      ? await Promise.all([
          db.execute<{ id: string; display_name: string }>(sql`select id, display_name from users where id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`),
          db
            .select({ userId: gameParticipants.userId, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${gameParticipants.correct})::int`, answered: sql<number>`sum(${gameParticipants.answered})::int` })
            .from(gameParticipants)
            .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
            .where(and(hostedBy(auth.user.id), inArray(gameParticipants.userId, ids)))
            .groupBy(gameParticipants.userId),
        ])
      : [{ rows: [] }, []];
    const nameOf = new Map(names.rows.map((r) => [r.id, r.display_name]));
    const playOf = new Map(played.map((p) => [p.userId!, p]));
    return {
      students: ids
        .map((uid) => {
          const p = playOf.get(uid);
          return {
            key: studentKey(secret, auth.user.id, uid),
            name: nameOf.get(uid) ?? 'Student',
            classes: roster.filter((r) => r.userId === uid).map((r) => r.className),
            games: p?.games ?? 0,
            rate: p && p.answered ? (p.correct ?? 0) / p.answered : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  app.get('/api/reports/students/:key', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { key } = parse(z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'No student with that key.') }), req.params);
    // Only students in your own classes: the key is checked against your roster, never trusted.
    const roster = await teacherStudents(db, auth.user.id);
    const uid = roster.find((r) => studentKey(secret, auth.user.id, r.userId) === key)?.userId;
    if (!uid) throw notFound('That student is not in any of your classes.');
    const name = (await db.execute<{ display_name: string }>(sql`select display_name from users where id = ${uid}::uuid`)).rows[0]?.display_name ?? 'Student';
    const games = await db
      .select({ g: gameSessions, correct: gameParticipants.correct, answered: gameParticipants.answered, rank: gameParticipants.rank, leftEarly: gameParticipants.leftEarly, subject: questionSets.subject })
      .from(gameParticipants)
      .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
      .leftJoin(questionSets, eq(questionSets.id, gameSessions.setId))
      .where(and(hostedBy(auth.user.id), eq(gameParticipants.userId, uid)))
      .orderBy(asc(gameSessions.endedAt))
      .limit(300);
    const gameIds = games.map((r) => r.g.id);
    const answers = gameIds.length ? await db.select().from(answerEvents).where(and(inArray(answerEvents.gameId, gameIds), eq(answerEvents.userId, uid))).orderBy(asc(answerEvents.id)) : [];
    const setIds = [...new Set(games.map((r) => r.g.setId).filter((x): x is string => Boolean(x)))];
    const sets = setIds.length ? await db.select().from(questionSets).where(inArray(questionSets.id, setIds)) : [];
    const typeOf = new Map<string, string>();
    for (const s of sets) for (const [qid, q] of questionsById(s)) typeOf.set(`${s.id}:${qid}`, q.type);
    const bySubject = new Map<string, { games: number; correct: number; answered: number }>();
    for (const r of games) {
      const s = bySubject.get(r.subject ?? 'other') ?? { games: 0, correct: 0, answered: 0 };
      s.games++;
      s.correct += r.correct;
      s.answered += r.answered;
      bySubject.set(r.subject ?? 'other', s);
    }
    const byType = new Map<string, { right: number; answered: number }>();
    const rows = answers.map((a) => ({ id: a.id, playerKey: `${a.gameId}:${a.playerKey}`, questionId: `${a.setId}:${a.questionId}`, correct: a.correct, responseMs: a.responseMs, kind: a.kind, given: null }));
    for (const a of firstTries(rows)) {
      const t = typeOf.get(a.questionId) ?? 'unknown';
      const s = byType.get(t) ?? { right: 0, answered: 0 };
      s.answered++;
      if (a.correct) s.right++;
      byType.set(t, s);
    }
    return {
      student: { key, name, classes: [...new Map(roster.filter((r) => r.userId === uid).map((r) => [r.classId, { id: r.classId, name: r.className }])).values()] },
      games: games.map((r) => ({ id: r.g.id, mode: modeTitle(r.g.modeId, r.g.variantId), setTitle: r.g.setTitle, endedAt: r.g.endedAt.toISOString(), correct: r.correct, answered: r.answered, rank: r.rank, players: r.g.playerCount, leftEarly: r.leftEarly })),
      bySubject: [...bySubject].map(([subject, s]) => ({ subject, ...s })).sort((a, b) => b.games - a.games),
      byType: [...byType].map(([type, s]) => ({ type, ...s })).sort((a, b) => b.answered - a.answered),
    };
  });
}

