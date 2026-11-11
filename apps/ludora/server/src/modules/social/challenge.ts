import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { roomOptionsSchema } from '@ludora/shared';
import { MODES, type GameMode } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { users } from '../../db/schema.ts';
import { noStore, requireAccount, requirePermission } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { MAX_ROOMS_PER_HOST } from '../../realtime/manager.ts';
import { isFlagOn } from '../flags/service.ts';
import { isModePlayableBy } from '../modes/service.ts';
import { notify } from '../notifications/service.ts';
import { loadSetForPlay } from '../sets/access.ts';
import { readPreferences } from '../users/preferences.ts';
import { areFriends, blockedEitherWay } from './service.ts';

/*
 * Challenge a friend (finish): a one-against-one game on a set the challenger picks. The server
 * opens a room that only the two of them can join, starts it by itself when both are in (there is
 * no host screen: both play), and sends the friend a notification with a Join button.
 *
 * Safety: accepted friends only, never across a block, and never to a friend who has turned game
 * invites off. There is no message: the notification says who, which game and which set, nothing
 * typed by a student. Modes are those that run without a host: self-paced ones, and quiz rounds
 * that move on by themselves.
 */

/** Modes a challenge can use: playable by two, no teams needed, and nothing waits for a host to press Next. */
export function challengeModes(): GameMode[] {
  return MODES.filter(
    (m) =>
      m.meta.status === 'playable' &&
      m.meta.players.min <= 2 &&
      m.meta.players.max >= 2 &&
      m.meta.teams !== 'required' &&
      (m.meta.pacing === 'self' || (m.meta.pacing === 'host' && m.settings.some((s) => s.key === 'autoAdvance'))),
  );
}

const FRIENDS_OFF = 'Friends are switched off at the moment.';

export async function challengeRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/challenges/modes', async (req, reply) => {
    noStore(reply);
    requireAccount(req);
    return { modes: challengeModes().map((m) => ({ id: m.meta.id, title: m.meta.title, tagline: m.meta.tagline ?? '' })) };
  });

  app.post('/api/challenges', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requirePermission(req, 'rooms.host');
    requireAccount(req);
    if (auth.user.isGuest) throw new AppError(403, 'forbidden', 'Save your progress to an account to challenge friends.');
    if (!(await isFlagOn(db, 'social.friends', auth))) throw new AppError(403, 'not_available', FRIENDS_OFF);
    const body = parse(z.object({ friendId: z.string().uuid(), setId: z.string().uuid(), modeId: z.string().min(1).max(60) }), req.body);
    if (body.friendId === auth.user.id) throw new AppError(400, 'validation_failed', 'Pick a friend to challenge.');
    const block = await blockedEitherWay(db, auth.user.id, body.friendId);
    if (block.byMe || block.byThem || !(await areFriends(db, auth.user.id, body.friendId))) throw new AppError(403, 'forbidden', 'You can challenge your friends only.');
    const [friend] = await db.select({ id: users.id, status: users.status, preferences: users.preferences }).from(users).where(eq(users.id, body.friendId)).limit(1);
    if (!friend || friend.status !== 'active') throw new AppError(403, 'forbidden', 'You can challenge your friends only.');
    if (!readPreferences(friend.preferences).notifications.gameInvites) throw new AppError(409, 'conflict', 'Your friend is not taking game invites at the moment, so they cannot be challenged.');
    const mode = challengeModes().find((m) => m.meta.id === body.modeId);
    if (!mode) throw notFound('That game mode cannot be used for a challenge. Pick another.');
    await isModePlayableBy(deps, auth, mode.meta.id, null);
    const open = deps.rooms.hostedBy(auth.user.id).filter((r) => !r.solo && r.status !== 'ended');
    if (open.length >= MAX_ROOMS_PER_HOST) throw new AppError(409, 'conflict', `You already have ${MAX_ROOMS_PER_HOST} games open. Close one in Your open games, then try again.`);
    const { set, questions } = await loadSetForPlay(db, body.setId, auth);
    let room;
    try {
      room = deps.rooms.create({
        hostUserId: auth.user.id,
        hostName: auth.user.displayName,
        modeId: mode.meta.id,
        variantId: null,
        // Quiz rounds move on by themselves: there is no host to press Next.
        settings: mode.settings.some((s) => s.key === 'autoAdvance') ? { autoAdvance: true } : {},
        common: {},
        // The two of them only, signed in; it starts by itself a few seconds after both are in.
        options: roomOptionsSchema.parse({ maxPlayers: 2, lateJoin: false, requireAccount: true, autoStartAt: 2, startCountdownSec: 5 }),
        set: { id: set.id, title: set.title, questions },
        solo: false,
        classMembers: [auth.user.id, friend.id],
        classTitle: null,
      });
    } catch (err) {
      throw new AppError(400, 'validation_failed', (err as Error).message);
    }
    await notify(db, {
      userId: friend.id,
      kind: 'invite',
      title: `${auth.user.displayName} challenged you to ${mode.meta.title}`,
      body: `${set.title}, one against one. Join code ${room.code}`,
      link: `/join/${room.code}`,
      actorId: auth.user.id,
      dedupeKey: `challenge:${room.code}:${room.createdAt}`,
    });
    return { code: room.code, mode: mode.meta.title, set: set.title };
  });
}
