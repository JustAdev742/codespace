import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, customGames, questionSets } from '../src/db/schema.ts';
import { MIXED_SET } from '@ludora/engine/testing';
import { cliChangeRole } from '../src/cli/admin.ts';

/*
 * Game Maker: making a game from a mode, what the server checks, who can see
 * it, listing for everyone only with a trusted account, moderation, and
 * hosting from it.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let maker: Account;
let other: Account;
let trusted: Account;
let mod: Account;
let publicSet: string;

const game = (over: Record<string, unknown> = {}) => ({
  title: 'Friday Gold Rush',
  description: 'Deep mines and a race to 1,000.',
  modeId: 'gold-rush',
  variantId: null,
  setId: publicSet,
  settings: { risk: 'wild', goalGold: 1000 },
  common: { timeLimitSec: 300 },
  options: { generatedNames: true },
  glyph: 'mountain',
  hue: 40,
  visibility: 'private',
  ...over,
});

beforeAll(async () => {
  t = await createTestApp();
  maker = await registered(t.app);
  other = await registered(t.app);
  trusted = await registered(t.app);
  mod = await registered(t.app);
  const admin = await registered(t.app);
  expect((await cliChangeRole(t.db, 'test', 'grant', admin.username, 'superadmin', 'first admin')).ok).toBe(true);
  for (const [a, role] of [
    [trusted, 'trusted'],
    [mod, 'moderator'],
  ] as const) {
    expect((await admin.client.post(`/api/admin/users/${a.userId}/roles`, { role, grant: true, reason: 'test setup', confirm: a.username })).status).toBe(200);
  }
  publicSet = (await maker.client.get('/api/sets')).body.sets[0].id;
});
afterAll(async () => {
  await t?.close();
});

describe('making a game', () => {
  it('saves a game made from a 3D mode, with its settings checked against the mode', async () => {
    const res = await maker.client.post('/api/games', game({ settings: { risk: 'wild', goalGold: 999999, madeUp: true } }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.game).toMatchObject({ title: 'Friday Gold Rush', mode: { id: 'gold-rush', stage: '3d' }, visibility: 'private', mine: true, owner: { name: expect.any(String) } });
    // Unknown keys are dropped and numbers clamped to the mode's own range.
    expect(res.body.game.settings.madeUp).toBeUndefined();
    expect(res.body.game.settings.goalGold).toBeLessThan(999999);
    expect(res.body.game.settings.risk).toBe('wild');
  });

  it('takes a variant only with its own mode, and keeps the variant’s locked settings', async () => {
    expect((await maker.client.post('/api/games', game({ variantId: 'code-breakers-heist' }))).status).toBe(400);
    const heist = await maker.client.post('/api/games', game({ title: 'Vault Night', modeId: 'code-breakers', variantId: 'code-breakers-heist', settings: { heist: false } }));
    expect(heist.status).toBe(200);
    expect(heist.body.game.settings.heist).toBe(true);
    expect((await maker.client.post('/api/games', game({ modeId: 'no-such-mode' }))).status).toBe(404);
  });

  it('refuses a private set that is not yours, a bad name, and guests', async () => {
    const [secret] = await t.db.insert(questionSets).values({ ownerId: other.userId, title: 'Secret set', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length }).returning({ id: questionSets.id });
    expect((await maker.client.post('/api/games', game({ setId: secret!.id }))).status).toBe(403);
    expect((await maker.client.post('/api/games', game({ title: 'no' }))).status).toBe(400);
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await guest.post('/api/games', game())).status).toBe(403);
    expect((await new Client(t.app).post('/api/games', game())).status).toBe(401);
  });
});

describe('who sees a game', () => {
  it('keeps private games to their maker, shares unlisted ones by link, and lists public ones only from trusted accounts', async () => {
    const priv = (await maker.client.post('/api/games', game({ title: 'Private one' }))).body.game;
    expect((await other.client.get(`/api/games/${priv.id}`)).status).toBe(404);
    expect((await maker.client.get(`/api/games/${priv.id}`)).status).toBe(200);

    const unlisted = (await maker.client.post('/api/games', game({ title: 'Link only', visibility: 'unlisted' }))).body.game;
    const seen = await other.client.get(`/api/games/${unlisted.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.game.mine).toBe(false);
    // The maker shows by display name, as on public sets; never by account id.
    expect(JSON.stringify(seen.body)).not.toContain(maker.userId);

    expect((await maker.client.post('/api/games', game({ title: 'Everyone', visibility: 'public' }))).status).toBe(403);
    const pub = await trusted.client.post('/api/games', game({ title: 'Trusted public', visibility: 'public' }));
    expect(pub.status).toBe(200);
    const list = (await new Client(t.app).get('/api/games?scope=public')).body.games as { id: string; title: string }[];
    expect(list.map((g) => g.title)).toContain('Trusted public');
    expect(list.map((g) => g.title)).not.toContain('Link only');
    expect(list.map((g) => g.title)).not.toContain('Private one');
  });

  it('lets only the maker change or delete a game, and moderators hide a public one', async () => {
    const pub = (await trusted.client.post('/api/games', game({ title: 'To be hidden', visibility: 'public' }))).body.game;
    expect((await other.client.put(`/api/games/${pub.id}`, game({ title: 'Taken over' }))).status).toBe(403);
    expect((await other.client.delete(`/api/games/${pub.id}`)).status).toBe(403);
    expect((await other.client.post(`/api/admin/games/${pub.id}/hide`, { hidden: true, reason: 'not allowed' })).status).toBe(403);
    expect((await mod.client.post(`/api/admin/games/${pub.id}/hide`, { hidden: true, reason: 'unkind name' })).status).toBe(200);
    expect((await other.client.get(`/api/games/${pub.id}`)).status).toBe(404);
    expect((await trusted.client.get(`/api/games/${pub.id}`)).body.game.hidden).toBe(true);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'game.hide'));
    expect(entry?.targetId).toBe(pub.id);
    const renamed = await trusted.client.put(`/api/games/${pub.id}`, game({ title: 'Kinder name', visibility: 'public' }));
    expect(renamed.body.game.title).toBe('Kinder name');
    expect((await trusted.client.delete(`/api/games/${pub.id}`)).status).toBe(200);
  });
});

describe('hosting a made game', () => {
  it('counts a play when a room is set up from it', async () => {
    const g = (await maker.client.post('/api/games', game({ title: 'Quick Classic', modeId: 'classic', settings: {}, common: { questionLimit: 3 } }))).body.game;
    const room = await maker.client.post('/api/rooms', { setId: publicSet, modeId: 'classic', settings: g.settings, common: g.common, gameId: g.id });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    const [row] = await t.db.select().from(customGames).where(eq(customGames.id, g.id));
    expect(row?.plays).toBe(1);
  });
});
