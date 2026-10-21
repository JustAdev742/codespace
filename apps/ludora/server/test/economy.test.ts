import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { credit } from '../src/modules/economy/service.ts';
import { entitlements, inventory, items, ledger, packOpenings, pityCounters, shopListings, users, wallets } from '../src/db/schema.ts';
import { rotationPicks } from '../src/modules/shop/service.ts';
import { openPack } from '../src/modules/packs/service.ts';
import { GLIMS } from '@ludora/content';

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

let keyN = 0;
const key = () => `test-key-${Date.now()}-${++keyN}`;

async function give(userId: string, currency: string, amount: number) {
  await t.db.transaction((tx) => credit(tx, { userId, currency, amount, reason: 'admin_grant' }));
}

async function balance(userId: string, currency = 'sparks') {
  const [w] = await t.db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)));
  return w?.balance ?? 0;
}

describe('shop and purchases', () => {
  it('starts accounts with welcome Sparks and starter Glims', async () => {
    const u = await registered(t.app);
    expect(await balance(u.userId)).toBe(250);
    const inv = await t.db.select().from(inventory).where(eq(inventory.userId, u.userId));
    expect(inv.map((i) => i.itemId).sort()).toEqual(['glim-dewdrop', 'glim-pebblet', 'glim-sprig']);
  });

  it('lists sections with prices and ownership', async () => {
    const u = await registered(t.app);
    const shop = await u.client.get('/api/shop');
    expect(shop.status).toBe(200);
    const sections = new Set(shop.body.listings.map((l: any) => l.section));
    for (const s of ['lanterns', 'daily', 'accessories', 'profile', 'effects']) expect(sections.has(s), s).toBe(true);
    expect(shop.body.listings.filter((l: any) => l.section === 'daily')).toHaveLength(6);
    expect(shop.body.balances.sparks).toBe(250);
  });

  it('buys and opens a Lantern: charges once, grants a Glim, records everything', async () => {
    const u = await registered(t.app);
    const k = key();
    const res = await u.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: k });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('pack');
    expect(res.body.pack.item.id).toMatch(/^glim-/);
    expect(res.body.balances.sparks).toBe(100);
    // Same key again: the first result comes back and nothing is charged.
    const again = await u.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: k });
    expect(again.body.replayed).toBe(true);
    expect(again.body.pack.item.id).toBe(res.body.pack.item.id);
    expect(await balance(u.userId)).toBe(100);
    const opens = await t.db.select().from(packOpenings).where(eq(packOpenings.userId, u.userId));
    expect(opens).toHaveLength(1);
    const entries = await t.db.select().from(ledger).where(and(eq(ledger.userId, u.userId), eq(ledger.reason, 'pack_open')));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.delta).toBe(-150);
    expect(entries[0]!.balanceAfter).toBe(100);
  });

  it('refuses a purchase it cannot afford and changes nothing', async () => {
    const u = await registered(t.app);
    await u.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    const res = await u.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('insufficient_funds');
    expect(await balance(u.userId)).toBe(100);
  });

  it('never overspends under concurrent purchases', async () => {
    const u = await registered(t.app);
    await give(u.userId, 'sparks', 200); // 450 total: exactly three 150-Spark Lanterns
    const results = await Promise.all(Array.from({ length: 10 }, () => u.client.post('/api/shop/purchase', { listingId: 'l-lantern-tidepool', requestKey: key() })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'insufficient_funds')).toBe(true);
    expect(await balance(u.userId)).toBe(0);
    const [{ n }] = (await t.db.select({ n: sql<number>`count(*)::int` }).from(packOpenings).where(eq(packOpenings.userId, u.userId))) as [{ n: number }];
    expect(n).toBe(3);
  });

  it('charges once when the same request is sent several times at once', async () => {
    const u = await registered(t.app);
    const k = key();
    const results = await Promise.all(Array.from({ length: 6 }, () => u.client.post('/api/shop/purchase', { listingId: 'l-lantern-ember', requestKey: k })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.pack.item.id)).size).toBe(1);
    expect(await balance(u.userId)).toBe(100);
  });

  it('only sells daily picks that are in today\'s rotation', async () => {
    const u = await registered(t.app);
    await give(u.userId, 'sparks', 5000);
    const all = await t.db.select().from(shopListings);
    const today = rotationPicks(all, 'daily');
    const notToday = all.find((l) => l.rotation === 'daily' && !today.has(l.id))!;
    const res = await u.client.post('/api/shop/purchase', { listingId: notToday.id, requestKey: key() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('not_available');
    const inToday = [...today][0]!;
    const ok = await u.client.post('/api/shop/purchase', { listingId: inToday, requestKey: key() });
    expect(ok.status).toBe(200);
    const twice = await u.client.post('/api/shop/purchase', { listingId: inToday, requestKey: key() });
    expect(twice.status).toBe(409);
  });

  it('does not sell a cosmetic you already own', async () => {
    const u = await registered(t.app);
    await give(u.userId, 'sparks', 1000);
    const listing = (await t.db.select().from(shopListings).where(eq(shopListings.section, 'accessories'))).find((l) => l.priceCurrency === 'sparks')!;
    expect((await u.client.post('/api/shop/purchase', { listingId: listing.id, requestKey: key() })).status).toBe(200);
    expect((await u.client.post('/api/shop/purchase', { listingId: listing.id, requestKey: key() })).status).toBe(409);
  });

  it('requires a valid request key', async () => {
    const u = await registered(t.app);
    expect((await u.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow' })).status).toBe(400);
  });
});

describe('Lantern odds and pity', () => {
  it('publishes odds that add up to 100%', async () => {
    const u = await registered(t.app);
    const res = await u.client.get('/api/packs/lantern-starfall');
    const total = res.body.odds.reduce((n: number, o: any) => n + o.percent, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(res.body.odds.map((o: any) => o.rarity)).toContain('mythic');
    expect(res.body.items.length).toBe(14);
  });

  it('guarantees epic or better when the pity counter is reached', async () => {
    const u = await registered(t.app);
    const [pack] = await t.db.select().from((await import('../src/db/schema.ts')).packs).where(eq((await import('../src/db/schema.ts')).packs.id, 'lantern-meadow'));
    await t.db.insert(pityCounters).values({ userId: u.userId, packId: 'lantern-meadow', sinceEpic: 14 });
    // A random source that would always pick the commonest rarity.
    const result = await t.db.transaction((tx) => openPack(tx, { userId: u.userId, pack: pack!, opId: 0, unlimited: false, random: () => 0 }));
    expect(['epic', 'legendary', 'mythic']).toContain(result.item.rarity);
    expect(result.pity).toBe(true);
    const [pc] = await t.db.select().from(pityCounters).where(and(eq(pityCounters.userId, u.userId), eq(pityCounters.packId, 'lantern-meadow')));
    expect(pc!.sinceEpic).toBe(0);
  });

  it('draws rarities close to the published odds', async () => {
    const u = await registered(t.app);
    const { packs } = await import('../src/db/schema.ts');
    const [pack] = await t.db.select().from(packs).where(eq(packs.id, 'lantern-frost'));
    const counts: Record<string, number> = {};
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) {
      // Reset pity each time so it never interferes with the distribution.
      await t.db.update(pityCounters).set({ sinceEpic: 0 }).where(eq(pityCounters.userId, u.userId));
      const r = await t.db.transaction((tx) => openPack(tx, { userId: u.userId, pack: pack!, opId: 0, unlimited: false, random: rand }));
      counts[r.item.rarity] = (counts[r.item.rarity] ?? 0) + 1;
    }
    // Commons are 5000/9970 of the weight here (no mythics in this collection): about 50%.
    expect(counts.common! / 600).toBeGreaterThan(0.42);
    expect(counts.common! / 600).toBeLessThan(0.58);
    expect(counts.mythic ?? 0).toBe(0);
  }, 60_000);
});

describe('collection, recycling and crafting', () => {
  it('shows owned Glims and hides the art of unowned ones', async () => {
    const u = await registered(t.app);
    const res = await u.client.get('/api/collection');
    const meadow = res.body.collections.find((c: any) => c.id === 'meadow');
    expect(meadow.total).toBe(14);
    expect(meadow.owned).toBe(2);
    const missing = meadow.glims.find((g: any) => g.owned === 0);
    expect(missing.art).toBeNull();
    expect(missing.name).toBeNull();
    // Silhouettes keep the shape (body, ears, topper, tail, wings) and never colours or a face.
    for (const g of meadow.glims.filter((x: any) => x.owned === 0)) {
      expect(Object.keys(g.silhouette).every((k) => ['body', 'topper', 'ears', 'tail', 'back'].includes(k))).toBe(true);
    }
    const eared = GLIMS.find((g) => g.collectionId === 'meadow' && (g.art as { ears?: string }).ears && !meadow.glims.find((x: any) => x.id === g.id).owned);
    if (eared) expect(meadow.glims.find((x: any) => x.id === eared.id).silhouette.ears).toBe((eared.art as { ears: string }).ears);
  });

  it('recycles spares for Glow Dust but always keeps one', async () => {
    const u = await registered(t.app);
    await t.db.update(inventory).set({ quantity: 3 }).where(and(eq(inventory.userId, u.userId), eq(inventory.itemId, 'glim-sprig')));
    const ok = await u.client.post('/api/collection/recycle', { itemId: 'glim-sprig', quantity: 2, requestKey: key() });
    expect(ok.status).toBe(200);
    expect(ok.body.dust).toBe(10);
    expect(ok.body.balances.dust).toBe(10);
    const last = await u.client.post('/api/collection/recycle', { itemId: 'glim-sprig', quantity: 1, requestKey: key() });
    expect(last.status).toBe(409);
  });

  it('crafts a chosen Glim with Glow Dust', async () => {
    const u = await registered(t.app);
    const [target] = await t.db.select().from(items).where(and(eq(items.collectionId, 'ember'), eq(items.rarity, 'common')));
    const poor = await u.client.post('/api/collection/craft', { itemId: target!.id, requestKey: key() });
    expect(poor.status).toBe(409);
    await give(u.userId, 'dust', 40);
    const ok = await u.client.post('/api/collection/craft', { itemId: target!.id, requestKey: key() });
    expect(ok.status).toBe(200);
    expect(ok.body.balances.dust).toBe(0);
  });

  it('pays a collection reward exactly once', async () => {
    const u = await registered(t.app);
    const meadow = await t.db.select().from(items).where(eq(items.collectionId, 'meadow'));
    // Give every meadow Glim except one, then craft the last one twice over.
    const last = meadow.find((g) => g.rarity === 'common' && !['glim-pebblet', 'glim-sprig'].includes(g.id))!;
    for (const g of meadow) if (g.id !== last.id) await t.db.insert(inventory).values({ userId: u.userId, itemId: g.id, quantity: 1, source: 'test' }).onConflictDoNothing();
    await give(u.userId, 'dust', 100);
    const before = await balance(u.userId, 'moonstones');
    const first = await u.client.post('/api/collection/craft', { itemId: last.id, requestKey: key() });
    expect(first.body.collectionsCompleted).toEqual(['meadow']);
    await u.client.post('/api/collection/craft', { itemId: last.id, requestKey: key() });
    const rewards = await t.db.select().from(ledger).where(and(eq(ledger.userId, u.userId), eq(ledger.reason, 'collection_reward')));
    expect(rewards).toHaveLength(1);
    expect(rewards[0]!.delta).toBe(25);
    // Completing a first collection also unlocks the "Full set" achievement (+10 Moonstones).
    expect((await balance(u.userId, 'moonstones')) - before).toBe(35);
  });
});

describe('locker', () => {
  it('equips owned items only, and always keeps a buddy', async () => {
    const u = await registered(t.app);
    expect((await u.client.post('/api/locker/equip', { itemId: 'glim-dewdrop' })).status).toBe(200);
    expect((await u.client.post('/api/locker/equip', { itemId: 'acc-beanie' })).status).toBe(403);
    expect((await u.client.post('/api/locker/unequip', { slot: 'buddy' })).status).toBe(400);
    const locker = await u.client.get('/api/locker');
    expect(locker.body.equipped.buddy).toBe('glim-dewdrop');
    // The avatar carries the buddy's rarity, so its finish shows wherever it appears.
    expect((await u.client.get('/api/me/overview')).body.avatar).toMatchObject({ rarity: 'common' });
  });
});

describe('unlimited test currency', () => {
  it('only works for a flagged test account that holds the entitlement', async () => {
    const plain = await registered(t.app);
    await t.db.insert(entitlements).values({ userId: plain.userId, kind: 'unlimited_currency', reason: 'test' });
    await plain.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() });
    expect(await balance(plain.userId)).toBe(100);

    const tester = await registered(t.app);
    await t.db.update(users).set({ isTestAccount: true }).where(eq(users.id, tester.userId));
    await t.db.insert(entitlements).values({ userId: tester.userId, kind: 'unlimited_currency', reason: 'test' });
    for (let i = 0; i < 3; i++) expect((await tester.client.post('/api/shop/purchase', { listingId: 'l-lantern-meadow', requestKey: key() })).status).toBe(200);
    expect(await balance(tester.userId)).toBe(250);
    const free = await t.db.select().from(ledger).where(and(eq(ledger.userId, tester.userId), eq(ledger.unlimited, true)));
    expect(free).toHaveLength(3);
  });
});

describe('secure randomness', () => {
  it('stays inside [0, 1)', async () => {
    const { secureRandom } = await import('../src/lib/crypto.ts');
    for (let i = 0; i < 2000; i++) {
      const v = secureRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('events', () => {
  it('hands out Frost Festival quests only while the festival runs, and they pay Frost Tickets', async () => {
    const { EVENTS, saveEventWindow } = await import('../src/modules/events/service.ts');
    const { featureFlags, userQuests } = await import('../src/db/schema.ts');
    const { clearFlagCache } = await import('../src/modules/flags/service.ts');
    const frost = EVENTS[0]!;
    const day = 86_400_000;
    await saveEventWindow(t.db, frost, { startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day) }, null);
    await t.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, frost.flag));
    clearFlagCache();

    const u = await registered(t.app);
    const res = await u.client.get('/api/quests');
    const event = res.body.quests.filter((q: { kind: string }) => q.kind === 'event');
    expect(event).toHaveLength(3);
    expect(res.body.events).toEqual([{ key: 'frost_festival', name: 'Frost Festival', period: event[0].period }]);
    // Finish one and claim it.
    const q = event.find((x: { id: string }) => x.id === 'e-frost-lanterns-2');
    await t.db.update(userQuests).set({ progress: q.target, completedAt: new Date() }).where(and(eq(userQuests.userId, u.userId), eq(userQuests.questId, q.id)));
    const claim = await u.client.post(`/api/quests/${q.id}/claim`, { period: q.period });
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    expect(await balance(u.userId, 'frost_tickets')).toBe(30);

    // Outside the window nobody gets them.
    await saveEventWindow(t.db, frost, { startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() - 2 * day) }, null);
    const late = await registered(t.app);
    const none = await late.client.get('/api/quests');
    expect(none.body.quests.filter((x: { kind: string }) => x.kind === 'event')).toHaveLength(0);
  });
});
