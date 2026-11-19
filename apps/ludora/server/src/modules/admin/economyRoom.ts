import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { ITEM_TYPE_INFO, currencyCodeSchema, realGrantCap, staffReasonSchema, type ItemType } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { auditLog, classMembers, classes, equipped, inventory, items, ledger, packs, purchases, shopListings, users } from '../../db/schema.ts';
import { noStore } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { utcDay } from '../../lib/time.ts';
import { DEFAULT_GRANT_LIMITS, economyRulesSchema, getGrantLimits, getRules, grantLimitsSchema, saveGrantLimits, saveRules, type EconomyRules } from '../economy/config.ts';
import { previewRules } from '../economy/preview.ts';
import { credit, IDEMPOTENCY_KEY_PATTERN, withOperation } from '../economy/service.ts';
import { takeItem } from '../inventory/service.ts';
import { audit, likeEscape, loadUser, requireConfirm, staff, staffLimit } from './common.ts';
import { assertWithinDailyLimit, grantedToday, heldToDailyLimit } from './grantLimits.ts';

/*
 * The economy room (D58): the numbers an economy manager runs the economy by, and the tools they
 * run it with. Everything here is checked on the server: a permission per route, a reason for every
 * change, an audit row in the same transaction, and the daily grant total for economy managers.
 * Every figure comes from the ledger, purchases and wallets, and leaves out test accounts,
 * unlimited test currency and test resets.
 */

const requestKey = z.string().regex(IDEMPOTENCY_KEY_PATTERN, 'Missing request key');
const isoDate = z.iso.datetime({ offset: true });

/** Where Sparks balances fall. Counts only: the room never lists children by wealth. */
export const BALANCE_BANDS: { label: string; min: number; max: number | null }[] = [
  { label: 'None', min: 0, max: 0 },
  { label: '1 to 99', min: 1, max: 99 },
  { label: '100 to 499', min: 100, max: 499 },
  { label: '500 to 1,999', min: 500, max: 1999 },
  { label: '2,000 to 9,999', min: 2000, max: 9999 },
  { label: '10,000 or more', min: 10_000, max: null },
];

/** Every leaf of a rules object as path -> value, for "what changed" lists. */
export function flattenRules(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj === null || obj === undefined) return prefix ? { [prefix]: obj ?? null } : out;
  if (Array.isArray(obj) || typeof obj !== 'object') return { [prefix]: Array.isArray(obj) ? obj.join(', ') : obj };
  const entries = Object.entries(obj as Record<string, unknown>);
  // A boost is one thing to a reader: show it as a sentence, not four fields.
  if (prefix === 'boost') return { boost: `${(obj as { label: string }).label} x${(obj as { multiplier: number }).multiplier}` };
  for (const [k, v] of entries) Object.assign(out, flattenRules(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

export function diffRules(before: unknown, after: unknown): { path: string; from: string; to: string }[] {
  const a = flattenRules(before);
  const b = flattenRules(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => String(a[k] ?? 'none') !== String(b[k] ?? 'none')).map((k) => ({ path: k, from: String(a[k] ?? 'none'), to: String(b[k] ?? 'none') }));
}

/** A cell for a CSV file. Quotes it, and defuses anything a spreadsheet would read as a formula. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function validateStarters(db: AppDeps['db'], rules: EconomyRules) {
  if (!rules.starterItems.length) return;
  const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, rules.starterItems));
  const missing = rules.starterItems.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) throw new AppError(400, 'validation_failed', `Unknown starter item: ${missing.join(', ')}.`, { 'rules.starterItems': 'Unknown item id.' });
}

export async function economyRoomRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ---------------------------------- health ---------------------------------- */

  app.get('/api/admin/economy/health', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const { days } = parse(z.object({ days: z.coerce.number().int().refine((n) => [7, 14, 30].includes(n), 'Choose 7, 14 or 30 days.').default(14) }), req.query);
    const today = new Date(`${utcDay()}T00:00:00Z`);
    const since = new Date(today.getTime() - (days - 1) * 86_400_000);
    const rules = await getRules(db);
    const cap = rules.game.dailySparkCap;
    const real = sql`not u.is_test_account and not l.unlimited and l.reason <> 'test_reset'`;
    const [perDay, byReason, bands, median, listings, capDays, capToday] = await Promise.all([
      db.execute<{ day: string; currency: string; earned: string | null; spent: string | null }>(sql`
        select to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD') as day, l.currency,
          sum(l.delta) filter (where l.delta > 0) as earned, -sum(l.delta) filter (where l.delta < 0) as spent
        from ${ledger} l join ${users} u on u.id = l.user_id
        where l.created_at >= ${since} and ${real}
        group by 1, 2 order by 1, 2`),
      db.execute<{ currency: string; reason: string; earned: string | null; spent: string | null; n: string }>(sql`
        select l.currency, l.reason, sum(l.delta) filter (where l.delta > 0) as earned, -sum(l.delta) filter (where l.delta < 0) as spent, count(*) as n
        from ${ledger} l join ${users} u on u.id = l.user_id
        where l.created_at >= ${since} and ${real}
        group by 1, 2 order by 1, 2`),
      db.execute<{ band: number; n: string }>(sql`
        select case ${sql.raw(BALANCE_BANDS.map((b, i) => (b.max === null ? `else ${i}` : `when w.balance <= ${b.max} then ${i}`)).join(' '))} end as band, count(*) as n
        from wallets w join ${users} u on u.id = w.user_id
        where w.currency = 'sparks' and not u.is_test_account and not u.is_guest
        group by 1`),
      db.execute<{ median: string | null; players: string }>(sql`
        select percentile_cont(0.5) within group (order by w.balance) as median, count(*) as players
        from wallets w join ${users} u on u.id = w.user_id
        where w.currency = 'sparks' and not u.is_test_account and not u.is_guest`),
      db.execute<{ id: string; name: string | null; section: string; rotation: string | null; currency: string; n: string; spent: string | null }>(sql`
        select s.id, coalesce(s.title, i.name, p.name) as name, s.section, s.rotation, s.price_currency as currency, count(pu.id) as n, sum(pu.price_amount) as spent
        from ${shopListings} s
        left join ${items} i on i.id = s.item_id
        left join ${packs} p on p.id = s.pack_id
        left join (
          select pu.id, pu.listing_id, pu.price_amount from ${purchases} pu join ${users} u on u.id = pu.user_id
          where pu.created_at >= ${since} and pu.refunded_at is null and not pu.unlimited and not u.is_test_account
        ) pu on pu.listing_id = s.id
        where s.active
        group by s.id, i.name, p.name`),
      db.execute<{ day: string; capped: string; earners: string }>(sql`
        select day, count(*) filter (where total >= ${cap}) as capped, count(*) as earners from (
          select to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD') as day, l.user_id, sum(l.delta) as total
          from ${ledger} l join ${users} u on u.id = l.user_id
          where l.reason = 'game_reward' and l.created_at >= ${since} and not u.is_test_account
          group by 1, 2
        ) t group by day order by day`),
      db.execute<{ capped: string }>(sql`
        select count(*) as capped from user_stats s join ${users} u on u.id = s.user_id
        where s.sparks_day = ${utcDay()} and s.sparks_today >= ${cap} and not u.is_test_account`),
    ]);
    const dayList = Array.from({ length: days }, (_, i) => utcDay(new Date(since.getTime() + i * 86_400_000)));
    const bandCount = new Map(bands.rows.map((r) => [Number(r.band), Number(r.n)]));
    const items_ = listings.rows.map((r) => ({ id: r.id, name: r.name ?? r.id, section: r.section, rotating: Boolean(r.rotation), currency: r.currency, bought: Number(r.n), spent: Number(r.spent ?? 0) }));
    const capByDay = new Map(capDays.rows.map((r) => [r.day, { capped: Number(r.capped), earners: Number(r.earners) }]));
    return {
      days,
      since: since.toISOString(),
      cap,
      perDay: dayList.flatMap((day) => perDay.rows.filter((r) => r.day === day).map((r) => ({ day, currency: r.currency, earned: Number(r.earned ?? 0), spent: Number(r.spent ?? 0) }))),
      dayList,
      byReason: byReason.rows.map((r) => ({ currency: r.currency, reason: r.reason, earned: Number(r.earned ?? 0), spent: Number(r.spent ?? 0), entries: Number(r.n) })),
      bands: BALANCE_BANDS.map((b, i) => ({ label: b.label, min: b.min, max: b.max, players: bandCount.get(i) ?? 0 })),
      medianSparks: median.rows[0]?.median === null || median.rows[0]?.median === undefined ? null : Math.round(Number(median.rows[0].median)),
      players: Number(median.rows[0]?.players ?? 0),
      mostBought: items_.filter((i) => i.bought > 0).sort((a, b) => b.bought - a.bought || a.name.localeCompare(b.name)).slice(0, 8),
      // Rotating picks are only in the shop some days, so they are left out of "least bought".
      leastBought: items_.filter((i) => !i.rotating && i.section !== 'event').sort((a, b) => a.bought - b.bought || a.name.localeCompare(b.name)).slice(0, 8),
      capHits: dayList.map((day) => ({ day, ...(capByDay.get(day) ?? { capped: 0, earners: 0 }) })),
      cappedToday: Number(capToday.rows[0]?.capped ?? 0),
    };
  });

  /* ------------------------------ rules: preview, history, undo ------------------------------ */

  app.post('/api/admin/economy/rules/preview', staffLimit(120), async (req) => {
    staff(req, 'economy.view');
    const body = parse(z.object({ rules: economyRulesSchema }), req.body);
    const current = await getRules(db);
    return { preview: previewRules(current, body.rules), changes: diffRules(current, body.rules) };
  });

  app.get('/api/admin/economy/rules/history', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'economy.rules'), eq(auditLog.targetType, 'economy')))
      .orderBy(desc(auditLog.id))
      .limit(30);
    return {
      changes: rows.map((r, i) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        by: r.actorName,
        reason: r.reason,
        undoOf: r.targetName?.startsWith('Undo of #') ? Number(r.targetName.slice('Undo of #'.length)) : null,
        changes: diffRules(economyRulesSchema.safeParse(r.before ?? {}).data ?? r.before, economyRulesSchema.safeParse(r.after ?? {}).data ?? r.after),
        // Only the newest change can be undone in one step: undoing an older one would also throw away everything after it.
        canUndo: i === 0 && economyRulesSchema.safeParse(r.before ?? {}).success && r.before !== null,
      })),
    };
  });

  app.post('/api/admin/economy/rules/undo', staffLimit(10), async (req) => {
    const auth = staff(req, 'economy.configure');
    const body = parse(z.object({ changeId: z.number().int().positive(), reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      // The newest rules change, locked so two people undoing at once cannot both win.
      const [latest] = await tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'economy.rules'), eq(auditLog.targetType, 'economy')))
        .orderBy(desc(auditLog.id))
        .limit(1)
        .for('update');
      if (!latest || latest.id !== body.changeId) throw conflict('Only the newest rules change can be undone in one step. Reload to see the latest.');
      const restored = economyRulesSchema.safeParse(latest.before ?? null);
      if (!restored.success) throw conflict('That change has no earlier rules to go back to.');
      await validateStarters(db, restored.data);
      const before = await getRules(tx);
      await saveRules(tx, restored.data, auth.user.id);
      await audit(deps, req, tx, { actor: auth, action: 'economy.rules', targetType: 'economy', targetId: 'rules', targetName: `Undo of #${latest.id}`, reason: body.reason, before, after: restored.data });
      return { ok: true, rules: restored.data };
    });
  });

  /* -------------------------------- grant limits -------------------------------- */

  app.get('/api/admin/economy/limits', async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'economy.view');
    return {
      limits: await getGrantLimits(db),
      defaults: DEFAULT_GRANT_LIMITS,
      usedToday: await grantedToday(db, auth.user.id),
      heldToLimit: heldToDailyLimit(auth),
      canChange: auth.permissions.has('economy.limits'),
    };
  });

  app.put('/api/admin/economy/limits', staffLimit(10), async (req) => {
    const auth = staff(req, 'economy.limits');
    const body = parse(z.object({ limits: grantLimitsSchema, reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const before = await getGrantLimits(tx);
      await saveGrantLimits(tx, body.limits, auth.user.id);
      await audit(deps, req, tx, { actor: auth, action: 'economy.limits', targetType: 'economy', targetId: 'grant_limits', reason: body.reason, before, after: body.limits });
      return { ok: true, limits: body.limits };
    });
  });

  /* ------------------------- finding an account or a class to grant to ------------------------- */

  /**
   * The account finder for the economy room. It returns only what a grant needs (name and kind),
   * so an economy manager can grant without the player records that users.read opens.
   */
  app.get('/api/admin/economy/accounts', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const { q } = parse(z.object({ q: z.string().trim().min(2, 'Type at least 2 characters.').max(80) }), req.query);
    let cond: SQL | undefined;
    if (/^[0-9a-f-]{36}$/i.test(q)) cond = eq(users.id, q);
    else if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(q)) cond = eq(users.friendCode, q.toUpperCase());
    else cond = or(ilike(users.username, `%${likeEscape(q)}%`), ilike(users.displayName, `%${likeEscape(q)}%`));
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, isTestAccount: users.isTestAccount, isGuest: users.isGuest })
      .from(users)
      .where(cond)
      .orderBy(users.username)
      .limit(10);
    return { accounts: rows };
  });

  app.get('/api/admin/economy/classes', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.grant');
    const { q } = parse(z.object({ q: z.string().trim().min(2, 'Type at least 2 characters.').max(80) }), req.query);
    const owner = alias(users, 'owner');
    const rows = await db
      .select({
        id: classes.id,
        name: classes.name,
        archived: sql<boolean>`${classes.archivedAt} is not null`,
        teacher: owner.displayName,
        students: sql<number>`(select count(*)::int from ${classMembers} m where m.class_id = ${classes.id} and m.role = 'student')`,
      })
      .from(classes)
      .innerJoin(owner, eq(owner.id, classes.ownerId))
      .where(or(ilike(classes.name, `%${likeEscape(q)}%`), eq(classes.joinCode, q.toUpperCase())))
      .orderBy(classes.name)
      .limit(10);
    return { classes: rows };
  });

  /** One grant to every student in a class: the same amount each, one reason, one audit row. */
  app.post('/api/admin/economy/grant-class', staffLimit(10), async (req) => {
    const auth = staff(req, 'economy.grant');
    const body = parse(
      z.object({
        classId: z.string().uuid(),
        currency: currencyCodeSchema,
        amountEach: z.number().int().min(1).max(100_000),
        reason: staffReasonSchema,
        requestKey,
        confirm: z.string().max(80).optional(),
      }),
      req.body,
    );
    const [cls] = await db.select().from(classes).where(eq(classes.id, body.classId)).limit(1);
    if (!cls) throw notFound('No class with that id.');
    if (body.amountEach > realGrantCap(body.currency)) {
      throw new AppError(400, 'validation_failed', `At most ${realGrantCap(body.currency).toLocaleString('en-GB')} each at a time.`, { amountEach: 'Over the limit for one change.' });
    }
    requireConfirm(body.confirm, cls.name, 'the class name');
    const members = await db.select({ userId: classMembers.userId }).from(classMembers).where(and(eq(classMembers.classId, cls.id), eq(classMembers.role, 'student')));
    if (members.some((m) => m.userId === auth.user.id)) throw forbidden('You are a student in this class, and staff tools cannot change your own balance. Ask another staff member.');
    if (!members.length) throw conflict('This class has no students yet.');
    const total = body.amountEach * members.length;
    const { result, replayed } = await withOperation(db, auth.user.id, `staff-class:${body.requestKey}`, 'economy.class_grant', async (tx, opId) => {
      await assertWithinDailyLimit(tx, auth, body.currency, total);
      for (const m of members) {
        await credit(tx, { userId: m.userId, currency: body.currency, amount: body.amountEach, reason: 'admin_grant', refType: 'class', refId: cls.id, opId, actorId: auth.user.id, metadata: { reason: body.reason, tool: 'staff', classId: cls.id } });
      }
      const after = { currency: body.currency, amountEach: body.amountEach, students: members.length, total };
      await audit(deps, req, tx, { actor: auth, action: 'economy.class_grant', targetType: 'class', targetId: cls.id, targetName: cls.name, reason: body.reason, after });
      return after;
    });
    return { ok: true, replayed, ...result };
  });

  /* ---------------------------------- refunds ---------------------------------- */

  app.get('/api/admin/economy/purchases', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.query);
    const rows = await db
      .select({ p: purchases, title: shopListings.title, itemName: items.name, packName: packs.name, packId: shopListings.packId })
      .from(purchases)
      .leftJoin(shopListings, eq(shopListings.id, purchases.listingId))
      .leftJoin(items, eq(items.id, shopListings.itemId))
      .leftJoin(packs, eq(packs.id, shopListings.packId))
      .where(eq(purchases.userId, userId))
      .orderBy(desc(purchases.id))
      .limit(50);
    return {
      purchases: rows.map(({ p, title, itemName, packName, packId }) => ({
        id: p.id,
        listingId: p.listingId,
        name: title ?? itemName ?? packName ?? p.listingId,
        price: { currency: p.priceCurrency, amount: p.priceAmount },
        at: p.createdAt.toISOString(),
        refundedAt: p.refundedAt?.toISOString() ?? null,
        refundable: p.refundedAt ? 'Already refunded.' : p.unlimited ? 'Nothing was charged (unlimited test currency).' : packId ? 'Lanterns cannot be refunded: the Glim is already out. Grant instead if something went wrong.' : null,
      })),
    };
  });

  /**
   * Refund one purchase: the price goes back to the player and what it gave comes off them, in one
   * idempotent operation with its audit row. Lanterns cannot be refunded (the draw already happened).
   */
  app.post('/api/admin/economy/refund', staffLimit(20), async (req) => {
    const auth = staff(req, 'economy.grant');
    const body = parse(z.object({ purchaseId: z.number().int().positive(), reason: staffReasonSchema, requestKey, confirm: z.string().max(80).optional() }), req.body);
    const [found] = await db.select().from(purchases).where(eq(purchases.id, body.purchaseId)).limit(1);
    if (!found) throw notFound('No purchase with that number.');
    const target = await loadUser(db, found.userId);
    if (target.user.id === auth.user.id) throw forbidden('You cannot refund your own purchase with staff tools. Ask another staff member.');
    if (!target.user.isTestAccount) requireConfirm(body.confirm, target.user.username ?? target.user.displayName, 'the account name');
    const { result, replayed } = await withOperation(db, target.user.id, `staff-refund:${body.requestKey}`, 'economy.refund', async (tx, opId) => {
      const [p] = await tx.select().from(purchases).where(eq(purchases.id, body.purchaseId)).for('update');
      if (!p) throw notFound('No purchase with that number.');
      if (p.refundedAt) throw conflict('That purchase was already refunded.');
      if (p.unlimited) throw conflict('Nothing was charged for that purchase, so there is nothing to refund.');
      const [l] = await tx.select().from(shopListings).where(eq(shopListings.id, p.listingId)).limit(1);
      if (!l) throw conflict('That shop listing no longer exists, so what it gave cannot be worked out. Grant instead.');
      if (l.packId) throw conflict('Lanterns cannot be refunded: the Glim is already out. Grant instead if something went wrong.');
      const ids = l.itemId ? [l.itemId] : ((l.bundle as string[] | null) ?? []);
      const rows = ids.length ? await tx.select().from(items).where(inArray(items.id, ids)) : [];
      const taken: { itemId: string; name: string }[] = [];
      for (const it of rows) {
        const stackable = ITEM_TYPE_INFO[it.type as ItemType]?.stackable ?? false;
        const [own] = await tx.select().from(inventory).where(and(eq(inventory.userId, p.userId), eq(inventory.itemId, it.id))).for('update');
        if (stackable) {
          if (!own || own.quantity < 1) throw conflict(`They no longer have ${it.name} (it may have been recycled), so this cannot be refunded. Grant instead.`);
        } else if (!own || own.quantity < 1 || own.source !== `shop:${l.id}`) {
          // A bundle skips cosmetics the player already owned, and those are theirs to keep.
          continue;
        }
        const left = await takeItem(tx, p.userId, it.id, 1);
        if (left === 0) await tx.delete(equipped).where(and(eq(equipped.userId, p.userId), eq(equipped.itemId, it.id)));
        taken.push({ itemId: it.id, name: it.name });
      }
      const balance = await credit(tx, { userId: p.userId, currency: p.priceCurrency, amount: p.priceAmount, reason: 'refund', refType: 'purchase', refId: String(p.id), opId, actorId: auth.user.id, metadata: { reason: body.reason, listingId: l.id } });
      await tx.update(purchases).set({ refundedAt: new Date(), refundedBy: auth.user.id }).where(eq(purchases.id, p.id));
      const after = { purchaseId: p.id, listingId: l.id, currency: p.priceCurrency, refunded: p.priceAmount, balance, taken };
      await audit(deps, req, tx, { actor: auth, action: 'economy.refund', targetType: 'user', targetId: p.userId, targetName: target.user.username ?? target.user.displayName, reason: body.reason, after });
      return after;
    });
    return { ok: true, replayed, ...result };
  });

  /* ------------------------------------ sales ------------------------------------ */

  app.put('/api/admin/economy/sales/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'shop.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    const body = parse(z.object({ salePrice: z.number().int().min(1).max(1_000_000), startsAt: isoDate, endsAt: isoDate, reason: staffReasonSchema }), req.body);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (startsAt >= endsAt) throw new AppError(400, 'validation_failed', 'The sale has to end after it starts.', { endsAt: 'Must be after the start.' });
    if (endsAt <= new Date()) throw new AppError(400, 'validation_failed', 'That end date has already passed.', { endsAt: 'Choose a time in the future.' });
    if (endsAt.getTime() - startsAt.getTime() > 31 * 86_400_000) throw new AppError(400, 'validation_failed', 'A sale lasts at most 31 days.', { endsAt: 'At most 31 days after the start.' });
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(shopListings).where(eq(shopListings.id, id)).for('update');
      if (!before) throw notFound('No listing with that id.');
      if (body.salePrice >= before.priceAmount) throw new AppError(400, 'validation_failed', `A sale price has to be lower than the usual price (${before.priceAmount.toLocaleString('en-GB')}).`, { salePrice: 'Lower than the usual price.' });
      const [after] = await tx.update(shopListings).set({ salePrice: body.salePrice, saleStartsAt: startsAt, saleEndsAt: endsAt }).where(eq(shopListings.id, id)).returning();
      await audit(deps, req, tx, {
        actor: auth,
        action: 'listing.sale',
        targetType: 'listing',
        targetId: id,
        targetName: before.title ?? id,
        reason: body.reason,
        before: { salePrice: before.salePrice, saleStartsAt: before.saleStartsAt, saleEndsAt: before.saleEndsAt, priceAmount: before.priceAmount },
        after: { salePrice: after!.salePrice, saleStartsAt: after!.saleStartsAt, saleEndsAt: after!.saleEndsAt, priceAmount: after!.priceAmount },
      });
      return { ok: true, listing: after };
    });
  });

  app.post('/api/admin/economy/sales/:id/end', staffLimit(30), async (req) => {
    const auth = staff(req, 'shop.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    const body = parse(z.object({ reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(shopListings).where(eq(shopListings.id, id)).for('update');
      if (!before) throw notFound('No listing with that id.');
      if (before.salePrice === null) throw conflict('That listing has no sale.');
      await tx.update(shopListings).set({ salePrice: null, saleStartsAt: null, saleEndsAt: null }).where(eq(shopListings.id, id));
      await audit(deps, req, tx, {
        actor: auth,
        action: 'listing.sale_end',
        targetType: 'listing',
        targetId: id,
        targetName: before.title ?? id,
        reason: body.reason,
        before: { salePrice: before.salePrice, saleStartsAt: before.saleStartsAt, saleEndsAt: before.saleEndsAt },
        after: { salePrice: null },
      });
      return { ok: true };
    });
  });

  /* ------------------------------ economy history (audit) ------------------------------ */

  /**
   * The economy's own part of the audit log: rules, limits, grants, refunds, sales, listings,
   * currencies and events. An economy manager has no audit.read, so this is all of the audit log
   * they can see.
   */
  app.get('/api/admin/economy/activity', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const { before } = parse(z.object({ before: z.coerce.number().int().positive().optional() }), req.query);
    const actions = ['economy.grant', 'economy.revoke', 'economy.class_grant', 'economy.refund', 'economy.rules', 'economy.limits', 'economy.export', 'listing.create', 'listing.update', 'listing.sale', 'listing.sale_end', 'currency.create', 'currency.update', 'event.update'];
    const rows = await db
      .select({ id: auditLog.id, action: auditLog.action, actorName: auditLog.actorName, targetType: auditLog.targetType, targetName: auditLog.targetName, reason: auditLog.reason, after: auditLog.after, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(inArray(auditLog.action, actions), before ? lt(auditLog.id, before) : undefined))
      .orderBy(desc(auditLog.id))
      .limit(50);
    return { entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), nextBefore: rows.length === 50 ? rows[rows.length - 1]!.id : null };
  });

  /* ------------------------------------ CSV ------------------------------------ */

  app.get('/api/admin/economy/ledger.csv', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = staff(req, 'economy.view');
    const q = parse(z.object({ userId: z.string().uuid().optional(), currency: currencyCodeSchema.optional(), reason: z.string().max(40).optional() }), req.query);
    const actor = alias(users, 'actor');
    const conds: (SQL | undefined)[] = [];
    if (q.userId) conds.push(eq(ledger.userId, q.userId));
    if (q.currency) conds.push(eq(ledger.currency, q.currency));
    if (q.reason) conds.push(eq(ledger.reason, q.reason));
    const rows = await db
      .select({ l: ledger, username: users.username, name: users.displayName, isTest: users.isTestAccount, actorName: actor.displayName })
      .from(ledger)
      .innerJoin(users, eq(users.id, ledger.userId))
      .leftJoin(actor, eq(actor.id, ledger.actorId))
      .where(and(...conds))
      .orderBy(desc(ledger.id))
      .limit(5000);
    const header = ['id', 'time_utc', 'account', 'test_account', 'currency', 'change', 'balance_after', 'reason', 'staff', 'note'];
    const lines = [header.join(',')];
    for (const { l, username, name, isTest, actorName } of rows) {
      lines.push(
        [l.id, l.createdAt.toISOString(), username ?? name, isTest ? 'yes' : 'no', l.currency, l.unlimited ? 0 : l.delta, l.balanceAfter, l.reason, actorName ?? '', (l.metadata as { reason?: string } | null)?.reason ?? ''].map(csvCell).join(','),
      );
    }
    // A download of children's account history is itself recorded.
    await db.transaction((tx) => audit(deps, req, tx, { actor: auth, action: 'economy.export', targetType: q.userId ? 'user' : 'economy', targetId: q.userId ?? 'ledger', reason: 'Ledger downloaded as CSV', after: { rows: rows.length, filters: q } }));
    noStore(reply);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="ludora-ledger-${utcDay()}${q.userId ? '-one-account' : ''}.csv"`);
    return lines.join('\r\n') + '\r\n';
  });
}
