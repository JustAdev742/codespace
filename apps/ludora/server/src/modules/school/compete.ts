import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getMode } from '@ludora/engine';
import { soloBlocker } from '@ludora/engine/catalog';
import { prepareQuestions } from '@ludora/engine';
import { classChallengeInputSchema, questionSchema, tournamentInputSchema, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { assignments, classChallenges, classMembers, classes, gameParticipants, gameSessions, questionSets, tournamentMatches, tournaments } from '../../db/schema.ts';
import { noStore, requireAccount, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { canView, loadSet } from '../sets/access.ts';
import { notify } from '../notifications/service.ts';
import { advanceKnockout, classAccuracy, knockoutBracket, roundRobin, roundRobinTable, tournamentWinner, type MatchSlot } from './logic.ts';

/*
 * Tournaments (a knockout or round robin among classes or named teams, each match a game) and class
 * challenges (two classes play the same set over a week; the mean of each student's best accuracy
 * decides it, so class size does not matter). Teachers run their own; school staff may see all.
 */

const uuid = z.string().uuid();
type Entrant = { name: string; classId: string | null };
const canManage = (auth: AuthContext) => !auth.user.isGuest && auth.permissions.has('school.manage');

async function myClassIds(db: DbOrTx, userId: string): Promise<{ teach: Set<string>; member: Set<string> }> {
  const teach = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.ownerId, userId), isNull(classes.archivedAt)));
  const member = await db.select({ id: classMembers.classId }).from(classMembers).where(eq(classMembers.userId, userId));
  return { teach: new Set(teach.map((t) => t.id)), member: new Set(member.map((m) => m.id)) };
}

/* -------------------------------- tournaments ------------------------------- */

type TournamentRow = typeof tournaments.$inferSelect;
type MatchRow = typeof tournamentMatches.$inferSelect;

async function loadTournament(db: DbOrTx, id: string, auth: AuthContext): Promise<{ t: TournamentRow; owner: boolean }> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
  if (!t) throw notFound('That tournament does not exist.');
  const owner = t.ownerId === auth.user.id;
  if (owner || canManage(auth)) return { t, owner };
  const entrants = t.entrants as Entrant[];
  const mine = await myClassIds(db, auth.user.id);
  if (entrants.some((e) => e.classId && (mine.member.has(e.classId) || mine.teach.has(e.classId)))) return { t, owner };
  throw notFound('That tournament does not exist.');
}

function tournamentView(t: TournamentRow, matches: MatchRow[], owner: boolean) {
  const entrants = t.entrants as Entrant[];
  const slots: MatchSlot[] = matches.map((m) => ({ round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.winner }));
  return {
    id: t.id,
    name: t.name,
    format: t.format as 'knockout' | 'round_robin',
    entrants: entrants.map((e) => ({ name: e.name, isClass: Boolean(e.classId) })),
    matches: matches
      .sort((x, y) => x.round - y.round || x.slot - y.slot)
      .map((m) => ({ id: m.id, round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.winner, aScore: m.aScore, bScore: m.bScore, played: Boolean(m.playedAt), fromGame: Boolean(m.gameId) })),
    table: t.format === 'round_robin' ? roundRobinTable(entrants.length, slots) : null,
    winnerName: t.winnerName,
    finished: Boolean(t.finishedAt),
    owner,
  };
}

/**
 * Record a match result and move the tournament on: the winner into the next knockout round, and
 * the tournament's winner once every match is decided. `winner` is an entrant index, or -1 for a draw.
 */
export async function recordMatch(db: Db, matchId: string, result: { winner: number; aScore: number | null; bScore: number | null; gameId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId)).for('update');
    if (!m) throw notFound('That match does not exist.');
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournamentId)).for('update');
    if (!t) throw notFound('That tournament does not exist.');
    await tx.update(tournamentMatches).set({ winner: result.winner, aScore: result.aScore, bScore: result.bScore, gameId: result.gameId, playedAt: new Date() }).where(eq(tournamentMatches.id, m.id));
    const all = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    let slots: MatchSlot[] = all.map((x) => ({ round: x.round, slot: x.slot, a: x.a, b: x.b, winner: x.id === m.id ? result.winner : x.winner }));
    if (t.format === 'knockout') {
      slots = advanceKnockout(slots);
      for (const s of slots) {
        const row = all.find((x) => x.round === s.round && x.slot === s.slot)!;
        if (row.a !== s.a || row.b !== s.b) await tx.update(tournamentMatches).set({ a: s.a, b: s.b }).where(eq(tournamentMatches.id, row.id));
      }
    }
    const entrants = t.entrants as Entrant[];
    const winners = tournamentWinner(t.format as 'knockout' | 'round_robin', entrants.length, slots);
    if (winners && winners.length) {
      const winnerName = winners.map((w) => entrants[w]!.name).join(' and ');
      await tx.update(tournaments).set({ winnerName, finishedAt: new Date() }).where(eq(tournaments.id, t.id));
    } else if (t.finishedAt) {
      await tx.update(tournaments).set({ winnerName: null, finishedAt: null }).where(eq(tournaments.id, t.id));
    }
  });
}

/** The match a teacher may host now: theirs, both sides known, not yet played. */
export async function hostableMatch(db: DbOrTx, matchId: string, auth: AuthContext) {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId)).limit(1);
  if (!m) throw notFound('That match does not exist.');
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, m.tournamentId)).limit(1);
  if (!t || t.ownerId !== auth.user.id) throw notFound('That match does not exist.');
  if (m.a === null || m.b === null) throw conflict('Both sides of this match are not known yet.');
  if (m.playedAt) throw conflict('This match has already been played.');
  const entrants = t.entrants as Entrant[];
  return { match: m, tournament: t, a: entrants[m.a]!, b: entrants[m.b]! };
}

/* ------------------------------ class challenges ----------------------------- */

type ChallengeRow = typeof classChallenges.$inferSelect;

async function challengeResults(db: DbOrTx, c: ChallengeRow) {
  const side = async (classId: string, assignmentId: string | null) => {
    const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1);
    const members = await db.select({ id: classMembers.userId }).from(classMembers).where(eq(classMembers.classId, classId));
    const ids = members.map((m) => m.id);
    const plays =
      assignmentId && ids.length
        ? await db
            .select({ userId: gameParticipants.userId, correct: gameParticipants.correct, answered: gameParticipants.answered })
            .from(gameParticipants)
            .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
            .where(and(eq(gameSessions.assignmentId, assignmentId), inArray(gameParticipants.userId, ids), gte(gameSessions.endedAt, c.startsAt), lte(gameSessions.endedAt, c.endsAt)))
        : [];
    const r = classAccuracy(plays.filter((p) => p.userId).map((p) => ({ userId: p.userId!, correct: p.correct, answered: p.answered })));
    return { name: cls?.name ?? 'Class', members: ids.length, played: r.students, accuracy: r.accuracy };
  };
  const [a, b] = await Promise.all([side(c.classA, c.assignmentA), side(c.classB, c.assignmentB)]);
  const over = c.endsAt <= new Date();
  let winner: 'a' | 'b' | 'draw' | null = null;
  if (over && c.acceptedAt) {
    if (a.accuracy === null && b.accuracy === null) winner = null;
    else if ((a.accuracy ?? -1) === (b.accuracy ?? -1)) winner = 'draw';
    else winner = (a.accuracy ?? -1) > (b.accuracy ?? -1) ? 'a' : 'b';
  }
  return { a, b, over, winner };
}

function assignableMode(modeId: string) {
  const mode = getMode(modeId);
  if (!mode) throw notFound('That game mode does not exist.');
  const blocker = soloBlocker(mode.meta.id, null, {});
  if (blocker) throw conflict(`${blocker} Challenge games are played alone, like assignments.`);
  return mode;
}

export async function competeRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/school/tournaments', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const mine = await myClassIds(db, auth.user.id);
    const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).limit(200);
    const visible = rows.filter((t) => t.ownerId === auth.user.id || canManage(auth) || (t.entrants as Entrant[]).some((e) => e.classId && (mine.member.has(e.classId) || mine.teach.has(e.classId))));
    return { tournaments: visible.slice(0, 50).map((t) => ({ id: t.id, name: t.name, format: t.format, entrants: (t.entrants as Entrant[]).length, winnerName: t.winnerName, finished: Boolean(t.finishedAt), owner: t.ownerId === auth.user.id })) };
  });

  app.post('/api/school/tournaments', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    if (auth.user.accountType !== 'teacher' && !canManage(auth)) throw forbidden('Tournaments are set up by teachers.');
    const body = parse(tournamentInputSchema, req.body);
    const mine = await myClassIds(db, auth.user.id);
    const classIds = body.entrants.flatMap((e) => (e.classId ? [e.classId] : []));
    if (new Set(classIds).size !== classIds.length) throw new AppError(400, 'validation_failed', 'A class can enter only once.', { entrants: 'A class is listed twice.' });
    if (!canManage(auth) && classIds.some((id) => !mine.teach.has(id))) throw forbidden('You can enter only classes you teach.');
    if (canManage(auth) && classIds.length) {
      const found = await db.select({ id: classes.id }).from(classes).where(inArray(classes.id, classIds));
      if (found.length !== classIds.length) throw notFound('One of those classes does not exist.');
    }
    const names = body.entrants.map((e) => e.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new AppError(400, 'validation_failed', 'Give every entrant a different name.', { entrants: 'Two entrants have the same name.' });
    const slots = body.format === 'knockout' ? knockoutBracket(body.entrants.length) : roundRobin(body.entrants.length);
    const t = await db.transaction(async (tx) => {
      const [row] = await tx.insert(tournaments).values({ ownerId: auth.user.id, name: body.name, format: body.format, entrants: body.entrants }).returning();
      await tx.insert(tournamentMatches).values(slots.map((s) => ({ tournamentId: row!.id, round: s.round, slot: s.slot, a: s.a, b: s.b, winner: s.winner, playedAt: s.winner !== null ? new Date() : null })));
      return row!;
    });
    return { tournament: { id: t.id } };
  });

  app.get('/api/school/tournaments/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { t, owner } = await loadTournament(db, id, auth);
    const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    return { tournament: tournamentView(t, matches, owner) };
  });

  /** The teacher records a result by hand, for a game played some other way. */
  app.post('/api/school/tournaments/:id/matches/:mid', async (req) => {
    const auth = requireAccount(req);
    const { id, mid } = parse(z.object({ id: uuid, mid: uuid }), req.params);
    const body = parse(z.object({ winner: z.enum(['a', 'b', 'draw']), aScore: z.number().int().min(0).max(1_000_000).nullable().default(null), bScore: z.number().int().min(0).max(1_000_000).nullable().default(null) }), req.body);
    const { t, owner } = await loadTournament(db, id, auth);
    if (!owner) throw forbidden('Only the teacher who set up this tournament can record results.');
    const [m] = await db.select().from(tournamentMatches).where(and(eq(tournamentMatches.id, mid), eq(tournamentMatches.tournamentId, t.id))).limit(1);
    if (!m) throw notFound('That match does not exist.');
    if (m.a === null || m.b === null) throw conflict('Both sides of this match are not known yet.');
    if (body.winner === 'draw' && t.format === 'knockout') throw conflict('A knockout match needs a winner.');
    if (t.format === 'knockout' && m.playedAt) {
      const later = await db.select({ id: tournamentMatches.id }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, t.id), sql`${tournamentMatches.round} > ${m.round}`, sql`${tournamentMatches.playedAt} is not null`, sql`${tournamentMatches.a} is not null and ${tournamentMatches.b} is not null`)).limit(1);
      if (later.length) throw conflict('A later round has been played, so this result can no longer change.');
    }
    await recordMatch(db, m.id, { winner: body.winner === 'draw' ? -1 : body.winner === 'a' ? m.a : m.b, aScore: body.aScore, bScore: body.bScore, gameId: null });
    const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    const [fresh] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    return { tournament: tournamentView(fresh!, matches, true) };
  });

  app.delete('/api/school/tournaments/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { t, owner } = await loadTournament(db, id, auth);
    if (!owner) throw forbidden('Only the teacher who set up this tournament can delete it.');
    await db.delete(tournaments).where(eq(tournaments.id, t.id));
    return { ok: true };
  });

  /* ---------------------------- class challenges ---------------------------- */

  app.get('/api/school/challenges', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const mine = await myClassIds(db, auth.user.id);
    const ids = [...mine.teach, ...mine.member];
    if (!ids.length) return { challenges: [] };
    const rows = await db
      .select({ c: classChallenges, setTitle: questionSets.title })
      .from(classChallenges)
      .innerJoin(questionSets, eq(questionSets.id, classChallenges.setId))
      .where(or(inArray(classChallenges.classA, ids), inArray(classChallenges.classB, ids)))
      .orderBy(desc(classChallenges.createdAt))
      .limit(30);
    const out = [];
    for (const { c, setTitle } of rows) {
      const teachesA = mine.teach.has(c.classA);
      const teachesB = mine.teach.has(c.classB);
      // Students see a challenge once both teachers have agreed to it.
      if (!teachesA && !teachesB && !c.acceptedAt) continue;
      const mode = getMode(c.modeId);
      out.push({
        id: c.id,
        setTitle,
        mode: mode?.meta.title ?? c.modeId,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        accepted: Boolean(c.acceptedAt),
        canAccept: teachesB && !c.acceptedAt,
        canCancel: (c.createdBy === auth.user.id || teachesB) && !c.acceptedAt,
        mySide: mine.teach.has(c.classA) || mine.member.has(c.classA) ? 'a' : 'b',
        ...(await challengeResults(db, c)),
      });
    }
    return { challenges: out };
  });

  app.post('/api/school/challenges', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    if (auth.user.accountType !== 'teacher') throw forbidden('Class challenges are set up by teachers.');
    const body = parse(classChallengeInputSchema, req.body);
    const [mine] = await db.select().from(classes).where(and(eq(classes.id, body.classId), eq(classes.ownerId, auth.user.id), isNull(classes.archivedAt))).limit(1);
    if (!mine) throw notFound('That class is not one of yours.');
    const [other] = await db.select().from(classes).where(and(eq(classes.joinCode, body.otherCode.toUpperCase()), isNull(classes.archivedAt))).limit(1);
    if (!other) throw new AppError(404, 'not_found', 'No class with that join code. Ask the other teacher for their class code.', { otherCode: 'No class with that code.' });
    if (other.id === mine.id) throw new AppError(400, 'validation_failed', 'Choose a different class to challenge.', { otherCode: 'That is the same class.' });
    if (Date.parse(body.endsAt) <= Date.now()) throw new AppError(400, 'validation_failed', 'That challenge would already be over.', { endsAt: 'Choose an end in the future.' });
    const set = await loadSet(db, body.setId);
    if (!set || !canView(set, auth)) throw notFound('That question set does not exist or is private to someone else.');
    const mode = assignableMode(body.modeId);
    const questions: Question[] = ((set.questions as unknown[]) ?? []).flatMap((raw) => {
      const r = questionSchema.safeParse(raw);
      return r.success ? [r.data] : [];
    });
    const { problem } = prepareQuestions(mode, questions, 0);
    if (problem) throw conflict(`${problem} Choose another set or game mode.`);
    const [c] = await db.insert(classChallenges).values({ createdBy: auth.user.id, classA: mine.id, classB: other.id, setId: set.id, modeId: mode.meta.id, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) }).returning();
    if (other.ownerId === auth.user.id) await accept(db, c!, auth);
    else await notify(db, { userId: other.ownerId, kind: 'school', title: `${mine.name} challenged ${other.name}`, body: `${set.title}, played in your own time. Accept it in School.`, link: '/school?tab=compete', dedupeKey: `challenge:${c!.id}` });
    return { challenge: { id: c!.id } };
  });

  /** The challenged class's teacher accepts: both classes get the same assignment for the same dates. */
  async function accept(tx: Db, c: ChallengeRow, auth: AuthContext) {
    const [a] = await tx.select().from(classes).where(eq(classes.id, c.classA)).limit(1);
    const [b] = await tx.select().from(classes).where(eq(classes.id, c.classB)).limit(1);
    if (!a || !b) throw notFound('One of the classes has gone.');
    const title = `Class challenge: ${a.name} v ${b.name}`.slice(0, 80);
    const instructions = 'Play in your own time. Your class score is the average of everyone’s best accuracy, so every player counts the same.';
    await tx.transaction(async (t) => {
      const [locked] = await t.select().from(classChallenges).where(and(eq(classChallenges.id, c.id), isNull(classChallenges.acceptedAt))).for('update');
      if (!locked) throw conflict('This challenge has already been accepted.');
      const make = async (classId: string, createdBy: string) =>
        (await t.insert(assignments).values({ classId, setId: c.setId, modeId: c.modeId, variantId: null, title, instructions, dueAt: c.endsAt, opensAt: c.startsAt, closesAt: c.endsAt, maxAttempts: null, createdBy }).returning({ id: assignments.id }))[0]!.id;
      const assignmentA = await make(a.id, a.ownerId);
      const assignmentB = await make(b.id, b.ownerId);
      await t.update(classChallenges).set({ acceptedAt: new Date(), assignmentA, assignmentB }).where(eq(classChallenges.id, c.id));
    });
    if (a.ownerId !== auth.user.id) await notify(tx, { userId: a.ownerId, kind: 'school', title: `${b.name} accepted your challenge`, body: 'The assignment is in both classes.', link: '/school?tab=compete', dedupeKey: `challenge-ok:${c.id}` });
  }

  app.post('/api/school/challenges/:id/accept', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const [c] = await db.select().from(classChallenges).where(eq(classChallenges.id, id)).limit(1);
    if (!c) throw notFound('That challenge does not exist.');
    const [b] = await db.select().from(classes).where(eq(classes.id, c.classB)).limit(1);
    if (!b || b.ownerId !== auth.user.id) throw notFound('That challenge does not exist.');
    if (c.endsAt <= new Date()) throw conflict('This challenge has already ended.');
    await accept(db, c, auth);
    return { ok: true };
  });

  app.delete('/api/school/challenges/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const [c] = await db.select().from(classChallenges).where(eq(classChallenges.id, id)).limit(1);
    if (!c) throw notFound('That challenge does not exist.');
    const [b] = await db.select().from(classes).where(eq(classes.id, c.classB)).limit(1);
    if (c.createdBy !== auth.user.id && b?.ownerId !== auth.user.id) throw notFound('That challenge does not exist.');
    if (c.acceptedAt) throw conflict('Both classes have this challenge as an assignment now. Delete the assignment in each class instead.');
    await db.delete(classChallenges).where(eq(classChallenges.id, id));
    return { ok: true };
  });

}
