import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { classRewards, items, ledger, packs, shopListings, userStats } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { nextDailyReset, utcDay, weekStart } from '../../lib/time.ts';
import { readExtras, updateExtras } from '../player/service.ts';
import { availabilityContext, effectivePrice, saleActive, unavailableReason } from '../shop/service.ts';
import { activeBoost, getRules } from './config.ts';
import { balancesOf } from './service.ts';

/*
 * The player's Wallet (D58): balances, where their Sparks came from and went (newest first), how
 * much of today's game Sparks they have earned against the daily limit, a saving goal picked from
 * their wishlist, and a short summary of the week. Only ever the player's own account. Nothing
 * here compares players, and nothing urges them to spend.
 */

export interface WalletEntry {
  id: number;
  currency: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  /** A short extra line: the teacher and their reason, or what was bought. */
  detail: string | null;
  createdAt: string;
}

/** Details for a page of ledger rows: teachers' rewards and what was bought or refunded. */
async function describe(db: DbOrTx, rows: (typeof ledger.$inferSelect)[]): Promise<WalletEntry[]> {
  const rewardIds = rows.filter((r) => r.refType === 'class_reward' && r.refId).map((r) => r.refId!);
  const listingIds = [
    ...new Set(
      rows
        .map((r) => (r.refType === 'listing' ? r.refId : r.reason === 'refund' ? ((r.metadata as { listingId?: string } | null)?.listingId ?? null) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const [rewards, listings] = await Promise.all([
    rewardIds.length ? db.select({ id: classRewards.id, teacherName: classRewards.teacherName, note: classRewards.note }).from(classRewards).where(inArray(classRewards.id, rewardIds)) : Promise.resolve([]),
    listingIds.length
      ? db
          .select({ id: shopListings.id, title: shopListings.title, itemName: items.name, packName: packs.name })
          .from(shopListings)
          .leftJoin(items, eq(items.id, shopListings.itemId))
          .leftJoin(packs, eq(packs.id, shopListings.packId))
          .where(inArray(shopListings.id, listingIds))
      : Promise.resolve([]),
  ]);
  const reward = new Map(rewards.map((r) => [r.id, r]));
  const listing = new Map(listings.map((l) => [l.id, l.title ?? l.itemName ?? l.packName ?? null]));
  return rows.map((r) => {
    let detail: string | null = null;
    if (r.refType === 'class_reward' && r.refId) {
      const w = reward.get(r.refId);
      if (w) detail = `From ${w.teacherName}: ${w.note}`;
    } else if (r.refType === 'listing' && r.refId) detail = listing.get(r.refId) ?? null;
    else if (r.reason === 'refund') {
      const id = (r.metadata as { listingId?: string } | null)?.listingId;
      detail = id ? (listing.get(id) ?? null) : null;
    }
    return { id: r.id, currency: r.currency, delta: r.unlimited ? 0 : r.delta, balanceAfter: r.balanceAfter, reason: r.reason, detail, createdAt: r.createdAt.toISOString() };
  });
}

/** Sparks earned and spent in a window, earned split by where it came from. */
async function sparksBetween(db: DbOrTx, userId: string, from: Date, to: Date) {
  const rows = await db
    .select({ reason: ledger.reason, earned: sql<number>`coalesce(sum(${ledger.delta}) filter (where ${ledger.delta} > 0), 0)::int`, spent: sql<number>`coalesce(-sum(${ledger.delta}) filter (where ${ledger.delta} < 0), 0)::int` })
    .from(ledger)
    .where(and(eq(ledger.userId, userId), eq(ledger.currency, 'sparks'), eq(ledger.unlimited, false), gte(ledger.createdAt, from), lt(ledger.createdAt, to)))
    .groupBy(ledger.reason);
  return {
    earned: rows.reduce((n, r) => n + r.earned, 0),
    spent: rows.reduce((n, r) => n + r.spent, 0),
    sources: rows.filter((r) => r.earned > 0).map((r) => ({ reason: r.reason, sparks: r.earned })).sort((a, b) => b.sparks - a.sparks),
  };
}

export async function walletRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/me/wallet', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const userId = auth.user.id;
    const now = new Date();
    const rules = await getRules(db);
    const thisWeek = weekStart(now);
    const lastWeek = new Date(thisWeek.getTime() - 7 * 86_400_000);
    const [balances, stats, extras, rows, week, prev] = await Promise.all([
      balancesOf(db, userId),
      db.select({ sparksToday: userStats.sparksToday, sparksDay: userStats.sparksDay }).from(userStats).where(eq(userStats.userId, userId)).limit(1),
      readExtras(db, userId),
      db.select().from(ledger).where(eq(ledger.userId, userId)).orderBy(desc(ledger.id)).limit(30),
      sparksBetween(db, userId, thisWeek, new Date(now.getTime() + 1000)),
      sparksBetween(db, userId, lastWeek, thisWeek),
    ]);
    const earnedToday = stats[0]?.sparksDay === utcDay(now) ? stats[0].sparksToday : 0;

    // The saving goal, with its price as the shop charges it now and whether it is in the shop today.
    let goal = null;
    const wished = extras.wishlist;
    const { ctx, all } = await availabilityContext(db, auth, now);
    const listingRows = all.filter((l) => wished.includes(l.id));
    const names = listingRows.length
      ? await db
          .select({ id: shopListings.id, itemName: items.name, packName: packs.name })
          .from(shopListings)
          .leftJoin(items, eq(items.id, shopListings.itemId))
          .leftJoin(packs, eq(packs.id, shopListings.packId))
          .where(inArray(shopListings.id, listingRows.map((l) => l.id)))
      : [];
    const nameOf = (id: string) => {
      const l = listingRows.find((x) => x.id === id);
      const n = names.find((x) => x.id === id);
      return l?.title ?? n?.itemName ?? n?.packName ?? 'Something from the shop';
    };
    const options = wished
      .map((id) => listingRows.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => ({ id: l.id, name: nameOf(l.id), price: { currency: l.priceCurrency, amount: effectivePrice(l, now) } }));
    if (extras.savingGoal) {
      const l = listingRows.find((x) => x.id === extras.savingGoal);
      if (l) {
        const price = effectivePrice(l, now);
        const have = balances[l.priceCurrency] ?? 0;
        goal = {
          id: l.id,
          name: nameOf(l.id),
          price: { currency: l.priceCurrency, amount: price },
          sale: saleActive(l, now) ? { was: l.priceAmount, until: l.saleEndsAt!.toISOString() } : null,
          have,
          inShopNow: unavailableReason(l, ctx) === null,
        };
      }
    }
    const boost = rules.boost && new Date(rules.boost.endsAt) > now && new Date(rules.boost.startsAt).getTime() - now.getTime() < 7 * 86_400_000 ? { ...rules.boost, running: Boolean(activeBoost(rules, now)) } : null;
    return {
      balances,
      today: { gameSparks: earnedToday, cap: rules.game.dailySparkCap, resetsAt: nextDailyReset(now).toISOString() },
      boost,
      goal,
      goalOptions: options,
      week: { since: thisWeek.toISOString(), ...week, lastWeek: { earned: prev.earned, spent: prev.spent } },
      entries: await describe(db, rows),
      nextBefore: rows.length === 30 ? rows[rows.length - 1]!.id : null,
    };
  });

  app.get('/api/me/wallet/history', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.coerce.number().int().positive() }), req.query);
    const rows = await db.select().from(ledger).where(and(eq(ledger.userId, auth.user.id), lt(ledger.id, q.before))).orderBy(desc(ledger.id)).limit(30);
    return { entries: await describe(db, rows), nextBefore: rows.length === 30 ? rows[rows.length - 1]!.id : null };
  });

  /** Choose (or clear) the wishlist listing to save towards. It has to be on the wishlist. */
  app.put('/api/me/saving-goal', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { listingId } = parse(z.object({ listingId: z.string().min(1).max(80).nullable() }), req.body);
    if (listingId) {
      const [l] = await db.select({ id: shopListings.id }).from(shopListings).where(eq(shopListings.id, listingId)).limit(1);
      if (!l) throw notFound('That is not in the shop.');
    }
    return updateExtras(db, auth.user.id, (cur) => {
      if (listingId && !cur.wishlist.includes(listingId)) throw conflict('Add it to your wishlist first, then choose it as your goal.');
      return { next: { ...cur, savingGoal: listingId }, result: { savingGoal: listingId } };
    });
  });
}
