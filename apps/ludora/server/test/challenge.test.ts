import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { questionSets } from '../src/db/schema.ts';
import { challengeModes } from '../src/modules/social/challenge.ts';

/*
 * Challenge a friend: a one-against-one room only the two friends can join, started by itself,
 * and a notification with the join link. Friends only, never across a block, never to someone who
 * turned game invites off, and nothing typed by a student goes in the notification.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let ana: Account;
let ben: Account;
let cy: Account;
let setId: string;

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Ice floats.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'Fish fly.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
];

async function befriend(a: Account, b: Account) {
  const code = (await b.client.get('/api/friends')).body.friendCode as string;
  expect((await a.client.post('/api/friends/request', { friendCode: code })).status).toBe(200);
  expect((await b.client.post(`/api/friends/${a.userId}/accept`)).status).toBe(200);
}

beforeAll(async () => {
  t = await createTestApp();
  ana = await registered(t.app, { accountType: 'student' });
  ben = await registered(t.app, { accountType: 'student' });
  cy = await registered(t.app, { accountType: 'student' });
  await befriend(ana, ben);
  const [set] = await t.db.insert(questionSets).values({ ownerId: ana.userId, title: 'Quick facts', subject: 'science', visibility: 'public', questions: QUESTIONS, questionCount: QUESTIONS.length }).returning({ id: questionSets.id });
  setId = set!.id;
});
afterAll(async () => {
  await t?.close();
});

describe('challenge a friend', () => {
  it('offers only modes that run without a host and suit two players', async () => {
    const ids = challengeModes().map((m) => m.meta.id);
    expect(ids).toContain('classic');
    expect(ids).not.toContain('tug-of-war');
    expect(ids).not.toContain('time-attack');
    const listed = (await ana.client.get('/api/challenges/modes')).body.modes.map((m: { id: string }) => m.id);
    expect(listed).toEqual(ids);
  });

  it('opens a room for the two of them and tells the friend, with the join link', async () => {
    const r = await ana.client.post('/api/challenges', { friendId: ben.userId, setId, modeId: 'classic' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const code = r.body.code as string;
    const room = t.deps.rooms.get(code)!;
    expect(room.options).toMatchObject({ maxPlayers: 2, autoStartAt: 2, requireAccount: true, lateJoin: false });
    expect(room.settings).toMatchObject({ autoAdvance: true });
    // Only Ana and Ben get in; a third account and a name-only guest are turned away.
    expect(room.join({ name: 'Cy', userId: cy.userId, accountName: 'Cy', isGuestAccount: false, avatar: null }).ok).toBe(false);
    expect(room.join({ name: 'Guest', userId: null, accountName: null, isGuestAccount: true, avatar: null }).ok).toBe(false);
    const note = (await ben.client.get('/api/notifications')).body.items.find((n: { link: string }) => n.link === `/join/${code}`);
    expect(note).toMatchObject({ kind: 'invite' });
    expect(note.title).toMatch(/challenged you to Classic/);
    expect(room.join({ name: 'Ben', userId: ben.userId, accountName: 'Ben', isGuestAccount: false, avatar: null }).ok).toBe(true);
    expect(room.join({ name: 'Ana', userId: ana.userId, accountName: 'Ana', isGuestAccount: false, avatar: null }).ok).toBe(true);
    // Both in: it counts down by itself, with nobody pressing Start.
    expect(room.startsAt).not.toBeNull();
    room.close('test over');
    // From inside a challenge's lobby, a third friend cannot be invited: they could not get in.
    const again = await ana.client.post('/api/challenges', { friendId: ben.userId, setId, modeId: 'classic' });
    await befriend(ana, cy);
    const invite = await ana.client.post('/api/invites', { userId: cy.userId, code: again.body.code });
    expect(invite.status).toBe(409);
    expect(invite.body.error?.message ?? invite.body.message).toMatch(/just for the two of you/);
    t.deps.rooms.get(again.body.code)?.close('test over');
  });

  it('is refused to non-friends, across a block, to a guest and to a friend with invites off', async () => {
    const dee = await registered(t.app, { accountType: 'student' });
    expect((await ana.client.post('/api/challenges', { friendId: dee.userId, setId, modeId: 'classic' })).status).toBe(403);
    expect((await ana.client.post('/api/challenges', { friendId: ben.userId, setId, modeId: 'tug-of-war' })).status).toBe(404);
    // Ben turns game invites off.
    expect((await ben.client.patch('/api/me/preferences', { notifications: { gameInvites: false } })).status).toBe(200);
    expect((await ana.client.post('/api/challenges', { friendId: ben.userId, setId, modeId: 'classic' })).status).toBe(409);
    expect((await ben.client.patch('/api/me/preferences', { notifications: { gameInvites: true } })).status).toBe(200);
    // A block either way ends it.
    expect((await ben.client.post('/api/blocks', { userId: ana.userId })).status).toBe(200);
    expect((await ana.client.post('/api/challenges', { friendId: ben.userId, setId, modeId: 'classic' })).status).toBe(403);
    expect((await ben.client.post('/api/challenges', { friendId: ana.userId, setId, modeId: 'classic' })).status).toBe(403);
  });
});
