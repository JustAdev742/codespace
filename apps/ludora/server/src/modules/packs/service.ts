import { and, eq, inArray, sql } from 'drizzle-orm';
import { dropTableSchema, RARITIES, RARITY_INFO, type DropTable, type Rarity } from '@ludora/shared';
import { MONTHLY_PREFIX } from '@ludora/content';
import type { DbOrTx } from '../../db/client.ts';
import { economyOps, inventory, items, packOpenings, packs, pityCounters, userStats } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { secureRandom } from '../../lib/crypto.ts';
import { credit } from '../economy/service.ts';
import { grantItem } from '../inventory/service.ts';
import { bumpQuests } from '../progression/quests.ts';
import { checkAchievements, completedCollections } from '../progression/achievements.ts';
import { collections as collectionsTable } from '../../db/schema.ts';

export type PackRow = typeof packs.$inferSelect;

export interface PoolItem {
  id: string;
  name: string;
  rarity: Rarity;
  art: unknown;
  collectionId: string | null;
}

export function parseDropTable(raw: unknown): DropTable {
  const r = dropTableSchema.safeParse(raw);
  if (!r.success) throw new AppError(500, 'internal', 'This Lantern is misconfigured.');
  return r.data;
}

/** Items a Lantern can drop right now: listed items plus live items of its collections. Test-only and unreleased items never drop. */
export async function resolvePool(db: DbOrTx, table: DropTable): Promise<PoolItem[]> {
  const minRank = table.minRarity ? RARITY_INFO[table.minRarity].rank : 0;
  const all = table.collectionIds.includes('*');
  const conds = [eq(items.releaseState, 'live'), eq(items.isTestOnly, false), eq(items.type, 'glim')];
  const fromCollections = table.collectionIds.length
    ? await db
        .select({ id: items.id, name: items.name, rarity: items.rarity, art: items.art, collectionId: items.collectionId })
        .from(items)
        // '*' means every permanent collection: monthly Glims come only from their own month's Lantern.
        .where(and(...conds, all ? sql`${items.collectionId} is not null and ${items.collectionId} not like ${`${MONTHLY_PREFIX}%`}` : inArray(items.collectionId, table.collectionIds)))
    : [];
  const listed = table.itemIds.length
    ? await db
        .select({ id: items.id, name: items.name, rarity: items.rarity, art: items.art, collectionId: items.collectionId })
        .from(items)
        .where(and(eq(items.releaseState, 'live'), eq(items.isTestOnly, false), inArray(items.id, table.itemIds)))
    : [];
  const byId = new Map<string, PoolItem>();
  for (const i of fromCollections) if (RARITY_INFO[i.rarity as Rarity].rank >= minRank) byId.set(i.id, i as PoolItem);
  for (const i of listed) byId.set(i.id, i as PoolItem);
  return [...byId.values()];
}

export interface OddsRow {
  rarity: Rarity;
  percent: number;
  items: number;
  /** Chance of one particular item of this rarity. */
  perItemPercent: number;
}

/** The odds players see. Rarities with no items are dropped and the remaining weights rescaled to 100%. */
export function computeOdds(table: DropTable, pool: PoolItem[], restrictTo?: Rarity[]): OddsRow[] {
  const counts = new Map<Rarity, number>();
  for (const p of pool) counts.set(p.rarity, (counts.get(p.rarity) ?? 0) + 1);
  const present = RARITIES.filter((r) => (counts.get(r) ?? 0) > 0 && (table.weights[r] ?? 0) > 0 && (!restrictTo || restrictTo.includes(r)));
  const total = present.reduce((n, r) => n + (table.weights[r] ?? 0), 0);
  return present.map((r) => {
    const percent = total ? ((table.weights[r] ?? 0) / total) * 100 : 0;
    const n = counts.get(r) ?? 0;
    return { rarity: r, percent, items: n, perItemPercent: n ? percent / n : 0 };
  });
}

const EPIC_PLUS: Rarity[] = ['epic', 'legendary', 'mythic'];

function roll(odds: OddsRow[], random: () => number): Rarity {
  const r = random() * 100;
  let acc = 0;
  for (const o of odds) {
    acc += o.percent;
    if (r < acc) return o.rarity;
  }
  return odds[odds.length - 1]!.rarity;
}

export interface OpenResult {
  packId: string;
  item: { id: string; name: string; rarity: Rarity; art: unknown; collectionId: string | null };
  duplicate: boolean;
  quantity: number;
  pity: boolean;
  dustValue: number;
  collectionsCompleted: string[];
}

/**
 * Open one Lantern inside the caller's operation (the caller has already
 * charged for it). Randomness is crypto-grade and server-side; the result is
 * recorded before it is returned.
 */
export async function openPack(tx: DbOrTx, args: { userId: string; pack: PackRow; opId: number; unlimited: boolean; random?: () => number }): Promise<OpenResult> {
  const table = parseDropTable(args.pack.dropTable);
  const pool = await resolvePool(tx, table);
  if (!pool.length) throw new AppError(409, 'not_available', 'This Lantern is empty right now.');

  await tx.insert(pityCounters).values({ userId: args.userId, packId: args.pack.id, sinceEpic: 0 }).onConflictDoNothing();
  const [pc] = await tx
    .select({ sinceEpic: pityCounters.sinceEpic })
    .from(pityCounters)
    .where(and(eq(pityCounters.userId, args.userId), eq(pityCounters.packId, args.pack.id)))
    .for('update');
  const since = pc?.sinceEpic ?? 0;
  let odds = computeOdds(table, pool);
  let pity = false;
  if (table.pityEvery > 0 && since >= table.pityEvery - 1) {
    const guaranteed = computeOdds(table, pool, EPIC_PLUS);
    if (guaranteed.length) {
      odds = guaranteed;
      pity = true;
    }
  }
  const random = args.random ?? secureRandom;
  const rarity = roll(odds, random);
  const candidates = pool.filter((p) => p.rarity === rarity);
  const item = candidates[Math.floor(random() * candidates.length)]!;

  const [owned] = await tx.select({ q: inventory.quantity }).from(inventory).where(and(eq(inventory.userId, args.userId), eq(inventory.itemId, item.id)));
  const duplicate = (owned?.q ?? 0) > 0;
  const quantity = await grantItem(tx, { userId: args.userId, itemId: item.id, source: `pack:${args.pack.id}` });
  await tx
    .update(pityCounters)
    .set({ sinceEpic: EPIC_PLUS.includes(rarity) ? 0 : since + 1 })
    .where(and(eq(pityCounters.userId, args.userId), eq(pityCounters.packId, args.pack.id)));
  await tx.insert(packOpenings).values({ userId: args.userId, packId: args.pack.id, opId: args.opId, itemId: item.id, rarity, duplicate, pity, unlimited: args.unlimited });
  await tx.insert(userStats).values({ userId: args.userId }).onConflictDoNothing();
  await tx.update(userStats).set({ packsOpened: sql`${userStats.packsOpened} + 1` }).where(eq(userStats.userId, args.userId));
  await bumpQuests(tx, args.userId, { lanterns_opened: 1 });
  const completed = duplicate ? [] : await payCollectionRewards(tx, args.userId, args.opId);
  await checkAchievements(tx, args.userId, args.opId);
  return { packId: args.pack.id, item, duplicate, quantity, pity, dustValue: RARITY_INFO[rarity].dustValue, collectionsCompleted: completed };
}

/**
 * Pay each completed collection's reward exactly once. The marker row in
 * economy_ops is unique per user and collection, so two purchases that
 * finish a collection at the same moment cannot both pay.
 */
export async function payCollectionRewards(tx: DbOrTx, userId: string, opId: number): Promise<string[]> {
  const done = await completedCollections(tx, userId);
  const paid: string[] = [];
  for (const id of done) {
    const marker = await tx.insert(economyOps).values({ userId, idemKey: `collection:${id}`, kind: 'collection_reward', result: { opId } }).onConflictDoNothing().returning({ id: economyOps.id });
    if (!marker.length) continue;
    const [c] = await tx.select().from(collectionsTable).where(eq(collectionsTable.id, id)).limit(1);
    const reward = c?.reward as { currency: string; amount: number } | null;
    if (reward && reward.amount > 0) await credit(tx, { userId, currency: reward.currency, amount: reward.amount, reason: 'collection_reward', refType: 'collection', refId: id, opId });
    paid.push(id);
  }
  return paid;
}
