import type { FastifyInstance } from 'fastify';
import { randomBytes, randomInt } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CARD_EXPRESSIONS, CARD_POSES, GOAL_METRICS, MAX_FAVOURITES, MAX_OUTFITS, MAX_WISHLIST, displayNameSchema, type EquipSlot, type ItemType } from '@ludora/shared';
import { getMode } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { achievements, equipped, inventory, items, questionSets, shopListings, userAchievements } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { canView, loadSet } from '../sets/access.ts';
import { equipItem, slotFor, unequipSlot } from '../inventory/service.ts';
import { FAVOURITE_KINDS, HELP_KEYS, clampGoal, readExtras, updateExtras, type Extras, type Outfit } from './service.ts';

/** The slots an outfit remembers. Answer effects and victory moves stay as they are. */
export const OUTFIT_SLOTS = ['buddy', 'hat', 'eyes', 'neck', 'frame', 'banner', 'title', 'theme'] as const satisfies readonly EquipSlot[];

const favParams = z.object({ kind: z.enum(FAVOURITE_KINDS), id: z.string().min(1).max(80) });

/** The earned title a player shows, if they still hold its achievement. */
export async function earnedTitleOf(deps: AppDeps, userId: string, extras?: Extras): Promise<{ id: string; text: string } | null> {
  const chosen = (extras ?? (await readExtras(deps.db, userId))).title;
  if (!chosen) return null;
  const [row] = await deps.db
    .select({ id: achievements.id, title: achievements.title })
    .from(userAchievements)
    .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
    .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, chosen)))
    .limit(1);
  return row ? { id: row.id, text: row.title } : null;
}

export async function playerRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Everything the player chose, for their own pages. Only they ever see nicknames, the wishlist and the goal. */
  app.get('/api/me/extras', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const extras = await readExtras(db, auth.user.id);
    const sets = extras.favourites.sets.length ? await db.select().from(questionSets).where(inArray(questionSets.id, extras.favourites.sets)) : [];
    const order = new Map(extras.favourites.sets.map((id, i) => [id, i]));
    return {
      ...extras,
      earnedTitle: await earnedTitleOf(deps, auth.user.id, extras),
      // Starred sets you can still open, in the order you starred them.
      favouriteSets: sets
        .filter((s) => canView(s, auth))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((s) => ({ id: s.id, title: s.title, subject: s.subject, cover: s.cover, questionCount: s.questionCount })),
    };
  });

  /* -------------------------------- favourites ------------------------------- */

  app.put('/api/me/favourites/:kind/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { kind, id } = parse(favParams, req.params);
    if (kind === 'modes' && !getMode(id)) throw notFound('That game mode does not exist.');
    if (kind === 'sets') {
      const set = await loadSet(db, id);
      if (!set || !canView(set, auth)) throw notFound('That question set does not exist.');
    }
    if (kind === 'glims') {
      const [row] = await db.select({ q: inventory.quantity }).from(inventory).innerJoin(items, eq(items.id, inventory.itemId)).where(and(eq(inventory.userId, auth.user.id), eq(inventory.itemId, id), eq(items.type, 'glim'))).limit(1);
      if (!row || row.q < 1) throw notFound('You can only star Glims you have found.');
    }
    return updateExtras(db, auth.user.id, (cur) => {
      const list = cur.favourites[kind];
      if (list.includes(id)) return { next: cur, result: { favourites: cur.favourites } };
      if (list.length >= MAX_FAVOURITES) throw conflict(`You can star up to ${MAX_FAVOURITES}. Take the star off one first.`);
      const favourites = { ...cur.favourites, [kind]: [id, ...list] };
      return { next: { ...cur, favourites }, result: { favourites } };
    });
  });

  app.delete('/api/me/favourites/:kind/:id', async (req) => {
    const auth = requireAuth(req);
    const { kind, id } = parse(favParams, req.params);
    return updateExtras(db, auth.user.id, (cur) => {
      const favourites = { ...cur.favourites, [kind]: cur.favourites[kind].filter((x) => x !== id) };
      return { next: { ...cur, favourites }, result: { favourites } };
    });
  });

  /* ---------------------------------- goal ----------------------------------- */

  app.put('/api/me/goal', async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ metric: z.enum(GOAL_METRICS), target: z.number().int().min(1).max(1000) }), req.body);
    const goal = { metric: body.metric, target: clampGoal(body.metric, body.target) };
    return updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, goal }, result: { goal } }));
  });

  app.delete('/api/me/goal', async (req) => {
    const auth = requireAuth(req);
    return updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, goal: null }, result: { goal: null } }));
  });

  /* -------------------------------- wishlist --------------------------------- */

  app.put('/api/me/wishlist/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    const [listing] = await db.select({ id: shopListings.id }).from(shopListings).where(eq(shopListings.id, id)).limit(1);
    if (!listing) throw notFound('That is not in the shop.');
    return updateExtras(db, auth.user.id, (cur) => {
      if (cur.wishlist.includes(id)) return { next: cur, result: { wishlist: cur.wishlist } };
      if (cur.wishlist.length >= MAX_WISHLIST) throw conflict(`Your wishlist holds ${MAX_WISHLIST}. Take one off first.`);
      const wishlist = [id, ...cur.wishlist];
      return { next: { ...cur, wishlist }, result: { wishlist } };
    });
  });

  app.delete('/api/me/wishlist/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    return updateExtras(db, auth.user.id, (cur) => {
      const wishlist = cur.wishlist.filter((x) => x !== id);
      return { next: { ...cur, wishlist }, result: { wishlist } };
    });
  });

  /* -------------------------------- nicknames -------------------------------- */

  /** A nickname for one of your Glims. It goes through the name filter, and only you ever see it. */
  app.put('/api/me/nicknames/:itemId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { itemId } = parse(z.object({ itemId: z.string().min(1).max(80) }), req.params);
    const { nickname } = parse(z.object({ nickname: z.union([displayNameSchema, z.null()]) }), req.body);
    const [row] = await db.select({ q: inventory.quantity }).from(inventory).innerJoin(items, eq(items.id, inventory.itemId)).where(and(eq(inventory.userId, auth.user.id), eq(inventory.itemId, itemId), eq(items.type, 'glim'))).limit(1);
    if (!row || row.q < 1) throw notFound('You can only name Glims you have found.');
    return updateExtras(db, auth.user.id, (cur) => {
      const nicknames = { ...cur.nicknames };
      if (nickname) nicknames[itemId] = nickname;
      else delete nicknames[itemId];
      return { next: { ...cur, nicknames }, result: { itemId, nickname } };
    });
  });

  /* ---------------------------------- title ---------------------------------- */

  /** Show a title earned from an achievement under your name. Checked here: only achievements you have unlocked. */
  app.put('/api/me/title', async (req) => {
    const auth = requireAuth(req);
    const { achievementId } = parse(z.object({ achievementId: z.string().min(1).max(60).nullable() }), req.body);
    if (achievementId) {
      const [row] = await db.select({ id: userAchievements.achievementId }).from(userAchievements).where(and(eq(userAchievements.userId, auth.user.id), eq(userAchievements.achievementId, achievementId))).limit(1);
      if (!row) throw new AppError(403, 'forbidden', 'Unlock that achievement first to show its title.');
      // One title under your name: an earned title takes the place of a title from the shop.
      await unequipSlot(db, auth.user.id, 'title');
    }
    await updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, title: achievementId }, result: null }));
    return { earnedTitle: await earnedTitleOf(deps, auth.user.id) };
  });

  /* ------------------------------ profile card ------------------------------- */

  app.put('/api/me/card', async (req) => {
    const auth = requireAuth(req);
    const card = parse(z.object({ pose: z.enum(CARD_POSES), expression: z.enum(CARD_EXPRESSIONS) }), req.body);
    return updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, card }, result: { card } }));
  });

  /* ---------------------------------- help ----------------------------------- */

  app.post('/api/me/help/:key/dismiss', async (req) => {
    const auth = requireAuth(req);
    const { key } = parse(z.object({ key: z.enum(HELP_KEYS) }), req.params);
    return updateExtras(db, auth.user.id, (cur) => {
      const dismissed = cur.help.dismissed.includes(key) ? cur.help.dismissed : [...cur.help.dismissed, key];
      return { next: { ...cur, help: { dismissed } }, result: { dismissed } };
    });
  });

  /* --------------------------------- outfits --------------------------------- */

  /** Save what your buddy wears now as an outfit. */
  app.post('/api/me/outfits', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { name } = parse(z.object({ name: displayNameSchema }), req.body);
    const worn = await db.select().from(equipped).where(eq(equipped.userId, auth.user.id));
    const slots: Outfit["items"] = Object.fromEntries(worn.filter((w) => (OUTFIT_SLOTS as readonly string[]).includes(w.slot)).map((w) => [w.slot, w.itemId]));
    return updateExtras(db, auth.user.id, (cur) => {
      if (cur.outfits.length >= MAX_OUTFITS) throw conflict(`You can save up to ${MAX_OUTFITS} outfits. Delete one to save another.`);
      const outfit = { id: randomBytes(5).toString('hex'), name, items: slots };
      return { next: { ...cur, outfits: [...cur.outfits, outfit] }, result: { outfit } };
    });
  });

  app.delete('/api/me/outfits/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().max(20) }), req.params);
    return updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, outfits: cur.outfits.filter((o) => o.id !== id) }, result: { ok: true } }));
  });

  /**
   * Wear a saved outfit in one go. Each piece is equipped through the same check as the locker
   * (you must still own it); pieces you no longer have are skipped and named in `missing`.
   */
  app.post('/api/me/outfits/:id/wear', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().max(20) }), req.params);
    const outfit = (await readExtras(db, auth.user.id)).outfits.find((o) => o.id === id);
    if (!outfit) throw notFound('That outfit is not saved any more.');
    const missing: string[] = [];
    await db.transaction(async (tx) => {
      for (const slot of OUTFIT_SLOTS) {
        const item = outfit.items[slot];
        if (item) {
          try {
            await equipItem(tx, auth.user.id, item);
          } catch {
            missing.push(item);
          }
        } else if (slot !== 'buddy') {
          await unequipSlot(tx, auth.user.id, slot);
        }
      }
    });
    if (outfit.items.title) await updateExtras(db, auth.user.id, (cur) => ({ next: { ...cur, title: null }, result: null }));
    const names = missing.length ? await db.select({ name: items.name }).from(items).where(inArray(items.id, missing)) : [];
    return { ok: true, missing: names.map((n) => n.name) };
  });

  /**
   * Surprise me: a random buddy and random accessories from what you own, picked here with the
   * server's random numbers. Each accessory slot may also come out empty.
   */
  app.post('/api/locker/surprise', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const owned = await db
      .select({ id: items.id, type: items.type, art: items.art })
      .from(inventory)
      .innerJoin(items, eq(items.id, inventory.itemId))
      .where(and(eq(inventory.userId, auth.user.id), sql`${inventory.quantity} > 0`, inArray(items.type, ['glim', 'accessory'])));
    const glims = owned.filter((i) => i.type === 'glim');
    if (!glims.length) throw conflict('Find a Glim first. Open a Lantern in the shop.');
    const pick = <T>(list: T[]): T => list[randomInt(list.length)]!;
    const chosen: Partial<Record<EquipSlot, string | null>> = { buddy: pick(glims).id };
    for (const slot of ['hat', 'eyes', 'neck'] as const) {
      const options = owned.filter((i) => i.type === 'accessory' && slotFor(i.type as ItemType, i.art) === slot);
      chosen[slot] = options.length ? pick([null, ...options.map((o) => o.id)]) : null;
    }
    await db.transaction(async (tx) => {
      for (const [slot, item] of Object.entries(chosen) as [EquipSlot, string | null][]) {
        if (item) await equipItem(tx, auth.user.id, item);
        else await unequipSlot(tx, auth.user.id, slot);
      }
    });
    return { equipped: chosen };
  });
}
