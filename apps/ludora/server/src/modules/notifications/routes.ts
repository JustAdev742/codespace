import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { roomCodeSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { notifications } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { isFlagOn } from '../flags/service.ts';
import { areFriends, blockedEitherWay } from '../social/service.ts';
import { listNotifications, notify, unreadCount, workDue } from './service.ts';

export async function notificationRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/notifications', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }), req.query);
    const [page, due] = await Promise.all([listNotifications(db, auth.user.id, q), q.before ? Promise.resolve([]) : workDue(db, auth.user.id)]);
    return { due, items: page.items, nextBefore: page.nextBefore ? String(page.nextBefore) : null };
  });

  /** For the bell in the header: unread notifications plus work due soon. */
  app.get('/api/notifications/count', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [unread, due] = await Promise.all([unreadCount(db, auth.user.id), workDue(db, auth.user.id)]);
    return { unread: unread + due.length };
  });

  app.post('/api/notifications/read', async (req) => {
    const auth = requireAuth(req);
    const { ids } = parse(z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(100).optional() }), req.body ?? {});
    // Only ever the player's own rows: someone else's id simply matches nothing.
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, auth.user.id), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined));
    return { ok: true, unread: await unreadCount(db, auth.user.id) };
  });

  app.post('/api/notifications/:id/unread', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const done = await db.update(notifications).set({ readAt: null }).where(and(eq(notifications.userId, auth.user.id), eq(notifications.id, id))).returning({ id: notifications.id });
    if (!done.length) throw notFound('That notification is not there any more.');
    return { ok: true };
  });

  /**
   * Invite a friend to a game you are in or hosting. The friend gets a notification with the
   * join link. Only accepted friends, never across a block, and only for a room that is open
   * to them now; the server checks the sender belongs to that room.
   */
  app.post('/api/invites', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    if (!(await isFlagOn(db, 'social.friends', auth))) throw new AppError(403, 'not_available', 'Friends are switched off at the moment.');
    const body = parse(z.object({ userId: z.string().uuid(), code: roomCodeSchema }), req.body);
    const room = deps.rooms.get(body.code);
    const mine = room && !room.isClosed() && !room.solo && (room.hostUserId === auth.user.id || [...room.roster.values()].some((r) => r.userId === auth.user.id));
    if (!room || !mine) throw new AppError(404, 'room_not_found', 'That game has closed, so there is nothing to invite them to.');
    const open = !room.locked && (room.status === 'lobby' || ((room.status === 'running' || room.status === 'paused') && room.options.lateJoin));
    if (!open) throw new AppError(409, 'conflict', 'This game is not taking new players right now.');
    const block = await blockedEitherWay(db, auth.user.id, body.userId);
    if (block.byMe || block.byThem || !(await areFriends(db, auth.user.id, body.userId))) throw new AppError(403, 'forbidden', 'You can invite your friends only.');
    const title = room.variant?.meta.title ?? room.mode.meta.title;
    await notify(db, { userId: body.userId, kind: 'invite', title: `${auth.user.displayName} invited you to play ${title}`, body: `Join code ${room.code}`, link: `/join/${room.code}`, actorId: auth.user.id, dedupeKey: `invite:${room.code}:${room.createdAt}:${auth.user.id}` });
    return { ok: true };
  });
}
