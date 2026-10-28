import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GLIMS } from '@ludora/content';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, collections, inventory, items, packs } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { resolvePool } from '../src/modules/packs/service.ts';
import { credit } from '../src/modules/economy/service.ts';

/*
 * The Creator Studio: only designers (and administrators) get in, the house
 * rules hold on the server, and publishing makes real items, listings and
 * Lanterns that players can buy.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let admin: Account;
let designer: Account;
let designer2: Account;
let player: Account;

const glimArt = (hue: number, extra: Record<string, unknown> = {}) => ({ kind: 'glim', body: 'orb', hue, accentHue: (hue + 97) % 360, saturation: 61, eyes: 'pixel', mouth: 'wobble', pattern: 'circuit', topper: 'quill', cheeks: false, ...extra });
const glim = (name: string, hue: number, rarity = 'common') => ({ kind: 'glim', name, description: 'A Glim made in the Studio for testing.', rarity, art: glimArt(hue) });

async function lastAudit(action: string) {
  const rows = await t.db.select().from(auditLog).where(eq(auditLog.action, action));
  return rows[rows.length - 1];
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await registered(t.app);
  designer = await registered(t.app);
  designer2 = await registered(t.app);
  player = await registered(t.app);
  expect((await cliChangeRole(t.db, 'test', 'grant', admin.username, 'superadmin', 'first admin')).ok).toBe(true);
  for (const d of [designer, designer2]) {
    const res = await admin.client.post(`/api/admin/users/${d.userId}/roles`, { role: 'designer', grant: true, reason: 'studio designer', confirm: d.username });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
});
afterAll(async () => {
  await t?.close();
});

describe('who gets into the Studio', () => {
  it('turns away anyone without the designer role, including guests, before reading the request', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    for (const [c, status] of [
      [new Client(t.app), 401],
      [guest, 403],
      [player.client, 403],
    ] as const) {
      expect((await c.get('/api/studio')).status).toBe(status);
      expect((await c.post('/api/studio/drafts', glim('Nopeling', 11))).status).toBe(status);
      expect((await c.post('/api/studio/lanterns', {})).status).toBe(status);
      expect((await c.post('/api/studio/drafts/00000000-0000-4000-8000-000000000000/publish', {})).status).toBe(status);
    }
  });

  it('lets designers and administrators in, and the role shows on the account', async () => {
    const d = await designer.client.get('/api/studio');
    expect(d.status).toBe(200);
    expect(d.body.canPublish).toBe(true);
    expect((await admin.client.get('/api/studio')).status).toBe(200);
    const me = await designer.client.get('/api/auth/me');
    expect(me.body.permissions).toContain('studio.use');
    expect(me.body.permissions).not.toContain('staff.access');
    expect((await lastAudit('user.role_grant'))?.targetId).toBe(designer2.userId);
  });
});

describe('house rules', () => {
  it('saves a Glim made from the genome, and refuses names and looks that break the catalogue’s rules', async () => {
    const ok = await designer.client.post('/api/studio/drafts', glim('Quillbit', 13));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.draft).toMatchObject({ kind: 'glim', name: 'Quillbit', status: 'draft', mine: true });

    expect((await designer.client.post('/api/studio/drafts', glim('Far Too Many Words', 14))).status).toBe(400);
    expect((await designer.client.post('/api/studio/drafts', glim('Pebblet', 15))).status).toBe(409);
    expect((await designer.client.post('/api/studio/drafts', glim('Quillbit', 16))).status).toBe(409);
    expect((await designer.client.post('/api/studio/drafts', { ...glim('Twinling', 17), art: GLIMS[0]!.art })).status).toBe(409);
    expect((await designer.client.post('/api/studio/drafts', { ...glim('Mythling', 18), rarity: 'mythic' })).status).toBe(400);
    expect((await designer.client.post('/api/studio/drafts', { ...glim('Badart', 19), art: { ...glimArt(19), body: 'dragon' } })).status).toBe(400);
    const acc = await designer.client.post('/api/studio/drafts', { kind: 'accessory', name: 'Odd Hat', description: 'A hat in a slot it does not fit.', rarity: 'rare', art: { kind: 'accessory', slot: 'neck', shape: 'wizard', hue: 30 } });
    expect(acc.status).toBe(400);
    const check = await designer.client.post('/api/studio/check', { draft: glim('Pebblet', 20) });
    expect(check.body).toMatchObject({ ok: false });
  });

  it('only the maker can change or delete a draft', async () => {
    const made = (await designer.client.post('/api/studio/drafts', glim('Mineling', 21))).body.draft;
    expect((await designer2.client.patch(`/api/studio/drafts/${made.id}`, glim('Stolen', 21))).status).toBe(403);
    expect((await designer2.client.delete(`/api/studio/drafts/${made.id}`)).status).toBe(403);
    const edited = await designer.client.patch(`/api/studio/drafts/${made.id}`, { ...glim('Mineling', 22), rarity: 'rare' });
    expect(edited.body.draft).toMatchObject({ rarity: 'rare' });
    expect((await designer.client.delete(`/api/studio/drafts/${made.id}`)).status).toBe(200);
  });
});

describe('publishing', () => {
  it('publishes a draft as a real Glim in the shop, at a price inside its rarity’s range, and a player can buy it', async () => {
    const made = (await designer.client.post('/api/studio/drafts', glim('Shopling', 23, 'uncommon'))).body.draft;
    const tooCheap = await designer.client.post(`/api/studio/drafts/${made.id}/publish`, { listing: { priceAmount: 10 }, reason: 'into the shop' });
    expect(tooCheap.status).toBe(400);
    const res = await designer.client.post(`/api/studio/drafts/${made.id}/publish`, { listing: { priceAmount: 150 }, reason: 'into the shop' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.itemId).toBe('glim-shopling');

    const [item] = await t.db.select().from(items).where(eq(items.id, 'glim-shopling'));
    expect(item).toMatchObject({ type: 'glim', collectionId: 'studio', releaseState: 'live', rarity: 'uncommon' });
    expect((await t.db.select().from(collections).where(eq(collections.id, 'studio'))).length).toBe(1);
    expect((await lastAudit('studio.publish'))?.reason).toBe('into the shop');

    // Published drafts are frozen; changes go through the staff catalogue.
    expect((await designer.client.patch(`/api/studio/drafts/${made.id}`, glim('Shopling', 24))).status).toBe(409);

    const shop = (await player.client.get('/api/shop')).body.listings as { id: string; section: string; price: { amount: number } }[];
    const listing = shop.find((l) => l.id === res.body.listingId);
    expect(listing).toMatchObject({ section: 'glims', price: { amount: 150 } });
    const buy = await player.client.post('/api/shop/purchase', { listingId: res.body.listingId, requestKey: `studio-buy-${Date.now()}` });
    expect(buy.status, JSON.stringify(buy.body)).toBe(200);
    const inv = await t.db.select().from(inventory).where(eq(inventory.userId, player.userId));
    expect(inv.some((i) => i.itemId === 'glim-shopling')).toBe(true);
  });

  it('makes a limited Lantern from Glim drafts, sold only between its dates, with odds from the standard table', async () => {
    const ids: string[] = [];
    for (const [i, rarity] of (['common', 'common', 'uncommon', 'rare', 'epic'] as const).entries()) {
      ids.push((await designer.client.post('/api/studio/drafts', glim(`Starmote ${'ABCDE'[i]}`, 40 + i * 9, rarity))).body.draft.id);
    }
    const now = Date.now();
    const bad = await designer.client.post('/api/studio/lanterns', { name: 'Starmote', description: 'Seven little stars that fell into the Studio.', hue: 260, accentHue: 50, pattern: 'stars', draftIds: ids.slice(0, 2), priceAmount: 150, startsAt: new Date(now - 3_600_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(), reason: 'limited drop' });
    expect(bad.status).toBe(400);
    const res = await designer.client.post('/api/studio/lanterns', { name: 'Starmote', description: 'Five little stars that fell into the Studio.', hue: 260, accentHue: 50, pattern: 'stars', draftIds: ids, priceAmount: 150, startsAt: new Date(now - 3_600_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(), reason: 'limited drop' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.itemIds).toHaveLength(5);

    const [pack] = await t.db.select().from(packs).where(eq(packs.id, res.body.packId));
    expect(pack).toMatchObject({ name: 'Starmote Lantern', priceAmount: 150 });
    expect((pack!.dropTable as { pityEvery: number }).pityEvery).toBe(15);

    const shop = (await player.client.get('/api/shop')).body.listings as { id: string; section: string }[];
    expect(shop.filter((l) => l.id.endsWith(res.body.packId)).map((l) => l.section).sort()).toEqual(['featured', 'lanterns']);
    const odds = await player.client.get(`/api/packs/${res.body.packId}`);
    expect(odds.status).toBe(200);

    await t.db.transaction((tx) => credit(tx, { userId: player.userId, currency: 'sparks', amount: 500, reason: 'admin_grant' }));
    const buy = await player.client.post('/api/shop/purchase', { listingId: `l-featured-${res.body.packId}`, requestKey: `studio-lantern-${Date.now()}` });
    expect(buy.status, JSON.stringify(buy.body)).toBe(200);
    expect(res.body.itemIds).toContain(buy.body.pack.item.id);

    const [moonlit] = await t.db.select().from(packs).where(eq(packs.id, 'lantern-moonlit'));
    const pool = await resolvePool(t.db, moonlit!.dropTable as never);
    expect(pool.some((p) => res.body.itemIds.includes(p.id) || p.id === 'glim-shopling')).toBe(false);
    expect((await lastAudit('studio.lantern'))?.targetId).toBe(res.body.packId);
  });
});
