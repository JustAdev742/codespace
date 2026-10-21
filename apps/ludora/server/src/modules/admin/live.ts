import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gt, ilike, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CATALOG } from '@ludora/engine/catalog';
import { MODE_VISIBILITIES, ROLES, staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { auditLog, errorReports, featureFlags, gameSessions, users } from '../../db/schema.ts';
import { noStore } from '../../http/context.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { clearFlagCache } from '../flags/service.ts';
import { modeVisibility, setModeVisibility } from '../modes/service.ts';
import { audit, likeEscape, requireConfirm, staff, staffLimit } from './common.ts';

const startedAt = Date.now();
const VERSION = process.env.npm_package_version ?? '0.1.0';
const codeParam = z.object({ code: z.string().regex(/^\d{6}$/, 'Room codes are 6 digits.') });

export async function adminLiveRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ---------------------------------- rooms ---------------------------------- */

  app.get('/api/admin/rooms', async (req, reply) => {
    noStore(reply);
    staff(req, 'rooms.manage');
    const rooms = deps.rooms
      .list()
      .filter((r) => !r.isClosed())
      .map((r) => r.summary())
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
    return { rooms, totals: { rooms: rooms.length, players: rooms.reduce((n, r) => n + r.players, 0), sockets: deps.realtime?.connectedSockets() ?? null } };
  });

  app.get('/api/admin/rooms/:code', async (req, reply) => {
    noStore(reply);
    staff(req, 'rooms.manage');
    const { code } = parse(codeParam, req.params);
    const room = deps.rooms.get(code);
    if (!room) throw notFound('No live room with that code.');
    return {
      room: room.summary(),
      // Names and connection state only: reconnect tokens and answers never leave the room.
      players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, userId: p.userId, isGuest: p.isGuest, isBot: p.isBot, connected: p.connected, teamId: p.teamId })),
      setTitle: room.set.title,
      questions: room.set.questions.length,
    };
  });

  app.post('/api/admin/rooms/:code/close', staffLimit(20), async (req) => {
    const auth = staff(req, 'rooms.manage');
    const { code } = parse(codeParam, req.params);
    const body = parse(z.object({ reason: staffReasonSchema, confirm: z.string().max(10).optional() }), req.body);
    const room = deps.rooms.get(code);
    if (!room) throw notFound('No live room with that code.');
    requireConfirm(body.confirm, code, 'the room code');
    const before = room.summary();
    room.close('Ludora staff closed this room. Any game in progress was saved.');
    await audit(deps, req, db, { actor: auth, action: 'room.close', targetType: 'room', targetId: code, targetName: `${before.title}: ${before.setTitle}`, reason: body.reason, before });
    return { ok: true };
  });

  app.post('/api/admin/rooms/:code/remove-player', staffLimit(30), async (req) => {
    const auth = staff(req, 'rooms.manage');
    const { code } = parse(codeParam, req.params);
    const body = parse(z.object({ playerId: z.string().min(1).max(40), reason: staffReasonSchema }), req.body);
    const room = deps.rooms.get(code);
    if (!room) throw notFound('No live room with that code.');
    const p = room.players.get(body.playerId);
    if (!p) throw notFound('That player is not in the room.');
    const res = room.hostCommand({ cmd: 'kick', playerId: body.playerId });
    if (!res.ok) throw conflict(res.error.message);
    await audit(deps, req, db, { actor: auth, action: 'room.remove_player', targetType: 'room', targetId: code, targetName: p.name, reason: body.reason, after: { playerName: p.name, userId: p.userId } });
    return { ok: true };
  });

  /* ---------------------------------- modes ---------------------------------- */

  app.get('/api/admin/modes', async (req, reply) => {
    noStore(reply);
    staff(req, 'modes.manage');
    const vis = await modeVisibility(db);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const plays = await db
      .select({ modeId: gameSessions.modeId, variantId: gameSessions.variantId, n: count() })
      .from(gameSessions)
      .where(gt(gameSessions.endedAt, since))
      .groupBy(gameSessions.modeId, gameSessions.variantId);
    const playsOf = (modeId: string, variantId: string) => plays.filter((p) => p.modeId === modeId && p.variantId === variantId).reduce((n, p) => n + p.n, 0);
    return {
      modes: CATALOG.map((m) => ({
        id: m.meta.id,
        title: m.meta.title,
        status: m.meta.status,
        category: m.meta.category,
        visibility: vis.get(m.meta.id) ?? 'published',
        plays30d: plays.filter((p) => p.modeId === m.meta.id).reduce((n, p) => n + p.n, 0),
        variants: m.variants.map((v) => ({ id: v.meta.id, title: v.meta.title, status: v.meta.status, visibility: vis.get(v.meta.id) ?? 'published', plays30d: playsOf(m.meta.id, v.meta.id) })),
      })),
    };
  });

  app.put('/api/admin/modes/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'modes.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const body = parse(z.object({ visibility: z.enum(MODE_VISIBILITIES), reason: staffReasonSchema }), req.body);
    const exists = CATALOG.some((m) => m.meta.id === id || m.variants.some((v) => v.meta.id === id));
    if (!exists) throw notFound('No mode or variant with that id.');
    const before = (await modeVisibility(db)).get(id) ?? 'published';
    await db.transaction(async (tx) => {
      await setModeVisibility(tx, id, body.visibility, body.reason, auth.user.id);
      await audit(deps, req, tx, { actor: auth, action: 'mode.visibility', targetType: 'mode', targetId: id, reason: body.reason, before: { visibility: before }, after: { visibility: body.visibility } });
    });
    return { ok: true };
  });

  /* ---------------------------------- flags ---------------------------------- */

  app.get('/api/admin/flags', async (req, reply) => {
    noStore(reply);
    staff(req, 'flags.manage');
    const rows = await db.select({ f: featureFlags, by: users.displayName }).from(featureFlags).leftJoin(users, eq(users.id, featureFlags.updatedBy)).orderBy(featureFlags.key);
    return { flags: rows.map(({ f, by }) => ({ ...f, updatedAt: f.updatedAt.toISOString(), updatedBy: by })) };
  });

  app.patch('/api/admin/flags/:key', staffLimit(30), async (req) => {
    const auth = staff(req, 'flags.manage');
    const { key } = parse(z.object({ key: z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/) }), req.params);
    const body = parse(
      z.object({
        enabled: z.boolean().optional(),
        rolloutPercent: z.number().int().min(0).max(100).optional(),
        roles: z.array(z.enum(ROLES)).max(ROLES.length).optional(),
        userIds: z.array(z.string().uuid()).max(200).optional(),
        reason: staffReasonSchema,
      }),
      req.body,
    );
    const { reason, ...patch } = body;
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(featureFlags).where(eq(featureFlags.key, key)).for('update');
      if (!before) throw notFound('No flag with that key.');
      const [after] = await tx.update(featureFlags).set({ ...patch, updatedAt: new Date(), updatedBy: auth.user.id }).where(eq(featureFlags.key, key)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'flag.update', targetType: 'flag', targetId: key, reason, before, after });
      clearFlagCache();
      return { ok: true, flag: after };
    });
  });

  /* --------------------------------- system ---------------------------------- */

  app.get('/api/admin/system', async (req, reply) => {
    noStore(reply);
    staff(req, 'system.view');
    const t0 = performance.now();
    await deps.pool.query('select 1');
    const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;
    const day = new Date(Date.now() - 86_400_000);
    const [sizeRow, counts, errors] = await Promise.all([
      deps.pool.query<{ size: string }>('select pg_database_size(current_database()) as size'),
      db.execute<{ users: string; guests: string; tests: string; active_day: string; games_day: string }>(sql`
        select
          count(*) filter (where not is_guest) as users,
          count(*) filter (where is_guest) as guests,
          count(*) filter (where is_test_account) as tests,
          count(*) filter (where last_seen_at > ${day}) as active_day,
          (select count(*) from game_sessions where ended_at > ${day}) as games_day
        from users`),
      db.select({ source: errorReports.source, n: count() }).from(errorReports).where(gt(errorReports.createdAt, day)).groupBy(errorReports.source),
    ]);
    const mem = process.memoryUsage();
    const rooms = deps.rooms.list().filter((r) => !r.isClosed());
    const c = counts.rows[0];
    return {
      environment: deps.config.APP_ENV,
      version: VERSION,
      node: process.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
      database: { ok: true, latencyMs: dbLatencyMs, sizeMb: Math.round(Number(sizeRow.rows[0]?.size ?? 0) / 1048576), pool: { total: deps.pool.totalCount, idle: deps.pool.idleCount, waiting: deps.pool.waitingCount } },
      realtime: { rooms: rooms.length, running: rooms.filter((r) => r.status === 'running').length, players: rooms.reduce((n, r) => n + r.players.size, 0), sockets: deps.realtime?.connectedSockets() ?? null },
      accounts: { registered: Number(c?.users ?? 0), guests: Number(c?.guests ?? 0), test: Number(c?.tests ?? 0), activeLastDay: Number(c?.active_day ?? 0) },
      gamesLastDay: Number(c?.games_day ?? 0),
      errorsLastDay: Object.fromEntries(errors.map((e) => [e.source, e.n])),
      features: { aiQuestionDrafts: Boolean(deps.config.ANTHROPIC_API_KEY), email: Boolean(deps.config.SMTP_URL) },
    };
  });

  app.get('/api/admin/errors', async (req, reply) => {
    noStore(reply);
    staff(req, 'system.view');
    const q = parse(z.object({ source: z.enum(['server', 'client', 'realtime']).optional(), before: z.coerce.number().int().positive().optional() }), req.query);
    const conds: (SQL | undefined)[] = [];
    if (q.source) conds.push(eq(errorReports.source, q.source));
    if (q.before) conds.push(lt(errorReports.id, q.before));
    const rows = await db.select().from(errorReports).where(and(...conds)).orderBy(desc(errorReports.id)).limit(50);
    return {
      errors: rows.map((e) => ({ id: e.id, source: e.source, message: e.message, stack: e.stack, context: e.context, userId: e.userId, createdAt: e.createdAt.toISOString() })),
      nextBefore: rows.length === 50 ? rows[rows.length - 1]!.id : null,
    };
  });

  /* ---------------------------------- audit ---------------------------------- */

  app.get('/api/admin/audit', async (req, reply) => {
    noStore(reply);
    staff(req, 'audit.read');
    const q = parse(
      z.object({
        actorId: z.string().uuid().optional(),
        action: z.string().regex(/^[a-z_.]{1,40}$/).optional(),
        targetType: z.string().max(20).optional(),
        targetId: z.string().max(64).optional(),
        q: z.string().trim().max(60).optional(),
        before: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );
    const conds: (SQL | undefined)[] = [];
    if (q.actorId) conds.push(eq(auditLog.actorId, q.actorId));
    if (q.action) conds.push(ilike(auditLog.action, `${likeEscape(q.action)}%`));
    if (q.targetType) conds.push(eq(auditLog.targetType, q.targetType));
    if (q.targetId) conds.push(eq(auditLog.targetId, q.targetId));
    if (q.q) conds.push(sql`(${auditLog.actorName} ilike ${`%${likeEscape(q.q)}%`} or ${auditLog.targetName} ilike ${`%${likeEscape(q.q)}%`} or ${auditLog.reason} ilike ${`%${likeEscape(q.q)}%`})`);
    if (q.before) conds.push(lt(auditLog.id, q.before));
    const rows = await db.select().from(auditLog).where(and(...conds)).orderBy(desc(auditLog.id)).limit(50);
    return {
      entries: rows.map((a) => ({ ...a, ipHash: undefined, createdAt: a.createdAt.toISOString() })),
      nextBefore: rows.length === 50 ? rows[rows.length - 1]!.id : null,
    };
  });
}
