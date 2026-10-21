import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { createRng, hashString, ITEM_TYPE_INFO, type ItemType, type ShopSection } from '@ludora/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import { inventory, items, packs, purchases, shopListings } from '../../db/schema.ts';
import { AppError, insufficientFunds, notAvailable, notFound } from '../../lib/errors.ts';
import { isoWeek, nextDailyReset, nextWeeklyReset, utcDay } from '../../lib/time.ts';
import { debit, withOperation } from '../economy/service.ts';
import { grantItem } from '../inventory/service.ts';
import { openPack, payCollectionRewards, type OpenResult } from '../packs/service.ts';
import { checkAchievements } from '../progression/achievements.ts';
import { isFlagOn } from '../flags/service.ts';

export type ListingRow = typeof shopListings.$inferSelect;
export const DAILY_PICKS = 6;
export const WEEKLY_PICKS = 4;

/** Which rotation listings are on sale in a period. Deterministic, so every server and every player agrees. */
export function rotationPicks(listings: ListingRow[], rotation: 'daily' | 'weekly', now = new Date()): Set<string> {
  const pool = listings.filter((l) => l.rotation === rotation && l.active).sort((a, b) => a.id.localeCompare(b.id));
  const period = rotation === 'daily' ? utcDay(now) : isoWeek(now);
  const picked = createRng(hashString(`${rotation}:${period}`)).shuffle(pool).slice(0, rotation === 'daily' ? DAILY_PICKS : WEEKLY_PICKS);
  return new Set(picked.map((l) => l.id));
}

function periodStart(rotation: string | null, now: Date): Date | null {
  if (rotation === 'daily') return new Date(`${utcDay(now)}T00:00:00Z`);
  if (rotation === 'weekly') return new Date(nextWeeklyReset(now).getTime() - 7 * 86_400_000);
  return null;
}

export interface AvailabilityContext {
  now: Date;
  eventsOn: boolean;
  daily: Set<string>;
  weekly: Set<string>;
}

/** Why a listing cannot be bought right now, or null if it can. Ownership limits are checked separately. */
export function unavailableReason(l: ListingRow, ctx: AvailabilityContext): string | null {
  if (!l.active) return 'This is no longer for sale.';
  if (l.startsAt && l.startsAt > ctx.now) return 'This is not on sale yet.';
  if (l.endsAt && l.endsAt < ctx.now) return 'This offer has ended.';
  if (l.rotation === 'daily' && !ctx.daily.has(l.id)) return 'This is not in today\'s picks.';
  if (l.rotation === 'weekly' && !ctx.weekly.has(l.id)) return 'This is not in this week\'s picks.';
  if (l.section === 'event' && !ctx.eventsOn) return 'The event shop is closed.';
  return null;
}

export async function availabilityContext(db: DbOrTx, auth: Parameters<typeof isFlagOn>[2], now = new Date()): Promise<{ ctx: AvailabilityContext; all: ListingRow[] }> {
  const all = await db.select().from(shopListings);
  const rotationsOn = await isFlagOn(db, 'shop.rotations', auth);
  const ctx: AvailabilityContext = {
    now,
    eventsOn: await isFlagOn(db, 'events.frost_festival', auth),
    daily: rotationsOn ? rotationPicks(all, 'daily', now) : new Set(),
    weekly: rotationsOn ? rotationPicks(all, 'weekly', now) : new Set(),
  };
  return { ctx, all };
}

export interface ShopItemView {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: string;
  art: unknown;
  owned: number;
}

export interface ListingView {
  id: string;
  section: ShopSection;
  kind: 'item' | 'bundle' | 'pack';
  title: string;
  description: string;
  price: { currency: string; amount: number };
  worth: number | null;
  endsAt: string | null;
  limit: number | null;
  boughtThisPeriod: number;
  /** Why the player cannot buy it (owned, sold out for them), or null. */
  blocked: string | null;
  item?: ShopItemView;
  bundle?: ShopItemView[];
  pack?: { id: string; name: string; description: string; art: unknown };
}

export async function shopView(db: Db, userId: string, auth: Parameters<typeof isFlagOn>[2], now = new Date()) {
  const { ctx, all } = await availabilityContext(db, auth, now);
  const live = all.filter((l) => !unavailableReason(l, ctx));
  const itemIds = new Set<string>();
  for (const l of live) {
    if (l.itemId) itemIds.add(l.itemId);
    for (const b of (l.bundle as string[] | null) ?? []) itemIds.add(b);
  }
  const packIds = live.map((l) => l.packId).filter((x): x is string => Boolean(x));
  const [itemRows, packRows, owned, bought] = await Promise.all([
    itemIds.size ? db.select().from(items).where(inArray(items.id, [...itemIds])) : Promise.resolve([]),
    packIds.length ? db.select().from(packs).where(inArray(packs.id, packIds)) : Promise.resolve([]),
    db.select({ itemId: inventory.itemId, q: inventory.quantity }).from(inventory).where(eq(inventory.userId, userId)),
    db.select({ listingId: purchases.listingId, at: purchases.createdAt }).from(purchases).where(eq(purchases.userId, userId)),
  ]);
  const itemById = new Map(itemRows.map((i) => [i.id, i]));
  const packById = new Map(packRows.map((p) => [p.id, p]));
  const ownedById = new Map(owned.map((o) => [o.itemId, o.q]));
  const itemView = (id: string): ShopItemView | null => {
    const i = itemById.get(id);
    if (!i || i.releaseState !== 'live') return null;
    return { id: i.id, type: i.type as ItemType, name: i.name, description: i.description, rarity: i.rarity, art: i.art, owned: ownedById.get(i.id) ?? 0 };
  };
  const views: ListingView[] = [];
  for (const l of live.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))) {
    const start = periodStart(l.rotation, now);
    const boughtThisPeriod = bought.filter((b) => b.listingId === l.id && (!start || b.at >= start)).length;
    let blocked: string | null = l.perUserLimit && boughtThisPeriod >= l.perUserLimit ? (l.rotation ? 'Bought. Back in a future rotation.' : 'Bought') : null;
    const base = {
      id: l.id,
      section: l.section as ShopSection,
      price: { currency: l.priceCurrency, amount: l.priceAmount },
      worth: l.worth,
      endsAt: l.endsAt?.toISOString() ?? (l.rotation === 'daily' ? nextDailyReset(now).toISOString() : l.rotation === 'weekly' ? nextWeeklyReset(now).toISOString() : null),
      limit: l.perUserLimit,
      boughtThisPeriod,
    };
    if (l.itemId) {
      const item = itemView(l.itemId);
      if (!item) continue;
      if (!ITEM_TYPE_INFO[item.type].stackable && item.owned > 0) blocked = 'Owned';
      views.push({ ...base, kind: 'item', title: l.title ?? item.name, description: l.description ?? item.description, blocked, item });
    } else if (l.packId) {
      const p = packById.get(l.packId);
      if (!p || p.releaseState !== 'live') continue;
      views.push({ ...base, kind: 'pack', title: l.title ?? p.name, description: l.description ?? p.description, blocked, pack: { id: p.id, name: p.name, description: p.description, art: p.art } });
    } else {
      const bundle = ((l.bundle as string[]) ?? []).map(itemView).filter((x): x is ShopItemView => Boolean(x));
      if (!bundle.length) continue;
      if (bundle.every((b) => !ITEM_TYPE_INFO[b.type].stackable && b.owned > 0)) blocked = 'Owned';
      views.push({ ...base, kind: 'bundle', title: l.title ?? 'Bundle', description: l.description ?? '', blocked, bundle });
    }
  }
  return { listings: views, resets: { daily: nextDailyReset(now).toISOString(), weekly: nextWeeklyReset(now).toISOString() } };
}

export interface PurchaseResult {
  listingId: string;
  kind: 'item' | 'bundle' | 'pack';
  granted: { id: string; name: string; rarity: string; quantity: number }[];
  pack: OpenResult | null;
  charged: { currency: string; amount: number };
  unlimited: boolean;
}

/**
 * Buy a listing. Runs as one idempotent operation: availability, limits,
 * the charge, the items and any Lantern opening commit together or not at
 * all, and a retry with the same request key returns the first result.
 */
export async function purchase(db: Db, args: { userId: string; listingId: string; requestKey: string; auth: Parameters<typeof isFlagOn>[2] }) {
  return withOperation(db, args.userId, args.requestKey, `purchase:${args.listingId}`, async (tx, opId): Promise<PurchaseResult> => {
    const now = new Date();
    const { ctx, all } = await availabilityContext(tx, args.auth, now);
    const l = all.find((x) => x.id === args.listingId);
    if (!l) throw notFound('That is not in the shop.');
    const reason = unavailableReason(l, ctx);
    if (reason) throw notAvailable(reason);
    const start = periodStart(l.rotation, now);
    if (l.perUserLimit) {
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(purchases)
        .where(and(eq(purchases.userId, args.userId), eq(purchases.listingId, l.id), start ? gte(purchases.createdAt, start) : sql`true`))) as [{ n: number }];
      if (n >= l.perUserLimit) throw new AppError(409, 'conflict', 'You have already bought this.');
    }
    const grantIds = l.itemId ? [l.itemId] : ((l.bundle as string[] | null) ?? []);
    const grantRows = grantIds.length ? await tx.select().from(items).where(inArray(items.id, grantIds)) : [];
    if (grantRows.length !== grantIds.length || grantRows.some((i) => i.releaseState !== 'live' || i.isTestOnly)) throw notAvailable('This is not available right now.');
    for (const i of grantRows) {
      if (!ITEM_TYPE_INFO[i.type as ItemType].stackable) {
        const [o] = await tx.select({ q: inventory.quantity }).from(inventory).where(and(eq(inventory.userId, args.userId), eq(inventory.itemId, i.id)));
        if ((o?.q ?? 0) > 0 && l.itemId) throw new AppError(409, 'conflict', 'You already own this.');
      }
    }
    let packRow: typeof packs.$inferSelect | undefined;
    if (l.packId) {
      [packRow] = await tx.select().from(packs).where(eq(packs.id, l.packId)).limit(1);
      if (!packRow || packRow.releaseState !== 'live') throw notAvailable('This Lantern is not available right now.');
      if (packRow.availableFrom && packRow.availableFrom > now) throw notAvailable('This Lantern is not on sale yet.');
      if (packRow.availableUntil && packRow.availableUntil < now) throw notAvailable('This Lantern is no longer on sale.');
    }
    let charge;
    try {
      charge = await debit(tx, { userId: args.userId, currency: l.priceCurrency, amount: l.priceAmount, reason: l.packId ? 'pack_open' : 'purchase', refType: 'listing', refId: l.id, opId });
    } catch (err) {
      if (err instanceof AppError && err.code === 'insufficient_funds') throw insufficientFunds(err.message);
      throw err;
    }
    await tx.insert(purchases).values({ userId: args.userId, listingId: l.id, opId, priceCurrency: l.priceCurrency, priceAmount: l.priceAmount, unlimited: charge.unlimited });
    const granted: PurchaseResult['granted'] = [];
    for (const i of grantRows) {
      // Bundles skip cosmetics already owned rather than duplicating them.
      if (!ITEM_TYPE_INFO[i.type as ItemType].stackable) {
        const [o] = await tx.select({ q: inventory.quantity }).from(inventory).where(and(eq(inventory.userId, args.userId), eq(inventory.itemId, i.id)));
        if ((o?.q ?? 0) > 0) continue;
      }
      const quantity = await grantItem(tx, { userId: args.userId, itemId: i.id, source: `shop:${l.id}` });
      granted.push({ id: i.id, name: i.name, rarity: i.rarity, quantity });
    }
    let pack: OpenResult | null = null;
    if (packRow) pack = await openPack(tx, { userId: args.userId, pack: packRow, opId, unlimited: charge.unlimited });
    else {
      await payCollectionRewards(tx, args.userId, opId);
      await checkAchievements(tx, args.userId, opId);
    }
    return { listingId: l.id, kind: l.packId ? 'pack' : l.itemId ? 'item' : 'bundle', granted, pack, charged: { currency: l.priceCurrency, amount: l.priceAmount }, unlimited: charge.unlimited };
  });
}
