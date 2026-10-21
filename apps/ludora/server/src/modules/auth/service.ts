import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { generateName, isRole, type Role } from '@ludora/shared';
import type { Config } from '../../config.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { sessions, userRoles, users } from '../../db/schema.ts';
import { AppError, conflict, tooMany } from '../../lib/errors.ts';
import { friendCode, hashIp, randomToken, recoveryCode, sha256 } from '../../lib/crypto.ts';
import { makeAuthContext, type AuthContext, type AuthUser } from '../../http/context.ts';
import { defaultPreferences, readPreferences } from '../users/preferences.ts';

export const SESSION_COOKIE = 'ludora_sid';
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 86_400_000;
/** Extend a session at most once a day, so active players never get signed out but we do not write on every request. */
const SESSION_REFRESH_MS = 86_400_000;
const LAST_SEEN_WRITE_MS = 5 * 60_000;

// Argon2id (algorithm 2) with OWASP's recommended minimum cost. The library ships its enum as a const enum, hence the number.
const ARGON = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
// Verified against when a username does not exist, so both paths take the same time.
let dummyHash: Promise<string> | null = null;

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON);
}

export async function verifySecret(stored: string | null, secret: string): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hashSecret('not-a-real-password');
    await verify(await dummyHash, secret).catch(() => false);
    return false;
  }
  return verify(stored, secret).catch(() => false);
}

const normalizeRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function ageBandFor(birthYear: number | undefined, now = new Date()): string | null {
  if (!birthYear) return null;
  const age = now.getUTCFullYear() - birthYear;
  if (age < 13) return 'under13';
  if (age < 18) return '13to17';
  return 'adult';
}

type UserRow = typeof users.$inferSelect;

export function toAuthUser(u: UserRow): AuthUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isGuest: u.isGuest,
    accountType: u.accountType,
    ageBand: u.ageBand,
    isTestAccount: u.isTestAccount,
    status: u.status,
    level: u.level,
    xp: u.xp,
    friendCode: u.friendCode,
    preferences: readPreferences(u.preferences),
    mutedUntil: u.mutedUntil,
  };
}

export async function rolesOf(db: DbOrTx, userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role).filter(isRole);
}

/** A suspended or banned account, as a message the player can act on; null if the account may sign in. */
export function accountBlock(u: Pick<UserRow, 'status' | 'suspendedUntil'>, now = new Date()): string | null {
  if (u.status === 'banned') return 'This account has been banned. If you think this is a mistake, contact support.';
  if (u.status === 'suspended' && (!u.suspendedUntil || u.suspendedUntil > now)) {
    return u.suspendedUntil
      ? `This account is suspended until ${u.suspendedUntil.toUTCString()}.`
      : 'This account is suspended. Contact support.';
  }
  return null;
}

async function insertUserWithUniqueCode(tx: DbOrTx, values: Omit<typeof users.$inferInsert, 'friendCode'>): Promise<UserRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await tx
      .insert(users)
      .values({ ...values, friendCode: friendCode() })
      .onConflictDoNothing({ target: users.friendCode })
      .returning();
    if (rows[0]) return rows[0];
  }
  throw new Error('Could not allocate a friend code');
}

export interface SessionMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export async function createSession(db: DbOrTx, config: Config, userId: string, meta: SessionMeta): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomToken(32);
  const id = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    ipHash: hashIp(meta.ip, config.IP_HASH_KEY),
    userAgent: meta.userAgent?.slice(0, 200) ?? null,
  });
  return { token, id, expiresAt };
}

/** Look up the session behind a cookie token. Returns null for unknown, expired, revoked or blocked sessions. */
export async function resolveSession(db: Db, token: string): Promise<AuthContext | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const now = new Date();
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (accountBlock(row.u, now)) return null;
  const roles = await rolesOf(db, row.u.id);
  const nowMs = now.getTime();
  if (nowMs - row.s.lastSeenAt.getTime() > LAST_SEEN_WRITE_MS) {
    const extend = row.s.expiresAt.getTime() - nowMs < SESSION_MS - SESSION_REFRESH_MS;
    await db
      .update(sessions)
      .set({ lastSeenAt: now, ...(extend ? { expiresAt: new Date(nowMs + SESSION_MS) } : {}) })
      .where(eq(sessions.id, id));
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.u.id));
  }
  return makeAuthContext(toAuthUser(row.u), roles, id);
}

export async function revokeSession(db: DbOrTx, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(db: DbOrTx, userId: string, exceptId?: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), exceptId ? sql`${sessions.id} <> ${exceptId}` : sql`true`));
}

export interface RegisterInput {
  username: string;
  password: string;
  displayName?: string | undefined;
  accountType: 'player' | 'student' | 'teacher';
  birthYear?: number | undefined;
}

export async function registerUser(db: Db, input: RegisterInput): Promise<{ user: UserRow; recoveryCode: string }> {
  const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (taken.length) throw conflict('That username is taken.', { username: 'That username is taken.' });
  const code = recoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(input.password), hashSecret(normalizeRecovery(code))]);
  const ageBand = ageBandFor(input.birthYear);
  try {
    const user = await insertUserWithUniqueCode(db, {
      username: input.username,
      displayName: input.displayName ?? input.username,
      passwordHash,
      recoveryCodeHash,
      accountType: input.accountType,
      ageBand,
      preferences: defaultPreferences(ageBand),
    });
    return { user, recoveryCode: code };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('That username is taken.', { username: 'That username is taken.' });
    throw err;
  }
}

export async function createGuest(db: Db, displayName?: string): Promise<UserRow> {
  return insertUserWithUniqueCode(db, {
    username: null,
    displayName: displayName ?? generateName(),
    isGuest: true,
    preferences: defaultPreferences(null),
  });
}

export async function claimGuest(db: Db, userId: string, input: { username: string; password: string; birthYear?: number | undefined; accountType: RegisterInput['accountType'] }): Promise<{ user: UserRow; recoveryCode: string }> {
  const code = recoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(input.password), hashSecret(normalizeRecovery(code))]);
  const ageBand = ageBandFor(input.birthYear);
  try {
    const rows = await db
      .update(users)
      .set({ username: input.username, passwordHash, recoveryCodeHash, isGuest: false, ageBand, accountType: input.accountType, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.isGuest, true)))
      .returning();
    if (!rows[0]) throw conflict('This account already has a username.');
    return { user: rows[0], recoveryCode: code };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('That username is taken.', { username: 'That username is taken.' });
    throw err;
  }
}

const LOCK_AFTER = 5;

export async function login(db: Db, username: string, password: string): Promise<UserRow> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];
  const now = new Date();
  if (user?.lockedUntil && user.lockedUntil > now) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000));
    throw tooMany(`Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  const ok = await verifySecret(user?.passwordHash ?? null, password);
  if (!user || !ok) {
    if (user) {
      const failures = user.failedLogins + 1;
      const lockMs = failures >= LOCK_AFTER ? Math.min(15 * 60_000, 30_000 * 2 ** (failures - LOCK_AFTER)) : 0;
      await db
        .update(users)
        .set({ failedLogins: failures, lockedUntil: lockMs ? new Date(now.getTime() + lockMs) : null })
        .where(eq(users.id, user.id));
    }
    throw new AppError(401, 'unauthenticated', 'That username and password do not match.');
  }
  const block = accountBlock(user, now);
  if (block) throw new AppError(403, 'account_suspended', block);
  if (user.failedLogins || user.lockedUntil) await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  return user;
}

export async function recoverWithCode(db: Db, username: string, code: string, newPassword: string): Promise<{ user: UserRow; recoveryCode: string }> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];
  const ok = await verifySecret(user?.recoveryCodeHash ?? null, normalizeRecovery(code));
  if (!user || !ok) throw new AppError(401, 'unauthenticated', 'That username and recovery code do not match.');
  const block = accountBlock(user);
  if (block) throw new AppError(403, 'account_suspended', block);
  const next = recoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(newPassword), hashSecret(normalizeRecovery(next))]);
  const updated = await db.transaction(async (tx) => {
    const r = await tx
      .update(users)
      .set({ passwordHash, recoveryCodeHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await revokeAllSessions(tx, user.id);
    return r[0]!;
  });
  return { user: updated, recoveryCode: next };
}

export async function changePassword(db: Db, userId: string, sessionId: string, current: string, next: string): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !(await verifySecret(user.passwordHash, current))) {
    throw new AppError(400, 'validation_failed', 'Your current password is not right.', { currentPassword: 'Your current password is not right.' });
  }
  const passwordHash = await hashSecret(next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await revokeAllSessions(tx, userId, sessionId);
  });
}

export async function newRecoveryCode(db: Db, userId: string): Promise<string> {
  const code = recoveryCode();
  await db.update(users).set({ recoveryCodeHash: await hashSecret(normalizeRecovery(code)) }).where(eq(users.id, userId));
  return code;
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}
