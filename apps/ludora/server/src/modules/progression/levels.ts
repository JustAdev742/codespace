import { eq, sql } from 'drizzle-orm';
import { levelFromXp } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { users } from '../../db/schema.ts';
import type { EconomyRules } from '../economy/config.ts';
import { credit } from '../economy/service.ts';

export interface XpResult {
  xp: number;
  from: number;
  to: number;
  rewards: { sparks: number; moonstones: number };
}

/** Add XP and pay level-up rewards for every level crossed. Call inside the caller's operation. */
export async function addXp(tx: DbOrTx, userId: string, amount: number, rules: EconomyRules, opId: number): Promise<XpResult> {
  const rows = await tx
    .update(users)
    .set({ xp: sql`${users.xp} + ${Math.max(0, Math.round(amount))}` })
    .where(eq(users.id, userId))
    .returning({ xp: users.xp, level: users.level });
  const row = rows[0]!;
  const from = row.level;
  const to = levelFromXp(row.xp).level;
  const rewards = { sparks: 0, moonstones: 0 };
  if (to > from) {
    await tx.update(users).set({ level: to }).where(eq(users.id, userId));
    for (let lvl = from + 1; lvl <= to; lvl++) {
      rewards.sparks += rules.levelUp.sparks;
      if (lvl % rules.levelUp.moonstonesEvery === 0) rewards.moonstones += rules.levelUp.moonstones;
    }
    if (rewards.sparks) await credit(tx, { userId, currency: 'sparks', amount: rewards.sparks, reason: 'level_reward', refType: 'level', refId: String(to), opId });
    if (rewards.moonstones) await credit(tx, { userId, currency: 'moonstones', amount: rewards.moonstones, reason: 'level_reward', refType: 'level', refId: String(to), opId });
  }
  return { xp: row.xp, from, to, rewards };
}
