import { inArray } from 'drizzle-orm';
import type { AppDeps } from '../../app.ts';
import { equipped, items, userStats } from '../../db/schema.ts';
import { grantItem } from '../inventory/service.ts';
import { getRules } from './config.ts';
import { credit, ensureWallets, withOperation } from './service.ts';

/** Starting wallet, stats row, welcome Sparks and starter Glims. Runs once per account (idempotent). */
export async function afterAccountCreated(deps: Pick<AppDeps, 'db'>, userId: string): Promise<void> {
  const rules = await getRules(deps.db);
  await withOperation(deps.db, userId, 'welcome-v1', 'welcome', async (tx, opId) => {
    await ensureWallets(tx, userId);
    await tx.insert(userStats).values({ userId }).onConflictDoNothing();
    if (rules.welcomeSparks > 0) await credit(tx, { userId, currency: 'sparks', amount: rules.welcomeSparks, reason: 'welcome', opId });
    const starters = rules.starterItems.length
      ? await tx.select({ id: items.id }).from(items).where(inArray(items.id, rules.starterItems))
      : [];
    for (const s of starters) await grantItem(tx, { userId, itemId: s.id, source: 'welcome' });
    const first = rules.starterItems.find((id) => starters.some((s) => s.id === id));
    if (first) await tx.insert(equipped).values({ userId, slot: 'buddy', itemId: first }).onConflictDoNothing();
    return { sparks: rules.welcomeSparks, items: starters.map((s) => s.id) };
  });
}
