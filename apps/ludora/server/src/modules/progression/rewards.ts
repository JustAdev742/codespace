import { eq, sql } from 'drizzle-orm';
import type { RewardSummary } from '@ludora/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import { userStats } from '../../db/schema.ts';
import { addDays, utcDay } from '../../lib/time.ts';
import { getRules, type EconomyRules } from '../economy/config.ts';
import { credit, withOperation } from '../economy/service.ts';
import { checkAchievements } from './achievements.ts';
import { addXp } from './levels.ts';
import { bumpQuests } from './quests.ts';

/*
 * Turning a finished game into Sparks, XP, stats, quest progress and
 * achievements. Each player's rewards for a game run as one idempotent
 * operation keyed by the game id, so a retried save can never pay twice.
 */

export interface GameRewardInput {
  rank: number;
  /** Human players in the game, bots excluded. */
  humans: number;
  answered: number;
  correct: number;
  solo: boolean;
  outcome: 'competitive' | 'coop-win' | 'coop-loss';
  sparksToday: number;
}

export interface GameReward {
  eligible: boolean;
  sparks: number;
  xp: number;
  capped: boolean;
  podium: boolean;
  win: boolean;
  note: string | null;
}

/** Pure reward maths, kept separate so the rules are easy to test and to tune. */
export function computeGameReward(rules: EconomyRules, i: GameRewardInput): GameReward {
  const g = rules.game;
  const contested = i.humans >= 3 && !i.solo;
  const podium = i.outcome === 'coop-win' ? !i.solo && i.humans >= 2 : contested && i.rank <= 3;
  const win = i.outcome === 'competitive' && contested && i.rank === 1;
  if (i.answered < g.minAnswered) {
    return { eligible: false, sparks: 0, xp: 0, capped: false, podium: false, win: false, note: `Answer at least ${g.minAnswered} questions in a game to earn rewards.` };
  }
  let place = 0;
  if (i.outcome === 'coop-win' && !i.solo) place = g.placeSparks[1] ?? 0;
  else if (i.outcome === 'competitive' && contested) place = g.placeSparks[i.rank - 1] ?? 0;
  const mult = i.solo ? g.soloMultiplier : 1;
  const sparks = Math.round((g.participationSparks + i.correct * g.sparksPerCorrect + place) * mult);
  const remaining = Math.max(0, g.dailySparkCap - i.sparksToday);
  const granted = Math.min(sparks, remaining);
  const xp = Math.round((g.xpParticipation + i.correct * g.xpPerCorrect + (win ? g.xpWin : 0)) * mult);
  return {
    eligible: true,
    sparks: granted,
    xp,
    capped: granted < sparks,
    podium,
    win,
    note: granted < sparks ? 'You reached today\'s Spark limit from games. XP and quests still count, and the limit resets at midnight UTC.' : null,
  };
}

export interface PlayerGameRecord {
  userId: string;
  gameId: string;
  modeId: string;
  rank: number;
  humans: number;
  answered: number;
  correct: number;
  bestStreak: number;
  responseMsTotal: number;
  quickCorrect: number;
  solo: boolean;
  teams: boolean;
  outcome: GameRewardInput['outcome'];
}

async function lockStats(tx: DbOrTx, userId: string) {
  await tx.insert(userStats).values({ userId }).onConflictDoNothing();
  const rows = await tx.select().from(userStats).where(eq(userStats.userId, userId)).for('update');
  return rows[0]!;
}

export async function applyGameResult(db: Db, r: PlayerGameRecord): Promise<RewardSummary> {
  const rules = await getRules(db);
  const op = await withOperation(db, r.userId, `game:${r.gameId}`, 'game_reward', async (tx, opId) => {
    const today = utcDay();
    const stats = await lockStats(tx, r.userId);
    const sparksToday = stats.sparksDay === today ? stats.sparksToday : 0;
    const reward = computeGameReward(rules, { ...r, sparksToday });
    const notes: string[] = [];
    if (reward.note) notes.push(reward.note);

    // Daily streak: the first finished game of each UTC day extends (or restarts) it.
    let streak = stats.dailyStreak;
    let streakBonus = 0;
    let streakMoonstones = 0;
    const newDay = stats.lastPlayDay !== today && reward.eligible;
    if (newDay) {
      streak = stats.lastPlayDay === addDays(today, -1) ? stats.dailyStreak + 1 : 1;
      streakBonus = rules.dailyStreak.sparksPerDay * Math.min(streak, rules.dailyStreak.maxBonusDays);
      if (streak % 7 === 0) streakMoonstones = rules.dailyStreak.moonstonesOnWeek;
    }

    const modes = { ...((stats.modesPlayed as Record<string, number>) ?? {}) };
    modes[r.modeId] = (modes[r.modeId] ?? 0) + 1;
    await tx
      .update(userStats)
      .set({
        gamesPlayed: sql`${userStats.gamesPlayed} + 1`,
        gamesWon: sql`${userStats.gamesWon} + ${reward.win ? 1 : 0}`,
        podiums: sql`${userStats.podiums} + ${reward.podium ? 1 : 0}`,
        questionsAnswered: sql`${userStats.questionsAnswered} + ${r.answered}`,
        questionsCorrect: sql`${userStats.questionsCorrect} + ${r.correct}`,
        bestStreak: sql`greatest(${userStats.bestStreak}, ${r.bestStreak})`,
        totalResponseMs: sql`${userStats.totalResponseMs} + ${Math.round(r.responseMsTotal)}`,
        modesPlayed: modes,
        sparksToday: sparksToday + reward.sparks,
        sparksDay: today,
        ...(newDay ? { dailyStreak: streak, longestDailyStreak: Math.max(stats.longestDailyStreak, streak), lastPlayDay: today } : {}),
        updatedAt: new Date(),
      })
      .where(eq(userStats.userId, r.userId));

    if (reward.sparks) await credit(tx, { userId: r.userId, currency: 'sparks', amount: reward.sparks, reason: 'game_reward', refType: 'game', refId: r.gameId, opId });
    if (streakBonus) {
      await credit(tx, { userId: r.userId, currency: 'sparks', amount: streakBonus, reason: 'streak_reward', refType: 'streak', refId: String(streak), opId });
      notes.push(`Day ${streak} streak: +${streakBonus} Sparks.`);
    }
    if (streakMoonstones) {
      await credit(tx, { userId: r.userId, currency: 'moonstones', amount: streakMoonstones, reason: 'streak_reward', refType: 'streak', refId: String(streak), opId });
      notes.push(`A full week in a row: +${streakMoonstones} Moonstones.`);
    }
    const xp = reward.xp ? await addXp(tx, r.userId, reward.xp, rules, opId) : null;
    if (xp && xp.to > xp.from) {
      const extra = [xp.rewards.sparks ? `${xp.rewards.sparks} Sparks` : '', xp.rewards.moonstones ? `${xp.rewards.moonstones} Moonstones` : ''].filter(Boolean).join(' and ');
      notes.push(`Level ${xp.to}!${extra ? ` +${extra}.` : ''}`);
    }
    const quests = reward.eligible
      ? await bumpQuests(tx, r.userId, {
          games_played: 1,
          correct_answers: r.correct,
          podiums: reward.podium ? 1 : 0,
          wins: reward.win ? 1 : 0,
          distinct_modes: 1,
          quick_answers: r.quickCorrect,
          streak_in_game: r.bestStreak,
          team_games: r.teams ? 1 : 0,
        })
      : [];
    const unlocked = await checkAchievements(tx, r.userId, opId);
    const summary: RewardSummary = {
      status: reward.eligible ? 'granted' : 'none',
      sparks: reward.sparks + streakBonus + (xp?.rewards.sparks ?? 0),
      xp: reward.xp,
      ...(xp && xp.to > xp.from ? { levelUp: { from: xp.from, to: xp.to } } : {}),
      quests,
      achievements: unlocked.map((a) => ({ title: a.title })),
      notes,
    };
    return summary;
  });
  return op.result;
}

/** Hosting a game with at least two human players earns XP and counts towards hosting quests. */
export async function applyHostResult(db: Db, hostUserId: string, gameId: string): Promise<void> {
  const rules = await getRules(db);
  await withOperation(db, hostUserId, `host:${gameId}`, 'host_reward', async (tx, opId) => {
    await lockStats(tx, hostUserId);
    await tx.update(userStats).set({ gamesHosted: sql`${userStats.gamesHosted} + 1`, updatedAt: new Date() }).where(eq(userStats.userId, hostUserId));
    await addXp(tx, hostUserId, rules.game.xpHost, rules, opId);
    await bumpQuests(tx, hostUserId, { games_hosted: 1 });
    await checkAchievements(tx, hostUserId, opId);
    return { ok: true };
  });
}
