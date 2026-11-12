import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  REPORT_REASONS,
  copiesCatalogue,
  decodeDesign,
  designInputSchema,
  designNameSchema,
  designSlotsFor,
  staffReasonSchema,
  tidyGlim,
  wearSlotOf,
  type DesignInput,
  type DesignKind,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { designs, inventory, items, reports, users, wornDesigns } from '../../db/schema.ts';
import { noStore, requireAuth, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';

/*
 * "My designs": any account (guests too) designs Glims and items for itself to wear. Everything is
 * decided here, never in the browser: the design is validated against the shared schema with hard
 * caps, the name follows the display-name rules, the number of designs is held to the account's
 * slots for its level, a design may not copy the look of anything in the catalogue (that would be a
 * way round the shop), and only the owner can change, delete or wear a design. Staff with
 * content.moderate can hide one; a hidden design is not worn and nobody else sees it.
 */

type DesignRow = typeof designs.$inferSelect;

const idParam = z.object({ id: z.string().uuid('No design with that id.') });

/** Per-account limits for design writes, so nobody can churn through the database. */
function limit(max: number) {
  return { config: { rateLimit: { max, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => (req.auth ? `designs:${req.auth.user.id}` : `designs-ip:${req.ip || 'gone'}`) } } };
}

function view(r: DesignRow, worn: Set<string>) {
  return {
    id: r.id,
    kind: r.kind as DesignKind,
    name: r.name,
    art: r.art,
    worn: worn.has(r.id),
    hidden: r.hiddenAt ? { reason: r.hiddenReason ?? 'Hidden by staff.' } : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Normalise the art so equal looks are stored alike (defaults dropped). */
function tidy(d: DesignInput): DesignInput {
  return d.kind === 'glim' ? { ...d, art: tidyGlim(d.art) } : d;
}

/** Refuse a design that copies the look of a catalogue item of its kind (anything sold or ever sold). */
async function assertNotCatalogue(db: DbOrTx, d: DesignInput) {
  const rows = await db.select({ art: items.art }).from(items).where(eq(items.type, d.kind));
  if (rows.some((r) => copiesCatalogue(d.kind, d.art, r.art))) {
    throw new AppError(409, 'conflict', d.kind === 'glim' ? 'That looks just like a Glim from the shop or the collection. Change its shape, colours, markings or parts to make it your own.' : 'That looks just like an item from the shop. Change its colours or paint an emblem on it to make it your own.', { art: 'Too close to a catalogue item.' });
  }
}

async function slotsOf(db: DbOrTx, userId: string, lock = false) {
  // Lock the account row so two saves at once cannot both take the last slot.
  const q = db.select({ level: users.level }).from(users).where(eq(users.id, userId)).limit(1);
  const [u] = lock ? await q.for('update') : await q;
  const [{ used } = { used: 0 }] = await db.select({ used: count() }).from(designs).where(eq(designs.ownerId, userId));
  const { max, nextAt } = designSlotsFor(u?.level ?? 1);
  return { used: Number(used), max, nextAt, level: u?.level ?? 1 };
}

async function assertSlotFree(db: DbOrTx, userId: string) {
  const s = await slotsOf(db, userId, true);
  if (s.used >= s.max) {
    throw new AppError(409, 'conflict', s.nextAt ? `All ${s.max} design slots are in use. Delete one, or reach level ${s.nextAt} for another.` : `All ${s.max} design slots are in use. Delete one to make another.`);
  }
}

async function loadOwn(db: DbOrTx, id: string, auth: AuthContext, lock = false): Promise<DesignRow> {
  const q = db.select().from(designs).where(eq(designs.id, id)).limit(1);
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw notFound('No design with that id.');
  if (row.ownerId !== auth.user.id) throw forbidden('That design belongs to someone else.');
  return row;
}

async function wornIds(db: DbOrTx, userId: string): Promise<Set<string>> {
  const rows = await db.select({ designId: wornDesigns.designId }).from(wornDesigns).where(eq(wornDesigns.userId, userId));
  return new Set(rows.map((r) => r.designId));
}

export async function designRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** My designs, my slots, and the Glims I own (to start a design from). */
  app.get('/api/designs', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [rows, worn, slots, owned] = await Promise.all([
      db.select().from(designs).where(eq(designs.ownerId, auth.user.id)).orderBy(desc(designs.updatedAt)).limit(50),
      wornIds(db, auth.user.id),
      slotsOf(db, auth.user.id),
      db
        .select({ id: items.id, name: items.name, art: items.art })
        .from(inventory)
        .innerJoin(items, eq(items.id, inventory.itemId))
        .where(and(eq(inventory.userId, auth.user.id), eq(items.type, 'glim'), gt(inventory.quantity, 0)))
        .orderBy(items.name)
        .limit(300),
    ]);
    return { designs: rows.map((r) => view(r, worn)), slots, owned };
  });

  /** Would this be accepted? The editor asks as you change things, so problems show before saving. */
  app.post('/api/designs/check', limit(120), async (req) => {
    requireAuth(req);
    const d = tidy(parse(designInputSchema, req.body));
    try {
      await assertNotCatalogue(db, d);
      return { ok: true, problem: null };
    } catch (err) {
      if (err instanceof AppError && err.status === 409) return { ok: false, problem: err.message };
      throw err;
    }
  });

  app.post('/api/designs', limit(30), async (req) => {
    const auth = requireAuth(req);
    const d = tidy(parse(designInputSchema, req.body));
    return db.transaction(async (tx) => {
      await assertSlotFree(tx, auth.user.id);
      await assertNotCatalogue(tx, d);
      const [row] = await tx.insert(designs).values({ ownerId: auth.user.id, kind: d.kind, name: d.name, art: d.art }).returning();
      return { design: view(row!, new Set()) };
    });
  });

  app.patch('/api/designs/:id', limit(60), async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const d = tidy(parse(designInputSchema, req.body));
    return db.transaction(async (tx) => {
      const row = await loadOwn(tx, id, auth, true);
      if (row.kind !== d.kind) throw new AppError(400, 'validation_failed', 'A design keeps its kind. Make a new design instead.');
      if (row.hiddenAt) throw conflict('Staff hid this design, so it cannot be changed. You can delete it.');
      await assertNotCatalogue(tx, d);
      // An item moved to another slot stops being worn in the old one.
      if (wearSlotOf({ kind: row.kind as DesignKind, art: row.art }) !== wearSlotOf(d)) await tx.delete(wornDesigns).where(and(eq(wornDesigns.userId, auth.user.id), eq(wornDesigns.designId, id)));
      const [after] = await tx.update(designs).set({ name: d.name, art: d.art, updatedAt: new Date() }).where(eq(designs.id, id)).returning();
      return { design: view(after!, await wornIds(tx, auth.user.id)) };
    });
  });

  app.delete('/api/designs/:id', limit(30), async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await loadOwn(db, id, auth);
    await db.delete(designs).where(and(eq(designs.id, id), eq(designs.ownerId, auth.user.id)));
    return { ok: true };
  });

  app.post('/api/designs/:id/duplicate', limit(30), async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    return db.transaction(async (tx) => {
      const row = await loadOwn(tx, id, auth);
      if (row.hiddenAt) throw conflict('Staff hid this design, so it cannot be copied.');
      await assertSlotFree(tx, auth.user.id);
      const name = designNameSchema.safeParse(`${row.name.slice(0, 19)} copy`);
      const [copy] = await tx.insert(designs).values({ ownerId: auth.user.id, kind: row.kind, name: name.success ? name.data : row.name, art: row.art }).returning();
      return { design: view(copy!, new Set()) };
    });
  });

  /** Wear one of my designs: a Glim as my buddy, an item in its slot. It shows wherever my avatar does. */
  app.post('/api/designs/:id/wear', limit(60), async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const row = await loadOwn(db, id, auth);
    if (row.hiddenAt) throw conflict('Staff hid this design, so it cannot be worn.');
    const slot = wearSlotOf({ kind: row.kind as DesignKind, art: row.art });
    await db
      .insert(wornDesigns)
      .values({ userId: auth.user.id, slot, designId: id })
      .onConflictDoUpdate({ target: [wornDesigns.userId, wornDesigns.slot], set: { designId: id, createdAt: new Date() } });
    return { ok: true, slot };
  });

  app.post('/api/designs/unwear', limit(60), async (req) => {
    const auth = requireAuth(req);
    const { slot } = parse(z.object({ slot: z.enum(['buddy', 'hat', 'eyes', 'neck']) }), req.body);
    await db.delete(wornDesigns).where(and(eq(wornDesigns.userId, auth.user.id), eq(wornDesigns.slot, slot)));
    return { ok: true };
  });

  /** Turn a design code into a design of my own. The code carries only the look; the name is mine. */
  app.post('/api/designs/import', limit(20), async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ code: z.string().max(700), name: z.string().max(60) }), req.body);
    const decoded = decodeDesign(body.code);
    if (!decoded) throw new AppError(400, 'validation_failed', 'That design code is not right. Check it was copied in full.', { code: 'Not a design code.' });
    const d = tidy(parse(designInputSchema, { ...decoded, name: body.name }));
    return db.transaction(async (tx) => {
      await assertSlotFree(tx, auth.user.id);
      await assertNotCatalogue(tx, d);
      const [row] = await tx.insert(designs).values({ ownerId: auth.user.id, kind: d.kind, name: d.name, art: d.art }).returning();
      return { design: view(row!, new Set()) };
    });
  });

  /**
   * Report someone's design (seen worn in a lobby or on a profile). Like other reports, the answer
   * never says whether the design exists, and repeat reports of the same design are merged.
   */
  app.post(
    '/api/designs/:id/report',
    { config: { rateLimit: { max: 8, timeWindow: '10 minutes', keyGenerator: (req: FastifyRequest) => (req.auth ? `report:${req.auth.user.id}` : `report-ip:${req.ip || 'gone'}`) } } },
    async (req) => {
      const auth = requireAuth(req);
      const { id } = parse(idParam, req.params);
      const body = parse(z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(1000).default('') }), req.body);
      const [row] = await db.select({ id: designs.id, ownerId: designs.ownerId, name: designs.name }).from(designs).where(eq(designs.id, id)).limit(1);
      if (!row || row.ownerId === auth.user.id) return { ok: true };
      const [open] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(and(eq(reports.reporterId, auth.user.id), eq(reports.targetType, 'design'), eq(reports.targetId, id), eq(reports.status, 'open')))
        .limit(1);
      if (!open) await db.insert(reports).values({ reporterId: auth.user.id, targetType: 'design', targetId: id, reason: body.reason, details: `${body.details}\n\n[Design "${row.name}" by ${row.ownerId}]`.trim() });
      return { ok: true };
    },
  );

  /* ---------------------------------- staff ---------------------------------- */

  /** Designs to look at: reported ones first, or hidden ones, or the newest. */
  app.get('/api/staff/designs', async (req, reply) => {
    noStore(reply);
    staff(req, 'content.moderate');
    const { filter } = parse(z.object({ filter: z.enum(['reported', 'hidden', 'recent']).default('reported') }), req.query);
    const reportRows = await db
      .select({ targetId: reports.targetId, n: count() })
      .from(reports)
      .where(and(eq(reports.targetType, 'design'), eq(reports.status, 'open')))
      .groupBy(reports.targetId);
    const reportCount = new Map(reportRows.map((r) => [r.targetId, Number(r.n)]));
    const reportedIds = [...reportCount.keys()].filter((id) => z.string().uuid().safeParse(id).success);
    const where =
      filter === 'reported' ? (reportedIds.length ? inArray(designs.id, reportedIds) : sql`false`) : filter === 'hidden' ? isNotNull(designs.hiddenAt) : isNull(designs.hiddenAt);
    const rows = await db
      .select({ d: designs, ownerName: users.displayName, ownerUsername: users.username })
      .from(designs)
      .innerJoin(users, eq(users.id, designs.ownerId))
      .where(where)
      .orderBy(desc(designs.updatedAt))
      .limit(100);
    return {
      designs: rows.map((r) => ({
        id: r.d.id,
        kind: r.d.kind,
        name: r.d.name,
        art: r.d.art,
        owner: { id: r.d.ownerId, name: r.ownerName, username: r.ownerUsername },
        reports: reportCount.get(r.d.id) ?? 0,
        hidden: r.d.hiddenAt ? { reason: r.d.hiddenReason, at: r.d.hiddenAt.toISOString() } : null,
        updatedAt: r.d.updatedAt.toISOString(),
      })),
    };
  });

  /** Hide or show a design, with a reason, audited. Hiding takes it off whoever wears it and closes its open reports. */
  app.post('/api/staff/designs/:id/visibility', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ action: z.enum(['hide', 'unhide']), reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(designs).where(eq(designs.id, id)).for('update');
      if (!row) throw notFound('No design with that id.');
      if (body.action === 'hide') {
        if (row.hiddenAt) throw conflict('That design is already hidden.');
        await tx.update(designs).set({ hiddenAt: new Date(), hiddenReason: body.reason, hiddenBy: auth.user.id }).where(eq(designs.id, id));
        await tx.delete(wornDesigns).where(eq(wornDesigns.designId, id));
        await tx
          .update(reports)
          .set({ status: 'resolved', resolvedBy: auth.user.id, resolution: `Design hidden: ${body.reason}`, resolvedAt: new Date() })
          .where(and(eq(reports.targetType, 'design'), eq(reports.targetId, id), eq(reports.status, 'open')));
      } else {
        if (!row.hiddenAt) throw conflict('That design is not hidden.');
        await tx.update(designs).set({ hiddenAt: null, hiddenReason: null, hiddenBy: null }).where(eq(designs.id, id));
      }
      await audit(deps, req, tx, { actor: auth, action: `design.${body.action}`, targetType: 'design', targetId: id, targetName: row.name, reason: body.reason, before: { hidden: Boolean(row.hiddenAt) }, after: { hidden: body.action === 'hide' } });
      return { ok: true };
    });
  });
}

/** For avatars: each player's worn designs that are not hidden, by slot. */
export async function wornDesignsOf(db: DbOrTx, userIds: readonly string[]): Promise<Map<string, { slot: string; id: string; name: string; kind: string; art: unknown }[]>> {
  const out = new Map<string, { slot: string; id: string; name: string; kind: string; art: unknown }[]>();
  if (!userIds.length) return out;
  const rows = await db
    .select({ userId: wornDesigns.userId, slot: wornDesigns.slot, id: designs.id, name: designs.name, kind: designs.kind, art: designs.art })
    .from(wornDesigns)
    .innerJoin(designs, and(eq(designs.id, wornDesigns.designId), eq(designs.ownerId, wornDesigns.userId), isNull(designs.hiddenAt)))
    .where(inArray(wornDesigns.userId, [...userIds]));
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({ slot: r.slot, id: r.id, name: r.name, kind: r.kind, art: r.art });
    out.set(r.userId, list);
  }
  return out;
}

