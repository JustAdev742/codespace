import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  MODERATION_ACTION_INFO,
  MODERATION_ACTIONS,
  ROLE_INFO,
  ROLES,
  canAssignRole,
  outranks,
  staffReasonSchema,
  type Role,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import {
  entitlements,
  gameParticipants,
  gameSessions,
  inventory,
  items,
  ledger,
  moderationActions,
  reports,
  sessions,
  userRoles,
  users,
  userStats,
  wallets,
} from '../../db/schema.ts';
import { noStore } from '../../http/context.ts';
import { conflict, forbidden } from '../../lib/errors.ts';
import { CLEAR_ALPHABET, randomCode, recoveryCode } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { hashSecret, normalizeRecovery, revokeAllSessions } from '../auth/service.ts';
import {
  assertCanActOn,
  audit,
  confirmWordFor,
  likeEscape,
  loadUser,
  maskEmail,
  requireConfirm,
  staff,
  staffLimit,
  staffUserSummary,
  type UserRow,
} from './common.ts';

const idParams = z.object({ id: z.string().uuid('No account with that id.') });

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'suspended', 'banned']).optional(),
  kind: z.enum(['registered', 'guest', 'test']).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const moderateSchema = z.object({
  action: z.enum(MODERATION_ACTIONS),
  reason: staffReasonSchema,
  durationHours: z.number().int().min(1).max(24 * 365).optional(),
  reportId: z.number().int().positive().optional(),
  confirm: z.string().max(80).optional(),
});

const roleSchema = z.object({
  role: z.enum(ROLES),
  grant: z.boolean(),
  reason: staffReasonSchema,
  confirm: z.string().max(80).optional(),
});

const reasonOnly = z.object({ reason: staffReasonSchema, confirm: z.string().max(80).optional() });

const PAGE = 50;
const SIGNED_OUT = 'Your account was signed out by Ludora staff.';

function moderationState(u: UserRow) {
  return {
    status: u.status,
    displayName: u.displayName,
    mutedUntil: u.mutedUntil?.toISOString() ?? null,
    suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
  };
}

export async function adminUserRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/admin/users', async (req, reply) => {
    noStore(reply);
    staff(req, 'users.read');
    const q = parse(listQuery, req.query);
    const conds: (SQL | undefined)[] = [];
    if (q.q) {
      const text = q.q;
      if (/^[0-9a-f-]{36}$/i.test(text)) conds.push(eq(users.id, text));
      else if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(text)) conds.push(eq(users.friendCode, text.toUpperCase()));
      else {
        const like = `%${likeEscape(text)}%`;
        conds.push(or(ilike(users.username, like), ilike(users.displayName, like)));
      }
    }
    if (q.status) conds.push(eq(users.status, q.status));
    if (q.kind === 'guest') conds.push(eq(users.isGuest, true));
    if (q.kind === 'registered') conds.push(eq(users.isGuest, false));
    if (q.kind === 'test') conds.push(eq(users.isTestAccount, true));
    if (q.role) conds.push(sql`exists (select 1 from ${userRoles} where ${userRoles.userId} = ${users.id} and ${userRoles.role} = ${q.role})`);
    const where = and(...conds);
    const [rows, [total]] = await Promise.all([
      db.select().from(users).where(where).orderBy(desc(users.createdAt), desc(users.id)).limit(PAGE).offset(q.offset),
      db.select({ n: count() }).from(users).where(where),
    ]);
    const roleRows = rows.length ? await db.select().from(userRoles).where(inArray(userRoles.userId, rows.map((r) => r.id))) : [];
    const rolesBy = new Map<string, Role[]>();
    for (const r of roleRows) rolesBy.set(r.userId, [...(rolesBy.get(r.userId) ?? []), r.role as Role]);
    return { users: rows.map((u) => staffUserSummary(u, rolesBy.get(u.id) ?? [])), total: total?.n ?? 0, offset: q.offset, pageSize: PAGE };
  });

  app.get('/api/admin/users/:id', async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'users.read');
    const { id } = parse(idParams, req.params);
    const target = await loadUser(db, id);
    const u = target.user;
    const granter = alias(users, 'granter');
    const actor = alias(users, 'actor');
    const now = new Date();
    const [roleRows, modRows, statRows, sessionRows, reportRows, inventoryRows, gameRows, entRows, hostedRows] = await Promise.all([
      db
        .select({ role: userRoles.role, reason: userRoles.reason, grantedAt: userRoles.grantedAt, grantedBy: granter.displayName })
        .from(userRoles)
        .leftJoin(granter, eq(granter.id, userRoles.grantedBy))
        .where(eq(userRoles.userId, id)),
      db
        .select({ m: moderationActions, actorName: actor.displayName })
        .from(moderationActions)
        .leftJoin(actor, eq(actor.id, moderationActions.actorId))
        .where(eq(moderationActions.targetUserId, id))
        .orderBy(desc(moderationActions.createdAt))
        .limit(50),
      db.select().from(userStats).where(eq(userStats.userId, id)).limit(1),
      db
        .select({ n: count(), last: sql<Date | null>`max(${sessions.lastSeenAt})` })
        .from(sessions)
        .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))),
      auth.permissions.has('reports.handle')
        ? db.select().from(reports).where(and(eq(reports.targetType, 'user'), eq(reports.targetId, id))).orderBy(desc(reports.createdAt)).limit(20)
        : Promise.resolve([]),
      db
        .select({ type: items.type, n: count(), total: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int` })
        .from(inventory)
        .innerJoin(items, eq(items.id, inventory.itemId))
        .where(and(eq(inventory.userId, id), gt(inventory.quantity, 0)))
        .groupBy(items.type),
      db
        .select({
          gameId: gameSessions.id,
          modeId: gameSessions.modeId,
          variantId: gameSessions.variantId,
          setTitle: gameSessions.setTitle,
          endedAt: gameSessions.endedAt,
          rank: gameParticipants.rank,
          score: gameParticipants.score,
          playerCount: gameSessions.playerCount,
          hosted: sql<boolean>`${gameSessions.hostUserId} = ${id}`,
        })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(eq(gameParticipants.userId, id))
        .orderBy(desc(gameSessions.endedAt))
        .limit(10),
      db
        .select({ e: entitlements, grantedBy: granter.displayName })
        .from(entitlements)
        .leftJoin(granter, eq(granter.id, entitlements.grantedBy))
        .where(eq(entitlements.userId, id))
        .orderBy(desc(entitlements.createdAt))
        .limit(20),
      // The same count the player sees on their own stats page: every game they hosted with other people.
      db
        .select({ n: count() })
        .from(gameSessions)
        .where(and(eq(gameSessions.hostUserId, id), eq(gameSessions.isSolo, false))),
    ]);

    const canEconomy = auth.permissions.has('economy.view');
    const [walletRows, ledgerRows] = canEconomy
      ? await Promise.all([
          db.select({ currency: wallets.currency, balance: wallets.balance }).from(wallets).where(eq(wallets.userId, id)),
          db.select().from(ledger).where(eq(ledger.userId, id)).orderBy(desc(ledger.id)).limit(25),
        ])
      : [[], []];

    const actable = u.id !== auth.user.id && outranks(auth.roles, target.roles);
    const stats = statRows[0];
    return {
      user: {
        ...staffUserSummary(u, target.roles),
        friendCode: u.friendCode,
        email: auth.permissions.has('users.edit') ? u.email : maskEmail(u.email),
        emailVerified: Boolean(u.emailVerifiedAt),
        mutedUntil: u.mutedUntil?.toISOString() ?? null,
        suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
        lockedUntil: u.lockedUntil?.toISOString() ?? null,
        failedLogins: u.failedLogins,
        xp: u.xp,
        confirmWord: confirmWordFor(u),
      },
      roles: roleRows.map((r) => ({ role: r.role, reason: r.reason, grantedAt: r.grantedAt.toISOString(), grantedBy: r.grantedBy })),
      moderation: modRows.map(({ m, actorName }) => ({
        id: m.id,
        action: m.action,
        reason: m.reason,
        until: m.until?.toISOString() ?? null,
        actor: actorName ?? 'Ludora',
        createdAt: m.createdAt.toISOString(),
        acknowledgedAt: m.acknowledgedAt?.toISOString() ?? null,
      })),
      reports: reportRows.map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt.toISOString() })),
      sessions: { active: sessionRows[0]?.n ?? 0, lastSeenAt: sessionRows[0]?.last ? new Date(sessionRows[0].last).toISOString() : null },
      stats: stats
        ? {
            gamesPlayed: stats.gamesPlayed,
            gamesWon: stats.gamesWon,
            gamesHosted: hostedRows[0]?.n ?? 0,
            questionsAnswered: stats.questionsAnswered,
            questionsCorrect: stats.questionsCorrect,
            packsOpened: stats.packsOpened,
            dailyStreak: stats.dailyStreak,
          }
        : null,
      inventory: inventoryRows.map((r) => ({ type: r.type, distinct: r.n, total: r.total })),
      games: gameRows.map((g) => ({ ...g, endedAt: g.endedAt.toISOString() })),
      entitlements: entRows.map(({ e, grantedBy }) => ({
        id: e.id,
        kind: e.kind,
        reason: e.reason,
        grantedBy,
        createdAt: e.createdAt.toISOString(),
        expiresAt: e.expiresAt?.toISOString() ?? null,
        revokedAt: e.revokedAt?.toISOString() ?? null,
        active: !e.revokedAt && (!e.expiresAt || e.expiresAt > now),
      })),
      economy: canEconomy
        ? {
            balances: Object.fromEntries(walletRows.map((w) => [w.currency, w.balance])),
            ledger: ledgerRows.map((l) => ({
              id: l.id,
              currency: l.currency,
              delta: l.delta,
              balanceAfter: l.balanceAfter,
              reason: l.reason,
              unlimited: l.unlimited,
              createdAt: l.createdAt.toISOString(),
            })),
          }
        : null,
      // What the signed-in staff member may do here. Display only: every action re-checks on the server.
      can: {
        moderate: actable && auth.permissions.has('users.moderate'),
        edit: actable && auth.permissions.has('users.edit'),
        assignRoles: actable && !u.isGuest && auth.permissions.has('roles.assign') ? ROLES.filter((r) => r !== 'player' && canAssignRole(auth.roles, r)) : [],
        grant: u.id !== auth.user.id && auth.permissions.has('economy.grant'),
        testTools: u.isTestAccount && auth.permissions.has('testing.tools'),
      },
    };
  });

  app.post('/api/admin/users/:id/moderate', staffLimit(30), async (req) => {
    const auth = staff(req, 'users.moderate');
    const { id } = parse(idParams, req.params);
    const body = parse(moderateSchema, req.body);
    const info = MODERATION_ACTION_INFO[body.action];
    const now = new Date();
    const until = body.durationHours ? new Date(now.getTime() + body.durationHours * 3_600_000) : null;

    const result = await db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      assertCanActOn(auth, target, 'moderate this account');
      const u = target.user;
      const before = moderationState(u);
      const patch: Partial<typeof users.$inferInsert> = {};
      let signOut = false;
      switch (body.action) {
        case 'warn':
          break;
        case 'mute':
          if (!until) throw conflict('Choose how long the mute lasts.', { durationHours: 'Choose how long the mute lasts.' });
          patch.mutedUntil = until;
          break;
        case 'unmute':
          if (!u.mutedUntil || u.mutedUntil <= now) throw conflict('This account is not muted.');
          patch.mutedUntil = null;
          break;
        case 'suspend':
          // A suspension with no end date is as serious as a ban, so it needs the same typed confirmation.
          if (!until) requireConfirm(body.confirm, confirmWordFor(u), 'the account name');
          patch.status = 'suspended';
          patch.suspendedUntil = until;
          signOut = true;
          break;
        case 'unsuspend':
          if (u.status !== 'suspended') throw conflict('This account is not suspended.');
          patch.status = 'active';
          patch.suspendedUntil = null;
          break;
        case 'ban':
          requireConfirm(body.confirm, confirmWordFor(u), 'the account name');
          if (u.status === 'banned') throw conflict('This account is already banned.');
          patch.status = 'banned';
          patch.suspendedUntil = null;
          signOut = true;
          break;
        case 'unban':
          if (u.status !== 'banned') throw conflict('This account is not banned.');
          patch.status = 'active';
          break;
        case 'reset_name':
          patch.displayName = `Player ${randomCode(CLEAR_ALPHABET, 4)}`;
          patch.nameChangedAt = now;
          break;
      }
      let updated = u;
      if (Object.keys(patch).length) {
        [updated] = await tx.update(users).set({ ...patch, updatedAt: now }).where(eq(users.id, id)).returning() as [UserRow];
      }
      if (signOut) await revokeAllSessions(tx, id);
      const [action] = await tx
        .insert(moderationActions)
        .values({ targetUserId: id, actorId: auth.user.id, action: body.action, reason: body.reason, until: body.action === 'mute' || body.action === 'suspend' ? until : null, reportId: body.reportId ?? null })
        .returning({ id: moderationActions.id });
      if (body.reportId) {
        await tx
          .update(reports)
          .set({ status: 'resolved', resolvedBy: auth.user.id, resolvedAt: now, resolution: `actioned: ${info.past.toLowerCase()}` })
          .where(and(eq(reports.id, body.reportId), eq(reports.status, 'open')));
      }
      await audit(deps, req, tx, {
        actor: auth,
        action: `user.${body.action}`,
        targetType: 'user',
        targetId: id,
        targetName: u.username ?? u.displayName,
        reason: body.reason,
        before,
        after: moderationState(updated),
      });
      return { actionId: action!.id, signOut, user: moderationState(updated) };
    });

    // After the commit: take the account out of live games and close its sockets.
    let roomsAffected = 0;
    if (result.signOut) {
      const notice = body.action === 'ban' ? 'This account has been banned.' : 'This account has been suspended.';
      roomsAffected = deps.rooms.removeUser(id, notice);
      deps.realtime?.disconnectUser(id, notice);
    }
    return { ok: true, actionId: result.actionId, user: result.user, roomsAffected };
  });

  app.post('/api/admin/users/:id/roles', staffLimit(20), async (req) => {
    const auth = staff(req, 'roles.assign');
    const { id } = parse(idParams, req.params);
    const body = parse(roleSchema, req.body);
    if (body.role === 'player') throw conflict('Every account is a player already.');
    const label = ROLE_INFO[body.role].label;

    return db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      if (target.user.id === auth.user.id) throw forbidden('You cannot change your own roles. Ask another administrator.');
      if (target.user.isGuest) throw conflict('Guest accounts cannot hold roles. The player needs to create an account first.');
      if (!canAssignRole(auth.roles, body.role)) throw forbidden(`Only someone above ${label} can grant or remove that role.`);
      if (!outranks(auth.roles, target.roles)) throw forbidden('This account has the same or a higher role than yours.');
      if (body.role === 'admin' || body.role === 'superadmin') requireConfirm(body.confirm, confirmWordFor(target.user), 'the account name');

      const before = [...target.roles].sort();
      const has = target.roles.includes(body.role);
      if (body.grant) {
        if (has) throw conflict(`This account is already ${label}.`);
        await tx.insert(userRoles).values({ userId: id, role: body.role, grantedBy: auth.user.id, reason: body.reason });
      } else {
        if (!has) throw conflict(`This account is not ${label}.`);
        if (body.role === 'superadmin') {
          const [row] = await tx.select({ n: count() }).from(userRoles).where(eq(userRoles.role, 'superadmin'));
          if ((row?.n ?? 0) <= 1) throw conflict('Ludora needs at least one super administrator.');
        }
        await tx.delete(userRoles).where(and(eq(userRoles.userId, id), eq(userRoles.role, body.role)));
      }
      const after = (body.grant ? [...target.roles, body.role] : target.roles.filter((r) => r !== body.role)).sort();
      await audit(deps, req, tx, {
        actor: auth,
        action: body.grant ? 'user.role_grant' : 'user.role_revoke',
        targetType: 'user',
        targetId: id,
        targetName: target.user.username ?? target.user.displayName,
        reason: body.reason,
        before: { roles: before },
        after: { roles: after, changed: body.role },
      });
      return { ok: true, roles: after };
    });
  });

  /** Support's account recovery: a new one-time recovery code, shown once, and every session signed out. */
  app.post('/api/admin/users/:id/recovery-code', staffLimit(10), async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'users.edit');
    const { id } = parse(idParams, req.params);
    const body = parse(reasonOnly, req.body);
    const code = recoveryCode();
    const codeHash = await hashSecret(normalizeRecovery(code));
    await db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      assertCanActOn(auth, target, 'reset sign-in');
      if (!target.user.username || target.user.isGuest) throw conflict('Guest accounts have no password to recover.');
      requireConfirm(body.confirm, target.user.username, 'the username');
      await tx.update(users).set({ recoveryCodeHash: codeHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, id));
      await revokeAllSessions(tx, id);
      // The code itself is never written to the audit log.
      await audit(deps, req, tx, { actor: auth, action: 'user.recovery_code', targetType: 'user', targetId: id, targetName: target.user.username, reason: body.reason });
    });
    deps.realtime?.disconnectUser(id, SIGNED_OUT);
    return { ok: true, recoveryCode: code };
  });

  app.post('/api/admin/users/:id/sign-out', staffLimit(20), async (req) => {
    const auth = staff(req, 'users.edit');
    const { id } = parse(idParams, req.params);
    const body = parse(reasonOnly, req.body);
    await db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      assertCanActOn(auth, target, 'sign out');
      await revokeAllSessions(tx, id);
      await audit(deps, req, tx, { actor: auth, action: 'user.sign_out', targetType: 'user', targetId: id, targetName: target.user.username ?? target.user.displayName, reason: body.reason });
    });
    deps.realtime?.disconnectUser(id, SIGNED_OUT);
    return { ok: true };
  });

  app.post('/api/admin/users/:id/unlock', staffLimit(20), async (req) => {
    const auth = staff(req, 'users.edit');
    const { id } = parse(idParams, req.params);
    const body = parse(reasonOnly, req.body);
    await db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      assertCanActOn(auth, target, 'unlock sign-in');
      await tx.update(users).set({ failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, id));
      await audit(deps, req, tx, { actor: auth, action: 'user.unlock', targetType: 'user', targetId: id, targetName: target.user.username ?? target.user.displayName, reason: body.reason, before: { failedLogins: target.user.failedLogins, lockedUntil: target.user.lockedUntil } });
    });
    return { ok: true };
  });
}
