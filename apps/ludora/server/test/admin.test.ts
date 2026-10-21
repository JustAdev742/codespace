import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, entitlements, inventory, items, ledger, pityCounters, reports, users, wallets } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';

/*
 * Staff tools: who may call what (the authorisation matrix), and the rules
 * each tool enforces on top of its permission.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
const STAFF_ROLES = ['tester', 'moderator', 'support', 'admin', 'superadmin'] as const;
const as: Record<'player' | (typeof STAFF_ROLES)[number], Account> = {} as never;

let keyN = 0;
const key = () => `admin-test-${Date.now()}-${++keyN}`;

async function balance(userId: string, currency = 'sparks') {
  const [w] = await t.db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)));
  return w?.balance ?? 0;
}

async function lastAudit(action: string) {
  const rows = await t.db.select().from(auditLog).where(eq(auditLog.action, action));
  return rows[rows.length - 1];
}

beforeAll(async () => {
  t = await createTestApp();
  as.player = await registered(t.app);
  for (const role of STAFF_ROLES) as[role] = await registered(t.app);
  // The first super administrator comes from the operator CLI, as in a real deployment.
  const boot = await cliChangeRole(t.db, 'test', 'grant', as.superadmin.username, 'superadmin', 'first admin');
  expect(boot.ok).toBe(true);
  for (const role of ['tester', 'moderator', 'support', 'admin'] as const) {
    const res = await as.superadmin.client.post(`/api/admin/users/${as[role].userId}/roles`, { role, grant: true, reason: 'test setup', confirm: as[role].username });
    expect(res.status, `${role}: ${JSON.stringify(res.body)}`).toBe(200);
  }
});
afterAll(async () => {
  await t?.close();
});

const can = (role: Role | 'anon', p: Permission) => role !== 'anon' && (ROLE_PERMISSIONS[role] as readonly string[]).includes(p);
const clientFor = (role: Role | 'anon') => (role === 'anon' ? new Client(t.app) : as[role as keyof typeof as].client);
const ROLES_UNDER_TEST = ['anon', 'player', ...STAFF_ROLES] as const;
const SOME_ID = '00000000-0000-4000-8000-000000000000';

describe('authorisation matrix', () => {
  const reads: [string, Permission][] = [
    ['/api/admin/users', 'users.read'],
    [`/api/admin/users/${SOME_ID}`, 'users.read'],
    ['/api/admin/economy/overview', 'economy.view'],
    ['/api/admin/economy/ledger', 'economy.view'],
    ['/api/admin/economy/rules', 'economy.view'],
    ['/api/admin/currencies', 'economy.view'],
    ['/api/admin/items', 'catalog.manage'],
    ['/api/admin/collections', 'catalog.manage'],
    ['/api/admin/packs', 'catalog.manage'],
    ['/api/admin/shop/listings', 'shop.manage'],
    ['/api/admin/events', 'events.manage'],
    ['/api/admin/reports', 'reports.handle'],
    ['/api/admin/sets', 'content.moderate'],
    ['/api/admin/rooms', 'rooms.manage'],
    ['/api/admin/modes', 'modes.manage'],
    ['/api/admin/flags', 'flags.manage'],
    ['/api/admin/system', 'system.view'],
    ['/api/admin/errors', 'system.view'],
    ['/api/admin/audit', 'audit.read'],
    ['/api/admin/testing/info', 'testing.tools'],
    ['/api/admin/testing/accounts', 'testing.tools'],
  ];
  // Writes are sent with an empty body: an allowed caller gets a validation error (400, or 404 for an
  // unknown target), anyone else is turned away before the body is even read.
  const writes: ['POST' | 'PUT' | 'PATCH', string, Permission][] = [
    ['POST', `/api/admin/users/${SOME_ID}/moderate`, 'users.moderate'],
    ['POST', `/api/admin/users/${SOME_ID}/roles`, 'roles.assign'],
    ['POST', `/api/admin/users/${SOME_ID}/recovery-code`, 'users.edit'],
    ['POST', `/api/admin/users/${SOME_ID}/sign-out`, 'users.edit'],
    ['POST', `/api/admin/users/${SOME_ID}/unlock`, 'users.edit'],
    ['POST', '/api/admin/economy/grant', 'economy.grant'],
    ['POST', '/api/admin/economy/revoke', 'economy.grant'],
    ['PUT', '/api/admin/economy/rules', 'economy.configure'],
    ['POST', '/api/admin/currencies', 'economy.configure'],
    ['PATCH', '/api/admin/currencies/sparks', 'economy.configure'],
    ['POST', '/api/admin/items', 'catalog.manage'],
    ['PATCH', '/api/admin/items/glim-sprig', 'catalog.manage'],
    ['PATCH', '/api/admin/collections/meadow', 'catalog.manage'],
    ['POST', '/api/admin/packs', 'catalog.manage'],
    ['POST', '/api/admin/packs/preview', 'catalog.manage'],
    ['PATCH', '/api/admin/packs/lantern-meadow', 'catalog.manage'],
    ['POST', '/api/admin/shop/listings', 'shop.manage'],
    ['PATCH', '/api/admin/shop/listings/l-lantern-meadow', 'shop.manage'],
    ['PATCH', '/api/admin/events/frost_festival', 'events.manage'],
    ['POST', '/api/admin/reports/1/resolve', 'reports.handle'],
    ['POST', '/api/admin/reports/1/reopen', 'reports.handle'],
    ['POST', `/api/admin/sets/${SOME_ID}/visibility`, 'content.moderate'],
    ['POST', '/api/admin/rooms/123456/close', 'rooms.manage'],
    ['POST', '/api/admin/rooms/123456/remove-player', 'rooms.manage'],
    ['PUT', '/api/admin/modes/classic', 'modes.manage'],
    ['PATCH', '/api/admin/flags/debug.overlay', 'flags.manage'],
    ['POST', '/api/admin/testing/accounts', 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/grant`, 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/revoke`, 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/reset`, 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/scenario`, 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/entitlements`, 'testing.tools'],
    ['POST', `/api/admin/testing/accounts/${SOME_ID}/test-flag`, 'testing.entitlements'],
  ];

  it.each(ROLES_UNDER_TEST)('reads as %s', async (role) => {
    const c = clientFor(role);
    for (const [url, perm] of reads) {
      const res = await c.get(url);
      const expected = can(role, perm) ? (url.includes(SOME_ID) ? 404 : 200) : role === 'anon' ? 401 : 403;
      expect(res.status, `${role} GET ${url}`).toBe(expected);
    }
  });

  it.each(ROLES_UNDER_TEST)('writes as %s', async (role) => {
    const c = clientFor(role);
    for (const [method, url, perm] of writes) {
      const res = await c.request(method, url, {});
      if (can(role, perm)) expect([400, 404], `${role} ${method} ${url}: ${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
      else expect(res.status, `${role} ${method} ${url}`).toBe(role === 'anon' ? 401 : 403);
    }
  });

  it('a guest session never gets staff rights, even with a role row', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    const me = await guest.get('/api/auth/me');
    await t.db.insert((await import('../src/db/schema.ts')).userRoles).values({ userId: me.body.user.id, role: 'admin', reason: 'should not matter' });
    expect((await guest.get('/api/admin/users')).status).toBe(403);
  });

  it('player-facing payloads never include staff-only fields', async () => {
    const list = await as.support.client.get(`/api/admin/users?q=${as.player.username}`);
    expect(list.status).toBe(200);
    const json = JSON.stringify(list.body);
    for (const field of ['passwordHash', 'recoveryCodeHash', 'password_hash', 'email']) expect(json).not.toContain(field);
  });
});

describe('roles', () => {
  it('the CLI refuses bad input and never removes the last super administrator', async () => {
    expect((await cliChangeRole(t.db, 'test', 'grant', as.player.username, 'wizard', 'nope')).ok).toBe(false);
    expect((await cliChangeRole(t.db, 'test', 'grant', as.player.username, 'admin', '')).ok).toBe(false);
    expect((await cliChangeRole(t.db, 'test', 'grant', 'nobody_here', 'admin', 'reason')).ok).toBe(false);
    const last = await cliChangeRole(t.db, 'test', 'revoke', as.superadmin.username, 'superadmin', 'testing');
    expect(last).toEqual({ ok: false, message: 'Refusing to remove the last super administrator.' });
    const row = await lastAudit('user.role_grant');
    expect(row).toBeTruthy();
    const boot = (await t.db.select().from(auditLog).where(eq(auditLog.actorName, 'system:cli')))[0];
    expect(boot?.targetId).toBe(as.superadmin.userId);
  });

  it('admin and superadmin grants need the account name typed out', async () => {
    const u = await registered(t.app);
    const res = await as.superadmin.client.post(`/api/admin/users/${u.userId}/roles`, { role: 'admin', grant: true, reason: 'promotion' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('confirmation_required');
  });

  it('only someone above a role can grant it', async () => {
    const u = await registered(t.app);
    const grant = (who: Account, role: Role) => who.client.post(`/api/admin/users/${u.userId}/roles`, { role, grant: true, reason: 'test', confirm: u.username });
    expect((await grant(as.admin, 'moderator')).status).toBe(200);
    expect((await grant(as.admin, 'admin')).status).toBe(403);
    expect((await grant(as.admin, 'superadmin')).status).toBe(403);
    expect((await grant(as.moderator, 'tester')).status).toBe(403);
    expect((await grant(as.support, 'tester')).status).toBe(403);
    expect((await grant(as.admin, 'moderator')).status).toBe(409);
  });

  it('nobody changes their own roles, and nobody acts on someone of equal or higher rank', async () => {
    const self = await as.superadmin.client.post(`/api/admin/users/${as.superadmin.userId}/roles`, { role: 'tester', grant: true, reason: 'self' });
    expect(self.status).toBe(403);
    const up = await as.admin.client.post(`/api/admin/users/${as.superadmin.userId}/roles`, { role: 'tester', grant: true, reason: 'nope' });
    expect(up.status).toBe(403);
    const peer = await registered(t.app);
    await as.superadmin.client.post(`/api/admin/users/${peer.userId}/roles`, { role: 'admin', grant: true, reason: 'peer', confirm: peer.username });
    const sideways = await as.admin.client.post(`/api/admin/users/${peer.userId}/roles`, { role: 'admin', grant: false, reason: 'demote a peer', confirm: peer.username });
    expect(sideways.status).toBe(403);
  });

  it('removing a role takes effect on the very next request', async () => {
    const u = await registered(t.app);
    await as.superadmin.client.post(`/api/admin/users/${u.userId}/roles`, { role: 'moderator', grant: true, reason: 'temp' });
    expect((await u.client.get('/api/admin/reports')).status).toBe(200);
    const off = await as.superadmin.client.post(`/api/admin/users/${u.userId}/roles`, { role: 'moderator', grant: false, reason: 'done' });
    expect(off.status).toBe(200);
    expect((await u.client.get('/api/admin/reports')).status).toBe(403);
    const audit = await lastAudit('user.role_revoke');
    expect(audit?.before).toEqual({ roles: ['moderator'] });
    expect(audit?.after).toEqual({ roles: [], changed: 'moderator' });
    expect(audit?.reason).toBe('done');
  });
});

describe('moderation', () => {
  it('a warning reaches the player until they dismiss it', async () => {
    const u = await registered(t.app);
    const res = await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'warn', reason: 'Please keep names friendly.' });
    expect(res.status).toBe(200);
    const notices = await u.client.get('/api/me/notices');
    expect(notices.body.notices).toHaveLength(1);
    expect(notices.body.notices[0]).toMatchObject({ action: 'warn', reason: 'Please keep names friendly.' });
    await u.client.post(`/api/me/notices/${notices.body.notices[0].id}/ack`);
    expect((await u.client.get('/api/me/notices')).body.notices).toHaveLength(0);
    // Someone else cannot dismiss it for them.
    const other = await registered(t.app);
    await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'warn', reason: 'Second warning.' });
    const id = (await u.client.get('/api/me/notices')).body.notices[0].id;
    await other.client.post(`/api/me/notices/${id}/ack`);
    expect((await u.client.get('/api/me/notices')).body.notices).toHaveLength(1);
  });

  it('mutes need a length and show on the account', async () => {
    const u = await registered(t.app);
    expect((await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'mute', reason: 'spam reactions' })).status).toBe(409);
    expect((await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'mute', reason: 'spam reactions', durationHours: 2 })).status).toBe(200);
    expect((await u.client.get('/api/auth/me')).body.user.muted).toBe(true);
    expect((await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'unmute', reason: 'served' })).status).toBe(200);
    expect((await u.client.get('/api/auth/me')).body.user.muted).toBe(false);
  });

  it('a ban needs typed confirmation, signs the player out and blocks sign-in until lifted', async () => {
    const u = await registered(t.app);
    const unconfirmed = await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'ban', reason: 'harassment' });
    expect(unconfirmed.body.error.code).toBe('confirmation_required');
    expect((await u.client.get('/api/auth/me')).body.user).not.toBeNull();
    const ban = await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'ban', reason: 'harassment', confirm: u.username.toUpperCase() });
    expect(ban.status).toBe(200);
    expect((await u.client.get('/api/auth/me')).body.user).toBeNull();
    const login = await new Client(t.app).post('/api/auth/login', { username: u.username, password: u.password });
    expect(login.status).toBe(403);
    const audit = await lastAudit('user.ban');
    expect(audit).toMatchObject({ targetId: u.userId, reason: 'harassment', actorId: as.moderator.userId });
    expect((audit?.before as { status: string }).status).toBe('active');
    expect((audit?.after as { status: string }).status).toBe('banned');
    expect((await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'unban', reason: 'appeal accepted' })).status).toBe(200);
    expect((await new Client(t.app).post('/api/auth/login', { username: u.username, password: u.password })).status).toBe(200);
  });

  it('moderators cannot act on staff above them or on themselves', async () => {
    expect((await as.moderator.client.post(`/api/admin/users/${as.admin.userId}/moderate`, { action: 'warn', reason: 'not allowed' })).status).toBe(403);
    expect((await as.moderator.client.post(`/api/admin/users/${as.moderator.userId}/moderate`, { action: 'warn', reason: 'not allowed' })).status).toBe(403);
  });

  it('resets an inappropriate display name', async () => {
    const u = await registered(t.app);
    const res = await as.moderator.client.post(`/api/admin/users/${u.userId}/moderate`, { action: 'reset_name', reason: 'rude name' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toMatch(/^Player [A-Z0-9]{4}$/);
    expect((await u.client.get('/api/auth/me')).body.user.displayName).toBe(res.body.user.displayName);
  });

  it('support issues a recovery code that works once and signs the account out', async () => {
    const u = await registered(t.app);
    const res = await as.support.client.post(`/api/admin/users/${u.userId}/recovery-code`, { reason: 'verified by email', confirm: u.username });
    expect(res.status).toBe(200);
    expect((await u.client.get('/api/auth/me')).body.user).toBeNull();
    const fresh = new Client(t.app);
    const recover = await fresh.post('/api/auth/recover', { username: u.username, recoveryCode: res.body.recoveryCode, newPassword: 'a brand new passphrase' });
    expect(recover.status).toBe(200);
    // The code is never stored in the audit log.
    const audit = await lastAudit('user.recovery_code');
    expect(JSON.stringify(audit)).not.toContain(res.body.recoveryCode);
    // Support cannot reset an administrator's sign-in.
    expect((await as.support.client.post(`/api/admin/users/${as.admin.userId}/recovery-code`, { reason: 'try anyway', confirm: as.admin.username })).status).toBe(403);
  });

  it('shows full email only to staff who can edit accounts', async () => {
    const u = await registered(t.app);
    await t.db.update(users).set({ email: 'someone@example.com' }).where(eq(users.id, u.userId));
    expect((await as.support.client.get(`/api/admin/users/${u.userId}`)).body.user.email).toBe('someone@example.com');
    expect((await as.moderator.client.get(`/api/admin/users/${u.userId}`)).body.user.email).toBe('s***@e***.com');
  });
});

describe('reports', () => {
  it('players report; repeats merge; probing reveals nothing', async () => {
    const reporter = await registered(t.app);
    const target = await registered(t.app);
    const send = (body: object) => reporter.client.post('/api/reports', body);
    expect((await send({ targetType: 'user', targetId: target.userId, reason: 'inappropriate_name', details: 'name is rude' })).status).toBe(200);
    expect((await send({ targetType: 'user', targetId: target.userId, reason: 'inappropriate_name' })).status).toBe(200);
    expect((await send({ targetType: 'user', targetId: SOME_ID, reason: 'spam' })).body).toEqual({ ok: true });
    expect((await send({ targetType: 'user', targetId: reporter.userId, reason: 'spam' })).body).toEqual({ ok: true });
    expect((await send({ targetType: 'set', targetId: SOME_ID, reason: 'harassment' })).status).toBe(400);
    const rows = await t.db.select().from(reports).where(eq(reports.reporterId, reporter.userId));
    expect(rows).toHaveLength(1);

    const queue = await as.moderator.client.get('/api/admin/reports');
    const mine = queue.body.reports.find((r: { id: number }) => r.id === rows[0]!.id);
    expect(mine.target.label).toContain(target.username);
    expect(mine.details).toBe('name is rude');

    const resolve = await as.moderator.client.post(`/api/admin/reports/${rows[0]!.id}/resolve`, { outcome: 'dismissed', note: 'name is fine' });
    expect(resolve.status).toBe(200);
    expect((await as.moderator.client.post(`/api/admin/reports/${rows[0]!.id}/resolve`, { outcome: 'dismissed', note: 'again' })).status).toBe(409);
    expect((await as.moderator.client.post(`/api/admin/reports/${rows[0]!.id}/reopen`, { reason: 'second look' })).status).toBe(200);
  });

  it('moderating from a report resolves it', async () => {
    const reporter = await registered(t.app);
    const target = await registered(t.app);
    await reporter.client.post('/api/reports', { targetType: 'user', targetId: target.userId, reason: 'harassment' });
    const [r] = await t.db.select().from(reports).where(eq(reports.reporterId, reporter.userId));
    await as.moderator.client.post(`/api/admin/users/${target.userId}/moderate`, { action: 'warn', reason: 'from report', reportId: r!.id });
    const [after] = await t.db.select().from(reports).where(eq(reports.id, r!.id));
    expect(after?.status).toBe('resolved');
    expect(after?.resolution).toBe('actioned: warned');
  });
});

describe('economy tools', () => {
  it('grants to a real player: capped, typed confirmation, idempotent, ledgered and audited', async () => {
    const u = await registered(t.app);
    const start = await balance(u.userId);
    const k = key();
    const grant = (body: object) => as.admin.client.post('/api/admin/economy/grant', { userId: u.userId, currency: 'sparks', reason: 'lost a game to a server restart', requestKey: k, ...body });
    expect((await grant({ amount: 500 })).body.error.code).toBe('confirmation_required');
    expect((await grant({ amount: 10_001, confirm: u.username })).status).toBe(400);
    const ok = await grant({ amount: 500, confirm: u.username });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, replayed: false, balance: start + 500 });
    const again = await grant({ amount: 500, confirm: u.username });
    expect(again.body.replayed).toBe(true);
    expect(await balance(u.userId)).toBe(start + 500);
    const entries = await t.db.select().from(ledger).where(and(eq(ledger.userId, u.userId), eq(ledger.reason, 'admin_grant')));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(as.admin.userId);
    expect((await lastAudit('economy.grant'))?.reason).toBe('lost a game to a server restart');
  });

  it('never lets staff pay themselves, and support can look but not grant', async () => {
    expect((await as.admin.client.post('/api/admin/economy/grant', { userId: as.admin.userId, currency: 'sparks', amount: 10, reason: 'pay myself', requestKey: key() })).status).toBe(403);
    expect((await as.support.client.post('/api/admin/economy/grant', { userId: as.player.userId, currency: 'sparks', amount: 10, reason: 'goodwill', requestKey: key(), confirm: as.player.username })).status).toBe(403);
    expect((await as.support.client.get(`/api/admin/economy/ledger?userId=${as.player.userId}`)).status).toBe(200);
  });

  it('revokes only what is there', async () => {
    const u = await registered(t.app);
    const res = await as.admin.client.post('/api/admin/economy/revoke', { userId: u.userId, currency: 'sparks', amount: 9_999, reason: 'clawback', requestKey: key(), confirm: u.username });
    expect(res.status).toBe(409);
    const ok = await as.admin.client.post('/api/admin/economy/revoke', { userId: u.userId, currency: 'sparks', amount: 50, reason: 'clawback', requestKey: key(), confirm: u.username });
    expect(ok.body.balance).toBe(200);
  });

  it('test-only items never reach real accounts', async () => {
    const created = await as.admin.client.post('/api/admin/items', {
      id: 'qa-test-hat',
      type: 'accessory',
      name: 'QA hard hat',
      description: 'For testing only.',
      rarity: 'common',
      art: { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 30 },
      releaseState: 'live',
      isTestOnly: true,
      reason: 'test item',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const u = await registered(t.app);
    expect((await as.admin.client.post('/api/admin/economy/grant', { userId: u.userId, itemId: 'qa-test-hat', reason: 'should fail', requestKey: key(), confirm: u.username })).status).toBe(403);
  });

  it('rules changes are validated and audited with before and after', async () => {
    const current = (await as.admin.client.get('/api/admin/economy/rules')).body.rules;
    const bad = await as.admin.client.put('/api/admin/economy/rules', { rules: { ...current, starterItems: ['no-such-item'] }, reason: 'typo test' });
    expect(bad.status).toBe(400);
    const res = await as.admin.client.put('/api/admin/economy/rules', { rules: { ...current, welcomeSparks: 300 }, reason: 'launch week' });
    expect(res.status).toBe(200);
    const fresh = await registered(t.app);
    expect(await balance(fresh.userId)).toBe(300);
    const audit = await lastAudit('economy.rules');
    expect((audit?.before as { welcomeSparks: number }).welcomeSparks).toBe(250);
    expect((audit?.after as { welcomeSparks: number }).welcomeSparks).toBe(300);
    await as.admin.client.put('/api/admin/economy/rules', { rules: current, reason: 'back to normal' });
  });
});

describe('testing tools', () => {
  let qa: { userId: string; username: string; password: string };

  it('creates a test account with a one-time password', async () => {
    const res = await as.tester.client.post('/api/admin/testing/accounts', { accountType: 'student', age: 'teen', reason: 'QA for shop flows' });
    expect(res.status).toBe(200);
    expect(res.body.username).toMatch(/^qa_[a-z]+\d{3}$/);
    qa = { userId: res.body.account.id, username: res.body.username, password: res.body.password };
    const login = await new Client(t.app).post('/api/auth/login', { username: qa.username, password: qa.password });
    expect(login.status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.id, qa.userId));
    expect(row?.isTestAccount).toBe(true);
    expect(row?.ageBand).toBe('13to17');
    expect(await balance(qa.userId)).toBe(250);
  });

  it('grants big amounts to test accounts only, without typed confirmation', async () => {
    const ok = await as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/grant`, { currency: 'sparks', amount: 100_000, reason: 'shop testing', requestKey: key() });
    expect(ok.status).toBe(200);
    expect(await balance(qa.userId)).toBe(100_250);
    const real = await as.tester.client.post(`/api/admin/testing/accounts/${as.player.userId}/grant`, { currency: 'sparks', amount: 10, reason: 'nope', requestKey: key() });
    expect(real.status).toBe(403);
  });

  it('unlimited currency needs a test account plus an entitlement, and is never charged', async () => {
    const ent = await as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/entitlements`, { kind: 'unlimited_currency', grant: true, reason: 'pack odds testing' });
    expect(ent.status).toBe(200);
    const player = new Client(t.app);
    await player.post('/api/auth/login', { username: qa.username, password: qa.password });
    const before = await balance(qa.userId);
    const buy = await player.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    expect(buy.status).toBe(200);
    expect(buy.body.unlimited).toBe(true);
    expect(await balance(qa.userId)).toBe(before);
    // A real account with the same entitlement row still pays: the test-account flag is required too.
    await t.db.insert(entitlements).values({ userId: as.player.userId, kind: 'unlimited_currency', reason: 'forged row' });
    const real = await as.player.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    expect(real.body.unlimited).toBe(false);
    expect((await as.tester.client.post(`/api/admin/testing/accounts/${as.player.userId}/entitlements`, { kind: 'unlimited_currency', grant: true, reason: 'nope' })).status).toBe(403);
  });

  it('resets need typed confirmation and are written to the ledger', async () => {
    const unconfirmed = await as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/reset`, { scopes: ['economy'], reason: 'clean slate' });
    expect(unconfirmed.body.error.code).toBe('confirmation_required');
    const res = await as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/reset`, { scopes: ['economy'], reason: 'clean slate', confirm: qa.username });
    expect(res.status).toBe(200);
    expect(await balance(qa.userId)).toBe(0);
    const resets = await t.db.select().from(ledger).where(and(eq(ledger.userId, qa.userId), eq(ledger.reason, 'test_reset')));
    expect(resets.length).toBeGreaterThan(0);
    const all = await as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/reset`, { scopes: ['economy', 'inventory', 'progression'], reason: 'brand new', confirm: qa.username });
    expect(all.status).toBe(200);
    expect(await balance(qa.userId)).toBe(250);
    const inv = await t.db.select().from(inventory).where(eq(inventory.userId, qa.userId));
    expect(inv.map((i) => i.itemId).sort()).toEqual(['glim-dewdrop', 'glim-pebblet', 'glim-sprig']);
  });

  it('runs QA scenarios', async () => {
    const run = (scenario: string) => as.tester.client.post(`/api/admin/testing/accounts/${qa.userId}/scenario`, { scenario, reason: 'qa run' });
    const almost = await run('almost_complete');
    expect(almost.status).toBe(200);
    const meadow = await t.db.select({ id: items.id }).from(items).where(and(eq(items.collectionId, 'meadow'), eq(items.type, 'glim')));
    const owned = await t.db.select().from(inventory).where(eq(inventory.userId, qa.userId));
    expect(meadow.filter((m) => owned.some((o) => o.itemId === m.id && o.quantity > 0))).toHaveLength(meadow.length - 1);
    expect((await run('pity_ready')).status).toBe(200);
    const pity = await t.db.select().from(pityCounters).where(eq(pityCounters.userId, qa.userId));
    expect(pity.length).toBeGreaterThan(0);
    expect((await run('level_up_ready')).status).toBe(200);
    expect((await run('wealthy')).body).toMatchObject({ sparks: 50_000 });
  });

  it('only a super administrator turns an existing account into a test account', async () => {
    const u = await registered(t.app);
    expect((await as.tester.client.post(`/api/admin/testing/accounts/${u.userId}/test-flag`, { isTest: true, reason: 'qa account', confirm: u.username })).status).toBe(403);
    expect((await as.admin.client.post(`/api/admin/testing/accounts/${u.userId}/test-flag`, { isTest: true, reason: 'qa account', confirm: u.username })).status).toBe(403);
    expect((await as.superadmin.client.post(`/api/admin/testing/accounts/${u.userId}/test-flag`, { isTest: true, reason: 'qa account', confirm: u.username })).status).toBe(200);
    await as.superadmin.client.post(`/api/admin/testing/accounts/${u.userId}/entitlements`, { kind: 'unlimited_currency', grant: true, reason: 'qa account' });
    expect((await as.superadmin.client.post(`/api/admin/testing/accounts/${u.userId}/test-flag`, { isTest: false, reason: 'done', confirm: u.username })).status).toBe(200);
    const active = await t.db.select().from(entitlements).where(and(eq(entitlements.userId, u.userId)));
    expect(active.every((e) => e.revokedAt)).toBe(true);
  });
});

describe('testing tools in production', () => {
  let prod: TestContext;
  beforeAll(async () => {
    prod = await createTestApp({ APP_ENV: 'production', IP_HASH_KEY: 'p'.repeat(40) });
  });
  afterAll(async () => {
    await prod?.close();
  });

  it('switches QA scenarios off and keeps unlimited currency for super administrators', async () => {
    const tester = await registered(prod.app);
    const boss = await registered(prod.app);
    await cliChangeRole(prod.db, 'production', 'grant', boss.username, 'superadmin', 'first admin');
    await boss.client.post(`/api/admin/users/${tester.userId}/roles`, { role: 'tester', grant: true, reason: 'qa team' });
    const acct = await tester.client.post('/api/admin/testing/accounts', { reason: 'prod smoke test' });
    expect(acct.status).toBe(200);
    const id = acct.body.account.id;
    expect((await tester.client.post(`/api/admin/testing/accounts/${id}/scenario`, { scenario: 'wealthy', reason: 'qa run' })).status).toBe(403);
    expect((await tester.client.post(`/api/admin/testing/accounts/${id}/entitlements`, { kind: 'unlimited_currency', grant: true, reason: 'qa account' })).status).toBe(403);
    expect((await boss.client.post(`/api/admin/testing/accounts/${id}/entitlements`, { kind: 'unlimited_currency', grant: true, reason: 'release check' })).status).toBe(200);
    expect((await tester.client.get('/api/admin/testing/info')).body).toMatchObject({ environment: 'production', scenariosEnabled: false, canGrantUnlimited: false });
  });
});

describe('catalogue, shop and live operations', () => {
  it('previews Lantern odds before saving and rejects tables that cannot drop anything', async () => {
    const empty = await as.admin.client.post('/api/admin/packs/preview', { dropTable: { weights: { common: 1 }, itemIds: ['no-such-glim'] } });
    expect(empty.status).toBe(400);
    const ok = await as.admin.client.post('/api/admin/packs/preview', { dropTable: { weights: { common: 60, rare: 40 }, collectionIds: ['meadow'] } });
    expect(ok.status).toBe(200);
    const total = ok.body.odds.reduce((n: number, o: { percent: number }) => n + o.percent, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('repricing a Lantern moves the shop listings that sold it at the old price', async () => {
    const res = await as.admin.client.patch('/api/admin/packs/lantern-meadow', { priceAmount: 175, reason: 'price test' });
    expect(res.status).toBe(200);
    expect(res.body.listingsRepriced).toBeGreaterThan(0);
    const shop = await as.player.client.get('/api/shop');
    const l = shop.body.listings.find((x: { id: string }) => x.id === 'l-lantern-meadow');
    expect(l.price.amount).toBe(175);
    await as.admin.client.patch('/api/admin/packs/lantern-meadow', { priceAmount: 150, reason: 'restore' });
  });

  it('deactivating a listing takes it out of the shop', async () => {
    await as.admin.client.patch('/api/admin/shop/listings/l-lantern-starfall', { active: false, reason: 'pause sales' });
    const shop = await as.player.client.get('/api/shop');
    expect(shop.body.listings.some((x: { id: string }) => x.id === 'l-lantern-starfall')).toBe(false);
    await as.admin.client.patch('/api/admin/shop/listings/l-lantern-starfall', { active: true, reason: 'resume' });
  });

  it('item art has to match the item type', async () => {
    const res = await as.admin.client.patch('/api/admin/items/glim-sprig', { art: { kind: 'title', text: 'Nope' }, reason: 'bad art' });
    expect(res.status).toBe(400);
  });

  it('moves an event window together with its listings and currency, and ending early needs confirmation', async () => {
    const res = await as.admin.client.patch('/api/admin/events/frost_festival', { startsAt: '2026-10-01T00:00:00Z', endsAt: '2027-02-14T23:59:59Z', reason: 'extend festival' });
    expect(res.status).toBe(200);
    const listings = (await as.admin.client.get('/api/admin/shop/listings?section=event')).body.listings;
    expect(listings.every((l: { endsAt: string }) => l.endsAt === '2027-02-14T23:59:59.000Z')).toBe(true);
    const cur = (await as.admin.client.get('/api/admin/currencies')).body.currencies.find((c: { code: string }) => c.code === 'frost_tickets');
    expect(cur.expiresAt).toBe('2027-02-14T23:59:59.000Z');
    const off = await as.admin.client.patch('/api/admin/events/frost_festival', { enabled: false, reason: 'end early' });
    expect(off.body.error.code).toBe('confirmation_required');
  });

  it('flags change behaviour and are audited', async () => {
    const before = (await as.player.client.get('/api/shop')).body.listings.filter((l: { section: string }) => l.section === 'daily').length;
    expect(before).toBe(6);
    expect((await as.admin.client.patch('/api/admin/flags/shop.rotations', { enabled: false, reason: 'rotation bug' })).status).toBe(200);
    const after = (await as.player.client.get('/api/shop')).body.listings.filter((l: { section: string }) => l.section === 'daily').length;
    expect(after).toBe(0);
    await as.admin.client.patch('/api/admin/flags/shop.rotations', { enabled: true, reason: 'fixed' });
    const audit = await lastAudit('flag.update');
    expect((audit?.after as { enabled: boolean }).enabled).toBe(true);
  });

  it('hides a mode from players while staff can still see it', async () => {
    await as.admin.client.put('/api/admin/modes/comet-dash', { visibility: 'hidden', reason: 'bug in timer' });
    const pub = await as.player.client.get('/api/modes');
    expect(pub.body.modes.some((m: { meta: { id: string } }) => m.meta.id === 'comet-dash')).toBe(false);
    const staffView = await as.admin.client.get('/api/modes');
    expect(staffView.body.modes.some((m: { meta: { id: string } }) => m.meta.id === 'comet-dash')).toBe(true);
    await as.admin.client.put('/api/admin/modes/comet-dash', { visibility: 'published', reason: 'fixed' });
  });

  it('lists and closes a live room with the room code typed out', async () => {
    const sets = await as.player.client.get('/api/sets');
    const setId = sets.body.sets[0].id;
    const room = await as.player.client.post('/api/rooms', { setId, modeId: 'classic' });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    const code = room.body.code;
    const list = await as.moderator.client.get('/api/admin/rooms');
    expect(list.body.rooms.some((r: { code: string }) => r.code === code)).toBe(true);
    expect((await as.moderator.client.post(`/api/admin/rooms/${code}/close`, { reason: 'abuse' })).body.error.code).toBe('confirmation_required');
    expect((await as.moderator.client.post(`/api/admin/rooms/${code}/close`, { reason: 'abuse', confirm: code })).status).toBe(200);
    expect((await as.moderator.client.get(`/api/admin/rooms/${code}`)).status).toBe(404);
  });

  it('the audit log is searchable and never exposes hashed IPs', async () => {
    const res = await as.admin.client.get('/api/admin/audit?action=user.');
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThan(3);
    expect(res.body.entries.every((e: { action: string }) => e.action.startsWith('user.'))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('ipHash');
  });

  it('system health reports the database and rooms', async () => {
    const res = await as.admin.client.get('/api/admin/system');
    expect(res.body).toMatchObject({ environment: 'test', database: { ok: true } });
    expect(typeof res.body.database.latencyMs).toBe('number');
  });
});
