import { eq, sql } from 'drizzle-orm';
import type { RewardSummary } from '@ludora/shared';
import type { AnswerRecord, EngineResults } from '@ludora/engine';
import type { AppDeps } from '../app.ts';
import { answerEvents, gameParticipants, gameSessions, questionSets } from '../db/schema.ts';
import type { PersistOutcome, Room } from './room.ts';
import { applyGameResult, applyHostResult } from '../modules/progression/rewards.ts';

const MAX_ANSWER_ROWS = 10_000;
const QUICK_MS = 5000;
/** At most this many questions count towards one game's rewards, however long it ran. */
export const MAX_REWARDED_QUESTIONS = 40;

/**
 * What a player's answers are worth for rewards, quests and achievements.
 * Each question counts once however many tries it took; self-graded
 * answers never count as correct; streaks and quick answers only count
 * graded responses. This keeps modes that record many small tries (memory
 * pairs, bingo marks, flashcards) from paying more than a quiz.
 */
export function rewardCounts(answers: readonly AnswerRecord[]) {
  const seen = new Set<string>();
  const right = new Set<string>();
  let streak = 0;
  let bestStreak = 0;
  let quick = 0;
  let responseMs = 0;
  for (const a of answers) {
    const kind = a.kind ?? 'answer';
    if (!seen.has(a.qid)) responseMs += Math.max(0, a.responseMs);
    seen.add(a.qid);
    if (a.correct && kind !== 'self') right.add(a.qid);
    if (kind !== 'answer') continue;
    if (a.correct) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      if (a.responseMs < QUICK_MS) quick++;
    } else streak = 0;
  }
  return {
    answered: Math.min(seen.size, MAX_REWARDED_QUESTIONS),
    correct: Math.min(right.size, MAX_REWARDED_QUESTIONS),
    bestStreak,
    quickCorrect: Math.min(quick, MAX_REWARDED_QUESTIONS),
    responseMsTotal: responseMs,
  };
}

/**
 * Save a finished game and pay rewards. The game record is written first in
 * one transaction; each player's rewards then run as their own idempotent
 * operation, so one player's problem never blocks another's rewards.
 */
export async function persistGame(deps: AppDeps, room: Room, results: EngineResults): Promise<PersistOutcome> {
  const gameId = room.gameId!;
  const info = (playerId: string) => room.roster.get(playerId) ?? { userId: null, name: 'Player', isGuest: true, isBot: false };
  const humans = results.standings.filter((s) => !s.isBot).length;
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - results.durationMs);

  await deps.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(gameSessions)
      .values({
        id: gameId,
        roomCode: room.code,
        modeId: room.mode.meta.id,
        variantId: room.variant?.meta.id ?? null,
        hostUserId: room.hostUserId,
        setId: room.set.id,
        setTitle: room.set.title,
        settings: room.settings,
        common: room.common,
        status: results.endedBy === 'error' ? 'error' : 'completed',
        endedBy: results.endedBy,
        playerCount: humans,
        summary: results.summary.slice(0, 300),
        classId: room.classId,
        assignmentId: room.assignmentId,
        isSolo: room.solo,
        startedAt,
        endedAt,
        durationMs: Math.round(results.durationMs),
      })
      .onConflictDoNothing()
      .returning({ id: gameSessions.id });
    if (!inserted.length) return;
    if (results.standings.length) {
      await tx.insert(gameParticipants).values(
        results.standings.map((s) => {
          const who = info(s.playerId);
          return {
            gameId,
            userId: who.userId,
            playerKey: s.playerId,
            displayName: s.name,
            isGuest: who.isGuest,
            isBot: s.isBot,
            teamId: s.teamId,
            rank: s.rank,
            score: Math.round(s.score),
            label: s.label.slice(0, 80),
            answered: s.stats.answered,
            correct: s.stats.correct,
            avgResponseMs: s.stats.answered ? Math.round(s.stats.responseMsSum / s.stats.answered) : 0,
            bestStreak: s.stats.bestStreak,
            leftEarly: s.left,
          };
        }),
      );
    }
    const answers = results.answers.filter((a) => !info(a.playerId).isBot).slice(0, MAX_ANSWER_ROWS);
    for (let i = 0; i < answers.length; i += 1000) {
      await tx.insert(answerEvents).values(
        answers.slice(i, i + 1000).map((a) => ({
          gameId,
          userId: info(a.playerId).userId,
          playerKey: a.playerId,
          setId: room.set.id,
          questionId: a.qid,
          correct: a.correct,
          partial: a.partial,
          responseMs: Math.max(0, Math.round(a.responseMs)),
          kind: a.kind ?? 'answer',
        })),
      );
    }
    if (room.set.id && humans > 0) await tx.update(questionSets).set({ plays: sql`${questionSets.plays} + 1` }).where(eq(questionSets.id, room.set.id));
  });

  const rewards = new Map<string, RewardSummary>();
  for (const s of results.standings) {
    const who = info(s.playerId);
    if (who.isBot) continue;
    if (!who.userId) {
      rewards.set(s.playerId, { status: 'none', sparks: 0, xp: 0, quests: [], achievements: [], notes: ['Sign in before you join to earn Sparks, XP and quest progress.'] });
      continue;
    }
    if (results.endedBy === 'error' && s.stats.answered === 0) continue;
    const counts = rewardCounts(results.answers.filter((a) => a.playerId === s.playerId));
    try {
      const summary = await applyGameResult(deps.db, {
        userId: who.userId,
        gameId,
        modeId: room.mode.meta.id,
        rank: s.rank,
        humans,
        ...counts,
        solo: room.solo || humans === 1,
        teams: room.teams.length > 0,
        outcome: results.outcome,
      });
      if (who.isGuest && summary.status === 'granted') summary.notes.push('Create an account to keep these rewards safe. Your progress comes with you.');
      rewards.set(s.playerId, summary);
    } catch (err) {
      deps.log?.error({ err, gameId, playerId: s.playerId }, 'reward failed');
      rewards.set(s.playerId, { status: 'none', sparks: 0, xp: 0, quests: [], achievements: [], notes: ['Rewards could not be saved for this game.'] });
    }
  }
  const hostPlayed = [...room.roster.values()].some((r) => r.userId === room.hostUserId);
  if (!room.solo && !hostPlayed && humans >= 2) {
    await applyHostResult(deps.db, room.hostUserId, gameId).catch((err) => deps.log?.error({ err, gameId }, 'host reward failed'));
  }
  return { gameId, rewards };
}
