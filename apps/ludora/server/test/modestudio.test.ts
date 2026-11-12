import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { MAX_BLUEPRINTS_PER_MAKER, STARTER_BLUEPRINTS, type Blueprint } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, blueprints, gameSessions, reports } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import type { Room } from '../src/realtime/room.ts';

/*
 * Mode Studio on the server: storing made games, who may see, copy and host one, the trusted
 * permission for public games, moderation, the limit per account, and a hosted made game saved
 * like any game with its own name in the report.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let maker: Account;
let other: Account;
let trusted: Account;
let mod: Account;
let setId: string;

const starter = (id = 'three-lives'): Blueprint => structuredClone(STARTER_BLUEPRINTS.find((s) => s.id === id)!.blueprint);

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
  setId = (await maker.client.get('/api/sets')).body.sets[0].id;
});
afterAll(async () => {
  await t?.close();
});

describe('saving a made game', () => {
  it('saves a checked blueprint and refuses a broken one with a message in words', async () => {
    const ok = await maker.client.post('/api/blueprints', { blueprint: starter('meadow-dash') });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.game).toMatchObject({ name: 'Meadow dash', kind: 'race', dimension: '3d', visibility: 'private', mine: true, actsOnOthers: [], playable: true });

    const bad = await maker.client.post('/api/blueprints', { blueprint: { ...starter(), end: { ...starter().end, timeLimitSec: 0 } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe('The time limit must be at least 60.');

    // Anything outside the studio's parts (such as a reward) is refused, not quietly stored.
    const rewards = await maker.client.post('/api/blueprints', { blueprint: { ...starter(), rewards: { sparks: 1000 } } });
    expect(rewards.status).toBe(400);
    expect(rewards.body.error.message).toMatch(/cannot have “rewards”/);

    const rude = await maker.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'Shit game' } });
    expect(rude.status).toBe(400);
  });

  it('saves a game with numbers and rules of its own, lists rules acting on others, and refuses a rule outside the catalogue', async () => {
    const withRules = { ...starter(), vars: [{ name: 'coins', scope: 'player', start: 0, max: 99 }], rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'add', n: 1, var: 'coins' }] }, { when: { type: 'reach', n: 5, var: 'coins' }, if: [], do: [{ type: 'ahead-lose', n: 1 }] }] };
    const ok = await maker.client.post('/api/blueprints', { blueprint: withRules });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.game.actsOnOthers.some((s: string) => s.startsWith('Rule: When a player reaches 5 coins'))).toBe(true);
    const back = await maker.client.get(`/api/blueprints/${ok.body.game.id}`);
    expect(back.body.game.blueprint.rules).toEqual(withRules.rules);
    const code = await maker.client.post('/api/blueprints', { blueprint: { ...withRules, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'gain', n: 1, run: 'fetch()' }] }] } });
    expect(code.status).toBe(400);
    const message = await maker.client.post('/api/blueprints', { blueprint: { ...withRules, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'say', message: 'Anything I like' }] }] } });
    expect(message.status).toBe(400);
  });

  it('needs an account: guests and signed-out visitors cannot save', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await guest.post('/api/blueprints', { blueprint: starter() })).status).toBe(403);
    expect((await new Client(t.app).post('/api/blueprints', { blueprint: starter() })).status).toBe(401);
  });

  it('stops at the limit per account', async () => {
    const busy = await registered(t.app);
    const rows = Array.from({ length: MAX_BLUEPRINTS_PER_MAKER }, (_, i) => ({ ownerId: busy.userId, name: `Game ${i}`, blueprint: starter() }));
    await t.db.insert(blueprints).values(rows);
    const over = await busy.client.post('/api/blueprints', { blueprint: starter() });
    expect(over.status).toBe(409);
    expect(over.body.error.message).toBe(`You have ${MAX_BLUEPRINTS_PER_MAKER} made games, the most you can keep. Delete one to make another.`);
  });
});

describe('who sees, changes and copies a made game', () => {
  it('keeps private ones to their maker, shares link ones, and lists public ones only from trusted accounts', async () => {
    const priv = (await maker.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'Private lives' } })).body.game;
    expect((await other.client.get(`/api/blueprints/${priv.id}`)).status).toBe(404);
    expect((await maker.client.get(`/api/blueprints/${priv.id}`)).status).toBe(200);

    const link = (await maker.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'Link lives' }, visibility: 'unlisted' })).body.game;
    const seen = await other.client.get(`/api/blueprints/${link.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.game).toMatchObject({ mine: false, owner: { name: expect.any(String) } });
    expect(JSON.stringify(seen.body)).not.toContain(maker.userId);

    const pub = await maker.client.post('/api/blueprints', { blueprint: starter(), visibility: 'public' });
    expect(pub.status).toBe(403);
    expect(pub.body.error.message).toMatch(/needs a trusted account/);
    const trustedPub = await trusted.client.post('/api/blueprints', { blueprint: { ...starter('island-claim'), name: 'Island for all' }, visibility: 'public' });
    expect(trustedPub.status).toBe(200);
    // The card says plainly what acts on other players.
    expect(trustedPub.body.game.actsOnOthers).toEqual(['Gust power-up: everyone ahead of you loses 1.', 'Steal: when the map is full, a claim takes a square from the leader.']);
    const list = (await new Client(t.app).get('/api/blueprints?scope=public')).body.games as { name: string }[];
    expect(list.map((g) => g.name)).toContain('Island for all');
    expect(list.map((g) => g.name)).not.toContain('Link lives');
    expect(list.map((g) => g.name)).not.toContain('Private lives');
    const found = (await other.client.get('/api/blueprints?scope=public&q=island')).body.games as { name: string }[];
    expect(found.map((g) => g.name)).toEqual(['Island for all']);
  });

  it('lets only the maker change or delete one; anyone who can see a public one can copy it', async () => {
    const pub = (await trusted.client.post('/api/blueprints', { blueprint: { ...starter('rope-pull'), name: 'Big pull' }, visibility: 'public' })).body.game;
    expect((await other.client.put(`/api/blueprints/${pub.id}`, { blueprint: { ...starter(), name: 'Taken over' } })).status).toBe(403);
    expect((await other.client.delete(`/api/blueprints/${pub.id}`)).status).toBe(403);
    const copy = await other.client.post(`/api/blueprints/${pub.id}/copy`);
    expect(copy.status).toBe(200);
    expect(copy.body.game).toMatchObject({ name: 'Big pull (copy)', mine: true, visibility: 'private', copied: true });
    expect(copy.body.game.blueprint.kind).toEqual(starter('rope-pull').kind);
    // The copy is the copier's own to change; the original is untouched.
    expect((await other.client.put(`/api/blueprints/${copy.body.game.id}`, { blueprint: { ...copy.body.game.blueprint, name: 'My pull' } })).body.game.name).toBe('My pull');
    expect((await other.client.get(`/api/blueprints/${pub.id}`)).body.game.name).toBe('Big pull');
    // A private game cannot be copied by someone else.
    const priv = (await maker.client.post('/api/blueprints', { blueprint: starter() })).body.game;
    expect((await other.client.post(`/api/blueprints/${priv.id}/copy`)).status).toBe(404);
    expect((await trusted.client.delete(`/api/blueprints/${pub.id}`)).status).toBe(200);
  });

  it('moderators hide one: nobody else sees it, nobody can host it, and it is audited', async () => {
    const pub = (await trusted.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'To be hidden' }, visibility: 'public' })).body.game;
    expect((await other.client.post(`/api/admin/blueprints/${pub.id}/hide`, { hidden: true, reason: 'not allowed' })).status).toBe(403);
    expect((await mod.client.post(`/api/admin/blueprints/${pub.id}/hide`, { hidden: true, reason: 'unkind name' })).status).toBe(200);
    expect((await other.client.get(`/api/blueprints/${pub.id}`)).status).toBe(404);
    expect((await trusted.client.get(`/api/blueprints/${pub.id}`)).body.game.hidden).toBe(true);
    const hosted = await trusted.client.post('/api/rooms', { setId, modeId: 'made-game', blueprintId: pub.id });
    expect(hosted.status).toBe(403);
    expect(hosted.body.error.message).toMatch(/hidden by a moderator/);
    expect((await other.client.post('/api/rooms', { setId, modeId: 'made-game', blueprintId: pub.id })).status).toBe(404);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'blueprint.hide'));
    expect(entry?.targetId).toBe(pub.id);
  });
});

describe('reporting a made game', () => {
  it('stores a report on a game the reporter can see, not on someone’s private one, and lists it for moderators', async () => {
    const link = (await maker.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'Reported game' }, visibility: 'unlisted' })).body.game;
    const priv = (await maker.client.post('/api/blueprints', { blueprint: { ...starter(), name: 'Secret game' } })).body.game;
    expect((await other.client.post('/api/reports', { targetType: 'blueprint', targetId: link.id, reason: 'inappropriate_content', details: 'Rude words' })).status).toBe(200);
    expect((await other.client.post('/api/reports', { targetType: 'blueprint', targetId: priv.id, reason: 'spam' })).status).toBe(200);
    const rows = await t.db.select().from(reports).where(eq(reports.targetType, 'blueprint'));
    expect(rows.map((r) => r.targetId)).toEqual([link.id]);
    const queue = await mod.client.get('/api/admin/reports?status=open');
    expect(queue.status).toBe(200);
    expect(JSON.stringify(queue.body)).toContain('Made game: Reported game');
  });
});

describe('hosting a made game', () => {
  it('another account cannot host someone else’s private game', async () => {
    const priv = (await maker.client.post('/api/blueprints', { blueprint: starter() })).body.game;
    const res = await other.client.post('/api/rooms', { setId, modeId: 'classic', blueprintId: priv.id });
    expect(res.status).toBe(404);
    expect(t.deps.rooms.hostedBy(other.userId)).toHaveLength(0);
  });

  it('plays solo, and hosts a game played to the end, saved with its own name in the report', async () => {
    const g = (await maker.client.post('/api/blueprints', { blueprint: { ...starter('three-lives'), name: 'Lives of the class' } })).body.game;
    const solo = await maker.client.post('/api/rooms', { setId, modeId: 'made-game', blueprintId: g.id, solo: true, practiceBots: { count: 2, level: 'easy' } });
    expect(solo.status, JSON.stringify(solo.body)).toBe(200);
    expect(solo.body.solo).toBe(true);

    const made = await maker.client.post('/api/rooms', { setId, modeId: 'anything', blueprintId: g.id });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const info = await other.client.get(`/api/rooms/${made.body.code}`);
    expect(info.body).toMatchObject({ title: 'Lives of the class', modeId: 'made-game' });

    const r = t.deps.rooms.get(made.body.code) as Room;
    const a = r.join({ name: 'Zia', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    const b = r.join({ name: 'Yan', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!a.ok || !b.ok) throw new Error('join failed');
    expect(r.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    // Both answer every question wrong: three lives each, so after three questions both are out and the game ends.
    for (let i = 0; i < 10 && r.status !== 'ended'; i++) {
      let s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
      if (s.phase !== 'question') r.hostCommand({ cmd: 'next' });
      s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
      if (s.phase !== 'question') continue;
      const view = r.view(a.player.id) as { game?: { sync?: { question?: { q: { type: string; choices?: { id: string }[] } } } } };
      const q = view.game?.sync?.question?.q;
      const reveal = r.runtime!.debugReveal(s.iid) as { correct?: unknown };
      for (const p of [a, b]) {
        const answer = q?.type === 'truefalse' ? { type: 'truefalse', value: reveal.correct !== true } : q?.choices ? { type: 'mcq', choiceId: q.choices.find((c) => c.id !== reveal.correct)!.id } : { type: 'short', text: 'zzzz' };
        r.action(p.player.id, `a-${p.player.id}-${i}-xxxxxx`, { type: 'answer', iid: s.iid, answer });
      }
    }
    expect(r.status).toBe('ended');
    expect(r.results?.summary).toBe('Everyone is out.');
    await t.deps.rooms.idle();
    const [saved] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, made.body.code));
    expect(saved).toMatchObject({ modeId: 'made-game', settings: { madeGame: { id: g.id, name: 'Lives of the class' } } });
    const rep = await maker.client.get(`/api/games/${saved!.id}/report`);
    expect(rep.status).toBe(200);
    expect(rep.body.game.mode).toBe('Lives of the class');
    const hosted = await maker.client.get('/api/me/hosted');
    expect(hosted.body.games[0].mode).toBe('Lives of the class');
    const [row] = await t.db.select().from(blueprints).where(eq(blueprints.id, g.id));
    expect(row?.plays).toBe(2);
  });
});

describe('the “describe your game” AI task', () => {
  it('is registered, builds a checked blueprint from a model’s draft, and asks again when the draft breaks a rule', async () => {
    await import('../src/modules/ai/tasks/index.ts');
    const { getAiTask, TaskReject } = await import('../src/modules/ai/tasks.ts');
    const task = getAiTask('mode.draft')!;
    expect(task).toBeTruthy();
    expect(task.input.safeParse({ description: 'short' }).success).toBe(false);
    const draft = { name: 'Snowy slide', unit: 'metres', goal: 'Reach the top.', kind: 'climb', size: 999, twist: true, pacing: 'rounds', rule: 'points', right: 50, wrong: 1, speed: 2, streak: 1, powers: ['shield', 'freeze'], events: ['golden'], ending: 'first', minutes: 60, questions: 20, place: 'snowfield', threeD: true, hue: 200 };
    const out = task.validate(task.output.parse(draft), { description: 'A snowy climb' }, {} as never) as { output: { blueprint: Blueprint } };
    // Numbers are brought within the limits and the result passes the same check as a saved game.
    expect(out.output.blueprint).toMatchObject({ name: 'Snowy slide', kind: { type: 'climb', height: 60, twist: true }, answer: { right: 10 }, end: { type: 'first', timeLimitSec: 900 }, look: { dimension: '3d' } });
    // A draft the word filter stops is refused with the reason, so the model gets one more try.
    expect(() => task.validate(task.output.parse({ ...draft, name: 'Shit climb' }), { description: 'x' }, {} as never)).toThrow(TaskReject);
  });

  it('answers as game code the maker can read, checked like code they typed', async () => {
    await import('../src/modules/ai/tasks/index.ts');
    const { getAiTask, TaskReject } = await import('../src/modules/ai/tasks.ts');
    const task = getAiTask('mode.draft')!;
    const code = 'game "Coin climb"\nclimb to 30 metres\neach player has 0 coins\nwhen a player gets 3 right in a row: add 1 coins\nwhen a player reaches 5 coins: win\nwins: first to the goal';
    const out = task.validate(task.output.parse({ code }), { description: 'A climb with coins' }, {} as never) as { output: { blueprint: Blueprint; code: string } };
    expect(out.output.blueprint).toMatchObject({ name: 'Coin climb', kind: { type: 'climb', height: 30 }, vars: [{ name: 'coins' }] });
    expect(out.output.code).toContain('when a player reaches 5 coins: win');
    // Code with a mistake, or words the filter stops, is sent back to the model with the problem.
    expect(() => task.validate(task.output.parse({ code: 'game "Coin climb"\nclimb to 300 metres' }), { description: 'x' }, {} as never)).toThrow(/Line 2: Height must be at most 60/);
    expect(() => task.validate(task.output.parse({ code: 'game "Shit climb"' }), { description: 'x' }, {} as never)).toThrow(TaskReject);
    expect(() => task.validate(task.output.parse({ code: 'game "Hi there"\nwhen a player answers right: say "You smell"' }), { description: 'x' }, {} as never)).toThrow(TaskReject);
  });
});
