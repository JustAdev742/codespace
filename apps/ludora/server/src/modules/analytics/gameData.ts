import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Question } from '@ludora/shared';
import { teachesClass } from '../classes/access.ts';
import { getMode } from '@ludora/engine';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents, classMembers, classes, gameParticipants, gameSessions, reportNotes } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { notFound } from '../../lib/errors.ts';
import { loadSet } from '../sets/access.ts';
import { questionsById } from './report.ts';
import {
  analyseQuestions,
  hardestAndEasiest,
  misconceptions,
  pace,
  participation,
  possiblyGuessing,
  teamReport,
  type AnswerRow,
  type PlayerRow,
  type QuestionAnalysis,
  type TeamRow,
} from './analysis.ts';

export type GameRow = typeof gameSessions.$inferSelect;
export type Membership = 'class' | 'account' | 'guest' | 'bot';

/**
 * Who may open a game's report: the host, the teacher of the class it was played in, or staff
 * who can look up accounts. Anyone else (another teacher, a student who played in it) gets the
 * same 404 as for a game that does not exist.
 */
export async function gameAccess(db: DbOrTx, auth: AuthContext, id: string): Promise<{ game: GameRow; host: boolean; teacher: boolean }> {
  const [g] = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).limit(1);
  if (!g) throw notFound('That game does not exist.');
  const host = g.hostUserId === auth.user.id;
  let teacher = false;
  if (!host && g.classId) {
    // The class's owner or one of its co-teachers.
    teacher = await teachesClass(db, g.classId, auth.user.id);
  }
  if (!host && !teacher && !auth.permissions.has('users.read')) throw notFound('That game does not exist.');
  return { game: g, host, teacher };
}

export interface LoadedGame {
  players: (PlayerRow & { rank: number; label: string; avgResponseMs: number; bestStreak: number; membership: Membership; team: string | null; userId: string | null })[];
  answers: AnswerRow[];
  questions: Map<string, Question>;
  teams: TeamRow[];
  pacing: string;
}

/** A finished game's players, answers and questions, as the analysis functions take them. */
export async function loadGame(db: DbOrTx, g: GameRow): Promise<LoadedGame> {
  const [parts, rows, set] = await Promise.all([
    db.select().from(gameParticipants).where(eq(gameParticipants.gameId, g.id)).orderBy(asc(gameParticipants.rank), asc(gameParticipants.id)),
    db.select().from(answerEvents).where(eq(answerEvents.gameId, g.id)).orderBy(asc(answerEvents.id)),
    g.setId ? loadSet(db, g.setId) : Promise.resolve(null),
  ]);
  // "Your student": in the class the game was hosted for or, for a game with no class, in any class the host teaches.
  const memberIds = new Set<string>();
  const ids = parts.filter((p) => !p.isGuest).map((p) => p.userId).filter((x): x is string => Boolean(x));
  const inClass = g.classId ? eq(classMembers.classId, g.classId) : g.hostUserId ? eq(classes.ownerId, g.hostUserId) : null;
  if (ids.length && inClass) {
    const rows = await db.select({ userId: classMembers.userId }).from(classMembers).innerJoin(classes, eq(classes.id, classMembers.classId)).where(and(inClass, inArray(classMembers.userId, ids)));
    for (const m of rows) memberIds.add(m.userId);
  }
  const teams: TeamRow[] = Array.isArray(g.teams)
    ? (g.teams as { teamId: string; name: string; rank?: number; score?: number; label?: string }[]).map((t) => ({ teamId: String(t.teamId), name: String(t.name), rank: t.rank ?? null, score: t.score ?? null, label: t.label ?? null }))
    : [];
  const teamName = new Map(teams.map((t) => [t.teamId, t.name]));
  return {
    players: parts.map((p) => ({
      playerKey: p.playerKey,
      name: p.displayName,
      isBot: p.isBot,
      isGuest: p.isGuest,
      teamId: p.teamId,
      answered: p.answered,
      correct: p.correct,
      leftEarly: p.leftEarly,
      score: p.score,
      rank: p.rank,
      label: p.label,
      avgResponseMs: p.avgResponseMs,
      bestStreak: p.bestStreak,
      membership: p.isBot ? 'bot' : p.userId && memberIds.has(p.userId) ? 'class' : p.isGuest || !p.userId ? 'guest' : 'account',
      team: p.teamId ? (teamName.get(p.teamId) ?? null) : null,
      userId: p.userId,
    })),
    answers: rows.map((r) => ({ id: r.id, playerKey: r.playerKey, questionId: r.questionId, correct: r.correct, responseMs: r.responseMs, kind: r.kind, given: r.given })),
    questions: questionsById(set),
    teams,
    pacing: getMode(g.modeId)?.meta.pacing ?? 'host',
  };
}

export function promptOf(questions: Map<string, Question>, id: string) {
  const q = questions.get(id);
  return { prompt: q?.prompt ?? 'A question that is no longer in the set', type: q?.type ?? 'unknown' };
}

/** The question table, the lists a teacher acts on, and the totals, for one group of players. */
export function questionView(answers: readonly AnswerRow[], questions: Map<string, Question>) {
  const analysed = analyseQuestions(answers);
  const { hardest, easiest } = hardestAndEasiest(analysed);
  return {
    questions: analysed.map((q: QuestionAnalysis) => ({ ...q, ...promptOf(questions, q.questionId) })),
    misconceptions: misconceptions(analysed).map((q) => q.questionId),
    hardest: hardest.map((q) => q.questionId),
    easiest: easiest.map((q) => q.questionId),
    totals: { answered: analysed.reduce((n, q) => n + q.players, 0), right: analysed.reduce((n, q) => n + q.right, 0) },
  };
}

/** Everything the game report page shows that is worked out from the answers. */
export async function buildReport(db: DbOrTx, g: GameRow, auth: AuthContext) {
  const data = await loadGame(db, g);
  const people = data.players.filter((p) => !p.isBot);
  const guests = new Set(people.filter((p) => p.membership === 'guest').map((p) => p.playerKey));
  const all = questionView(data.answers, data.questions);
  const [note] = await db.select().from(reportNotes).where(and(eq(reportNotes.gameId, g.id), eq(reportNotes.authorId, auth.user.id))).limit(1);
  const analysed = analyseQuestions(data.answers);
  return {
    data,
    view: all,
    // The same without guests, for "Leave guests out of the totals".
    viewAccounts: guests.size && guests.size < people.length ? questionView(data.answers.filter((a) => !guests.has(a.playerKey)), data.questions) : null,
    participation: participation(data.players, data.answers),
    guessing: possiblyGuessing(data.players, data.answers, analysed),
    teams: teamReport(data.players, data.teams, data.answers),
    pace: data.pacing === 'host' ? null : pace(data.players, data.answers, g.durationMs),
    note: note ? { body: note.body, updatedAt: note.updatedAt.toISOString() } : null,
  };
}
