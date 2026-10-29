import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import { auditLog, gameParticipants, questionSets, uploads, users } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { AppError, conflict } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { writeAudit } from '../audit/service.ts';
import { rolesOf, SESSION_COOKIE, verifySecret } from '../auth/service.ts';

/*
 * A player's own data: download everything stored about the account, or
 * delete the account. Deleting removes the account and what belongs only to
 * it (sessions, wallet, collection, friends, classes it teaches, private
 * sets, images no remaining set uses); game results and public sets stay,
 * with no name attached. The database's foreign keys do most of the work:
 * every reference to a user either cascades or is set to null.
 */

/** Roles that run the platform. Their holders close their accounts through another administrator, so nobody locks staff out by accident. */
const STAFF_ROLES = new Set(['tester', 'moderator', 'support', 'admin', 'superadmin']);

const deleteSchema = z.object({
  /** Required for accounts with a password. */
  password: z.string().max(200).optional(),
  /** The username, or "delete" for a guest account. */
  confirm: z.string().max(60),
});

/** Every table that refers to a user, with the column that names them, for the download. */
const OWN_ROWS: readonly [table: string, column: string][] = [
  ['user_roles', 'user_id'],
  ['entitlements', 'user_id'],
  ['sessions', 'user_id'],
  ['user_stats', 'user_id'],
  ['wallets', 'user_id'],
  ['ledger_entries', 'user_id'],
  ['economy_ops', 'user_id'],
  ['inventory', 'user_id'],
  ['equipped', 'user_id'],
  ['purchases', 'user_id'],
  ['pack_openings', 'user_id'],
  ['pity_counters', 'user_id'],
  ['user_quests', 'user_id'],
  ['user_achievements', 'user_id'],
  ['friendships', 'user_a'],
  ['friendships', 'user_b'],
  ['blocks', 'blocker_id'],
  ['classes', 'owner_id'],
  ['class_members', 'user_id'],
  ['assignments', 'created_by'],
  ['class_events', 'created_by'],
  ['question_sets', 'owner_id'],
  ['custom_games', 'owner_id'],
  ['studio_drafts', 'owner_id'],
  ['uploads', 'owner_id'],
  ['game_sessions', 'host_user_id'],
  ['game_participants', 'user_id'],
  ['answer_events', 'user_id'],
  ['reports', 'reporter_id'],
  ['moderation_actions', 'target_user_id'],
  ['ai_draft_requests', 'user_id'],
];
const ROW_LIMIT = 5000;
const DELETED = 'Deleted account';
/** Never part of a download: secrets, and other people's identities in staff records. */
const WITHHELD = /hash|token|secret|^actor_id$|^granted_by$|^resolved_by$|^hidden_by$/i;

export async function accountRoutes(app: FastifyInstance, deps: AppDeps) {
  // Public: who runs this copy, for the privacy policy and terms pages.
  app.get('/api/legal', async () => ({ operatorName: deps.config.OPERATOR_NAME ?? null, operatorContact: deps.config.OPERATOR_CONTACT ?? null }));

  app.get('/api/me/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const uid = auth.user.id;
    const [me] = await deps.db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!me) throw new AppError(404, 'not_found', 'That account no longer exists.');
    const tables: Record<string, unknown[]> = {};
    for (const [table, column] of OWN_ROWS) {
      const res = await deps.db.execute(sql`select * from ${sql.identifier(table)} where ${sql.identifier(column)} = ${uid} limit ${ROW_LIMIT}`);
      const rows = (res.rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !WITHHELD.test(k))));
      if (rows.length) tables[column === 'user_id' || column === 'owner_id' ? table : `${table} (${column})`] = rows;
    }
    const account = Object.fromEntries(Object.entries(me).filter(([k]) => !/hash|failedLogins|lockedUntil/i.test(k)));
    reply.header('content-disposition', `attachment; filename="ludora-data-${me.username ?? 'guest'}.json"`);
    return {
      about: 'Everything Ludora stores about this account, as of the time shown. Each table lists its rows (at most 5,000 each).',
      exportedAt: new Date().toISOString(),
      account,
      tables,
    };
  });

  app.post('/api/me/delete', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(deleteSchema, req.body);
    const uid = auth.user.id;
    const [me] = await deps.db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!me) throw new AppError(404, 'not_found', 'That account no longer exists.');
    const expected = me.username ?? 'delete';
    if (body.confirm.trim().toLowerCase() !== expected.toLowerCase()) {
      throw new AppError(400, 'validation_failed', me.username ? 'Type your username to confirm.' : 'Type delete to confirm.', { confirm: me.username ? 'Type your username exactly.' : 'Type delete.' });
    }
    if (me.passwordHash && !(await verifySecret(me.passwordHash, body.password ?? ''))) {
      throw new AppError(400, 'validation_failed', 'Your password is not right.', { password: 'Your password is not right.' });
    }
    const roles = await rolesOf(deps.db, uid);
    if (roles.some((r) => STAFF_ROLES.has(r))) {
      throw conflict('Staff accounts are closed by another administrator: ask one to remove your staff roles first.');
    }

    // Out of every live room first, and out of their rosters, so no game saved afterwards points at the account.
    deps.rooms.forgetUser(uid, 'This player has left Ludora.');
    await deps.rooms.idle();

    // Private sets are the owner's alone; public and shared ones stay for the people using them, without a name.
    const privateSets = await deps.db
      .delete(questionSets)
      .where(and(eq(questionSets.ownerId, uid), eq(questionSets.visibility, 'private')))
      .returning({ id: questionSets.id });

    // Images the account uploaded that no remaining set shows. An image's row is what lets it be served.
    const mine = await deps.db.select({ id: uploads.id, mime: uploads.mime }).from(uploads).where(eq(uploads.ownerId, uid));
    const orphans: { id: string; mime: string }[] = [];
    for (const u of mine) {
      const used = await deps.db.execute(sql`select 1 from question_sets where questions::text like ${'%/uploads/' + u.id + '.%'} limit 1`);
      if (!used.rows.length) orphans.push(u);
    }

    await deps.db.transaction(async (tx) => {
      for (const o of orphans) await tx.delete(uploads).where(eq(uploads.id, o.id));
      // Copies of the name: past games keep their scores under "Player", and the audit log keeps
      // what happened without saying to whom (its ids are set to null by the delete below).
      await tx.update(gameParticipants).set({ displayName: 'Player' }).where(eq(gameParticipants.userId, uid));
      await tx.update(auditLog).set({ actorName: DELETED }).where(eq(auditLog.actorId, uid));
      await tx.update(auditLog).set({ targetName: DELETED }).where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, uid)));
      // The record of the deletion names no one: the id was random and now points at nothing.
      await writeAudit(tx, deps.config.APP_ENV, {
        actor: { system: 'self-service' },
        action: 'account.deleted',
        targetType: 'user',
        targetId: uid,
        after: { privateSets: privateSets.length, images: orphans.length },
      });
      await tx.delete(users).where(eq(users.id, uid));
    });

    const dir = resolve(process.cwd(), deps.config.UPLOAD_DIR);
    const ext: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
    await Promise.all(orphans.map((o) => unlink(join(dir, `${o.id}.${ext[o.mime] ?? 'bin'}`)).catch(() => {})));

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
