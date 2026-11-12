import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { encodeDesign, encodePaint, emptyPaint, randomDesignArt, stampAt } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, items, reports, users } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { loadAvatar } from '../src/modules/profiles/avatar.ts';

/*
 * My designs: any account designs Glims and items for itself. The server holds the caps, the
 * slots, the "not a copy of the shop" rule and ownership; staff can hide a design.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let maker: Account;
let other: Account;
let mod: Account;

const painted = encodePaint(stampAt(emptyPaint(), 5, 6, 'heart', 2, 'mirror'));
const glimArt = (seed: number, extra: Record<string, unknown> = {}) => ({ ...randomDesignArt(seed), paint: painted, ...extra });
const hat = (extra: Record<string, unknown> = {}) => ({ kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 123, accentHue: 301, emblem: painted, ...extra });

async function setLevel(a: Account, level: number) {
  await t.db.update(users).set({ level }).where(eq(users.id, a.userId));
}

beforeAll(async () => {
  t = await createTestApp();
  const admin = await registered(t.app);
  maker = await registered(t.app);
  other = await registered(t.app);
  mod = await registered(t.app);
  expect((await cliChangeRole(t.db, 'test', 'grant', admin.username, 'superadmin', 'first admin')).ok).toBe(true);
  const res = await admin.client.post(`/api/admin/users/${mod.userId}/roles`, { role: 'moderator', grant: true, reason: 'moderates designs', confirm: mod.username });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
});
afterAll(async () => {
  await t?.close();
});

describe('who can design', () => {
  it('needs a session; any account, guests too, gets a few free slots', async () => {
    const anon = new Client(t.app);
    expect((await anon.get('/api/designs')).status).toBe(401);
    expect((await anon.post('/api/designs', { kind: 'glim', name: 'Nope', art: glimArt(1) })).status).toBe(401);
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    const g = await guest.post('/api/designs', { kind: 'glim', name: 'Guesty', art: glimArt(2) });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const mine = await guest.get('/api/designs');
    expect(mine.body.slots).toMatchObject({ used: 1, max: 3, nextAt: 5 });
  });
});

describe('the server checks every design', () => {
  it('saves a valid Glim with painted markings and normalises defaults away', async () => {
    const r = await maker.client.post('/api/designs', { kind: 'glim', name: '  Puddle   Pal ', art: glimArt(3, { feet: 'nub', idle: 'calm', width: 100 }) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.design).toMatchObject({ kind: 'glim', name: 'Puddle Pal', worn: false, hidden: null });
    expect(r.body.design.art.paint).toBe(painted);
    for (const k of ['feet', 'idle', 'width']) expect(r.body.design.art).not.toHaveProperty(k);
  });

  it('refuses values past the caps, broken painter data, unknown parts and bad names', async () => {
    const bad = [
      { kind: 'glim', name: 'Wide', art: glimArt(4, { width: 160 }) },
      { kind: 'glim', name: 'Tall', art: glimArt(4, { height: 40 }) },
      { kind: 'glim', name: 'Eyes', art: glimArt(4, { eyeSize: 300 }) },
      { kind: 'glim', name: 'Paint', art: glimArt(4, { paint: '0Z0Z0J' }) },
      { kind: 'glim', name: 'Paint', art: glimArt(4, { paint: 'x'.repeat(5000) }) },
      { kind: 'glim', name: 'Parts', art: glimArt(4, { feet: 'rockets' }) },
      { kind: 'glim', name: 'shit pile', art: glimArt(4) },
      { kind: 'glim', name: 'x', art: glimArt(4) },
      { kind: 'accessory', name: 'Odd hat', art: hat({ shape: 'scarf' }) },
      { kind: 'title', name: 'Words', art: { kind: 'title', text: 'Anything' } },
    ];
    for (const body of bad) {
      const r = await maker.client.post('/api/designs', body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
  });

  it('refuses a design that copies a catalogue Glim or item, and says how to make it your own', async () => {
    const [glim] = await t.db.select().from(items).where(eq(items.type, 'glim')).limit(1);
    const copy = await maker.client.post('/api/designs', { kind: 'glim', name: 'Copycat', art: glim!.art });
    expect(copy.status).toBe(409);
    expect(copy.body.error.message).toMatch(/make it your own/);
    const nudged = { ...(glim!.art as Record<string, number>), hue: ((glim!.art as { hue: number }).hue + 8) % 360 };
    expect((await maker.client.post('/api/designs', { kind: 'glim', name: 'Copycat', art: nudged })).status).toBe(409);
    expect((await maker.client.post('/api/designs/check', { kind: 'glim', name: 'Copycat', art: nudged })).body).toMatchObject({ ok: false });
    // The same Glim with markings painted on is its own design.
    expect((await maker.client.post('/api/designs/check', { kind: 'glim', name: 'Copycat', art: { ...nudged, paint: painted } })).body).toMatchObject({ ok: true });
    const [acc] = await t.db.select().from(items).where(eq(items.type, 'accessory')).limit(1);
    expect((await maker.client.post('/api/designs', { kind: 'accessory', name: 'Shop hat', art: acc!.art })).status).toBe(409);
  });
});

describe('slots by level', () => {
  it('stops at the slots for the level, and a higher level opens another', async () => {
    const a = await registered(t.app);
    for (let i = 0; i < 3; i++) expect((await a.client.post('/api/designs', { kind: 'glim', name: `Slotty ${'abc'[i]}`, art: glimArt(10 + i) })).status).toBe(200);
    const full = await a.client.post('/api/designs', { kind: 'glim', name: 'One more', art: glimArt(20) });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/level 5/);
    const first = (await a.client.get('/api/designs')).body.designs[0].id;
    expect((await a.client.post(`/api/designs/${first}/duplicate`, {})).status).toBe(409);
    expect((await a.client.post('/api/designs/import', { code: encodeDesign('glim', glimArt(21)), name: 'Imported' })).status).toBe(409);
    await setLevel(a, 5);
    expect((await a.client.post('/api/designs', { kind: 'glim', name: 'One more', art: glimArt(20) })).status).toBe(200);
    expect((await a.client.get('/api/designs')).body.slots).toMatchObject({ used: 4, max: 4, nextAt: 10 });
  });
});

describe('a design is its owner’s', () => {
  it('another account cannot change, delete, copy or wear it', async () => {
    const r = await maker.client.post('/api/designs', { kind: 'accessory', name: 'Lucky hat', art: hat() });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.design.id;
    expect((await other.client.patch(`/api/designs/${id}`, { kind: 'accessory', name: 'Mine now', art: hat() })).status).toBe(403);
    expect((await other.client.delete(`/api/designs/${id}`)).status).toBe(403);
    expect((await other.client.post(`/api/designs/${id}/duplicate`, {})).status).toBe(403);
    expect((await other.client.post(`/api/designs/${id}/wear`, {})).status).toBe(403);
    expect((await other.client.get('/api/designs')).body.designs).toEqual([]);
    expect((await maker.client.patch(`/api/designs/${id}`, { kind: 'glim', name: 'Switch', art: glimArt(5) })).status).toBe(400);
  });

  it('wearing puts it on the avatar others see (a Glim with no rarity, its name, the item in its slot), and taking it off restores the buddy', async () => {
    const before = await loadAvatar(t.db, maker.userId);
    const g = await maker.client.post('/api/designs', { kind: 'glim', name: 'Star Pup', art: glimArt(30) });
    const h = (await maker.client.get('/api/designs')).body.designs.find((d: { name: string }) => d.name === 'Lucky hat');
    expect((await maker.client.post(`/api/designs/${g.body.design.id}/wear`, {})).body).toMatchObject({ ok: true, slot: 'buddy' });
    expect((await maker.client.post(`/api/designs/${h.id}/wear`, {})).body).toMatchObject({ ok: true, slot: 'hat' });
    const after = await loadAvatar(t.db, maker.userId);
    expect(after?.art).toEqual(g.body.design.art);
    expect(after?.rarity).toBeUndefined();
    expect(after?.design).toEqual({ id: g.body.design.id, name: 'Star Pup' });
    expect(after?.accessories?.find((a) => a.slot === 'hat')).toMatchObject({ shape: 'beanie', emblem: painted });
    expect((await maker.client.get('/api/designs')).body.designs.filter((d: { worn: boolean }) => d.worn)).toHaveLength(2);
    expect((await maker.client.post('/api/designs/unwear', { slot: 'buddy' })).status).toBe(200);
    expect((await loadAvatar(t.db, maker.userId))?.art).toEqual(before?.art);
    await maker.client.post(`/api/designs/${g.body.design.id}/wear`, {});
  });
});

describe('design codes', () => {
  it('a friend turns a code into a design of their own (the look, not the name); a broken code is refused', async () => {
    const art = glimArt(40);
    const code = encodeDesign('glim', art);
    const r = await other.client.post('/api/designs/import', { code, name: 'From a friend' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.design.name).toBe('From a friend');
    expect(r.body.design.art.body).toBe(art.body);
    expect((await other.client.post('/api/designs/import', { code: code.slice(0, -2), name: 'Broken' })).status).toBe(400);
    expect((await other.client.post('/api/designs/import', { code, name: 'shit' })).status).toBe(400);
  });
});

describe('reports and staff', () => {
  it('anyone can report a worn design; staff hide it with a reason, it comes off the avatar, and players cannot hide', async () => {
    const worn = (await loadAvatar(t.db, maker.userId))!.design!;
    expect((await other.client.post(`/api/designs/${worn.id}/report`, { reason: 'inappropriate_content', details: 'Rude markings' })).body).toEqual({ ok: true });
    expect((await other.client.post(`/api/designs/${worn.id}/report`, { reason: 'inappropriate_content' })).body).toEqual({ ok: true });
    expect(await t.db.select().from(reports).where(and(eq(reports.targetType, 'design'), eq(reports.targetId, worn.id)))).toHaveLength(1);
    // Reporting your own design, or one that does not exist, says the same and stores nothing.
    expect((await maker.client.post(`/api/designs/${worn.id}/report`, { reason: 'spam' })).body).toEqual({ ok: true });
    expect((await other.client.post('/api/designs/00000000-0000-4000-8000-000000000000/report', { reason: 'spam' })).body).toEqual({ ok: true });

    expect((await other.client.get('/api/staff/designs')).status).toBe(403);
    expect((await other.client.post(`/api/staff/designs/${worn.id}/visibility`, { action: 'hide', reason: 'not mine to hide' })).status).toBe(403);
    const list = await mod.client.get('/api/staff/designs?filter=reported');
    expect(list.status).toBe(200);
    expect(list.body.designs.find((d: { id: string }) => d.id === worn.id)).toMatchObject({ name: 'Star Pup', reports: 1 });
    expect((await mod.client.post(`/api/staff/designs/${worn.id}/visibility`, { action: 'hide' })).status).toBe(400);
    expect((await mod.client.post(`/api/staff/designs/${worn.id}/visibility`, { action: 'hide', reason: 'Markings break the rules' })).status).toBe(200);
    const avatar = await loadAvatar(t.db, maker.userId);
    expect(avatar?.design).toBeUndefined();
    const mine = (await maker.client.get('/api/designs')).body.designs.find((d: { id: string }) => d.id === worn.id);
    expect(mine).toMatchObject({ worn: false, hidden: { reason: 'Markings break the rules' } });
    expect((await maker.client.post(`/api/designs/${worn.id}/wear`, {})).status).toBe(409);
    const [entry] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, 'design.hide'), eq(auditLog.targetId, worn.id)));
    expect(entry).toBeTruthy();
    expect((await mod.client.post(`/api/staff/designs/${worn.id}/visibility`, { action: 'unhide', reason: 'Looked again' })).status).toBe(200);
    expect((await maker.client.post(`/api/designs/${worn.id}/wear`, {})).status).toBe(200);
  });
});
