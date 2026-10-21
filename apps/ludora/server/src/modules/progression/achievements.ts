import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { achievements, collections, inventory, items, questionSets, userAchievements, userStats, users } from '../../db/schema.ts';
import { credit } from '../economy/service.ts';
import { grantItem } from '../inventory/service.ts';

export interface UnlockNote {
  id: string;
  title: string;
}

async function metricValues(tx: DbOrTx, userId: string): Promise<Record<string, number>> {
  const [stats] = await tx.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
  const [user] = await tx.select({ level: users.level }).from(users).where(eq(users.id, userId)).limit(1);
  const [glims] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(inventory)
    .innerJoin(items, eq(items.id, inventory.itemId))
    .where(and(eq(inventory.userId, userId), eq(items.type, 'glim'), sql`${inventory.quantity} > 0`));
  const [sets] = await tx.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(eq(questionSets.ownerId, userId));
  const completed = await completedCollections(tx, userId);
  return {
    games_played: stats?.gamesPlayed ?? 0,
    games_won: stats?.gamesWon ?? 0,
    podiums: stats?.podiums ?? 0,
    questions_correct: stats?.questionsCorrect ?? 0,
    best_streak: stats?.bestStreak ?? 0,
    games_hosted: stats?.gamesHosted ?? 0,
    daily_streak: stats?.longestDailyStreak ?? 0,
    distinct_modes: Object.keys((stats?.modesPlayed as Record<string, number>) ?? {}).length,
    packs_opened: stats?.packsOpened ?? 0,
    level: user?.level ?? 1,
    glims_owned: glims?.n ?? 0,
    sets_created: sets?.n ?? 0,
    collections_completed: completed.length,
  };
}

/** Collections where the player owns every live item. */
export async function completedCollections(tx: DbOrTx, userId: string): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    select c.id from ${collections} c
    where exists (select 1 from ${items} i where i.collection_id = c.id and i.release_state = 'live')
      and not exists (
        select 1 from ${items} i
        where i.collection_id = c.id and i.release_state = 'live'
          and not exists (select 1 from ${inventory} inv where inv.user_id = ${userId} and inv.item_id = i.id and inv.quantity > 0)
      )`);
  return rows.rows.map((r) => r.id);
}

/** Unlock anything newly earned and pay its reward straight away. Idempotent: an achievement unlocks once. */
export async function checkAchievements(tx: DbOrTx, userId: string, opId: number): Promise<UnlockNote[]> {
  const values = await metricValues(tx, userId);
  const all = await tx.select().from(achievements);
  const have = new Set((await tx.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId))).map((r) => r.id));
  const notes: UnlockNote[] = [];
  for (const a of all) {
    if (have.has(a.id) || (values[a.metric] ?? 0) < a.target) continue;
    const inserted = await tx.insert(userAchievements).values({ userId, achievementId: a.id, claimedAt: new Date() }).onConflictDoNothing().returning();
    if (!inserted.length) continue;
    const reward = a.reward as { sparks?: number; moonstones?: number; itemId?: string };
    if (reward.sparks) await credit(tx, { userId, currency: 'sparks', amount: reward.sparks, reason: 'achievement_reward', refType: 'achievement', refId: a.id, opId });
    if (reward.moonstones) await credit(tx, { userId, currency: 'moonstones', amount: reward.moonstones, reason: 'achievement_reward', refType: 'achievement', refId: a.id, opId });
    if (reward.itemId) await grantItem(tx, { userId, itemId: reward.itemId, source: `achievement:${a.id}` });
    notes.push({ id: a.id, title: a.title });
  }
  return notes;
}
