import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { levelFromXp } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { blocks, classMembers, classes, friendships, gameParticipants, gameSessions, users, userStats } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth, type AuthContext } from '../../http/context.ts';
import { isFlagOn } from '../flags/service.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { isoWeek, weekStart } from '../../lib/time.ts';
import { loadAvatars } from '../profiles/avatar.ts';
import { readPreferences } from '../users/preferences.ts';
import { MAX_FRIENDS, blockedEitherWay, pairOf } from './service.ts';

/*
 * Friends, blocks and leaderboards.
 *
 * Friend requests follow the receiver's privacy setting: everyone, only by
 * friend code, or nobody. Every refusal reads the same, so a request never
 * reveals whether someone blocked you or what their settings are. Blocking
 * removes any friendship and stops requests and profile views both ways.
 * Leaderboards show display names, levels and avatars only, never
 * usernames, and leave out guests, test accounts and anyone who opted out.
 */

const NOT_ACCEPTING = 'That player is not accepting friend requests right now.';
const FRIENDS_OFF = 'Friends are switched off at the moment.';
const idParam = z.object({ id: z.string().uuid() });

async function friendCount(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .where(and(or(eq(friendships.userA, userId), eq(friendships.userB, userId)), eq(friendships.status, 'accepted')));
  return row?.n ?? 0;
}

function person(u: { id: string; displayName: string; xp: number }, avatar: unknown) {
  return { id: u.id, displayName: u.displayName, level: levelFromXp(u.xp).level, avatar };
}

export async function socialRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  // Staff can switch friends off with the social.friends flag, for example while
  // dealing with abuse. Blocks keep working whatever the flag says: they are a safety tool.
  const requireFriendsOn = async (auth: AuthContext) => {
    if (!(await isFlagOn(db, 'social.friends', auth))) throw new AppError(403, 'not_available', FRIENDS_OFF);
  };

  app.get('/api/friends', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    await requireFriendsOn(auth);
    const me = auth.user.id;
    const rows = await db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userA, me), eq(friendships.userB, me)))
      .orderBy(desc(friendships.createdAt));
    const otherIds = rows.map((r) => (r.userA === me ? r.userB : r.userA));
    const people = otherIds.length ? await db.select({ id: users.id, displayName: users.displayName, xp: users.xp, lastSeenAt: users.lastSeenAt, status: users.status }).from(users).where(inArray(users.id, otherIds)) : [];
    const avatars = await loadAvatars(db, otherIds);
    const byId = new Map(people.map((p) => [p.id, p]));
    const view = (r: (typeof rows)[number]) => {
      const other = byId.get(r.userA === me ? r.userB : r.userA);
      if (!other || other.status === 'banned') return null;
      return { ...person(other, avatars.get(other.id) ?? null), since: (r.acceptedAt ?? r.createdAt).toISOString() };
    };
    const pick = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).map(view).filter((x): x is NonNullable<typeof x> => Boolean(x));
    return {
      friendCode: auth.user.friendCode,
      friends: pick((r) => r.status === 'accepted').sort((a, b) => a.displayName.localeCompare(b.displayName)),
      incoming: pick((r) => r.status === 'pending' && r.requestedBy !== me),
      outgoing: pick((r) => r.status === 'pending' && r.requestedBy === me),
      max: MAX_FRIENDS,
    };
  });

  /** Ask by friend code (always allowed unless they chose nobody), or by account id from a profile (only if they accept requests from everyone). */
  app.post('/api/friends/request', { config: { rateLimit: { max: 30, timeWindow: '1 hour', keyGenerator: (r) => (r.auth ? `friend:${r.auth.user.id}` : r.ip || 'gone') } } }, async (req) => {
    const auth = requireAccount(req);
    await requireFriendsOn(auth);
    const body = parse(z.object({ friendCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Friend codes look like ABCD-1234.').optional(), userId: z.string().uuid().optional() }).refine((b) => Boolean(b.friendCode) !== Boolean(b.userId), 'Enter a friend code.'), req.body);
    const me = auth.user.id;
    const [target] = await db
      .select()
      .from(users)
      .where(body.friendCode ? eq(users.friendCode, body.friendCode) : eq(users.id, body.userId!))
      .limit(1);
    if (!target || target.isGuest || target.status !== 'active') throw notFound(body.friendCode ? 'No player has that friend code. Check it and try again.' : NOT_ACCEPTING);
    if (target.id === me) throw conflict('That is your own friend code.');
    const setting = readPreferences(target.preferences).privacy.allowFriendRequests;
    const block = await blockedEitherWay(db, me, target.id);
    if (block.byMe) throw conflict('You have blocked this player. Unblock them first.');
    if (block.byThem || setting === 'nobody' || (setting === 'friend_code' && !body.friendCode)) throw new AppError(403, 'forbidden', NOT_ACCEPTING);

    const [a, b] = pairOf(me, target.id);
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b))).for('update');
      if (existing?.status === 'accepted') throw conflict('You are already friends.');
      if (existing?.status === 'pending' && existing.requestedBy === me) throw conflict('You have already asked. They have not answered yet.');
      if ((await friendCount(tx, me)) >= MAX_FRIENDS) throw conflict(`You can have up to ${MAX_FRIENDS} friends.`);
      // They had already asked you: asking back accepts.
      if (existing?.status === 'pending') {
        if ((await friendCount(tx, target.id)) >= MAX_FRIENDS) throw new AppError(403, 'forbidden', NOT_ACCEPTING);
        await tx.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
        return { ok: true, status: 'accepted' as const, displayName: target.displayName };
      }
      await tx.insert(friendships).values({ userA: a, userB: b, status: 'pending', requestedBy: me });
      return { ok: true, status: 'pending' as const, displayName: target.displayName };
    });
  });

  app.post('/api/friends/:id/accept', async (req) => {
    const auth = requireAccount(req);
    await requireFriendsOn(auth);
    const { id } = parse(idParam, req.params);
    const [a, b] = pairOf(auth.user.id, id);
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b))).for('update');
      if (!row || row.status !== 'pending' || row.requestedBy === auth.user.id) throw notFound('That friend request is no longer there.');
      if ((await friendCount(tx, auth.user.id)) >= MAX_FRIENDS) throw conflict(`You can have up to ${MAX_FRIENDS} friends.`);
      await tx.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
      return { ok: true };
    });
  });

  /** Remove a friend, cancel your request or decline theirs. */
  app.delete('/api/friends/:id', async (req) => {
    const auth = requireAccount(req);
    await requireFriendsOn(auth);
    const { id } = parse(idParam, req.params);
    const [a, b] = pairOf(auth.user.id, id);
    await db.delete(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
    return { ok: true };
  });

  app.get('/api/blocks', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const rows = await db
      .select({ id: users.id, displayName: users.displayName, at: blocks.createdAt })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, auth.user.id))
      .orderBy(desc(blocks.createdAt));
    return { blocked: rows.map((r) => ({ id: r.id, displayName: r.displayName, since: r.at.toISOString() })) };
  });

  app.post('/api/blocks', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
    if (userId === auth.user.id) throw conflict('You cannot block yourself.');
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw notFound('That player does not exist.');
    const [a, b] = pairOf(auth.user.id, userId);
    await db.transaction(async (tx) => {
      await tx.insert(blocks).values({ blockerId: auth.user.id, blockedId: userId }).onConflictDoNothing();
      await tx.delete(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
    });
    return { ok: true };
  });

  app.delete('/api/blocks/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    await db.delete(blocks).where(and(eq(blocks.blockerId, auth.user.id), eq(blocks.blockedId, id)));
    return { ok: true };
  });

  /**
   * Leaderboards: correct answers this week (Monday 00:00 UTC onwards) or
   * all time, among your friends, a class you belong to, or everyone.
   */
  app.get('/api/leaderboards', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(
      z.object({ scope: z.enum(['friends', 'class', 'global']).default('friends'), period: z.enum(['week', 'all']).default('week'), classId: z.string().uuid().optional() }),
      req.query,
    );
    const me = auth.user.id;
    let pool: string[] | null = null;
    if (q.scope === 'friends') {
      await requireFriendsOn(auth);
      const rows = await db.select().from(friendships).where(and(or(eq(friendships.userA, me), eq(friendships.userB, me)), eq(friendships.status, 'accepted')));
      pool = [me, ...rows.map((r) => (r.userA === me ? r.userB : r.userA))];
    } else if (q.scope === 'class') {
      if (!q.classId) throw new AppError(400, 'validation_failed', 'Choose a class.');
      const [cls] = await db.select().from(classes).where(eq(classes.id, q.classId)).limit(1);
      const members = cls ? await db.select({ userId: classMembers.userId }).from(classMembers).where(eq(classMembers.classId, cls.id)) : [];
      if (!cls || (cls.ownerId !== me && !members.some((m) => m.userId === me))) throw notFound('That class does not exist.');
      pool = members.map((m) => m.userId);
    }
    const since = weekStart(new Date());
    const scoreRows =
      q.period === 'week'
        ? await db
            .select({ userId: gameParticipants.userId, score: sql<number>`coalesce(sum(${gameParticipants.correct}), 0)::int`, games: sql<number>`count(*)::int` })
            .from(gameParticipants)
            .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
            .where(and(gte(gameSessions.endedAt, since), eq(gameParticipants.isBot, false), pool ? inArray(gameParticipants.userId, pool.length ? pool : [me]) : sql`${gameParticipants.userId} is not null`))
            .groupBy(gameParticipants.userId)
            .orderBy(desc(sql`sum(${gameParticipants.correct})`))
            .limit(200)
        : await db
            .select({ userId: userStats.userId, score: userStats.questionsCorrect, games: userStats.gamesPlayed })
            .from(userStats)
            .where(pool ? inArray(userStats.userId, pool.length ? pool : [me]) : sql`${userStats.questionsCorrect} > 0`)
            .orderBy(desc(userStats.questionsCorrect))
            .limit(200);
    const ids = scoreRows.map((r) => r.userId).filter((x): x is string => Boolean(x));
    const people = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const shown = scoreRows.filter((r) => {
      const u = r.userId ? byId.get(r.userId) : undefined;
      if (!u || u.isGuest || u.isTestAccount || u.status !== 'active') return false;
      return u.id === me || readPreferences(u.preferences).privacy.showOnLeaderboards;
    });
    const top = shown.slice(0, 50);
    const avatars = await loadAvatars(db, top.map((r) => r.userId!));
    // Ids only where the viewer could open the profile anyway: friends and classmates. The global board is names only.
    const withIds = q.scope !== 'global';
    const myIndex = shown.findIndex((r) => r.userId === me);
    return {
      scope: q.scope,
      period: q.period,
      week: q.period === 'week' ? { label: isoWeek(new Date()), since: since.toISOString() } : null,
      entries: top.map((r, i) => {
        const u = byId.get(r.userId!)!;
        return { rank: i + 1, ...(withIds || u.id === me ? { id: u.id } : {}), displayName: u.displayName, level: levelFromXp(u.xp).level, avatar: avatars.get(u.id) ?? null, score: r.score, games: r.games, me: u.id === me };
      }),
      me: myIndex >= 50 ? { rank: myIndex + 1, score: shown[myIndex]!.score } : null,
    };
  });
}
