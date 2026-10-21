import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  ENTITLEMENT_KINDS,
  QA_SCENARIOS,
  RARITY_INFO,
  RESET_SCOPES,
  displayNameSchema,
  levelFromXp,
  staffReasonSchema,
  type Rarity,
  type ResetScope,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { Tx } from '../../db/client.ts';
import {
  economyOps,
  entitlements,
  equipped,
  inventory,
  items,
  ledger,
  packOpenings,
  packs,
  pityCounters,
  purchases,
  userAchievements,
  userQuests,
  users,
  userStats,
  wallets,
} from '../../db/schema.ts';
import { noStore, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden } from '../../lib/errors.ts';
import { randomToken } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { utcDay } from '../../lib/time.ts';
import { registerUser, isUniqueViolation } from '../auth/service.ts';
import { afterAccountCreated } from '../economy/welcome.ts';
import { credit } from '../economy/service.ts';
import { grantItem } from '../inventory/service.ts';
import { parseDropTable } from '../packs/service.ts';
import { applyMovement, movementSchema } from './economy.ts';
import { assertCanActOn, audit, loadUser, requireConfirm, staff, staffLimit, staffUserSummary, type UserRow } from './common.ts';

/*
 * Staff testing tools. Rules, all enforced here:
 *  - They only ever act on test accounts (users.is_test_account), which the
 *    owner of an account cannot set. Testers create fresh test accounts;
 *    converting an existing account needs testing.entitlements (superadmin).
 *  - Unlimited currency needs a test account plus an active entitlement.
 *    In production only testing.entitlements may grant it; in sandbox and
 *    development any holder of testing.tools may.
 *  - QA scenarios are switched off in production.
 *  - Everything is rate limited and written to the audit log.
 */

const idParams = z.object({ id: z.string().uuid('No account with that id.') });
const WORDS = ['otter', 'maple', 'comet', 'pixel', 'tulip', 'ember', 'frost', 'cobalt', 'lark', 'basil', 'quill', 'reef'];
const AGE_BANDS = { adult: 25, teen: 15, child: 10 } as const;

const createSchema = z.object({
  displayName: displayNameSchema.optional(),
  accountType: z.enum(['player', 'student', 'teacher']).default('player'),
  age: z.enum(['adult', 'teen', 'child']).default('adult'),
  reason: staffReasonSchema,
});

export function canGrantUnlimited(auth: AuthContext, deps: AppDeps): boolean {
  return deps.config.isProduction ? auth.permissions.has('testing.entitlements') : auth.permissions.has('testing.tools');
}

async function loadTestAccount(deps: AppDeps, auth: AuthContext, id: string, tx?: Tx) {
  const target = await loadUser(tx ?? deps.db, id, Boolean(tx));
  if (!target.user.isTestAccount) throw forbidden('Testing tools only work on test accounts.');
  if (target.user.id === auth.user.id) throw forbidden('Use a separate test account, not your own.');
  return target;
}

/** Remove what each scope covers. Idempotency records go too, so welcome gifts and quest claims can run again. */
async function resetAccount(tx: Tx, userId: string, actorId: string, scopes: readonly ResetScope[]) {
  if (scopes.includes('economy')) {
    const held = await tx.select().from(wallets).where(and(eq(wallets.userId, userId), gt(wallets.balance, 0))).for('update');
    for (const w of held) {
      await tx.insert(ledger).values({ userId, currency: w.currency, delta: -w.balance, balanceAfter: 0, reason: 'test_reset', actorId, metadata: { tool: 'reset' } });
      await tx.update(wallets).set({ balance: 0, updatedAt: new Date() }).where(and(eq(wallets.userId, userId), eq(wallets.currency, w.currency)));
    }
  }
  if (scopes.includes('inventory')) {
    await tx.delete(equipped).where(eq(equipped.userId, userId));
    await tx.delete(inventory).where(eq(inventory.userId, userId));
    await tx.delete(pityCounters).where(eq(pityCounters.userId, userId));
    await tx.delete(purchases).where(eq(purchases.userId, userId));
    await tx.delete(packOpenings).where(eq(packOpenings.userId, userId));
  }
  if (scopes.includes('progression')) {
    await tx.update(users).set({ xp: 0, level: 1, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(userStats).where(eq(userStats.userId, userId));
    await tx.insert(userStats).values({ userId });
    await tx.delete(userQuests).where(eq(userQuests.userId, userId));
    await tx.delete(userAchievements).where(eq(userAchievements.userId, userId));
  }
  await tx.delete(economyOps).where(eq(economyOps.userId, userId));
}

async function grantAll(tx: Tx, userId: string, ids: string[], source: string) {
  if (!ids.length) return 0;
  const owned = await tx.select({ itemId: inventory.itemId }).from(inventory).where(and(eq(inventory.userId, userId), inArray(inventory.itemId, ids), gt(inventory.quantity, 0)));
  const have = new Set(owned.map((o) => o.itemId));
  let n = 0;
  for (const id of ids) {
    if (have.has(id)) continue;
    await grantItem(tx, { userId, itemId: id, source });
    n++;
  }
  return n;
}

export async function adminTestingRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/admin/testing/info', async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'testing.tools');
    return {
      environment: deps.config.APP_ENV,
      scenariosEnabled: !deps.config.isProduction,
      canGrantUnlimited: canGrantUnlimited(auth, deps),
      canConvertAccounts: auth.permissions.has('testing.entitlements'),
    };
  });

  app.get('/api/admin/testing/accounts', async (req, reply) => {
    noStore(reply);
    staff(req, 'testing.tools');
    const rows = await db.select().from(users).where(eq(users.isTestAccount, true)).orderBy(desc(users.createdAt)).limit(200);
    const ids = rows.map((r) => r.id);
    const now = new Date();
    const [walletRows, entRows] = ids.length
      ? await Promise.all([
          db.select().from(wallets).where(inArray(wallets.userId, ids)),
          db
            .select()
            .from(entitlements)
            .where(and(inArray(entitlements.userId, ids), isNull(entitlements.revokedAt), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)))),
        ])
      : [[], []];
    return {
      accounts: rows.map((u) => ({
        ...staffUserSummary(u, []),
        balances: Object.fromEntries(walletRows.filter((w) => w.userId === u.id).map((w) => [w.currency, w.balance])),
        entitlements: entRows.filter((e) => e.userId === u.id).map((e) => ({ kind: e.kind, expiresAt: e.expiresAt?.toISOString() ?? null })),
      })),
    };
  });

  /** A fresh test account. The password is shown once, here, and never stored in plain text. */
  app.post('/api/admin/testing/accounts', staffLimit(20, '1 hour'), async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'testing.tools');
    const body = parse(createSchema, req.body);
    const password = randomToken(12);
    const birthYear = new Date().getUTCFullYear() - AGE_BANDS[body.age];
    let created: UserRow | null = null;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const word = WORDS[randomInt(WORDS.length)]!;
      const username = `qa_${word}${randomInt(100, 1000)}`;
      try {
        created = (await registerUser(db, { username, password, displayName: body.displayName ?? `Test ${word[0]!.toUpperCase()}${word.slice(1)}`, accountType: body.accountType, birthYear })).user;
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'conflict') && !isUniqueViolation(err)) throw err;
      }
    }
    if (!created) throw conflict('Could not find a free test username. Try again.');
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isTestAccount: true }).where(eq(users.id, created!.id));
      await audit(deps, req, tx, { actor: auth, action: 'testing.account_create', targetType: 'user', targetId: created!.id, targetName: created!.username ?? created!.displayName, reason: body.reason, after: { accountType: body.accountType, age: body.age } });
    });
    await afterAccountCreated(deps, created.id);
    return { ok: true, account: staffUserSummary({ ...created, isTestAccount: true }, []), username: created.username, password };
  });

  const testMovement = (direction: 'grant' | 'revoke') => async (req: FastifyRequest) => {
    const auth = staff(req, 'testing.tools');
    const { id } = parse(idParams, req.params);
    const body = parse(movementSchema, { ...(req.body as object), userId: id });
    return applyMovement(deps, req, auth, body, direction, 'test');
  };
  app.post('/api/admin/testing/accounts/:id/grant', staffLimit(60), testMovement('grant'));
  app.post('/api/admin/testing/accounts/:id/revoke', staffLimit(60), testMovement('revoke'));

  app.post('/api/admin/testing/accounts/:id/reset', staffLimit(20), async (req) => {
    const auth = staff(req, 'testing.tools');
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ scopes: z.array(z.enum(RESET_SCOPES)).min(1), reason: staffReasonSchema, confirm: z.string().max(80).optional() }), req.body);
    await db.transaction(async (tx) => {
      const target = await loadTestAccount(deps, auth, id, tx);
      requireConfirm(body.confirm, target.user.username ?? target.user.displayName, 'the test account name');
      await resetAccount(tx, id, auth.user.id, body.scopes);
      await audit(deps, req, tx, { actor: auth, action: 'testing.reset', targetType: 'user', targetId: id, targetName: target.user.username ?? target.user.displayName, reason: body.reason, after: { scopes: body.scopes } });
    });
    if (body.scopes.includes('economy') && body.scopes.includes('inventory') && body.scopes.includes('progression')) await afterAccountCreated(deps, id);
    return { ok: true };
  });

  app.post('/api/admin/testing/accounts/:id/scenario', staffLimit(30), async (req) => {
    const auth = staff(req, 'testing.tools');
    if (deps.config.isProduction) throw forbidden('QA scenarios are switched off in production. Use the sandbox.');
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ scenario: z.enum(QA_SCENARIOS), reason: staffReasonSchema }), req.body);
    const summary = await db.transaction(async (tx) => {
      const target = await loadTestAccount(deps, auth, id, tx);
      const note = { tool: 'scenario', scenario: body.scenario, reason: body.reason };
      let done: Record<string, unknown> = {};
      switch (body.scenario) {
        case 'fresh':
          await resetAccount(tx, id, auth.user.id, RESET_SCOPES);
          break;
        case 'wealthy':
          for (const [currency, amount] of [['sparks', 50_000], ['moonstones', 2_000], ['dust', 5_000]] as const) {
            await credit(tx, { userId: id, currency, amount, reason: 'admin_grant', actorId: auth.user.id, metadata: note });
          }
          done = { sparks: 50_000, moonstones: 2_000, dust: 5_000 };
          break;
        case 'almost_complete': {
          const glims = await tx.select().from(items).where(and(eq(items.collectionId, 'meadow'), eq(items.type, 'glim'), eq(items.releaseState, 'live'), eq(items.isTestOnly, false)));
          // Keep back the rarest one: the scenario tests completing a collection with a Lantern or by crafting.
          const sorted = glims.sort((a, b) => RARITY_INFO[b.rarity as Rarity].rank - RARITY_INFO[a.rarity as Rarity].rank);
          const keepBack = sorted[0];
          await tx.delete(inventory).where(and(eq(inventory.userId, id), eq(inventory.itemId, keepBack?.id ?? '')));
          await tx.delete(economyOps).where(and(eq(economyOps.userId, id), eq(economyOps.idemKey, 'collection:meadow')));
          done = { granted: await grantAll(tx, id, sorted.slice(1).map((g) => g.id), 'test_scenario'), missing: keepBack?.name ?? null };
          break;
        }
        case 'every_cosmetic': {
          const cosmetics = await tx.select({ id: items.id }).from(items).where(and(ne(items.type, 'glim'), eq(items.releaseState, 'live')));
          done = { granted: await grantAll(tx, id, cosmetics.map((c) => c.id), 'test_scenario') };
          break;
        }
        case 'level_up_ready': {
          const info = levelFromXp(target.user.xp);
          if (!info.needed) throw conflict('This account is already at the top level.');
          const xp = target.user.xp - info.into + info.needed - 1;
          await tx.update(users).set({ xp, level: info.level }).where(eq(users.id, id));
          done = { xp, level: info.level };
          break;
        }
        case 'streak_six': {
          const yesterday = utcDay(new Date(Date.now() - 86_400_000));
          await tx.insert(userStats).values({ userId: id }).onConflictDoNothing();
          await tx
            .update(userStats)
            .set({ dailyStreak: 6, lastPlayDay: yesterday, longestDailyStreak: sql`greatest(${userStats.longestDailyStreak}, 6)` })
            .where(eq(userStats.userId, id));
          done = { dailyStreak: 6, lastPlayDay: yesterday };
          break;
        }
        case 'pity_ready': {
          const all = await tx.select().from(packs);
          let n = 0;
          for (const p of all) {
            const every = parseDropTable(p.dropTable).pityEvery;
            if (!every) continue;
            await tx
              .insert(pityCounters)
              .values({ userId: id, packId: p.id, sinceEpic: every - 1 })
              .onConflictDoUpdate({ target: [pityCounters.userId, pityCounters.packId], set: { sinceEpic: every - 1 } });
            n++;
          }
          done = { lanterns: n };
          break;
        }
      }
      await audit(deps, req, tx, { actor: auth, action: 'testing.scenario', targetType: 'user', targetId: id, targetName: target.user.username ?? target.user.displayName, reason: body.reason, after: { scenario: body.scenario, ...done } });
      return done;
    });
    if (body.scenario === 'fresh') await afterAccountCreated(deps, id);
    return { ok: true, scenario: body.scenario, ...summary };
  });

  app.post('/api/admin/testing/accounts/:id/entitlements', staffLimit(20), async (req) => {
    const auth = staff(req, 'testing.tools');
    if (!canGrantUnlimited(auth, deps)) throw forbidden('In production only a super administrator can change test entitlements.');
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ kind: z.enum(ENTITLEMENT_KINDS), grant: z.boolean(), days: z.number().int().min(1).max(90).default(30), reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const target = await loadTestAccount(deps, auth, id, tx);
      const now = new Date();
      const active = await tx
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.userId, id), eq(entitlements.kind, body.kind), isNull(entitlements.revokedAt), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now))));
      if (body.grant) {
        if (active.length) throw conflict('This test account already has that.');
        await tx.insert(entitlements).values({ userId: id, kind: body.kind, reason: body.reason, grantedBy: auth.user.id, expiresAt: new Date(now.getTime() + body.days * 86_400_000) });
      } else {
        if (!active.length) throw conflict('This test account does not have that.');
        await tx.update(entitlements).set({ revokedAt: now }).where(inArray(entitlements.id, active.map((a) => a.id)));
      }
      await audit(deps, req, tx, {
        actor: auth,
        action: body.grant ? 'testing.entitlement_grant' : 'testing.entitlement_revoke',
        targetType: 'user',
        targetId: id,
        targetName: target.user.username ?? target.user.displayName,
        reason: body.reason,
        after: { kind: body.kind, ...(body.grant ? { days: body.days } : {}) },
      });
      return { ok: true };
    });
  });

  /** Turn an existing account into a test account or back. Super administrators only: it is the path to test entitlements. */
  app.post('/api/admin/testing/accounts/:id/test-flag', staffLimit(10), async (req) => {
    const auth = staff(req, 'testing.entitlements');
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ isTest: z.boolean(), reason: staffReasonSchema, confirm: z.string().max(80).optional() }), req.body);
    return db.transaction(async (tx) => {
      const target = await loadUser(tx, id, true);
      assertCanActOn(auth, target, 'change test status');
      if (target.user.isGuest) throw conflict('Guest accounts cannot be test accounts.');
      if (target.user.isTestAccount === body.isTest) throw conflict(body.isTest ? 'This is already a test account.' : 'This is not a test account.');
      requireConfirm(body.confirm, target.user.username ?? target.user.displayName, 'the account name');
      await tx.update(users).set({ isTestAccount: body.isTest, updatedAt: new Date() }).where(eq(users.id, id));
      if (!body.isTest) await tx.update(entitlements).set({ revokedAt: new Date() }).where(and(eq(entitlements.userId, id), isNull(entitlements.revokedAt)));
      await audit(deps, req, tx, { actor: auth, action: 'testing.test_flag', targetType: 'user', targetId: id, targetName: target.user.username ?? target.user.displayName, reason: body.reason, before: { isTestAccount: target.user.isTestAccount }, after: { isTestAccount: body.isTest } });
      return { ok: true };
    });
  });
}
