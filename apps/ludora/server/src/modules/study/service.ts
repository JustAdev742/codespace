import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { DAILY_CHALLENGE_QUESTIONS, MISTAKES_PER_ROUND, questionSchema, roomOptionsSchema, streakEnding, type Question } from '@ludora/shared';
import { getMode } from '@ludora/engine';
import { soloBlocker } from '@ludora/engine/catalog';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents, mistakes, practiceRuns, questionSets } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { AppError, conflict } from '../../lib/errors.ts';
import { addDays, utcDay } from '../../lib/time.ts';
import { dailyPick, dailySample, mistakeStep, questionOutcome } from './logic.ts';

/*
 * Study: the mistakes list, "Fix my mistakes" rounds and the daily challenge.
 * Both kinds of practice are ordinary solo games set up here; rewards follow
 * the usual rules (solo multiplier, daily Spark cap), because the game pays
 * them like any other. Each round is recorded in practice_runs and matched to
 * the saved game by its room code when the game ends.
 */

/** Modes the daily challenge rotates through, if they can be played alone with a question limit. */
const DAILY_MODES = ['classic', 'quick-draw', 'confidence'];
/** The mode for mistakes rounds: every question type, one question at a time, with the answer shown after. */
const MISTAKES_MODE = 'classic';
/** A practice room must end within this long to count. */
const RUN_WINDOW_MS = 6 * 3600_000;

const validQuestions = (raw: unknown): Question[] => ((raw as unknown[]) ?? []).flatMap((q) => {
  const r = questionSchema.safeParse(q);
  return r.success ? [r.data] : [];
});

export function dailyModes(): string[] {
  return DAILY_MODES.filter((id) => {
    const mode = getMode(id);
    return mode && mode.meta.status === 'playable' && !soloBlocker(id, null, {}) && mode.meta.common.fields.includes('questionLimit');
  });
}

/** Today's challenge: a built-in set and a mode, the same for everyone that day. */
export async function dailyChallenge(db: DbOrTx, day = utcDay()) {
  const sets = await db
    .select({ id: questionSets.id, title: questionSets.title, subject: questionSets.subject, cover: questionSets.cover, questions: questionSets.questions })
    .from(questionSets)
    .where(and(eq(questionSets.isOfficial, true), eq(questionSets.visibility, 'public'), isNull(questionSets.hiddenAt)))
    .orderBy(asc(questionSets.seedKey), asc(questionSets.id));
  const usable = sets.filter((s) => validQuestions(s.questions).filter((q) => q.type !== 'flashcard').length >= DAILY_CHALLENGE_QUESTIONS);
  const set = dailyPick(usable, day, 'daily-set');
  const modeId = dailyPick(dailyModes(), day, 'daily-mode');
  if (!set || !modeId) return null;
  const questions = dailySample(validQuestions(set.questions).filter((q) => q.type !== 'flashcard'), DAILY_CHALLENGE_QUESTIONS, day, 'daily-questions');
  return { day, set: { id: set.id, title: set.title, subject: set.subject, cover: set.cover as { glyph: string; hue: number } | null }, modeId, questions };
}

/** Days the player finished a daily challenge, newest first, and their streak. */
export async function dailyHistory(db: DbOrTx, userId: string, today = utcDay()) {
  const rows = await db
    .selectDistinct({ day: practiceRuns.day })
    .from(practiceRuns)
    .where(and(eq(practiceRuns.userId, userId), eq(practiceRuns.kind, 'daily'), isNotNull(practiceRuns.completedAt), gt(practiceRuns.day, addDays(today, -400))))
    .orderBy(desc(practiceRuns.day));
  const days = rows.map((r) => r.day);
  let longest = 0;
  let run = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    run = i < days.length - 1 && days[i] === addDays(days[i + 1]!, 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { days, streak: streakEnding(days, today), longest, doneToday: days[0] === today };
}

function createSoloRoom(deps: AppDeps, auth: AuthContext, init: { modeId: string; set: { id: string | null; title: string; questions: Question[] }; questionLimit: number }) {
  try {
    return deps.rooms.create({
      hostUserId: auth.user.id,
      hostName: auth.user.displayName,
      modeId: init.modeId,
      variantId: null,
      settings: {},
      common: { questionLimit: init.questionLimit },
      options: roomOptionsSchema.parse({ maxPlayers: 1, lateJoin: false }),
      set: init.set,
      solo: true,
    });
  } catch (err) {
    throw new AppError(400, 'validation_failed', (err as Error).message);
  }
}

export async function startDaily(deps: AppDeps, auth: AuthContext) {
  const today = utcDay();
  const challenge = await dailyChallenge(deps.db, today);
  if (!challenge) throw conflict('There is no daily challenge today. Try a game mode instead.');
  const room = createSoloRoom(deps, auth, { modeId: challenge.modeId, set: { id: challenge.set.id, title: challenge.set.title, questions: challenge.questions }, questionLimit: challenge.questions.length });
  await deps.db.insert(practiceRuns).values({ userId: auth.user.id, kind: 'daily', day: today, roomCode: room.code, setId: challenge.set.id, modeId: challenge.modeId });
  return { code: room.code };
}

export interface MistakeView {
  setId: string;
  setTitle: string;
  questionId: string;
  prompt: string;
  type: Question['type'];
  misses: number;
  rightDays: number;
  lastMissedAt: string;
}

/** The player's mistakes with their questions, most missed first. Questions since removed from their set are left out. */
export async function listMistakes(db: DbOrTx, userId: string): Promise<(MistakeView & { question: Question })[]> {
  const rows = await db
    .select({ setId: mistakes.setId, questionId: mistakes.questionId, misses: mistakes.misses, rightDays: mistakes.rightDays, lastMissedAt: mistakes.lastMissedAt, title: questionSets.title, questions: questionSets.questions, hiddenAt: questionSets.hiddenAt })
    .from(mistakes)
    .innerJoin(questionSets, eq(questionSets.id, mistakes.setId))
    .where(eq(mistakes.userId, userId))
    .orderBy(desc(mistakes.misses), desc(mistakes.lastMissedAt))
    .limit(200);
  const out: (MistakeView & { question: Question })[] = [];
  const cache = new Map<string, Map<string, Question>>();
  for (const r of rows) {
    if (r.hiddenAt) continue;
    if (!cache.has(r.setId)) cache.set(r.setId, new Map(validQuestions(r.questions).map((q) => [q.id, q])));
    const q = cache.get(r.setId)!.get(r.questionId);
    if (!q) continue;
    out.push({ setId: r.setId, setTitle: r.title, questionId: r.questionId, prompt: q.prompt, type: q.type, misses: r.misses, rightDays: r.rightDays, lastMissedAt: r.lastMissedAt.toISOString(), question: q });
  }
  return out;
}

/**
 * A round of up to ten mistakes as a solo game. The room's questions get fresh ids (m0, m1...)
 * because two sets can use the same id; the run remembers where each came from. A list shorter
 * than the mode's minimum is topped up with other questions from the same sets.
 */
export async function startMistakes(deps: AppDeps, auth: AuthContext) {
  const list = await listMistakes(deps.db, auth.user.id);
  if (!list.length) throw conflict('You have no mistakes to fix. Questions you get wrong in games show up here.');
  const picked = list.slice(0, MISTAKES_PER_ROUND).map((m) => ({ setId: m.setId, question: m.question }));
  const min = getMode(MISTAKES_MODE)?.meta.minQuestions ?? 3;
  if (picked.length < min) {
    const setIds = [...new Set(picked.map((p) => p.setId))];
    const sets = await deps.db.select({ id: questionSets.id, questions: questionSets.questions }).from(questionSets).where(inArray(questionSets.id, setIds));
    for (const s of sets) {
      for (const q of validQuestions(s.questions)) {
        if (picked.length >= min) break;
        if (!picked.some((p) => p.setId === s.id && p.question.id === q.id)) picked.push({ setId: s.id, question: q });
      }
    }
  }
  if (picked.length < min) throw conflict(`A round needs at least ${min} questions. Play a few more games, then try again.`);
  const questions = picked.map((p, i) => ({ ...p.question, id: `m${i}` }));
  const room = createSoloRoom(deps, auth, { modeId: MISTAKES_MODE, set: { id: null, title: 'My mistakes', questions }, questionLimit: questions.length });
  await deps.db.insert(practiceRuns).values({ userId: auth.user.id, kind: 'mistakes', day: utcDay(), roomCode: room.code, setId: null, modeId: MISTAKES_MODE, questions: picked.map((p, i) => ({ q: `m${i}`, s: p.setId, id: p.question.id })) });
  return { code: room.code, questions: questions.length };
}

/**
 * After a game is saved: update every signed-in player's mistakes list from their answers, and
 * finish the host's practice run if this game was one. Returns notes to add to players' results.
 */
export async function recordStudy(deps: AppDeps, game: { gameId: string; roomCode: string; hostUserId: string }): Promise<Map<string, string[]>> {
  const notes = new Map<string, string[]>();
  const db = deps.db;
  const today = utcDay();
  const [run] = await db
    .select()
    .from(practiceRuns)
    .where(and(eq(practiceRuns.roomCode, game.roomCode), eq(practiceRuns.userId, game.hostUserId), isNull(practiceRuns.gameId), gt(practiceRuns.createdAt, new Date(Date.now() - RUN_WINDOW_MS))))
    .orderBy(desc(practiceRuns.createdAt))
    .limit(1);
  const answers = await db
    .select({ userId: answerEvents.userId, setId: answerEvents.setId, questionId: answerEvents.questionId, correct: answerEvents.correct, kind: answerEvents.kind })
    .from(answerEvents)
    .where(and(eq(answerEvents.gameId, game.gameId), isNotNull(answerEvents.userId)))
    .orderBy(asc(answerEvents.id));

  // A mistakes room's question ids map back to the set and question they came from.
  const origin = new Map<string, { s: string; id: string }>();
  if (run?.kind === 'mistakes') for (const m of (run.questions as { q: string; s: string; id: string }[]) ?? []) origin.set(m.q, { s: m.s, id: m.id });
  const groups = new Map<string, { userId: string; setId: string; questionId: string; records: { correct: boolean; kind: string }[] }>();
  for (const a of answers) {
    const from = run?.kind === 'mistakes' ? origin.get(a.questionId) : a.setId ? { s: a.setId, id: a.questionId } : undefined;
    if (!from || !a.userId) continue;
    const key = `${a.userId}|${from.s}|${from.id}`;
    if (!groups.has(key)) groups.set(key, { userId: a.userId, setId: from.s, questionId: from.id, records: [] });
    groups.get(key)!.records.push({ correct: a.correct, kind: a.kind });
  }

  const cleared = new Map<string, number>();
  const added = new Map<string, number>();
  const answered = new Map<string, number>();
  if (groups.size) {
    const setIds = [...new Set([...groups.values()].map((g) => g.setId))];
    const live = new Set((await db.select({ id: questionSets.id }).from(questionSets).where(inArray(questionSets.id, setIds))).map((r) => r.id));
    const userIds = [...new Set([...groups.values()].map((g) => g.userId))];
    await db.transaction(async (tx) => {
      const existing = await tx.select().from(mistakes).where(and(inArray(mistakes.userId, userIds), inArray(mistakes.setId, setIds))).for('update');
      const byKey = new Map(existing.map((m) => [`${m.userId}|${m.setId}|${m.questionId}`, m]));
      for (const [key, g] of groups) {
        const outcome = questionOutcome(g.records);
        if (outcome === null || !live.has(g.setId)) continue;
        answered.set(g.userId, (answered.get(g.userId) ?? 0) + 1);
        const cur = byKey.get(key);
        const step = mistakeStep(cur ? { misses: cur.misses, rightDays: cur.rightDays, lastRightDay: cur.lastRightDay } : null, outcome, today);
        const where = and(eq(mistakes.userId, g.userId), eq(mistakes.setId, g.setId), eq(mistakes.questionId, g.questionId));
        if (step.action === 'insert') {
          await tx.insert(mistakes).values({ userId: g.userId, setId: g.setId, questionId: g.questionId, ...step.next }).onConflictDoNothing();
          added.set(g.userId, (added.get(g.userId) ?? 0) + 1);
        } else if (step.action === 'update') {
          await tx.update(mistakes).set({ ...step.next, ...(outcome ? {} : { lastMissedAt: new Date() }) }).where(where);
        } else if (step.action === 'delete') {
          await tx.delete(mistakes).where(where);
          cleared.set(g.userId, (cleared.get(g.userId) ?? 0) + 1);
        }
      }
    });
  }

  if (run) {
    const host = game.hostUserId;
    const done = (answered.get(host) ?? 0) >= Math.min(3, run.kind === 'mistakes' ? origin.size : DAILY_CHALLENGE_QUESTIONS);
    await db.update(practiceRuns).set({ gameId: game.gameId, completedAt: done ? new Date() : null }).where(eq(practiceRuns.id, run.id));
    const own: string[] = [];
    if (run.kind === 'daily' && done) {
      const h = await dailyHistory(db, host, today);
      own.push(h.streak > 1 ? `Daily challenge done: ${h.streak} days in a row.` : 'Daily challenge done. Come back tomorrow for the next one.');
    }
    if (run.kind === 'mistakes' && done) {
      const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(mistakes).where(eq(mistakes.userId, host));
      const c = cleared.get(host) ?? 0;
      own.push(`${c ? `${c} ${c === 1 ? 'question' : 'questions'} off your mistakes list. ` : ''}${left?.n ? `${left.n} still to fix. A question goes once you get it right on two different days.` : 'Your mistakes list is clear.'}`);
    }
    if (own.length) notes.set(host, own);
  }
  for (const [userId, n] of added) {
    if (run && userId === game.hostUserId) continue;
    notes.set(userId, [...(notes.get(userId) ?? []), `${n} ${n === 1 ? 'question' : 'questions'} added to My mistakes. Fix them from your home page.`]);
  }
  return notes;
}
