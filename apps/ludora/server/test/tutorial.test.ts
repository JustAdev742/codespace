import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostCommandSchema, playerRequestSchema, roomOptionsSchema, type RoomOptions } from '@ludora/shared';
import { MIXED_SET } from '@ludora/engine/testing';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';
import { hostingDefaults, newRoomOptions } from '../src/modules/rooms/options.ts';
import { defaultCalmPlay, mergePreferences, preferencesPatchSchema, readPreferences } from '../src/modules/users/preferences.ts';
import { loadConfig } from '../src/config.ts';
import { questionSets } from '../src/db/schema.ts';
import { createTestApp, registered, type TestContext } from './helpers.ts';

/*
 * Calm play as a room's option, and the walkthrough before a game: both decided on the server.
 * The room tests run on their own (no sockets or database); the last block goes through the API.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const rooms: Room[] = [];

function makeRoom(opts: { modeId?: string; options?: Partial<RoomOptions>; solo?: boolean } = {}) {
  const r = new Room(
    {
      code: '654321',
      hostUserId: 'host-user',
      hostName: 'Ms Host',
      modeId: opts.modeId ?? 'lantern-rally',
      variantId: null,
      settings: {},
      common: {},
      options: roomOptionsSchema.parse(opts.options ?? {}),
      set: { id: null, title: 'Mixed', questions: MIXED_SET },
      solo: opts.solo ?? false,
    },
    { now: () => Date.now(), persist: async () => null, onError: () => {}, onClosed: () => {} },
  );
  rooms.push(r);
  return r;
}

function sub(role: 'host' | 'player', playerId: string | null, id = `${role}-${playerId ?? 'h'}`) {
  const events: [string, any][] = [];
  const s: RoomSubscriber & { last: () => any } = { id, role, playerId, emit: (e, p) => void events.push([e, p]), last: () => [...events].reverse().find(([e]) => e === 'room:view')?.[1] };
  return s;
}

function join(room: Room, name: string) {
  const r = room.join({ name, userId: null, accountName: null, isGuestAccount: true, avatar: null });
  if (!r.ok) throw new Error(r.error.message);
  const s = sub('player', r.player.id);
  room.subscribe(s);
  return { id: r.player.id, sub: s };
}

const done = (room: Room, id: string, value = true) => room.playerRequest(id, { op: 'tutorial', done: value });

describe('the walkthrough before a game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const r of rooms.splice(0)) r.close('test over');
    vi.useRealTimers();
  });

  it('is on for a room unless the host turns it off, and is part of the protocol', () => {
    expect(roomOptionsSchema.parse({}).tutorial).toBe(true);
    expect(playerRequestSchema.safeParse({ op: 'tutorial', done: true }).success).toBe(true);
    expect(hostCommandSchema.safeParse({ cmd: 'configure', options: { tutorial: false } }).success).toBe(true);
  });

  it('opens on Start for players who have not seen the mode, on every screen, and the game waits', () => {
    const room = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('lobby');
    vi.advanceTimersByTime(100);
    expect(host.last().room.intro).toMatchObject({ done: 0, players: 2 });
    expect(ana.sub.last().room.intro).toMatchObject({ done: 0, players: 2 });
    expect(ana.sub.last().me.tutorialDone).toBe(false);
    // One player finishes: the host sees who, the game still waits for the other.
    expect(done(room, ana.id).ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(room.status).toBe('lobby');
    expect(host.last().room.intro).toMatchObject({ done: 1, players: 2 });
    expect(host.last().players.find((p: any) => p.id === ana.id).tutorialDone).toBe(true);
    expect(host.last().players.find((p: any) => p.id === ben.id).tutorialDone).toBeUndefined();
    // The other finishes: the game starts by itself.
    expect(done(room, ben.id).ok).toBe(true);
    expect(room.status).toBe('running');
    vi.advanceTimersByTime(100);
    expect(host.last().room.intro).toBeNull();
  });

  it('lets the host skip it: Start again from the walkthrough starts the game', () => {
    const room = makeRoom();
    join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('lobby');
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('running');
  });

  it('lets the host go back to the lobby, and shows it again on the next Start', () => {
    const room = makeRoom();
    const ana = join(room, 'Ana');
    room.hostCommand({ cmd: 'start' });
    expect(room.hostCommand({ cmd: 'cancelStart' }).ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(ana.sub.last().room.intro).toBeNull();
    expect(room.status).toBe('lobby');
    room.hostCommand({ cmd: 'start' });
    vi.advanceTimersByTime(100);
    expect(ana.sub.last().room.intro).not.toBeNull();
  });

  it('never opens with "start now", in a room with the walkthrough off, or for a room of practice bots', () => {
    const now = makeRoom();
    join(now, 'Ana');
    expect(now.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    expect(now.status).toBe('running');

    const off = makeRoom({ options: { tutorial: false } });
    join(off, 'Ana');
    expect(off.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(off.status).toBe('running');

    const bots = makeRoom();
    expect(bots.hostCommand({ cmd: 'addBots', count: 2 }).ok).toBe(true);
    expect(bots.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(bots.status).toBe('running');
  });

  it('goes straight to the game for a class that already knows the mode', () => {
    const room = makeRoom();
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    // In the lobby each device says its player has seen this walkthrough before.
    done(room, ana.id);
    done(room, ben.id);
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('running');
  });

  it('knows from a signed-in player’s account which walkthroughs they have finished', () => {
    const room = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    expect(room.tutorialKey).toBe('lantern-rally');
    const r = room.join({ name: 'Ana', userId: 'u-ana', accountName: 'Ana', isGuestAccount: false, avatar: null, tutorialsSeen: ['classic', 'lantern-rally'] });
    if (!r.ok) throw new Error(r.error.message);
    const s = room.join({ name: 'Ben', userId: 'u-ben', accountName: 'Ben', isGuestAccount: false, avatar: null, tutorialsSeen: ['classic'] });
    if (!s.ok) throw new Error(s.error.message);
    room.subscribe(sub('player', r.player.id));
    room.subscribe(sub('player', s.player.id));
    vi.advanceTimersByTime(100);
    expect(host.last().room.tutorialKey).toBe('lantern-rally');
    room.hostCommand({ cmd: 'start' });
    vi.advanceTimersByTime(100);
    expect(host.last().room.intro).toMatchObject({ done: 1, players: 2 });
    done(room, s.player.id);
    expect(room.status).toBe('running');
  });

  it('shows it to everyone when one player is new, and counts those who know it as finished', () => {
    const room = makeRoom();
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    done(room, ana.id);
    room.hostCommand({ cmd: 'start' });
    expect(room.status).toBe('lobby');
    vi.advanceTimersByTime(100);
    expect(ana.sub.last().room.intro).toMatchObject({ done: 1, players: 2 });
    expect(ana.sub.last().me.tutorialDone).toBe(true);
    done(room, ben.id);
    expect(room.status).toBe('running');
  });

  it('does not wait for a player who leaves or loses their connection', () => {
    const room = makeRoom();
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    const cal = join(room, 'Cal');
    room.hostCommand({ cmd: 'start' });
    done(room, ana.id);
    room.unsubscribe(ben.sub.id);
    expect(room.status).toBe('lobby');
    room.leave(cal.id);
    expect(room.status).toBe('running');
  });

  it('goes back to the lobby if everyone it was for has gone', () => {
    const room = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    const ana = join(room, 'Ana');
    room.hostCommand({ cmd: 'addBots', count: 1 });
    room.hostCommand({ cmd: 'start' });
    room.leave(ana.id);
    vi.advanceTimersByTime(100);
    expect(room.status).toBe('lobby');
    expect(host.last().room.intro).toBeNull();
  });

  it('comes before the room’s countdown, and after a countdown nobody pressed Start for', () => {
    const room = makeRoom({ options: { startCountdownSec: 5 } });
    const ana = join(room, 'Ana');
    room.hostCommand({ cmd: 'start' });
    vi.advanceTimersByTime(100);
    expect(ana.sub.last().room.intro).not.toBeNull();
    expect(ana.sub.last().room.startsAt).toBeNull();
    done(room, ana.id);
    vi.advanceTimersByTime(100);
    expect(room.status).toBe('lobby');
    expect(ana.sub.last().room.startsAt).not.toBeNull();
    expect(ana.sub.last().room.intro).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(room.status).toBe('running');

    // Auto-start: the room fills, counts down, then shows the walkthrough before the game.
    const auto = makeRoom({ options: { autoStartAt: 1 } });
    const bea = join(auto, 'Bea');
    vi.advanceTimersByTime(5100);
    expect(auto.status).toBe('lobby');
    expect(bea.sub.last().room.intro).not.toBeNull();
    done(auto, bea.id);
    expect(auto.status).toBe('running');
  });

  it('is not shown again for Play again', () => {
    const room = makeRoom({ modeId: 'classic' });
    const ana = join(room, 'Ana');
    room.hostCommand({ cmd: 'start' });
    done(room, ana.id);
    expect(room.status).toBe('running');
    room.hostCommand({ cmd: 'end' });
    expect(room.status).toBe('ended');
    expect(room.hostCommand({ cmd: 'restart' }).ok).toBe(true);
    expect(room.status).toBe('running');
  });

  it('a solo game opens with it, and starts when its player has finished', () => {
    const room = makeRoom({ solo: true, options: { maxPlayers: 1, lateJoin: false } });
    const r = room.join({ name: 'Ana', userId: 'host-user', accountName: 'Ana', isGuestAccount: false, avatar: null });
    if (!r.ok) throw new Error(r.error.message);
    const s = sub('player', r.player.id);
    room.subscribe(s);
    // What the socket layer does for a solo game as its player arrives.
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('lobby');
    vi.advanceTimersByTime(100);
    expect(s.last().room.intro).toMatchObject({ done: 0, players: 1 });
    done(room, r.player.id);
    expect(room.status).toBe('running');
  });
});

describe('calm play, the room’s option', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const r of rooms.splice(0)) r.close('test over');
    vi.useRealTimers();
  });

  it('is off unless chosen, reaches every screen, and tells the game’s rules', () => {
    expect(roomOptionsSchema.parse({}).calmPlay).toBe(false);
    for (const calmPlay of [false, true]) {
      const room = makeRoom({ options: { calmPlay, tutorial: false } });
      const host = sub('host', null);
      room.subscribe(host);
      const ana = join(room, 'Ana');
      expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
      vi.advanceTimersByTime(100);
      // Players see what the teacher chose, and the server's game plays by it.
      expect(ana.sub.last().room.options.calmPlay).toBe(calmPlay);
      expect(host.last().room.options.calmPlay).toBe(calmPlay);
      expect(room.runtime!.calm).toBe(calmPlay);
      expect(ana.sub.last().game.you.calm === null).toBe(!calmPlay);
    }
  });

  it('is set between games: it cannot change while a game is on', () => {
    const room = makeRoom({ options: { tutorial: false } });
    join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'configure', options: { calmPlay: true } }).ok).toBe(true);
    expect(room.options.calmPlay).toBe(true);
    room.hostCommand({ cmd: 'start' });
    expect(room.hostCommand({ cmd: 'configure', options: { calmPlay: false } })).toMatchObject({ ok: false, error: { code: 'invalid_state' } });
    expect(room.options.calmPlay).toBe(true);
    expect(room.runtime!.calm).toBe(true);
  });

  it('in a calm room, a kart drives itself while its driver has a question open (the rule is the server’s)', () => {
    const room = makeRoom({ options: { calmPlay: true, tutorial: false } });
    const ana = join(room, 'Ana');
    room.hostCommand({ cmd: 'start' });
    vi.advanceTimersByTime(6000);
    const r = room.action(ana.id, 'steer-000001', { type: 'steer', dir: 1 });
    expect(r).toMatchObject({ ok: false, error: { message: 'Answer your question first. Your kart is driving itself.' } });
  });

  it('defaults to the host’s saved choice, then to on for a school’s own copy and off elsewhere', () => {
    const fresh = readPreferences({});
    expect(fresh.host.calmPlay).toBeNull();
    expect(defaultCalmPlay(fresh, false)).toBe(false);
    expect(defaultCalmPlay(fresh, true)).toBe(true);
    const on = mergePreferences(fresh, preferencesPatchSchema.parse({ host: { calmPlay: true } }));
    const off = mergePreferences(fresh, preferencesPatchSchema.parse({ host: { calmPlay: false } }));
    expect(defaultCalmPlay(on, false)).toBe(true);
    expect(defaultCalmPlay(off, true)).toBe(false);
    // And back to this copy's usual.
    expect(mergePreferences(on, preferencesPatchSchema.parse({ host: { calmPlay: null } })).host.calmPlay).toBeNull();

    const base = { DATABASE_URL: 'postgres://x/y', APP_ENV: 'test' };
    const plain = loadConfig(base);
    const school = loadConfig({ ...base, SCHOOL_THEME: 'hills-grammar' });
    expect(newRoomOptions(plain, fresh)).toMatchObject({ calmPlay: false, tutorial: true });
    expect(newRoomOptions(school, fresh)).toMatchObject({ calmPlay: true, tutorial: true });
    // What the host says for this room wins over both.
    expect(newRoomOptions(school, fresh, { calmPlay: false }).calmPlay).toBe(false);
    expect(newRoomOptions(plain, off, { calmPlay: true }).calmPlay).toBe(true);
    expect(newRoomOptions(loadConfig({ ...base, TUTORIAL_DEFAULT: 'off' }), fresh).tutorial).toBe(false);
    expect(newRoomOptions(loadConfig({ ...base, TUTORIAL_DEFAULT: 'off' }), fresh, { tutorial: true }).tutorial).toBe(true);
    // A copy's operator can set the usual either way, whatever its look.
    expect(newRoomOptions(loadConfig({ ...base, CALM_PLAY_DEFAULT: 'on' }), fresh).calmPlay).toBe(true);
    expect(newRoomOptions(loadConfig({ ...base, SCHOOL_THEME: 'hills-grammar', CALM_PLAY_DEFAULT: 'off' }), fresh).calmPlay).toBe(false);
    expect(newRoomOptions(loadConfig({ ...base, CALM_PLAY_DEFAULT: 'off' }), on).calmPlay).toBe(true);
    expect(hostingDefaults(school, fresh)).toEqual({ calmPlay: true, tutorial: true });
    expect(hostingDefaults(loadConfig({ ...base, TUTORIAL_DEFAULT: 'off' }), on)).toEqual({ calmPlay: true, tutorial: false });
  });
});

describe('walkthroughs an account has seen', () => {
  it('are kept with its preferences, added to and never dropped by a later save', () => {
    const fresh = readPreferences({});
    expect(fresh.tutorials).toEqual([]);
    const a = mergePreferences(fresh, preferencesPatchSchema.parse({ tutorials: ['lantern-rally'] }));
    // Another device finishes another walkthrough and knows nothing of the first.
    const b = mergePreferences(a, preferencesPatchSchema.parse({ tutorials: ['glow-tag', 'lantern-rally'] }));
    expect(b.tutorials).toEqual(['lantern-rally', 'glow-tag']);
    // Changing something else leaves them alone.
    expect(mergePreferences(b, preferencesPatchSchema.parse({ sound: false })).tutorials).toEqual(['lantern-rally', 'glow-tag']);
    // Preferences saved before this existed read as none seen.
    expect(readPreferences({ theme: 'dark' }).tutorials).toEqual([]);
    expect(preferencesPatchSchema.safeParse({ tutorials: ['x'.repeat(81)] }).success).toBe(false);
  });
});

describe('making a room through the API', () => {
  let plain: TestContext;
  let school: TestContext;
  beforeAll(async () => {
    plain = await createTestApp({ TUTORIAL_DEFAULT: 'on' });
    school = await createTestApp({ SCHOOL_THEME: 'hills-grammar', TUTORIAL_DEFAULT: 'on' });
  });
  afterAll(async () => {
    await plain.close();
    await school.close();
  });

  async function hostWithSet(t: TestContext) {
    const host = await registered(t.app, { accountType: 'teacher' });
    const [set] = await t.db
      .insert(questionSets)
      .values({ ownerId: host.userId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
      .returning({ id: questionSets.id });
    return { host, setId: set!.id };
  }
  const optionsOf = (t: TestContext, code: string) => t.deps.rooms.get(code)!.options;

  it('a new game is calm on a school’s own copy and not elsewhere, unless the host says', async () => {
    const a = await hostWithSet(plain);
    const b = await hostWithSet(school);
    const body = { modeId: 'lantern-rally' };
    expect(optionsOf(plain, (await a.host.client.post('/api/rooms', { ...body, setId: a.setId })).body.code)).toMatchObject({ calmPlay: false, tutorial: true });
    expect(optionsOf(school, (await b.host.client.post('/api/rooms', { ...body, setId: b.setId })).body.code)).toMatchObject({ calmPlay: true, tutorial: true });
    // Changing another option says nothing about calm play, so the default still applies.
    expect(optionsOf(school, (await b.host.client.post('/api/rooms', { ...body, setId: b.setId, options: { quiet: true } })).body.code)).toMatchObject({ calmPlay: true, quiet: true });
    expect(optionsOf(school, (await b.host.client.post('/api/rooms', { ...body, setId: b.setId, options: { calmPlay: false } })).body.code).calmPlay).toBe(false);
    expect(optionsOf(plain, (await a.host.client.post('/api/rooms', { ...body, setId: a.setId, options: { calmPlay: true, tutorial: false } })).body.code)).toMatchObject({ calmPlay: true, tutorial: false });
    // A solo game follows the same rule.
    expect(optionsOf(school, (await b.host.client.post('/api/rooms', { ...body, setId: b.setId, solo: true })).body.code).calmPlay).toBe(true);
  });

  it('a host’s saved choice is used for the games they start, and their seen walkthroughs are saved', async () => {
    const a = await hostWithSet(plain);
    expect((await a.host.client.patch('/api/me/preferences', { host: { calmPlay: true } })).status).toBe(200);
    expect(optionsOf(plain, (await a.host.client.post('/api/rooms', { modeId: 'classic', setId: a.setId })).body.code).calmPlay).toBe(true);
    const b = await hostWithSet(school);
    await b.host.client.patch('/api/me/preferences', { host: { calmPlay: false } });
    expect(optionsOf(school, (await b.host.client.post('/api/rooms', { modeId: 'classic', setId: b.setId })).body.code).calmPlay).toBe(false);

    await a.host.client.patch('/api/me/preferences', { tutorials: ['classic'] });
    const saved = await a.host.client.patch('/api/me/preferences', { tutorials: ['lantern-rally'] });
    expect(saved.body.preferences.tutorials).toEqual(['classic', 'lantern-rally']);
    expect(saved.body.preferences.host.calmPlay).toBe(true);
    const me = await a.host.client.get('/api/auth/me');
    expect(me.body.user.preferences.tutorials).toEqual(['classic', 'lantern-rally']);
    // The host page's switches start from what a new game would get.
    expect(me.body.hosting).toEqual({ calmPlay: true, tutorial: true });
    expect((await b.host.client.get('/api/auth/me')).body.hosting).toEqual({ calmPlay: false, tutorial: true });
    const c = await hostWithSet(school);
    expect((await c.host.client.get('/api/auth/me')).body.hosting).toEqual({ calmPlay: true, tutorial: true });
  });
});
