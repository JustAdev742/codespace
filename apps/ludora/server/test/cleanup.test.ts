import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, ledger, userRoles, users, wallets } from '../src/db/schema.ts';
import { copiesOf, mashSigns, nameKey } from '../src/modules/admin/spam.ts';

/*
 * The super administrator's clean-up tools: capping balances and removing junk accounts. Both show
 * what they will touch, need the count typed back, never touch staff or test accounts, and are audited.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let boss: Account;
let admin: Account;
let rich: Account;
let modest: Account;
let richStaff: Account;
const stamp = Date.now().toString(36).slice(-5);

async function setSparks(userId: string, balance: number) {
  await t.db.insert(wallets).values({ userId, currency: 'sparks', balance }).onConflictDoUpdate({ target: [wallets.userId, wallets.currency], set: { balance } });
}

beforeAll(async () => {
  t = await createTestApp();
  boss = await registered(t.app);
  admin = await registered(t.app);
  rich = await registered(t.app);
  modest = await registered(t.app);
  richStaff = await registered(t.app);
  await t.db.insert(userRoles).values([
    { userId: boss.userId, role: 'superadmin', reason: 'test' },
    { userId: admin.userId, role: 'admin', reason: 'test' },
    { userId: richStaff.userId, role: 'moderator', reason: 'test' },
  ]);
  await setSparks(rich.userId, 250_000);
  await setSparks(modest.userId, 1200);
  await setSparks(richStaff.userId, 90_000);
});
afterAll(async () => {
  await t?.close();
});

describe('spotting junk names', () => {
  it('takes the disguises off a name', () => {
    expect(nameKey('singto')).toBe('singto');
    expect(nameKey('singto2')).toBe('singto');
    expect(nameKey('S1NGT0')).toBe('singto');
    expect(nameKey('siingto_123')).toBe('singto');
    expect(nameKey('Sing To')).toBe('singto');
  });
  it('flags keyboard mashes and leaves real names alone', () => {
    for (const junk of ['aaa', 'aaaa', 'ihfjosifjsdoifjso', 'asdfgh', 'qwerty1', 'zzxxzz', 'bcdfgh']) expect(mashSigns(junk), junk).not.toEqual([]);
    for (const real of ['Ava', 'Ben', 'singto', 'Isabella', 'MrHarper', 'Leviticus1001', 'Zoe K', 'Rhythm']) expect(mashSigns(real), real).toEqual([]);
  });
  it('treats the oldest holder of a name as the original', () => {
    const at = (m: number) => new Date(2026, 0, 1, 0, m);
    const list = [
      { id: 'a', username: 'singto', displayName: 'Singto', createdAt: at(0) },
      { id: 'b', username: 'singto2', displayName: 'singto', createdAt: at(5) },
      { id: 'c', username: 's1ngt0', displayName: 'S', createdAt: at(9) },
      { id: 'd', username: 'ava', displayName: 'Ava', createdAt: at(1) },
    ];
    const copies = copiesOf(list);
    expect(copies.get('b')?.id).toBe('a');
    expect(copies.get('c')?.id).toBe('a');
    expect(copies.has('a')).toBe(false);
    expect(copies.has('d')).toBe(false);
  });
});

describe('capping balances', () => {
  it('is for super administrators only', async () => {
    expect((await admin.client.get('/api/admin/cleanup/balances?currency=sparks&cap=5000')).status).toBe(403);
  });
  it('shows who it will change, skips staff, needs the count, and writes the ledger', async () => {
    const preview = await boss.client.get('/api/admin/cleanup/balances?currency=sparks&cap=5000');
    expect(preview.status).toBe(200);
    const ids = preview.body.accounts.map((a: { id: string }) => a.id);
    expect(ids).toContain(rich.userId);
    expect(ids).not.toContain(modest.userId);
    expect(ids).not.toContain(richStaff.userId);
    const wrong = await boss.client.post('/api/admin/cleanup/balances', { currency: 'sparks', cap: 5000, reason: 'Bringing farmed Sparks back to a fair level for everyone.', confirm: '9999' });
    expect(wrong.status).toBe(409);
    const junk = await boss.client.post('/api/admin/cleanup/balances', { currency: 'sparks', cap: 5000, reason: 'ihfjosifjsdoifjso', confirm: String(preview.body.count) });
    expect(junk.status).toBe(400);
    const done = await boss.client.post('/api/admin/cleanup/balances', { currency: 'sparks', cap: 5000, reason: 'Bringing farmed Sparks back to a fair level for everyone.', confirm: String(preview.body.count) });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const bal = async (id: string) => (await t.db.select().from(wallets).where(and(eq(wallets.userId, id), eq(wallets.currency, 'sparks'))))[0]!.balance;
    expect(await bal(rich.userId)).toBe(5000);
    expect(await bal(modest.userId)).toBe(1200);
    expect(await bal(richStaff.userId)).toBe(90_000);
    const [entry] = await t.db.select().from(ledger).where(and(eq(ledger.userId, rich.userId), eq(ledger.reason, 'admin_revoke')));
    expect(entry!.delta).toBe(-245_000);
    const [log] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'economy.cap'));
    expect(log!.reason).toMatch(/fair level/);
  });
});

describe('removing junk accounts', () => {
  let original: Account;
  let copy: Account;
  let mash: Account;
  let ordinary: Account;
  beforeAll(async () => {
    original = await registered(t.app, { username: `singto${stamp}` });
    copy = await registered(t.app, { username: `s1ngt0${stamp}` });
    mash = await registered(t.app, { username: `aaaa${stamp}` });
    ordinary = await registered(t.app, { username: `isabella${stamp}` });
  });
  it('lists keyboard mashes and copies, finds names like a search, and leaves the original and staff out', async () => {
    const list = await boss.client.get(`/api/admin/cleanup/spam?like=${encodeURIComponent('singto')}`);
    expect(list.status).toBe(200);
    const byId = new Map(list.body.accounts.map((a: { id: string }) => [a.id, a]));
    expect(byId.has(mash.userId)).toBe(true);
    expect(byId.has(copy.userId)).toBe(true);
    expect((byId.get(mash.userId) as { signs: string[] }).signs.length).toBeGreaterThan(0);
    expect(byId.has(ordinary.userId)).toBe(false);
    expect(byId.has(boss.userId)).toBe(false);
    expect(byId.has(richStaff.userId)).toBe(false);
    // The original matches the search, so it is listed, but it is not marked as anyone's copy.
    expect((byId.get(original.userId) as { copyOf: unknown } | undefined)?.copyOf ?? null).toBeNull();
  });
  it('removes the chosen accounts, never staff, and keeps the username in the audit log', async () => {
    expect((await admin.client.post('/api/admin/cleanup/remove', { userIds: [mash.userId], reason: 'Keyboard-mash spam account with no games played.', confirm: '1' })).status).toBe(403);
    expect((await boss.client.post('/api/admin/cleanup/remove', { userIds: [richStaff.userId], reason: 'Trying to remove a staff account here.', confirm: '1' })).status).toBe(403);
    expect((await boss.client.post('/api/admin/cleanup/remove', { userIds: [mash.userId, copy.userId], reason: 'Spam accounts: a keyboard mash and a copy of singto.', confirm: '1' })).status).toBe(400);
    const done = await boss.client.post('/api/admin/cleanup/remove', { userIds: [mash.userId, copy.userId], reason: 'Spam accounts: a keyboard mash and a copy of singto.', confirm: '2' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.removed).toBe(2);
    expect(await t.db.select().from(users).where(eq(users.id, mash.userId))).toHaveLength(0);
    expect(await t.db.select().from(users).where(eq(users.id, original.userId))).toHaveLength(1);
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.action, 'user.removed'));
    expect(logs.map((l) => l.targetName)).toContain(mash.username);
    expect(logs[0]!.reason).toMatch(/Spam accounts/);
  });
});
