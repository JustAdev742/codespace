import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ROLE_PERMISSIONS, canAssignRole, hasPermission } from '@ludora/shared';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, classRewards, inventory, ledger, purchases, shopListings, wallets } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { DEFAULT_RULES, activeBoost, clearRulesCache, economyRulesSchema, type EconomyRules } from '../src/modules/economy/config.ts';
import { previewRules } from '../src/modules/economy/preview.ts';
import { computeGameReward } from '../src/modules/progression/rewards.ts';
import { csvCell, diffRules } from '../src/modules/admin/economyRoom.ts';
import { awardCost, budgetProblem } from '../src/modules/classes/rewards.ts';

/*
 * The economy manager role (D58), the economy room, class rewards and the Wallet: what an economy
 * manager can do, what they cannot, the daily grant total, refunds, sales, and the maths behind the
 * rules preview and the class budget.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let su: Account, admin: Account, econ: Account, econ2: Account, moderator: Account, support: Account, player: Account, other: Account;
let keyN = 0;
const key = () => `econ-test-${Date.now()}-${++keyN}`;

async function balance(userId: string, currency = 'sparks') {
  const [w] = await t.db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)));
  return w?.balance ?? 0;
}

beforeAll(async () => {
  t = await createTestApp();
  [su, admin, econ, econ2, moderator, support, player, other] = (await Promise.all(Array.from({ length: 8 }, () => registered(t.app)))) as [Account, Account, Account, Account, Account, Account, Account, Account];
  expect((await cliChangeRole(t.db, 'test', 'grant', su.username, 'superadmin', 'first admin')).ok).toBe(true);
  for (const [who, role] of [
    [admin, 'admin'],
    [moderator, 'moderator'],
    [support, 'support'],
  ] as const) {
    const r = await su.client.post(`/api/admin/users/${who.userId}/roles`, { role, grant: true, reason: 'test setup', confirm: who.username });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  // An administrator grants the economy manager role.
  for (const who of [econ, econ2]) {
    const r = await admin.client.post(`/api/admin/users/${who.userId}/roles`, { role: 'economist', grant: true, reason: 'runs the economy' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
});
afterAll(async () => {
  await t?.close();
});

describe('the economy manager role', () => {
  it('holds the economy permissions and nothing else', () => {
    const p = new Set(ROLE_PERMISSIONS.economist);
    for (const ok of ['staff.access', 'economy.view', 'economy.configure', 'economy.grant', 'shop.manage', 'events.manage'] as const) expect(p.has(ok)).toBe(true);
    for (const no of ['users.read', 'users.moderate', 'users.edit', 'roles.assign', 'reports.handle', 'content.moderate', 'rooms.manage', 'modes.manage', 'catalog.manage', 'flags.manage', 'system.view', 'audit.read', 'testing.tools', 'economy.limits'] as const) {
      expect(p.has(no), no).toBe(false);
    }
    expect(hasPermission(['admin'], 'economy.limits')).toBe(true);
  });

  it('is granted only by an administrator or above', async () => {
    expect(canAssignRole(['moderator'], 'economist')).toBe(false);
    expect(canAssignRole(['support'], 'economist')).toBe(false);
    expect(canAssignRole(['economist'], 'economist')).toBe(false);
    expect(canAssignRole(['admin'], 'economist')).toBe(true);
    expect((await moderator.client.post(`/api/admin/users/${other.userId}/roles`, { role: 'economist', grant: true, reason: 'try' })).status).toBe(403);
    expect((await support.client.post(`/api/admin/users/${other.userId}/roles`, { role: 'economist', grant: true, reason: 'try' })).status).toBe(403);
    expect((await econ.client.post(`/api/admin/users/${other.userId}/roles`, { role: 'economist', grant: true, reason: 'try' })).status).toBe(403);
  });

  it('opens every economy page', async () => {
    for (const url of ['/api/admin/economy/overview', '/api/admin/economy/health', '/api/admin/economy/ledger', '/api/admin/economy/rules', '/api/admin/economy/rules/history', '/api/admin/economy/limits', '/api/admin/economy/activity', '/api/admin/currencies', '/api/admin/shop/listings', '/api/admin/events', `/api/admin/economy/accounts?q=${player.username}`, `/api/admin/economy/purchases?userId=${player.userId}`, `/api/admin/users/${player.userId}/wallet`]) {
      const r = await econ.client.get(url);
      expect(r.status, url).toBe(200);
    }
  });

  it('is refused on every page outside the economy', async () => {
    for (const url of ['/api/admin/users', `/api/admin/users/${player.userId}`, '/api/admin/reports', '/api/admin/sets', '/api/admin/rooms', '/api/admin/modes', '/api/admin/flags', '/api/admin/system', '/api/admin/errors', '/api/admin/audit', '/api/admin/items', '/api/admin/packs', '/api/admin/testing/info', '/api/admin/ai']) {
      const r = await econ.client.get(url);
      expect(r.status, url).toBe(403);
    }
    expect((await econ.client.post(`/api/admin/users/${player.userId}/moderate`, { action: 'warn', reason: 'testing the boundary' })).status).toBe(403);
    expect((await econ.client.post(`/api/admin/users/${player.userId}/sign-out`, { reason: 'testing the boundary' })).status).toBe(403);
    expect((await econ.client.put('/api/admin/economy/limits', { limits: { sparks: 1_000_000, moonstones: 1, dust: 1, other: 1 }, reason: 'raise my own limit' })).status).toBe(403);
  });

  it('sees only the economy part of the audit log', async () => {
    const r = await econ.client.get('/api/admin/economy/activity');
    expect(r.status).toBe(200);
    for (const e of r.body.entries) expect(e.action).toMatch(/^(economy|listing|currency|event)\./);
    // The role grants above are in the audit log, and not in what the economy manager sees.
    expect(r.body.entries.some((e: { action: string }) => e.action.startsWith('user.'))).toBe(false);
  });

  it('cannot grant to their own account, alone or through a class', async () => {
    const r = await econ.client.post('/api/admin/economy/grant', { userId: econ.userId, currency: 'sparks', amount: 10, reason: 'pay myself', requestKey: key() });
    expect(r.status).toBe(403);
    expect(await balance(econ.userId)).toBe(250);
  });
});

describe('daily grant total', () => {
  it('lets an economy manager grant up to the daily total, then refuses, and an administrator can raise it', async () => {
    const grant = (who: Account, amount: number) => who.client.post('/api/admin/economy/grant', { userId: player.userId, currency: 'sparks', amount, reason: 'server outage refund', requestKey: key(), confirm: player.username });
    const before = await balance(player.userId);
    expect((await grant(econ, 10_000)).status).toBe(200);
    // Per change, the usual cap still applies.
    expect((await grant(econ, 10_001)).status).toBe(400);
    expect((await grant(econ, 9_000)).status).toBe(200);
    const over = await grant(econ, 1_001);
    expect(over.status).toBe(409);
    expect(over.body.error.message).toMatch(/1,000 more today/);
    expect((await grant(econ, 1_000)).status).toBe(200);
    expect((await grant(econ, 1)).status).toBe(409);
    expect(await balance(player.userId)).toBe(before + 20_000);
    const lim = await econ.client.get('/api/admin/economy/limits');
    expect(lim.body).toMatchObject({ heldToLimit: true, canChange: false, usedToday: { sparks: 20_000 }, limits: { sparks: 20_000 } });
    // The limit is per person: another economy manager still has a full day.
    expect((await grant(econ2, 500)).status).toBe(200);
    // Administrators are not held to the daily total.
    expect((await grant(admin, 10_000)).status).toBe(200);
    expect((await admin.client.get('/api/admin/economy/limits')).body.heldToLimit).toBe(false);
    // Only an administrator changes the limit, with a reason, audited.
    const raise = await admin.client.put('/api/admin/economy/limits', { limits: { sparks: 25_000, moonstones: 1000, dust: 10_000, other: 2000 }, reason: 'busy week of corrections' });
    expect(raise.status).toBe(200);
    const [row] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'economy.limits'));
    expect(row?.reason).toBe('busy week of corrections');
    expect((await grant(econ, 5_000)).status).toBe(200);
    expect((await grant(econ, 1)).status).toBe(409);
    // Removing never counts towards the total.
    const revoke = await econ.client.post('/api/admin/economy/revoke', { userId: player.userId, currency: 'sparks', amount: 5, reason: 'over-paid', requestKey: key(), confirm: player.username });
    expect(revoke.status).toBe(200);
  });

  it('counts two grants sent at once as two', async () => {
    const c = await registered(t.app);
    const r = await admin.client.post(`/api/admin/users/${c.userId}/roles`, { role: 'economist', grant: true, reason: 'race test' });
    expect(r.status).toBe(200);
    await admin.client.put('/api/admin/economy/limits', { limits: { sparks: 25_000, moonstones: 1000, dust: 15, other: 2000 }, reason: 'race test' });
    const results = await Promise.all(Array.from({ length: 4 }, () => c.client.post('/api/admin/economy/grant', { userId: player.userId, currency: 'dust', amount: 5, reason: 'race test', requestKey: key(), confirm: player.username })));
    expect(results.filter((x) => x.status === 200)).toHaveLength(3);
    expect(results.filter((x) => x.status === 409)).toHaveLength(1);
  });
});

describe('class grants from the economy room', () => {
  it('gives every student the same amount, needs the class name typed, and counts towards the daily total', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const made = await teacher.client.post('/api/classes', { name: 'Year 5 Oak' });
    const a = await registered(t.app);
    const b = await registered(t.app);
    for (const s of [a, b]) expect((await s.client.post('/api/classes/join', { code: made.body.class.joinCode })).status).toBe(200);
    const found = await econ2.client.get('/api/admin/economy/classes?q=Oak');
    expect(found.body.classes[0]).toMatchObject({ name: 'Year 5 Oak', students: 2 });
    const body = { classId: made.body.class.id, currency: 'sparks', amountEach: 100, reason: 'Lost a whole lesson of rewards to an outage', requestKey: key() };
    expect((await econ2.client.post('/api/admin/economy/grant-class', body)).status).toBe(400);
    const ok = await econ2.client.post('/api/admin/economy/grant-class', { ...body, confirm: 'Year 5 Oak' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ students: 2, total: 200 });
    expect(await balance(a.userId)).toBe(350);
    const again = await econ2.client.post('/api/admin/economy/grant-class', { ...body, confirm: 'Year 5 Oak' });
    expect(again.body.replayed).toBe(true);
    expect(await balance(a.userId)).toBe(350);
    expect((await econ2.client.get('/api/admin/economy/limits')).body.usedToday.sparks).toBe(700);
    // A student of the class who is also staff cannot grant to it.
    expect((await econ2.client.post('/api/classes/join', { code: made.body.class.joinCode })).status).toBe(200);
    expect((await econ2.client.post('/api/admin/economy/grant-class', { ...body, requestKey: key(), confirm: 'Year 5 Oak' })).status).toBe(403);
  });
});

describe('refunds', () => {
  it('gives back the price, takes the item back, frees the limit, and only once', async () => {
    const buyer = await registered(t.app);
    const listing = (await t.db.select().from(shopListings).where(eq(shopListings.section, 'accessories'))).find((l) => l.priceCurrency === 'sparks' && l.priceAmount <= 250 && !l.rotation && l.active)!;
    const before = await balance(buyer.userId);
    expect((await buyer.client.post('/api/shop/purchase', { listingId: listing.id, requestKey: key() })).status).toBe(200);
    expect(await balance(buyer.userId)).toBe(before - listing.priceAmount);
    const list = await econ.client.get(`/api/admin/economy/purchases?userId=${buyer.userId}`);
    const p = list.body.purchases[0];
    expect(p).toMatchObject({ listingId: listing.id, refundable: null });
    const noConfirm = await econ.client.post('/api/admin/economy/refund', { purchaseId: p.id, reason: 'bought by mistake', requestKey: key() });
    expect(noConfirm.status).toBe(400);
    const res = await econ.client.post('/api/admin/economy/refund', { purchaseId: p.id, reason: 'bought by mistake', requestKey: key(), confirm: buyer.username });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await balance(buyer.userId)).toBe(before);
    const [own] = await t.db.select().from(inventory).where(and(eq(inventory.userId, buyer.userId), eq(inventory.itemId, listing.itemId!)));
    expect(own?.quantity ?? 0).toBe(0);
    const [row] = await t.db.select().from(purchases).where(eq(purchases.id, p.id));
    expect(row?.refundedAt).toBeTruthy();
    const [entry] = await t.db.select().from(ledger).where(and(eq(ledger.userId, buyer.userId), eq(ledger.reason, 'refund')));
    expect(entry?.delta).toBe(listing.priceAmount);
    expect((await econ.client.post('/api/admin/economy/refund', { purchaseId: p.id, reason: 'again', requestKey: key(), confirm: buyer.username })).status).toBe(409);
    // It can be bought again, since the refunded purchase no longer counts.
    expect((await buyer.client.post('/api/shop/purchase', { listingId: listing.id, requestKey: key() })).status).toBe(200);
    const [audit] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'economy.refund'));
    expect(audit?.reason).toBe('bought by mistake');
  });

  it('refuses Lanterns, own purchases and roles without grants', async () => {
    const buyer = await registered(t.app);
    await buyer.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    const p = (await econ.client.get(`/api/admin/economy/purchases?userId=${buyer.userId}`)).body.purchases[0];
    expect(p.refundable).toMatch(/Lantern/);
    expect((await econ.client.post('/api/admin/economy/refund', { purchaseId: p.id, reason: 'try a lantern', requestKey: key(), confirm: buyer.username })).status).toBe(409);
    expect((await support.client.post('/api/admin/economy/refund', { purchaseId: p.id, reason: 'try', requestKey: key(), confirm: buyer.username })).status).toBe(403);
    await econ.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    const mine = (await econ.client.get(`/api/admin/economy/purchases?userId=${econ.userId}`)).body.purchases[0];
    expect((await econ.client.post('/api/admin/economy/refund', { purchaseId: mine.id, reason: 'mine', requestKey: key(), confirm: econ.username })).status).toBe(403);
  });
});

describe('sales and featured items', () => {
  it('runs a sale players pay, refuses a sale price at or above the price, and ends it', async () => {
    const listing = (await t.db.select().from(shopListings).where(eq(shopListings.section, 'accessories'))).find((l) => l.priceCurrency === 'sparks' && l.priceAmount >= 100 && l.priceAmount <= 400 && !l.rotation && l.active)!;
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect((await econ.client.put(`/api/admin/economy/sales/${listing.id}`, { salePrice: listing.priceAmount, startsAt, endsAt, reason: 'autumn sale' })).status).toBe(400);
    expect((await econ.client.put(`/api/admin/economy/sales/${listing.id}`, { salePrice: 10, startsAt: endsAt, endsAt: startsAt, reason: 'autumn sale' })).status).toBe(400);
    expect((await moderator.client.put(`/api/admin/economy/sales/${listing.id}`, { salePrice: 10, startsAt, endsAt, reason: 'autumn sale' })).status).toBe(403);
    const salePrice = Math.floor(listing.priceAmount / 2);
    const ok = await econ.client.put(`/api/admin/economy/sales/${listing.id}`, { salePrice, startsAt, endsAt, reason: 'autumn sale' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const buyer = await registered(t.app);
    const shop = await buyer.client.get('/api/shop');
    const seen = shop.body.listings.find((l: { id: string }) => l.id === listing.id);
    expect(seen.price.amount).toBe(salePrice);
    expect(seen.sale).toEqual({ was: listing.priceAmount, until: endsAt });
    const before = await balance(buyer.userId);
    expect((await buyer.client.post('/api/shop/purchase', { listingId: listing.id, requestKey: key() })).status).toBe(200);
    expect(await balance(buyer.userId)).toBe(before - salePrice);
    const featured = await econ.client.patch(`/api/admin/shop/listings/${listing.id}`, { featured: true, reason: 'pick of the week' });
    expect(featured.status).toBe(200);
    expect((await buyer.client.get('/api/shop')).body.listings.find((l: { id: string }) => l.id === listing.id).featured).toBe(true);
    expect((await econ.client.post(`/api/admin/economy/sales/${listing.id}/end`, { reason: 'sale over' })).status).toBe(200);
    expect((await buyer.client.get('/api/shop')).body.listings.find((l: { id: string }) => l.id === listing.id)?.sale ?? null).toBe(null);
    const actions = (await t.db.select().from(auditLog).where(eq(auditLog.targetId, listing.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['listing.sale', 'listing.update', 'listing.sale_end']));
  });
});

describe('rules: preview, history and undo', () => {
  it('previews a change, saves it, lists it and undoes it in one step', async () => {
    const current = (await econ.client.get('/api/admin/economy/rules')).body.rules as EconomyRules;
    const next = { ...current, game: { ...current.game, sparksPerCorrect: 6 } };
    const prev = await econ.client.post('/api/admin/economy/rules/preview', { rules: next });
    expect(prev.status).toBe(200);
    expect(prev.body.preview.headline).toBe('A player who answers 8 of 10 and comes 2nd of 5 in a class game earns 108 Sparks instead of 92.');
    expect(prev.body.changes).toEqual([{ path: 'game.sparksPerCorrect', from: '4', to: '6' }]);
    expect((await econ.client.post('/api/admin/economy/rules/preview', { rules: { ...next, game: { ...next.game, sparksPerCorrect: 999 } } })).status).toBe(400);
    expect((await econ.client.put('/api/admin/economy/rules', { rules: next, reason: 'reward accuracy more' })).status).toBe(200);
    clearRulesCache();
    const hist = await econ.client.get('/api/admin/economy/rules/history');
    const top = hist.body.changes[0];
    expect(top).toMatchObject({ reason: 'reward accuracy more', canUndo: true, changes: [{ path: 'game.sparksPerCorrect', from: '4', to: '6' }] });
    expect(hist.body.changes.slice(1).every((c: { canUndo: boolean }) => !c.canUndo)).toBe(true);
    expect((await moderator.client.post('/api/admin/economy/rules/undo', { changeId: top.id, reason: 'no' })).status).toBe(403);
    expect((await econ.client.post('/api/admin/economy/rules/undo', { changeId: top.id - 1, reason: 'old one' })).status).toBe(409);
    const undo = await econ.client.post('/api/admin/economy/rules/undo', { changeId: top.id, reason: 'too generous' });
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    clearRulesCache();
    expect((await econ.client.get('/api/admin/economy/rules')).body.rules.game.sparksPerCorrect).toBe(4);
    const after = (await econ.client.get('/api/admin/economy/rules/history')).body.changes[0];
    expect(after).toMatchObject({ undoOf: top.id, reason: 'too generous', changes: [{ path: 'game.sparksPerCorrect', from: '6', to: '4' }] });
  });

  it('keeps the class budget and boost when an older form saves rules without them', () => {
    const old = { ...DEFAULT_RULES } as Record<string, unknown>;
    delete old.classRewards;
    delete old.boost;
    const parsed = economyRulesSchema.parse(old);
    expect(parsed.classRewards).toEqual({ weeklyBudget: 500, maxPerStudent: 25 });
    expect(parsed.boost).toBe(null);
  });
});

describe('preview, boost and budget maths', () => {
  it('pays what computeGameReward pays, side by side', () => {
    const after = { ...DEFAULT_RULES, game: { ...DEFAULT_RULES.game, placeSparks: [60, 50, 25] } };
    const p = previewRules(DEFAULT_RULES, after);
    const second = p.rows.find((r) => r.id === 'second')!;
    expect(second.before.sparks).toBe(20 + 8 * 4 + 40);
    expect(second.after.sparks).toBe(20 + 8 * 4 + 50);
    expect(p.rows.find((r) => r.id === 'idle')!.after.sparks).toBe(0);
    expect(p.rows.find((r) => r.id === 'solo')!.after.sparks).toBe(Math.round((20 + 32) * 0.6));
    expect(p.gamesToCap).toEqual({ before: Math.ceil(1500 / 92), after: Math.ceil(1500 / 102) });
    expect(previewRules(DEFAULT_RULES, DEFAULT_RULES).headline).toMatch(/still earns 92 Sparks/);
  });

  it('multiplies game Sparks during a boost, never past the daily cap', () => {
    const input = { rank: 2, humans: 5, answered: 10, correct: 8, solo: false, outcome: 'competitive' as const, sparksToday: 0 };
    expect(computeGameReward(DEFAULT_RULES, { ...input, boost: 2 }).sparks).toBe(184);
    expect(computeGameReward(DEFAULT_RULES, { ...input, sparksToday: 1400, boost: 2 })).toMatchObject({ sparks: 100, capped: true });
    const rules = economyRulesSchema.parse({ ...DEFAULT_RULES, boost: { label: 'Double Sparks weekend', multiplier: 2, startsAt: '2026-11-21T00:00:00Z', endsAt: '2026-11-23T00:00:00Z' } });
    expect(activeBoost(rules, new Date('2026-11-22T12:00:00Z'))?.multiplier).toBe(2);
    expect(activeBoost(rules, new Date('2026-11-23T00:00:00Z'))).toBe(null);
    expect(economyRulesSchema.safeParse({ ...DEFAULT_RULES, boost: { label: 'Too long', multiplier: 2, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' } }).success).toBe(false);
    expect(economyRulesSchema.safeParse({ ...DEFAULT_RULES, boost: { label: 'Too big', multiplier: 5, startsAt: '2026-11-21T00:00:00Z', endsAt: '2026-11-22T00:00:00Z' } }).success).toBe(false);
  });

  it('checks a class award against the week and the per-student limit', () => {
    expect(awardCost(10, 28)).toBe(280);
    expect(budgetProblem({ amountEach: 10, students: 28, used: 0, budget: 500, maxPerStudent: 25 })).toBe(null);
    expect(budgetProblem({ amountEach: 10, students: 28, used: 300, budget: 500, maxPerStudent: 25 })).toBe('That needs 280 Sparks (10 each for 28 students), and this class has 200 left this week.');
    expect(budgetProblem({ amountEach: 30, students: 1, used: 0, budget: 500, maxPerStudent: 25 })).toMatch(/up to 25 Sparks/);
    expect(budgetProblem({ amountEach: 5, students: 0, used: 0, budget: 500, maxPerStudent: 25 })).toMatch(/no students/);
  });

  it('lists rule changes in words and keeps CSV cells safe', () => {
    expect(diffRules(DEFAULT_RULES, { ...DEFAULT_RULES, welcomeSparks: 300 })).toEqual([{ path: 'welcomeSparks', from: '250', to: '300' }]);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
  });
});

describe('class rewards', () => {
  it('lets a teacher reward a student or the class within the weekly budget, and the student sees who and why', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const made = await teacher.client.post('/api/classes', { name: 'Year 4 Birch' });
    const classId = made.body.class.id;
    const kids = await Promise.all([0, 1, 2].map(() => registered(t.app)));
    for (const k of kids) expect((await k.client.post('/api/classes/join', { code: made.body.class.joinCode })).status).toBe(200);
    const view = await teacher.client.get(`/api/classes/${classId}/rewards`);
    expect(view.body).toMatchObject({ budget: 500, maxPerStudent: 25, used: 0, left: 500 });
    expect(view.body.students).toHaveLength(3);
    const one = await teacher.client.post(`/api/classes/${classId}/rewards`, { studentId: kids[0]!.userId, amount: 20, note: 'Brilliant explaining', requestKey: key() });
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(await balance(kids[0]!.userId)).toBe(270);
    const all = await teacher.client.post(`/api/classes/${classId}/rewards`, { wholeClass: true, amount: 10, note: 'Great teamwork today', requestKey: key() });
    expect(all.body).toMatchObject({ students: 3, total: 30, left: 450 });
    expect(await balance(kids[1]!.userId)).toBe(260);
    // Over the per-student limit, over the budget, and from a student: all refused.
    expect((await teacher.client.post(`/api/classes/${classId}/rewards`, { studentId: kids[0]!.userId, amount: 26, note: 'too much', requestKey: key() })).status).toBe(409);
    await t.db.insert(classRewards).values({ classId, studentId: kids[2]!.userId, teacherId: teacher.userId, teacherName: 'x', amount: 440, note: 'filler', batchId: '00000000-0000-4000-8000-000000000001' });
    const over = await teacher.client.post(`/api/classes/${classId}/rewards`, { wholeClass: true, amount: 5, note: 'one more', requestKey: key() });
    expect(over.status).toBe(409);
    expect(over.body.error.message).toBe('That needs 15 Sparks (5 each for 3 students), and this class has 10 left this week.');
    expect((await kids[0]!.client.post(`/api/classes/${classId}/rewards`, { studentId: kids[1]!.userId, amount: 5, note: 'gift to a friend', requestKey: key() })).status).toBe(403);
    expect((await kids[0]!.client.get(`/api/classes/${classId}/rewards`)).status).toBe(403);
    expect((await teacher.client.post(`/api/classes/${classId}/rewards`, { studentId: other.userId, amount: 5, note: 'not in class', requestKey: key() })).status).toBe(409);
    // The student's Wallet says who gave it and why.
    const w = await kids[0]!.client.get('/api/me/wallet');
    const details = w.body.entries.filter((e: { reason: string }) => e.reason === 'class_reward').map((e: { detail: string }) => e.detail);
    expect(details).toEqual(expect.arrayContaining([`From ${teacher.username}: Brilliant explaining`, `From ${teacher.username}: Great teamwork today`]));
    const [a] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, 'class.reward'), eq(auditLog.targetId, classId)));
    expect(a?.reason).toBe('Brilliant explaining');
  });
});

describe('the Wallet', () => {
  it('shows balances, today\'s game Sparks against the limit, a saving goal from the wishlist and the week', async () => {
    const kid = await registered(t.app);
    const w = await kid.client.get('/api/me/wallet');
    expect(w.status).toBe(200);
    expect(w.body.balances.sparks).toBe(250);
    expect(w.body.today).toMatchObject({ gameSparks: 0, cap: 1500 });
    expect(w.body.entries[0]).toMatchObject({ reason: 'welcome', delta: 250 });
    expect(w.body.week.earned).toBe(250);
    expect(w.body.goal).toBe(null);
    const listing = (await t.db.select().from(shopListings).where(eq(shopListings.section, 'lanterns')))[0]!;
    expect((await kid.client.put('/api/me/saving-goal', { listingId: listing.id })).status).toBe(409);
    expect((await kid.client.put(`/api/me/wishlist/${listing.id}`)).status).toBe(200);
    expect((await kid.client.put('/api/me/saving-goal', { listingId: listing.id })).status).toBe(200);
    const g = (await kid.client.get('/api/me/wallet')).body.goal;
    expect(g).toMatchObject({ id: listing.id, have: 250, price: { currency: listing.priceCurrency } });
    // Taking it off the wishlist ends the goal.
    await kid.client.delete(`/api/me/wishlist/${listing.id}`);
    expect((await kid.client.get('/api/me/wallet')).body.goal).toBe(null);
    expect((await kid.client.get('/api/me/wallet/history?before=999999999')).status).toBe(200);
  });
});

describe('ledger download', () => {
  it('downloads one account\'s history as CSV and records the download', async () => {
    const r = await econ.client.get(`/api/admin/economy/ledger.csv?userId=${player.userId}`);
    expect(r.status).toBe(200);
    expect(r.res.headers['content-type']).toMatch(/text\/csv/);
    const lines = r.res.body.trim().split('\r\n');
    expect(lines[0]).toBe('id,time_utc,account,test_account,currency,change,balance_after,reason,staff,note');
    expect(lines.length).toBeGreaterThan(2);
    const [a] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'economy.export'));
    expect(a?.targetId).toBe(player.userId);
    expect((await moderator.client.get('/api/admin/economy/ledger.csv')).status).toBe(403);
  });
});

describe('economy health', () => {
  it('counts real ledger movement, balance bands and purchases, never naming players', async () => {
    const r = await econ.client.get('/api/admin/economy/health?days=7');
    expect(r.status).toBe(200);
    expect(r.body.dayList).toHaveLength(7);
    const today = r.body.dayList.at(-1);
    const sparksToday = r.body.perDay.find((d: { day: string; currency: string }) => d.day === today && d.currency === 'sparks');
    const [{ earned }] = (await t.db.execute<{ earned: string }>(
      // Same filter as the room: real accounts, no unlimited currency, no test resets.
      (await import('drizzle-orm')).sql`select coalesce(sum(l.delta) filter (where l.delta > 0), 0) as earned from ledger_entries l join users u on u.id = l.user_id where l.currency = 'sparks' and not u.is_test_account and not l.unlimited and l.reason <> 'test_reset' and l.created_at >= ${new Date(`${today}T00:00:00Z`)}`,
    )).rows as [{ earned: string }];
    expect(sparksToday.earned).toBe(Number(earned));
    const bandTotal = r.body.bands.reduce((n: number, b: { players: number }) => n + b.players, 0);
    expect(bandTotal).toBe(r.body.players);
    expect(JSON.stringify(r.body)).not.toContain(player.username);
    expect(r.body.mostBought.length).toBeGreaterThan(0);
    expect(r.body.capHits).toHaveLength(7);
    expect((await econ.client.get('/api/admin/economy/health?days=9')).status).toBe(400);
  });
});
