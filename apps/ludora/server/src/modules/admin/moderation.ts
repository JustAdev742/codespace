import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { REPORT_REASON_INFO, REPORT_TARGETS, reportSchema, staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { moderationActions, questionSets, reports, users } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { canView, loadSet } from '../sets/access.ts';
import { audit, likeEscape, staff, staffLimit } from './common.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const setParam = z.object({ id: z.string().uuid('No set with that id.') });

/** Notices a player must see: warnings, mutes and name resets, until they dismiss them. */
/** What the player is told about: moderation, and a teacher making them a new recovery code (D38). */
const NOTICE_ACTIONS = ['warn', 'mute', 'reset_name', 'unmute', 'teacher_recovery_code'] as const;

export async function moderationRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ------------------------------ for players ------------------------------- */

  /**
   * Report a player, a set or a live room. The response never says whether
   * the target exists or was already reported, so reports cannot be used to
   * probe for accounts. Repeat reports of the same thing are merged.
   */
  app.post(
    '/api/reports',
    { config: { rateLimit: { max: 8, timeWindow: '10 minutes', keyGenerator: (req) => (req.auth ? `report:${req.auth.user.id}` : `report-ip:${req.ip || 'gone'}`) } } },
    async (req) => {
      const auth = requireAuth(req);
      const body = parse(reportSchema, req.body);
      if (!REPORT_REASON_INFO[body.reason].targets.includes(body.targetType)) throw new AppError(400, 'validation_failed', 'That reason does not fit what you are reporting.', { reason: 'Pick another reason.' });
      let targetId = body.targetId;
      let details = body.details;
      if (body.targetType === 'user') {
        if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === auth.user.id) return { ok: true };
        const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
        if (!u) return { ok: true };
      } else if (body.targetType === 'set') {
        const set = await loadSet(db, targetId);
        if (!set || !canView(set, auth)) return { ok: true };
      } else {
        // Rooms disappear when the game ends, so keep a snapshot of who hosted it and what was playing.
        const room = deps.rooms.get(targetId);
        if (!room) return { ok: true };
        const players = [...room.players.values()].filter((p) => !p.isBot).map((p) => p.name).slice(0, 40);
        details = `${details}\n\n[Room ${room.code}] host: ${room.hostName} (${room.hostUserId}); mode: ${room.mode.meta.id}; set: ${room.set.title}; players: ${players.join(', ')}`.trim();
        targetId = room.code;
      }
      const [open] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(and(eq(reports.reporterId, auth.user.id), eq(reports.targetType, body.targetType), eq(reports.targetId, targetId), eq(reports.status, 'open')))
        .limit(1);
      if (!open) await db.insert(reports).values({ reporterId: auth.user.id, targetType: body.targetType, targetId, reason: body.reason, details });
      return { ok: true };
    },
  );

  app.get('/api/me/notices', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const rows = await db
      .select()
      .from(moderationActions)
      .where(and(eq(moderationActions.targetUserId, auth.user.id), inArray(moderationActions.action, [...NOTICE_ACTIONS]), isNull(moderationActions.acknowledgedAt)))
      .orderBy(desc(moderationActions.createdAt))
      .limit(5);
    return { notices: rows.map((r) => ({ id: r.id, action: r.action, reason: r.reason, until: r.until?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })) };
  });

  app.post('/api/me/notices/:id/ack', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await db
      .update(moderationActions)
      .set({ acknowledgedAt: new Date() })
      .where(and(eq(moderationActions.id, id), eq(moderationActions.targetUserId, auth.user.id), isNull(moderationActions.acknowledgedAt)));
    return { ok: true };
  });

  /* -------------------------------- for staff -------------------------------- */

  app.get('/api/admin/reports', async (req, reply) => {
    noStore(reply);
    staff(req, 'reports.handle');
    const q = parse(
      z.object({ status: z.enum(['open', 'resolved']).default('open'), targetType: z.enum(REPORT_TARGETS).optional(), offset: z.coerce.number().int().min(0).max(10_000).default(0) }),
      req.query,
    );
    const reporter = alias(users, 'reporter');
    const resolver = alias(users, 'resolver');
    const conds: (SQL | undefined)[] = [eq(reports.status, q.status)];
    if (q.targetType) conds.push(eq(reports.targetType, q.targetType));
    const where = and(...conds);
    const [rows, [total], counts] = await Promise.all([
      db
        .select({ r: reports, reporterName: reporter.displayName, resolverName: resolver.displayName })
        .from(reports)
        .leftJoin(reporter, eq(reporter.id, reports.reporterId))
        .leftJoin(resolver, eq(resolver.id, reports.resolvedBy))
        .where(where)
        .orderBy(q.status === 'open' ? reports.createdAt : desc(reports.resolvedAt))
        .limit(50)
        .offset(q.offset),
      db.select({ n: count() }).from(reports).where(where),
      db.select({ targetType: reports.targetType, n: count() }).from(reports).where(eq(reports.status, 'open')).groupBy(reports.targetType),
    ]);
    // Describe each target, so moderators can triage without opening every report.
    const userIds = rows.filter((x) => x.r.targetType === 'user').map((x) => x.r.targetId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const setIds = rows.filter((x) => x.r.targetType === 'set').map((x) => x.r.targetId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const [targetUsers, targetSets] = await Promise.all([
      userIds.length ? db.select({ id: users.id, username: users.username, displayName: users.displayName, status: users.status, isGuest: users.isGuest }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
      setIds.length ? db.select({ id: questionSets.id, title: questionSets.title, visibility: questionSets.visibility, hiddenAt: questionSets.hiddenAt, ownerId: questionSets.ownerId }).from(questionSets).where(inArray(questionSets.id, setIds)) : Promise.resolve([]),
    ]);
    const sameTarget = await db
      .select({ targetType: reports.targetType, targetId: reports.targetId, n: count() })
      .from(reports)
      .where(eq(reports.status, 'open'))
      .groupBy(reports.targetType, reports.targetId);
    return {
      total: total?.n ?? 0,
      offset: q.offset,
      open: Object.fromEntries(counts.map((c) => [c.targetType, c.n])),
      reports: rows.map(({ r, reporterName, resolverName }) => {
        const tu = r.targetType === 'user' ? targetUsers.find((u) => u.id === r.targetId) : undefined;
        const ts = r.targetType === 'set' ? targetSets.find((s) => s.id === r.targetId) : undefined;
        return {
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          target: tu
            ? { label: tu.username ? `${tu.displayName} (@${tu.username})` : `${tu.displayName} (guest)`, status: tu.status }
            : ts
              ? { label: ts.title, status: ts.hiddenAt ? 'hidden' : ts.visibility }
              : { label: r.targetType === 'room' ? `Room ${r.targetId}` : 'No longer exists', status: null },
          reason: r.reason,
          details: r.details,
          reporter: reporterName ?? 'Deleted account',
          openReportsOnTarget: sameTarget.find((s) => s.targetType === r.targetType && s.targetId === r.targetId)?.n ?? 0,
          status: r.status,
          resolution: r.resolution,
          resolvedBy: resolverName,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        };
      }),
    };
  });

  app.post('/api/admin/reports/:id/resolve', staffLimit(60), async (req) => {
    const auth = staff(req, 'reports.handle');
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ outcome: z.enum(['dismissed', 'actioned']), note: staffReasonSchema, alsoSameTarget: z.boolean().default(false) }), req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.select().from(reports).where(eq(reports.id, id)).for('update');
      if (!r) throw notFound('No report with that id.');
      if (r.status !== 'open') throw conflict('That report is already resolved.');
      const where = body.alsoSameTarget
        ? and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'open'))
        : eq(reports.id, id);
      const done = await tx
        .update(reports)
        .set({ status: 'resolved', resolvedBy: auth.user.id, resolvedAt: new Date(), resolution: `${body.outcome}: ${body.note}` })
        .where(where)
        .returning({ id: reports.id });
      await audit(deps, req, tx, { actor: auth, action: `report.${body.outcome}`, targetType: r.targetType, targetId: r.targetId, reason: body.note, after: { reports: done.map((d) => d.id) } });
      return { ok: true, resolved: done.length };
    });
  });

  app.post('/api/admin/reports/:id/reopen', staffLimit(30), async (req) => {
    const auth = staff(req, 'reports.handle');
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.select().from(reports).where(eq(reports.id, id)).for('update');
      if (!r) throw notFound('No report with that id.');
      if (r.status === 'open') throw conflict('That report is already open.');
      await tx.update(reports).set({ status: 'open', resolvedBy: null, resolvedAt: null, resolution: null }).where(eq(reports.id, id));
      await audit(deps, req, tx, { actor: auth, action: 'report.reopen', targetType: r.targetType, targetId: r.targetId, reason: body.reason, before: { resolution: r.resolution } });
      return { ok: true };
    });
  });

  /* --------------------------- question set review --------------------------- */

  app.get('/api/admin/sets', async (req, reply) => {
    noStore(reply);
    staff(req, 'content.moderate');
    const q = parse(
      z.object({
        q: z.string().trim().max(80).optional(),
        filter: z.enum(['public', 'reported', 'hidden', 'featured', 'all']).default('public'),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
      }),
      req.query,
    );
    const owner = alias(users, 'owner');
    const openReports = sql<number>`(select count(*)::int from ${reports} where ${reports.targetType} = 'set' and ${reports.targetId} = ${questionSets.id}::text and ${reports.status} = 'open')`;
    const conds: (SQL | undefined)[] = [];
    if (q.q) conds.push(sql`(${questionSets.title} ilike ${`%${likeEscape(q.q)}%`} or ${owner.username} ilike ${`%${likeEscape(q.q)}%`})`);
    if (q.filter === 'public') conds.push(and(eq(questionSets.visibility, 'public'), isNull(questionSets.hiddenAt)));
    if (q.filter === 'hidden') conds.push(isNotNull(questionSets.hiddenAt));
    if (q.filter === 'featured') conds.push(eq(questionSets.isFeatured, true));
    if (q.filter === 'reported') conds.push(sql`${openReports} > 0`);
    const where = and(...conds);
    const [rows, [total]] = await Promise.all([
      db
        .select({ s: questionSets, ownerName: owner.displayName, ownerUsername: owner.username, openReports })
        .from(questionSets)
        .leftJoin(owner, eq(owner.id, questionSets.ownerId))
        .where(where)
        .orderBy(desc(questionSets.updatedAt))
        .limit(50)
        .offset(q.offset),
      db.select({ n: count() }).from(questionSets).leftJoin(owner, eq(owner.id, questionSets.ownerId)).where(where),
    ]);
    return {
      total: total?.n ?? 0,
      offset: q.offset,
      pageSize: 50,
      sets: rows.map(({ s, ownerName, ownerUsername, openReports: n }) => ({
        id: s.id,
        title: s.title,
        subject: s.subject,
        visibility: s.visibility,
        questionCount: s.questionCount,
        isOfficial: s.isOfficial,
        isFeatured: s.isFeatured,
        hidden: Boolean(s.hiddenAt),
        hiddenReason: s.hiddenReason,
        plays: s.plays,
        owner: s.isOfficial ? 'Ludora' : ownerUsername ? `${ownerName} (@${ownerUsername})` : (ownerName ?? 'Deleted account'),
        openReports: n,
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  });

  /** The whole set, answers included, so a moderator can check it. */
  app.get('/api/admin/sets/:id', async (req, reply) => {
    noStore(reply);
    staff(req, 'content.moderate');
    const { id } = parse(setParam, req.params);
    const set = await loadSet(db, id);
    if (!set) throw notFound('No set with that id.');
    const [owner] = set.ownerId ? await db.select({ displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, set.ownerId)).limit(1) : [];
    const setReports = await db.select().from(reports).where(and(eq(reports.targetType, 'set'), eq(reports.targetId, id))).orderBy(desc(reports.createdAt)).limit(20);
    return {
      set: { ...set, search: undefined, createdAt: set.createdAt.toISOString(), updatedAt: set.updatedAt.toISOString(), hiddenAt: set.hiddenAt?.toISOString() ?? null },
      owner: owner ?? null,
      reports: setReports.map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt.toISOString() })),
    };
  });

  app.post('/api/admin/sets/:id/visibility', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(setParam, req.params);
    const body = parse(z.object({ action: z.enum(['hide', 'unhide', 'feature', 'unfeature']), reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const [set] = await tx.select().from(questionSets).where(eq(questionSets.id, id)).for('update');
      if (!set) throw notFound('No set with that id.');
      const before = { hidden: Boolean(set.hiddenAt), featured: set.isFeatured };
      let patch: Partial<typeof questionSets.$inferInsert>;
      switch (body.action) {
        case 'hide':
          if (set.hiddenAt) throw conflict('That set is already hidden.');
          patch = { hiddenAt: new Date(), hiddenReason: body.reason, isFeatured: false };
          break;
        case 'unhide':
          if (!set.hiddenAt) throw conflict('That set is not hidden.');
          patch = { hiddenAt: null, hiddenReason: null };
          break;
        case 'feature':
          if (set.hiddenAt || set.visibility !== 'public') throw conflict('Only public sets that are not hidden can be featured.');
          patch = { isFeatured: true };
          break;
        case 'unfeature':
          patch = { isFeatured: false };
          break;
      }
      await tx.update(questionSets).set(patch).where(eq(questionSets.id, id));
      await audit(deps, req, tx, {
        actor: auth,
        action: `set.${body.action}`,
        targetType: 'set',
        targetId: id,
        targetName: set.title,
        reason: body.reason,
        before,
        after: { hidden: patch.hiddenAt !== undefined ? Boolean(patch.hiddenAt) : before.hidden, featured: patch.isFeatured ?? before.featured },
      });
      return { ok: true };
    });
  });
}
