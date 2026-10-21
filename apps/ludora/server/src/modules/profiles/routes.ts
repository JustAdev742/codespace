import type { FastifyInstance } from 'fastify';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { displayNameSchema, levelFromXp, type ItemArt } from '@ludora/shared';
import { getMode, getVariant } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { currencies, equipped, friendships, gameParticipants, gameSessions, items, userStats, users } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { utcDay } from '../../lib/time.ts';
import { balancesOf } from '../economy/service.ts';
import { getRules } from '../economy/config.ts';
import { ensureQuests } from '../progression/quests.ts';
import { loadAvatar } from './avatar.ts';
import { blockedEitherWay, pairOf } from '../social/service.ts';
import { mergePreferences, preferencesPatchSchema, readPreferences } from '../users/preferences.ts';

const NAME_CHANGE_GAP_MS = 24 * 3600_000;

export function modeTitle(modeId: string, variantId: string | null): string {
  if (variantId) return getVariant(variantId)?.meta.title ?? variantId;
  return getMode(modeId)?.meta.title ?? modeId;
}

/** Equipped cosmetics with their art, keyed by slot. */
export async function equippedArt(deps: AppDeps, userId: string) {
  const rows = await deps.db
    .select({ slot: equipped.slot, itemId: equipped.itemId, art: items.art, name: items.name, rarity: items.rarity })
    .from(equipped)
    .innerJoin(items, eq(items.id, equipped.itemId))
    .where(eq(equipped.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.slot, { itemId: r.itemId, name: r.name, rarity: r.rarity, art: r.art as ItemArt }]));
}

const QUEST_ORDER = ['daily', 'weekly', 'event'];

export async function profileRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/me/overview', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const uid = auth.user.id;
    const [balances, curr, statsRows, avatar, slots, quests, recent, rules] = await Promise.all([
      balancesOf(deps.db, uid),
      deps.db.select().from(currencies).where(eq(currencies.active, true)).orderBy(currencies.sort),
      deps.db.select().from(userStats).where(eq(userStats.userId, uid)).limit(1),
      loadAvatar(deps.db, uid),
      equippedArt(deps, uid),
      ensureQuests(deps.db, uid),
      deps.db
        .select({ gameId: gameSessions.id, modeId: gameSessions.modeId, variantId: gameSessions.variantId, setTitle: gameSessions.setTitle, endedAt: gameSessions.endedAt, players: gameSessions.playerCount, rank: gameParticipants.rank, label: gameParticipants.label, correct: gameParticipants.correct, answered: gameParticipants.answered })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(eq(gameParticipants.userId, uid))
        .orderBy(desc(gameSessions.endedAt))
        .limit(6),
      getRules(deps.db),
    ]);
    const s = statsRows[0];
    const today = utcDay();
    return {
      balances,
      currencies: curr.map((c) => ({ code: c.code, name: c.name, kind: c.kind, hue: c.hue, description: c.description, howToEarn: c.howToEarn, howToSpend: c.howToSpend, expiresAt: c.expiresAt })),
      stats: {
        gamesPlayed: s?.gamesPlayed ?? 0,
        gamesWon: s?.gamesWon ?? 0,
        podiums: s?.podiums ?? 0,
        gamesHosted: s?.gamesHosted ?? 0,
        questionsAnswered: s?.questionsAnswered ?? 0,
        questionsCorrect: s?.questionsCorrect ?? 0,
        accuracy: s?.questionsAnswered ? s.questionsCorrect / s.questionsAnswered : null,
        bestStreak: s?.bestStreak ?? 0,
        dailyStreak: s && (s.lastPlayDay === today || s.lastPlayDay === utcDay(new Date(Date.now() - 86_400_000))) ? s.dailyStreak : 0,
        longestDailyStreak: s?.longestDailyStreak ?? 0,
        playedToday: s?.lastPlayDay === today,
        packsOpened: s?.packsOpened ?? 0,
      },
      dailySparks: { earned: s?.sparksDay === today ? s.sparksToday : 0, cap: rules.game.dailySparkCap },
      avatar,
      equipped: slots,
      level: levelFromXp(auth.user.xp),
      quests: {
        resets: quests.resets,
        list: quests.rows
          .map(({ uq, q }) => ({ id: q.id, kind: q.kind, title: q.title, description: q.description, progress: uq.progress, target: uq.target, period: uq.period, completed: Boolean(uq.completedAt), claimed: Boolean(uq.claimedAt), reward: q.reward }))
          .sort((a, b) => QUEST_ORDER.indexOf(a.kind) - QUEST_ORDER.indexOf(b.kind)),
      },
      recentGames: recent.map((g) => ({ ...g, title: modeTitle(g.modeId, g.variantId) })),
    };
  });

  app.get('/api/me/history', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
    const rows = await deps.db
      .select({ gameId: gameSessions.id, modeId: gameSessions.modeId, variantId: gameSessions.variantId, setTitle: gameSessions.setTitle, endedAt: gameSessions.endedAt, durationMs: gameSessions.durationMs, players: gameSessions.playerCount, isSolo: gameSessions.isSolo, rank: gameParticipants.rank, label: gameParticipants.label, correct: gameParticipants.correct, answered: gameParticipants.answered, avgResponseMs: gameParticipants.avgResponseMs, rewards: gameParticipants.rewards })
      .from(gameParticipants)
      .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
      .where(and(eq(gameParticipants.userId, auth.user.id), q.before ? lt(gameSessions.endedAt, new Date(q.before)) : sql`true`))
      .orderBy(desc(gameSessions.endedAt))
      .limit(q.limit + 1);
    const more = rows.length > q.limit;
    const page = rows.slice(0, q.limit).map((g) => ({ ...g, title: modeTitle(g.modeId, g.variantId) }));
    return { games: page, nextBefore: more ? page[page.length - 1]!.endedAt.toISOString() : null };
  });

  app.patch('/api/me', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ displayName: displayNameSchema }), req.body);
    const [row] = await deps.db.select({ changed: users.nameChangedAt }).from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (row?.changed && Date.now() - row.changed.getTime() < NAME_CHANGE_GAP_MS) {
      throw new AppError(429, 'rate_limited', 'You can change your name once a day.');
    }
    await deps.db.update(users).set({ displayName: body.displayName, nameChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, auth.user.id));
    return { ok: true };
  });

  app.patch('/api/me/preferences', async (req) => {
    const auth = requireAuth(req);
    const patch = parse(preferencesPatchSchema, req.body);
    const [row] = await deps.db.select({ preferences: users.preferences }).from(users).where(eq(users.id, auth.user.id)).limit(1);
    const next = mergePreferences(readPreferences(row?.preferences), patch);
    await deps.db.update(users).set({ preferences: next, updatedAt: new Date() }).where(eq(users.id, auth.user.id));
    return { ok: true, preferences: next };
  });

  /** A public profile. Privacy settings decide how much a stranger sees; private accounts show only a name and buddy. */
  app.get('/api/profiles/:id', async (req) => {
    const id = parse(z.object({ id: z.string().uuid() }), req.params).id;
    const [u] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u || u.status === 'banned') throw notFound('That player does not exist.');
    const viewer = req.auth;
    const isSelf = viewer?.user.id === u.id;
    const prefs = readPreferences(u.preferences);
    const staff = Boolean(viewer?.permissions.has('users.read'));
    let friendship: 'none' | 'friends' | 'requested' | 'incoming' = 'none';
    let blockedByMe = false;
    if (viewer && !isSelf) {
      const block = await blockedEitherWay(deps.db, viewer.user.id, u.id);
      // Someone who blocked you looks the same as someone who does not exist.
      if (block.byThem && !staff) throw notFound('That player does not exist.');
      blockedByMe = block.byMe;
      const [a, b] = pairOf(viewer.user.id, u.id);
      const [f] = await deps.db.select().from(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b))).limit(1);
      if (f) friendship = f.status === 'accepted' ? 'friends' : f.requestedBy === viewer.user.id ? 'requested' : 'incoming';
    }
    const isFriend = friendship === 'friends';
    const visibility = prefs.privacy.profileVisibility;
    const full = !blockedByMe && (isSelf || staff || visibility === 'public' || (visibility === 'friends' && isFriend));
    const [avatar, slots] = await Promise.all([loadAvatar(deps.db, u.id), equippedArt(deps, u.id)]);
    const canRequest = Boolean(viewer && !viewer.user.isGuest && !isSelf && !u.isGuest && !blockedByMe && friendship === 'none' && prefs.privacy.allowFriendRequests === 'everyone');
    const base = { id: u.id, displayName: u.displayName, avatar, equipped: slots, level: levelFromXp(u.xp).level, isFriend, isSelf, friendship, canRequest, blockedByMe, isGuest: u.isGuest, restricted: !full };
    if (!full) return base;
    const [s] = await deps.db.select().from(userStats).where(eq(userStats.userId, u.id)).limit(1);
    const glimCount = await deps.db.execute<{ n: number }>(sql`select count(*)::int as n from inventory inv join items i on i.id = inv.item_id where inv.user_id = ${u.id} and i.type = 'glim' and inv.quantity > 0`);
    return {
      ...base,
      joinedAt: u.createdAt,
      stats: { gamesPlayed: s?.gamesPlayed ?? 0, gamesWon: s?.gamesWon ?? 0, podiums: s?.podiums ?? 0, bestStreak: s?.bestStreak ?? 0, longestDailyStreak: s?.longestDailyStreak ?? 0, glims: glimCount.rows[0]?.n ?? 0 },
    };
  });

}
