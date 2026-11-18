import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roomOptionsSchema, type Question, type RoomOptions } from '@ludora/shared';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';
import { ILLEGAL_MOVES_COUNT, TOO_FAST_COUNT, TOO_FAST_MS, type IntegrityEvent } from '../src/realtime/integrity.ts';

/*
 * Integrity signals in a live room, on their own (no sockets or database): what a room reports
 * to staff, what it leaves alone, and that a reported player's game goes on exactly as before.
 */

const rooms: Room[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const r of rooms.splice(0)) r.close('test over');
  vi.useRealTimers();
});

const TF: Question[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, type: 'truefalse' as const, prompt: `Statement ${i + 1} is true.`, correct: i % 2 === 0 }));

function makeRoom(opts: { options?: Partial<RoomOptions>; watch?: boolean; onIntegrity?: (e: IntegrityEvent) => void } = {}) {
  const events: IntegrityEvent[] = [];
  const errors: string[] = [];
  const room = new Room(
    {
      code: '654321',
      hostUserId: 'host-user',
      hostName: 'Ms Host',
      modeId: 'classic',
      variantId: null,
      settings: {},
      common: { shuffleQuestions: false },
      options: roomOptionsSchema.parse({ tutorial: false, ...opts.options }),
      set: { id: null, title: 'Facts', questions: TF },
      solo: false,
    },
    {
      now: () => Date.now(),
      persist: async () => null,
      onError: (_err, where) => void errors.push(where),
      onClosed: () => {},
      ...(opts.watch === false ? {} : { onIntegrity: opts.onIntegrity ?? ((e) => void events.push(e)) }),
    },
  );
  rooms.push(room);
  return { room, events, errors };
}

function sub(role: 'host' | 'player', playerId: string | null) {
  const events: [string, any][] = [];
  const s: RoomSubscriber & { events: typeof events } = { id: `${role}-${playerId ?? 'h'}-${Math.random()}`, role, playerId, events, emit: (e, p) => void events.push([e, p]) };
  return s;
}

function join(room: Room, name: string, deviceSeat?: string) {
  const r = room.join({ name, userId: null, accountName: null, isGuestAccount: true, avatar: null, deviceSeat });
  if (!r.ok) throw new Error(r.error.message);
  const s = sub('player', r.player.id);
  room.subscribe(s);
  return { id: r.player.id, sub: s, token: r.player.reconnectToken };
}

const sync = (room: Room) => (room.runtime!.debugState() as { sync: { phase: string; iid: string; round: number } }).sync;
let seq = 0;
const actionId = () => `act-${String(++seq).padStart(8, '0')}`;

function start(room: Room) {
  expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
  vi.advanceTimersByTime(4100);
  expect(sync(room).phase).toBe('question');
}

/** From a closed question on to the next one. */
function nextQuestion(room: Room) {
  for (let i = 0; i < 3 && sync(room).phase !== 'question'; i++) expect(room.hostCommand({ cmd: 'next' }).ok).toBe(true);
  expect(sync(room).phase).toBe('question');
}

function answer(room: Room, playerId: string, right = true) {
  const iid = sync(room).iid;
  const reveal = room.runtime!.debugReveal(iid) as { correct: boolean };
  return room.action(playerId, actionId(), { type: 'answer', iid, answer: { type: 'truefalse', value: right ? reveal.correct : !reveal.correct } });
}

/** Play `rounds` questions: `fast` answers `ms` after each opens, everyone else a second later. */
function play(room: Room, rounds: number, fast: { id: string; ms: number; right?: boolean }, others: string[]) {
  for (let i = 0; i < rounds; i++) {
    if (i > 0) nextQuestion(room);
    vi.advanceTimersByTime(fast.ms);
    expect(answer(room, fast.id, fast.right ?? true)).toEqual({ ok: true });
    vi.advanceTimersByTime(1000);
    for (const id of others) expect(answer(room, id).ok).toBe(true);
  }
}

describe('answers faster than a person can read', () => {
  it('reports a player whose right answers keep arriving at once, and changes nothing for them', () => {
    const { room, events } = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    const quick = join(room, 'Sam R');
    const steady = join(room, 'Ana');
    start(room);
    play(room, TOO_FAST_COUNT - 1, { id: quick.id, ms: 60 }, [steady.id]);
    expect(events).toEqual([]);
    nextQuestion(room);
    vi.advanceTimersByTime(60);
    const at = Date.now();
    // The fifth answer is taken like any other.
    expect(answer(room, quick.id)).toEqual({ ok: true });
    expect(events).toEqual([
      {
        ludora_event: 'integrity',
        kind: 'too_fast',
        room: '654321',
        mode: 'classic',
        player: 'Sam R',
        count: TOO_FAST_COUNT,
        detail: `Sam R gave ${TOO_FAST_COUNT} right answers, each less than a quarter of a second after the question appeared.`,
        at: new Date(at).toISOString(),
      },
    ]);
    vi.advanceTimersByTime(1000);
    answer(room, steady.id);
    // Once a game, however long it goes on.
    nextQuestion(room);
    play(room, 2, { id: quick.id, ms: 60 }, [steady.id]);
    expect(events).toHaveLength(1);
    // Scored, ranked and still in the game like anyone else; nobody is sent anything about it.
    vi.advanceTimersByTime(100);
    expect(room.players.has(quick.id)).toBe(true);
    expect(room.runtime!.statsFor(quick.id)).toMatchObject({ answered: TOO_FAST_COUNT + 2, correct: TOO_FAST_COUNT + 2 });
    const scores = (room.runtime!.debugState() as { sync: { scores: Record<string, number> } }).sync.scores;
    expect(scores[quick.id]).toBeGreaterThan(scores[steady.id]!);
    for (const s of [host, quick.sub, steady.sub]) {
      expect(s.events.every(([e]) => e === 'room:view')).toBe(true);
      expect(JSON.stringify(s.events)).not.toMatch(/integrity|too_fast/);
    }
  });

  it('leaves alone a player who answers quickly but in a time a person can manage', () => {
    const { room, events } = makeRoom();
    const quick = join(room, 'Sam R');
    const steady = join(room, 'Ana');
    start(room);
    play(room, 8, { id: quick.id, ms: 450 }, [steady.id]);
    expect(events).toEqual([]);
  });

  it('leaves alone fast wrong answers and a mix that is right only by chance', () => {
    const { room, events } = makeRoom();
    const masher = join(room, 'Kit');
    const steady = join(room, 'Ana');
    start(room);
    for (let i = 0; i < 8; i++) {
      if (i > 0) nextQuestion(room);
      vi.advanceTimersByTime(40);
      answer(room, masher.id, i % 2 === 0);
      vi.advanceTimersByTime(1000);
      answer(room, steady.id);
    }
    expect(events).toEqual([]);
  });

  it('measures by the clock, so a pause while the question is on screen is reading time', () => {
    const { room, events } = makeRoom();
    room.subscribe(sub('host', null));
    const a = join(room, 'Sam R');
    const b = join(room, 'Ana');
    start(room);
    for (let i = 0; i < 7; i++) {
      if (i > 0) nextQuestion(room);
      vi.advanceTimersByTime(100);
      expect(room.hostCommand({ cmd: 'pause' }).ok).toBe(true);
      vi.advanceTimersByTime(30_000);
      expect(room.hostCommand({ cmd: 'resume' }).ok).toBe(true);
      vi.advanceTimersByTime(50);
      // 150 ms of game time, half a minute on the clock.
      expect(answer(room, a.id).ok).toBe(true);
      expect(answer(room, b.id).ok).toBe(true);
    }
    expect(events).toEqual([]);
  });

  it('does not hold extra time against a player: their answers are timed by the clock like anyone else', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Sam R');
    const b = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'extraTime', playerId: a.id, share: 1 }).ok).toBe(true);
    start(room);
    // 300 ms each (a little more on the first): the game scores that as about half, against the doubled limit. The clock says 300.
    play(room, 7, { id: a.id, ms: 300 }, [b.id]);
    const scored = room.runtime!.answerLog().filter((r) => r.playerId === a.id).map((r) => r.responseMs);
    expect(scored).toHaveLength(7);
    expect(scored.every((ms) => ms < TOO_FAST_MS)).toBe(true);
    expect(events).toEqual([]);
  });

  it('never reports a practice bot', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'addBots', count: 1 }).ok).toBe(true);
    const bot = [...room.players.values()].find((p) => p.isBot)!;
    start(room);
    for (let i = 0; i < 8; i++) {
      if (i > 0) nextQuestion(room);
      vi.advanceTimersByTime(10);
      const iid = sync(room).iid;
      const reveal = room.runtime!.debugReveal(iid) as { correct: boolean };
      // As the room plays a bot's move: straight to the game.
      expect(room.runtime!.act(bot.id, { type: 'answer', iid, answer: { type: 'truefalse', value: reveal.correct } }).ok).toBe(true);
      room.refused(bot.id, 'malformed');
      vi.advanceTimersByTime(1000);
      if (sync(room).phase === 'question') answer(room, a.id);
    }
    expect(room.runtime!.statsFor(bot.id).correct).toBe(8);
    expect(events).toEqual([]);
  });
});

describe('moves the game does not allow', () => {
  it('reports a player who keeps sending moves this game does not have, and answers them as before', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    start(room);
    const refusal = { ok: false, error: { code: 'invalid_state', message: 'That move is not allowed here.' } };
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) expect(room.action(a.id, actionId(), { type: 'give-me-points', n: 1e9 })).toEqual(refusal);
    expect(events).toEqual([]);
    const at = Date.now();
    expect(room.action(a.id, actionId(), 'answer')).toEqual(refusal);
    expect(events).toEqual([
      {
        ludora_event: 'integrity',
        kind: 'illegal_moves',
        room: '654321',
        mode: 'classic',
        player: 'Sam R',
        count: ILLEGAL_MOVES_COUNT,
        detail: `Sam R's device sent ${ILLEGAL_MOVES_COUNT} messages that the game's own screens never send.`,
        at: new Date(at).toISOString(),
      },
    ]);
    for (let i = 0; i < 20; i++) room.action(a.id, actionId(), { nonsense: true });
    expect(events).toHaveLength(1);
    // They can still play.
    expect(answer(room, a.id)).toEqual({ ok: true });
  });

  it('counts what the transport turned away: a message that is not a move, a host command from a player', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    start(room);
    for (let i = 0; i < ILLEGAL_MOVES_COUNT - 2; i++) room.refused(a.id, 'malformed');
    room.refused(a.id, 'host_command');
    expect(events).toEqual([]);
    room.refused(a.id, 'host_command');
    expect(events.map((e) => [e.kind, e.player, e.count])).toEqual([['illegal_moves', 'Sam R', ILLEGAL_MOVES_COUNT]]);
  });

  it('does not count the same message sent again', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    start(room);
    const id = actionId();
    for (let i = 0; i < 30; i++) expect(room.action(a.id, id, { type: 'nope' }).ok).toBe(false);
    expect(events).toEqual([]);
  });

  it('does not count ordinary refusals: a second tap, an answer after time is up, a tap while paused or after the end', () => {
    const { room, events } = makeRoom();
    room.subscribe(sub('host', null));
    const a = join(room, 'Sam R');
    const b = join(room, 'Ana');
    start(room);
    vi.advanceTimersByTime(900);
    expect(answer(room, a.id).ok).toBe(true);
    // A double tap, twenty times over.
    for (let i = 0; i < 20; i++) expect(answer(room, a.id)).toEqual({ ok: false, error: { code: 'invalid_state', message: 'You already answered.' } });
    // Paused.
    room.hostCommand({ cmd: 'pause' });
    for (let i = 0; i < 20; i++) expect(answer(room, b.id)).toMatchObject({ ok: false, error: { message: 'The game is paused.' } });
    room.hostCommand({ cmd: 'resume' });
    // Too late: the question has closed (20 seconds, and the reveal is still up).
    vi.advanceTimersByTime(21_000);
    expect(sync(room).phase).not.toBe('question');
    for (let i = 0; i < 20; i++) expect(answer(room, b.id)).toMatchObject({ ok: false, error: { message: 'Answers are closed.' } });
    // After the game.
    room.hostCommand({ cmd: 'end' });
    for (let i = 0; i < 20; i++) expect(room.action(b.id, actionId(), { type: 'nope' }).ok).toBe(false);
    expect(events).toEqual([]);
  });

  it('counts nothing in the lobby, and starts each game from nothing', () => {
    const { room, events } = makeRoom();
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    for (let i = 0; i < 20; i++) {
      room.refused(a.id, 'malformed');
      expect(room.action(a.id, actionId(), { type: 'nope' })).toMatchObject({ ok: false, error: { message: 'The game has not started yet.' } });
    }
    start(room);
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) room.action(a.id, actionId(), { type: 'nope' });
    room.hostCommand({ cmd: 'end' });
    expect(room.hostCommand({ cmd: 'restart' }).ok).toBe(true);
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) room.action(a.id, actionId(), { type: 'nope' });
    expect(events).toEqual([]);
    // A second game reports again, once.
    room.action(a.id, actionId(), { type: 'nope' });
    expect(events).toHaveLength(1);
  });
});

describe('one device playing as many players', () => {
  it('reports a browser that holds three seats at once when the game starts, naming them', () => {
    const { room, events } = makeRoom();
    const one = join(room, 'Sam R');
    const two = join(room, 'Sam 2', one.token);
    // A browser sends the seat it took last, so the third tab points at the second.
    const three = join(room, 'Kit', two.token);
    join(room, 'Ana');
    expect(new Set([one.id, two.id, three.id]).size).toBe(3);
    expect(events).toEqual([]);
    const at = Date.now();
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    expect(events).toEqual([
      {
        ludora_event: 'integrity',
        kind: 'one_device_many_players',
        room: '654321',
        mode: 'classic',
        player: 'Sam R',
        count: 3,
        detail: '3 players are connected from one browser at the same time: Sam R, Sam 2 and Kit.',
        at: new Date(at).toISOString(),
      },
    ]);
    // Nobody was removed or told.
    expect([one, two, three].every((p) => room.players.has(p.id) && p.sub.events.every(([e]) => e === 'room:view'))).toBe(true);
  });

  it('reports it when the third seat arrives during the game, and only once', () => {
    const { room, events } = makeRoom();
    const one = join(room, 'Sam R');
    const two = join(room, 'Sam 2', one.token);
    join(room, 'Ana');
    start(room);
    expect(events).toEqual([]);
    const three = join(room, 'Kit', two.token);
    expect(events.map((e) => [e.kind, e.player, e.count])).toEqual([['one_device_many_players', 'Sam R', 3]]);
    join(room, 'Kit 2', three.token);
    expect(events).toHaveLength(1);
  });

  it('leaves alone a class on its own devices, however many share a network, and two tabs on one', () => {
    const { room, events } = makeRoom();
    // Thirty devices: nothing the server sees ties them together, and their address is never asked.
    for (let i = 0; i < 30; i++) join(room, `Pupil ${i + 1}`);
    const one = join(room, 'Sam R');
    join(room, 'Sam 2', one.token);
    start(room);
    expect(events).toEqual([]);
  });

  it('counts only seats connected at the same time', () => {
    const { room, events } = makeRoom();
    const one = join(room, 'Sam R');
    const two = join(room, 'Sam 2', one.token);
    // The first tab was closed before the third joined: a shared tablet passed along, not three at once.
    room.unsubscribe(one.sub.id);
    const three = join(room, 'Kit', two.token);
    join(room, 'Ana');
    start(room);
    expect(events).toEqual([]);
    // It comes back: now three are on at once.
    expect(room.join({ reconnectToken: one.token, userId: null, accountName: null, isGuestAccount: true, avatar: null })).toMatchObject({ ok: true, resumed: true });
    expect(events.map((e) => [e.kind, e.count, e.detail])).toEqual([['one_device_many_players', 3, '3 players are connected from one browser at the same time: Sam R, Sam 2 and Kit.']]);
    expect(three.id).not.toBe(one.id);
  });

  it('a device seat token gives no seat back and an unknown one means nothing', () => {
    const { room, events } = makeRoom();
    const one = join(room, 'Sam R');
    const other = join(room, 'Kit', one.token);
    expect(other.id).not.toBe(one.id);
    expect(other.token).not.toBe(one.token);
    join(room, 'Ana', 'f'.repeat(32));
    join(room, 'Ben', 'f'.repeat(32));
    join(room, 'Cai', 'f'.repeat(32));
    start(room);
    expect(events).toEqual([]);
  });
});

describe('the watch is optional and cannot hurt a game', () => {
  it('without the hook a room watches for nothing', () => {
    const { room, events } = makeRoom({ watch: false });
    const a = join(room, 'Sam R');
    const b = join(room, 'Ana', a.token);
    const c = join(room, 'Kit', b.token);
    start(room);
    for (let i = 0; i < 20; i++) expect(room.action(a.id, actionId(), { type: 'nope' }).ok).toBe(false);
    play(room, 6, { id: a.id, ms: 20 }, [b.id, c.id]);
    expect(events).toEqual([]);
    expect((room as unknown as { watch: unknown }).watch).toBeNull();
  });

  it('a fault in reporting is logged as a room error and the move is answered as usual', () => {
    const { room, errors } = makeRoom({
      onIntegrity: () => {
        throw new Error('log is down');
      },
    });
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    start(room);
    for (let i = 0; i < ILLEGAL_MOVES_COUNT; i++) expect(room.action(a.id, actionId(), { type: 'nope' })).toEqual({ ok: false, error: { code: 'invalid_state', message: 'That move is not allowed here.' } });
    expect(errors).toEqual(['integrity']);
    expect(answer(room, a.id)).toEqual({ ok: true });
  });

  it('keeps nothing once the game is over or the room has closed', () => {
    const { room } = makeRoom();
    const a = join(room, 'Sam R');
    join(room, 'Ana');
    const watch = () => (room as unknown as { watch: unknown }).watch;
    expect(watch()).toBeNull();
    start(room);
    expect(watch()).not.toBeNull();
    room.action(a.id, actionId(), { type: 'nope' });
    room.hostCommand({ cmd: 'end' });
    expect(watch()).toBeNull();
    room.hostCommand({ cmd: 'restart' });
    expect(watch()).not.toBeNull();
    room.close('done');
    expect(watch()).toBeNull();
  });
});
