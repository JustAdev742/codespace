import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostCommandSchema, roomOptionsSchema, S2C, type Question, type RoomOptions } from '@ludora/shared';
import { MIXED_SET } from '@ludora/engine/testing';
import type { EngineResults } from '@ludora/engine';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';
import { computeAwards, hostReport, missedQuestionIds } from '../src/realtime/report.ts';
import { hideNames } from '../src/realtime/hideNames.ts';

/*
 * Hosting features of the live room, on their own (no sockets or database): the start countdown
 * and auto-start, who is still answering and nudges, add time, brain breaks, double points on the
 * final question, catch-up, names hidden on the big screen, ready, team picking, the exit ticket,
 * the waiting room, quiet rooms, lobby hops, pinned messages, renaming, the question preview, and
 * the end-of-game awards and report. Every host setting is enforced here, on the server.
 */

const rooms: Room[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const r of rooms.splice(0)) r.close('test over');
  vi.useRealTimers();
});

const TF: Question[] = [
  { id: 't1', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 't2', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 't3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
];

function makeRoom(opts: { modeId?: string; options?: Partial<RoomOptions>; common?: Record<string, unknown>; questions?: Question[]; classMembers?: string[]; hooks?: Partial<ConstructorParameters<typeof Room>[1]> } = {}) {
  const r = new Room(
    {
      code: '654321',
      hostUserId: 'host-user',
      hostName: 'Ms Host',
      modeId: opts.modeId ?? 'classic',
      variantId: null,
      settings: {},
      common: { shuffleQuestions: false, questionLimit: 3, ...opts.common },
      options: roomOptionsSchema.parse(opts.options ?? {}),
      set: { id: null, title: 'Facts', questions: opts.questions ?? TF },
      solo: false,
      ...(opts.classMembers ? { classId: 'class-1', classMembers: opts.classMembers, classTitle: 'Year 5 Oak' } : {}),
    },
    { now: () => Date.now(), persist: async () => null, onError: () => {}, onClosed: () => {}, ...opts.hooks },
  );
  rooms.push(r);
  return r;
}

function sub(role: 'host' | 'player', playerId: string | null, id = `${role}-${playerId ?? 'h'}`, remote = false) {
  const events: [string, any][] = [];
  const s: RoomSubscriber & { events: typeof events; last: () => any } = {
    id,
    role,
    playerId,
    remote,
    events,
    emit: (e, p) => void events.push([e, p]),
    last: () => [...events].reverse().find(([e]) => e === 'room:view')?.[1],
  };
  return s;
}

const guest = (name: string) => ({ name, userId: null, accountName: null, isGuestAccount: true, avatar: null });

function join(room: Room, name: string) {
  const r = room.join(guest(name));
  if (!r.ok) throw new Error(r.error.message);
  const s = sub('player', r.player.id);
  room.subscribe(s);
  return { id: r.player.id, sub: s, token: r.player.reconnectToken };
}

/** Into the first question of a classic game. */
function toFirstQuestion(room: Room) {
  expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
  vi.advanceTimersByTime(4100);
  const sync = (room.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
  expect(sync.phase).toBe('question');
  return sync;
}

function answer(room: Room, playerId: string, right: boolean) {
  const sync = (room.runtime!.debugState() as { sync: { iid: string } }).sync;
  const reveal = room.runtime!.debugReveal(sync.iid) as { type: string; correct: boolean };
  return room.action(playerId, `act-${playerId}-${Math.random().toString(36).slice(2, 10)}`, { type: 'answer', iid: sync.iid, answer: { type: 'truefalse', value: right ? reveal.correct : !reveal.correct } });
}

describe('start countdown and auto-start', () => {
  it('counts down on every screen, can be cancelled, then starts', () => {
    const room = makeRoom({ options: { startCountdownSec: 5 } });
    const p = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.status).toBe('lobby');
    vi.advanceTimersByTime(50);
    expect(p.sub.last().room.startsAt).toBe(Date.now() + 4950);
    expect(room.hostCommand({ cmd: 'cancelStart' }).ok).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(room.status).toBe('lobby');
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(room.status).toBe('running');
  });

  it('a countdown is refused when the game could not start, and "start now" skips it', () => {
    const room = makeRoom({ options: { startCountdownSec: 5 } });
    const r = room.hostCommand({ cmd: 'start' });
    expect(r.ok).toBe(false);
    join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    expect(room.status).toBe('running');
  });

  it('starts by itself once the chosen number of players are in, once per lobby', () => {
    const room = makeRoom({ options: { autoStartAt: 2 } });
    join(room, 'Ana');
    expect(room.startsAt).toBeNull();
    join(room, 'Ben');
    expect(room.startsAt).not.toBeNull();
    // The host cancels: it does not fire again when a third arrives.
    expect(room.hostCommand({ cmd: 'cancelStart' }).ok).toBe(true);
    join(room, 'Cai');
    expect(room.startsAt).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(room.status).toBe('lobby');
  });
});

describe('who has not answered, nudges and add time', () => {
  it('lists players still thinking for the host and nudges only them, a gentle once in a while', () => {
    const room = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    const a = join(room, 'Ana');
    const b = join(room, 'Ben');
    toFirstQuestion(room);
    expect(answer(room, a.id, true).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(host.last().host.waiting.map((w: { name: string }) => w.name)).toEqual(['Ben']);
    // Players never see the list.
    expect(a.sub.last().host).toBeUndefined();
    expect(room.hostCommand({ cmd: 'nudge', playerId: a.id }).ok).toBe(false);
    expect(room.hostCommand({ cmd: 'nudge', playerId: b.id }).ok).toBe(true);
    expect(b.sub.events.some(([e]) => e === S2C.nudge)).toBe(true);
    expect(a.sub.events.some(([e]) => e === S2C.nudge)).toBe(false);
    const again = room.hostCommand({ cmd: 'nudge', playerId: b.id });
    expect(!again.ok && again.error.code).toBe('rate_limited');
  });

  it('adds time to an open timed question in a host-paced game, and nowhere else', () => {
    const room = makeRoom();
    join(room, 'Ana');
    join(room, 'Ben');
    const before = toFirstQuestion(room);
    const deadline = (before as unknown as { deadline: number }).deadline;
    expect(room.hostCommand({ cmd: 'addTime', seconds: 10 }).ok).toBe(true);
    const after = (room.runtime!.debugState() as { sync: { deadline: number } }).sync.deadline;
    expect(after).toBe(deadline + 10_000);
    // The question stays open past its old deadline.
    vi.advanceTimersByTime(20_000 + 100);
    expect((room.runtime!.debugState() as { sync: { phase: string } }).sync.phase).toBe('question');

    const self = makeRoom({ modeId: 'lantern-match', questions: MIXED_SET });
    join(self, 'Cai');
    expect(self.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    const r = self.hostCommand({ cmd: 'addTime', seconds: 10 });
    expect(r.ok).toBe(false);
  });
});

describe('brain break', () => {
  it('pauses the game for the stretch and carries on by itself', () => {
    const room = makeRoom();
    room.subscribe(sub('host', null));
    const a = join(room, 'Ana');
    toFirstQuestion(room);
    expect(room.hostCommand({ cmd: 'break', seconds: 30 }).ok).toBe(true);
    expect(room.status).toBe('paused');
    vi.advanceTimersByTime(50);
    expect(a.sub.last().room.breakEndsAt).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(30_000);
    expect(room.status).toBe('running');
    expect(room.breakEndsAt).toBeNull();
  });
  it('ends early when the host says, and is refused in the lobby', () => {
    const room = makeRoom();
    room.subscribe(sub('host', null));
    join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'break', seconds: 60 }).ok).toBe(false);
    toFirstQuestion(room);
    room.hostCommand({ cmd: 'break', seconds: 60 });
    expect(room.hostCommand({ cmd: 'endBreak' }).ok).toBe(true);
    expect(room.status).toBe('running');
  });
});

describe('double points and catch-up', () => {
  it('the final question is worth double when chosen, and players are told before it', () => {
    const scores = (double: boolean) => {
      const room = makeRoom({ common: { doubleFinal: double, questionLimit: 2 } });
      room.subscribe(sub('host', null));
      const a = join(room, 'Ana');
      toFirstQuestion(room);
      answer(room, a.id, true);
      const first = (room.runtime!.debugState() as { sync: { scores: Record<string, number> } }).sync.scores[a.id]!;
      vi.advanceTimersByTime(50);
      // Between questions: the next one is the final, double one.
      expect(a.sub.last().room.doubleNow).toBe(double);
      room.hostCommand({ cmd: 'next' });
      room.hostCommand({ cmd: 'next' });
      vi.advanceTimersByTime(4100);
      answer(room, a.id, true);
      const total = (room.runtime?.debugState() as { sync: { scores: Record<string, number> } } | undefined)?.sync.scores[a.id] ?? room.results!.standings[0]!.score;
      return { first, last: total - first };
    };
    const plain = scores(false);
    const doubled = scores(true);
    expect(doubled.first).toBe(plain.first);
    expect(doubled.last).toBeGreaterThan(plain.last * 1.5);
  });

  it('a late joiner starts level with the lowest score when catch-up is on', () => {
    const room = makeRoom({ options: { catchUp: true } });
    const a = join(room, 'Ana');
    const b = join(room, 'Ben');
    toFirstQuestion(room);
    answer(room, a.id, true);
    answer(room, b.id, true);
    const late = join(room, 'Late Lou');
    const s = (room.runtime!.debugState() as { sync: { scores: Record<string, number> } }).sync.scores;
    expect(s[late.id]).toBe(Math.min(s[a.id]!, s[b.id]!));
    expect(s[late.id]).toBeGreaterThan(0);
  });
});

describe('names hidden on the big screen', () => {
  it('the projector shows "Player N"; the host remote and each player see real names', () => {
    const room = makeRoom({ options: { hideNames: true } });
    const host = sub('host', null);
    const remote = sub('host', null, 'remote', true);
    room.subscribe(host);
    room.subscribe(remote);
    const a = join(room, 'Ana Lovelace');
    join(room, 'Ben');
    vi.advanceTimersByTime(50);
    const big = JSON.stringify(host.last());
    expect(big).not.toContain('Ana Lovelace');
    expect(host.last().players.map((p: { name: string }) => p.name)).toEqual(['Player 1', 'Player 2']);
    expect(remote.last().players[0].name).toBe('Ana Lovelace');
    expect(a.sub.last().me.name).toBe('Ana Lovelace');
    // Reactions on the big screen carry the alias too.
    room.react(a.id, 'wave', 'player');
    expect(host.events.filter(([e]) => e === 'room:reaction').at(-1)![1].name).toBe('Player 1');
    expect(remote.events.filter(([e]) => e === 'room:reaction').at(-1)![1].name).toBe('Ana Lovelace');
    expect(hideNames({ room: { teams: [] }, me: {}, feed: [{ id: 1, at: 0, text: 'Ana joined. Anabel waved.' }] } as never, new Map([['Ana', 'Player 1']])).feed[0]!.text).toBe('Player 1 joined. Anabel waved.');
  });
});

describe('lobby: ready, teams, pinned message, hops, renaming, preview', () => {
  it('counts Ready and lets players pick a team only when the host allows it', () => {
    const room = makeRoom({ common: { teamCount: 2 } });
    const a = join(room, 'Ana');
    expect(room.playerRequest(a.id, { op: 'ready', ready: true }).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(a.sub.last().room.readyCount).toBe(1);
    expect(a.sub.last().me.ready).toBe(true);
    const team2 = room.teams[1]!.id;
    expect(room.playerRequest(a.id, { op: 'team', teamId: team2 }).ok).toBe(false);
    room.hostCommand({ cmd: 'configure', options: { teamPick: true } });
    expect(room.playerRequest(a.id, { op: 'team', teamId: team2 }).ok).toBe(true);
    expect(room.players.get(a.id)!.teamId).toBe(team2);
  });

  it('renames a team and a player through the name filter', () => {
    const room = makeRoom({ common: { teamCount: 2 } });
    const a = join(room, 'Ana');
    const t = room.teams[0]!.id;
    expect(room.hostCommand({ cmd: 'renameTeam', teamId: t, name: 'Rocket Owls' }).ok).toBe(true);
    expect(room.teams[0]!.name).toBe('Rocket Owls');
    expect(room.hostCommand({ cmd: 'renameTeam', teamId: t, name: 'shit team' }).ok).toBe(false);
    expect(room.hostCommand({ cmd: 'renamePlayer', playerId: a.id, name: 'Ana B' }).ok).toBe(true);
    expect(room.players.get(a.id)!.name).toBe('Ana B');
    expect(room.hostCommand({ cmd: 'renamePlayer', playerId: a.id, name: 'Sexy Ana' }).ok).toBe(false);
  });

  it('pins a short filtered message, and takes it down', () => {
    const room = makeRoom();
    const a = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'pin', text: '  First names only  ' }).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(a.sub.last().room.pinned).toBe('First names only');
    expect(room.hostCommand({ cmd: 'pin', text: 'what the hell' }).ok).toBe(false);
    room.hostCommand({ cmd: 'pin', text: null });
    expect(room.pinned).toBeNull();
  });

  it('a hop goes through the reactions path in the lobby only, rate limited; reactions can be turned off', () => {
    const room = makeRoom();
    const a = join(room, 'Ana');
    expect(room.react(a.id, 'hop', 'player').ok).toBe(true);
    expect(room.react(a.id, 'hop', 'player').ok).toBe(false);
    vi.advanceTimersByTime(2000);
    room.hostCommand({ cmd: 'configure', options: { reactions: false } });
    const off = room.react(a.id, 'wave', 'player');
    expect(!off.ok && off.error.message).toMatch(/turned reactions off/);
    room.hostCommand({ cmd: 'configure', options: { reactions: true } });
    toFirstQuestion(room);
    vi.advanceTimersByTime(2000);
    expect(room.react(a.id, 'hop', 'player').ok).toBe(false);
    // Quiet room and reactions can change mid-game; mode settings cannot.
    expect(room.hostCommand({ cmd: 'configure', options: { quiet: true } }).ok).toBe(true);
    expect(room.hostCommand({ cmd: 'configure', common: { questionTimeSec: 30 } }).ok).toBe(false);
  });

  it('the preview has prompts and no answers', () => {
    const room = makeRoom({ questions: MIXED_SET, common: { questionLimit: 0 } });
    const r = room.hostCommand({ cmd: 'preview' }) as { ok: true; questions: Record<string, unknown>[] };
    expect(r.ok).toBe(true);
    expect(r.questions.length).toBeGreaterThan(2);
    expect(JSON.stringify(r.questions)).not.toMatch(/correct|accepted|Mercury/);
  });
});

describe('room settings', () => {
  it('changing one switch leaves the others as they were (the command carries only what changed)', () => {
    const room = makeRoom({ options: { generatedNames: true, exitTicket: true }, common: { questionTimeSec: 45 } });
    const cmd = hostCommandSchema.parse({ cmd: 'configure', options: { admit: true } });
    expect(room.hostCommand(cmd).ok).toBe(true);
    expect(room.options).toMatchObject({ admit: true, generatedNames: true, exitTicket: true });
    expect(room.hostCommand(hostCommandSchema.parse({ cmd: 'configure', common: { doubleFinal: true } })).ok).toBe(true);
    expect(room.common).toMatchObject({ doubleFinal: true, questionTimeSec: 45 });
  });
});

describe('waiting room and class games', () => {
  it('the host lets each new player in or turns them away', () => {
    const room = makeRoom({ options: { admit: true } });
    const host = sub('host', null);
    room.subscribe(host);
    let token: string | null = null;
    let declined: string | null = null;
    const ask = (name: string) => room.join({ ...guest(name), onAdmitted: (t) => (token = t), onDeclined: (m) => (declined = m) }) as { ok: false; error: { code: string }; pendingId?: string };
    const r = ask('Ana');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('waiting_room');
    expect(room.players.size).toBe(0);
    vi.advanceTimersByTime(50);
    expect(host.last().host.pending).toEqual([{ id: r.pendingId, name: 'Ana' }]);
    expect(room.hostCommand({ cmd: 'admit', playerId: r.pendingId!, allow: true }).ok).toBe(true);
    expect(token).toBeTruthy();
    // Coming back with the token takes the seat.
    expect(room.join({ ...guest('Ana'), reconnectToken: token! }).ok).toBe(true);
    expect(room.players.size).toBe(1);
    const second = ask('Ben');
    room.hostCommand({ cmd: 'admit', playerId: second.pendingId!, allow: false });
    expect(declined).toMatch(/did not let you in/);
    expect(room.players.size).toBe(1);
    // Without a way to wait (an old client), the request is refused rather than slipping in.
    expect(room.join(guest('Cai')).ok).toBe(false);
  });

  it('a class game lets in only that class\'s members', () => {
    const room = makeRoom({ classMembers: ['u-ana'] });
    const outsider = room.join({ name: 'Zed', userId: 'u-zed', accountName: 'Zed', isGuestAccount: false, avatar: null });
    expect(!outsider.ok && outsider.error.code).toBe('class_only');
    expect(room.join(guest('Guest')).ok).toBe(false);
    expect(room.join({ name: 'Ana', userId: 'u-ana', accountName: 'Ana', isGuestAccount: false, avatar: null }).ok).toBe(true);
  });
});

describe('exit ticket, awards and the class summary', () => {
  it('collects how it felt as counts for the host only, never who chose what', () => {
    const room = makeRoom({ options: { exitTicket: true } });
    const host = sub('host', null);
    room.subscribe(host);
    const a = join(room, 'Ana');
    const b = join(room, 'Ben');
    expect(room.playerRequest(a.id, { op: 'feeling', feeling: 'great' }).ok).toBe(false);
    toFirstQuestion(room);
    room.hostCommand({ cmd: 'end' });
    expect(room.playerRequest(a.id, { op: 'feeling', feeling: 'great' }).ok).toBe(true);
    expect(room.playerRequest(b.id, { op: 'feeling', feeling: 'tough' }).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(host.last().host.feelings).toEqual({ great: 1, okay: 0, tough: 1 });
    expect(host.last().results.report.feelings).toEqual({ great: 1, okay: 0, tough: 1 });
    expect(JSON.stringify(host.last())).not.toMatch(/"feeling":"tough"/);
    expect(a.sub.last().me.feeling).toBe('great');
    expect(a.sub.last().results.report).toBeUndefined();
    expect(a.sub.last().host).toBeUndefined();
  });

  it('saves the exit ticket counts and each poll\'s votes with the game, in words, never who chose what', async () => {
    const saved: { results: EngineResults; voice: unknown }[] = [];
    const feelings: { gameId: string; counts: unknown }[] = [];
    const POLL: Question[] = [{ id: 'p1', type: 'poll', prompt: 'Which topic next?', choices: [{ id: 'a', text: 'Volcanoes' }, { id: 'b', text: 'Rivers' }] }, ...TF];
    let room!: Room;
    room = makeRoom({
      options: { exitTicket: true },
      questions: POLL,
      common: { questionLimit: 4 },
      hooks: {
        persist: async (r, results) => {
          saved.push({ results, voice: r.voiceFor(results) });
          return null;
        },
        saveFeelings: async (gameId, counts) => void feelings.push({ gameId, counts }),
      },
    });
    const a = join(room, 'Ana');
    const b = join(room, 'Ben');
    toFirstQuestion(room);
    const sync = (room.runtime!.debugState() as { sync: { iid: string } }).sync;
    expect(room.action(a.id, 'vote-a', { type: 'answer', iid: sync.iid, answer: { type: 'poll', choiceId: 'c0' } }).ok).toBe(true);
    expect(room.action(b.id, 'vote-b', { type: 'answer', iid: sync.iid, answer: { type: 'poll', choiceId: 'c0' } }).ok).toBe(true);
    vi.advanceTimersByTime(100);
    room.hostCommand({ cmd: 'end' });
    await vi.advanceTimersByTimeAsync(10);
    const voice = saved[0]!.voice as { polls: { prompt: string; choices: { text: string; votes: number }[] }[]; feelings: Record<string, number> };
    expect(voice.polls).toHaveLength(1);
    expect(voice.polls[0]!.prompt).toBe('Which topic next?');
    expect(voice.polls[0]!.choices.reduce((n, c) => n + c.votes, 0)).toBe(2);
    expect(voice.polls[0]!.choices.map((c) => c.text)).toEqual(['Volcanoes', 'Rivers']);
    expect(voice.feelings).toEqual({ great: 0, okay: 0, tough: 0 });
    expect(JSON.stringify(voice)).not.toContain('Ana');
    // Exit ticket answers come after the save: they are written onto the same game, once, a moment after the last tap.
    expect(room.playerRequest(a.id, { op: 'feeling', feeling: 'great' }).ok).toBe(true);
    expect(room.playerRequest(b.id, { op: 'feeling', feeling: 'tough' }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(feelings).toEqual([{ gameId: room.gameId, counts: { great: 1, okay: 0, tough: 1 } }]);
  });

  it('works out awards, the report and the missed questions from the answers', () => {
    const ans = (playerId: string, qid: string, correct: boolean, at: number, responseMs = 3000, given: string | null = null) => ({ playerId, qid, correct, partial: correct ? 1 : 0, responseMs, at, given });
    const answers = [
      ans('a', 'q1', true, 1000, 900),
      ans('b', 'q1', false, 1000, 3000, 'Venus'),
      ans('c', 'q1', false, 1000, 3000, 'venus'),
      ans('a', 'q2', true, 2000),
      ans('b', 'q2', false, 2000, 3000, 'Mars'),
      ans('c', 'q2', false, 2000),
      ans('a', 'q3', true, 3000),
      ans('b', 'q3', false, 3000),
      ans('c', 'q3', true, 3000),
      ans('a', 'q4', false, 4000),
      ans('b', 'q4', true, 4000),
      ans('c', 'q4', true, 4000),
      ans('a', 'q5', false, 5000),
      ans('b', 'q5', true, 5000),
      ans('c', 'q5', true, 5000),
      ans('a', 'q6', false, 6000),
      ans('b', 'q6', true, 6000),
      ans('c', 'q6', true, 6000),
    ];
    const standings = [
      { playerId: 'b', name: 'Ben', rank: 1 },
      { playerId: 'c', name: 'Cai', rank: 2 },
      { playerId: 'a', name: 'Ana', rank: 3 },
    ] as EngineResults['standings'];
    const awards = computeAwards({ answers, standings, durationMs: 6000 });
    const by = Object.fromEntries(awards.map((x) => [x.kind, x]));
    expect(by.streak).toMatchObject({ name: 'Cai', detail: '4 right in a row' });
    expect(by.fastest).toMatchObject({ name: 'Ana', detail: 'Right in 0.9 seconds' });
    expect(by.improved).toMatchObject({ name: 'Ben', detail: 'From 0% to 100% right' });
    expect(by.comeback).toMatchObject({ name: 'Ben', detail: 'From 3rd to 1st' });
    const report = hostReport(answers, standings, (q) => `Prompt ${q}`, 0.5, null);
    expect(report.right).toBe(10);
    expect(report.questions[0]).toMatchObject({ qid: 'q1', right: 1, answered: 3, commonWrong: { text: 'Venus', count: 2 } });
    expect(report.needHelp).toEqual([]);
    expect(missedQuestionIds(answers, 3)).toEqual(['q1', 'q2', 'q3']);
  });

  it('a played game carries awards for everyone and the report for the host, and Play the missed questions again has questions', () => {
    const room = makeRoom({ questions: MIXED_SET, common: { questionLimit: 2 } });
    const host = sub('host', null);
    room.subscribe(host);
    const a = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    vi.advanceTimersByTime(4100);
    const sync = (room.runtime!.debugState() as { sync: { iid: string } }).sync;
    const reveal = room.runtime!.debugReveal(sync.iid) as { type: string };
    // A wrong answer of whatever type came up.
    const wrong = reveal.type === 'truefalse' ? { type: 'truefalse', value: !(reveal as unknown as { correct: boolean }).correct } : reveal.type === 'short' ? { type: 'short', text: 'Lyon' } : { type: 'mcq', choiceId: 'zz' };
    room.action(a.id, 'wrong-answer-1', { type: 'answer', iid: sync.iid, answer: wrong });
    room.hostCommand({ cmd: 'end' });
    vi.advanceTimersByTime(50);
    expect(host.last().results.report.questions).toHaveLength(1);
    expect(a.sub.last().results.report).toBeUndefined();
    expect(room.missedQuestions().length).toBe(1);
  });
});

describe('shared hosting features in every mode', () => {
  it('break, names hidden, still answering, add time and the report work (or say they do not apply) in all modes, 3D included', async () => {
    const { MODES } = await import('@ludora/engine');
    const { MIXED_SET: set } = await import('@ludora/engine/testing');
    const questions = [...set, ...set.map((q) => ({ ...q, id: `${q.id}b` })), ...set.map((q) => ({ ...q, id: `${q.id}c` }))];
    for (const mode of MODES) {
      if (mode.meta.pacing === 'solo' || mode.meta.status === 'planned') continue;
      const room = makeRoom({ modeId: mode.meta.id, questions, common: { questionLimit: 0, teamCount: mode.meta.teams === 'required' ? 2 : 0 }, options: { hideNames: true } });
      const host = sub('host', null);
      room.subscribe(host);
      join(room, 'Zelda Quartermaine');
      join(room, 'Yusuf Okonkwo');
      room.hostCommand({ cmd: 'addBots', count: Math.max(0, mode.meta.players.min - 2) });
      const started = room.hostCommand({ cmd: 'start', now: true });
      expect(started.ok, `${mode.meta.id}: ${!started.ok ? started.error.message : ''}`).toBe(true);
      vi.advanceTimersByTime(6000);
      const view = () => {
        vi.advanceTimersByTime(50);
        return host.last();
      };
      const live = view();
      expect(JSON.stringify(live.game ?? null), `${mode.meta.id} big screen shows a name`).not.toMatch(/Zelda Quartermaine|Yusuf Okonkwo/);
      // Still answering: a list in host-paced modes during a question, otherwise null (the panel says it does not apply).
      if (mode.meta.pacing === 'self') expect(live.host.waiting, mode.meta.id).toBeNull();
      const add = room.hostCommand({ cmd: 'addTime', seconds: 10 });
      if (mode.meta.pacing !== 'host') expect(add.ok, mode.meta.id).toBe(false);
      expect(room.hostCommand({ cmd: 'break', seconds: 30 }).ok, mode.meta.id).toBe(true);
      expect(room.status, mode.meta.id).toBe('paused');
      vi.advanceTimersByTime(30_000);
      expect(room.status, mode.meta.id).toBe('running');
      expect(room.hostCommand({ cmd: 'end' }).ok, mode.meta.id).toBe(true);
      const end = view();
      expect(end.results.report, mode.meta.id).toBeTruthy();
      expect(JSON.stringify(end.results), `${mode.meta.id} results show a name`).not.toMatch(/Zelda Quartermaine|Yusuf Okonkwo/);
      room.close('done');
    }
  });
});

describe('extra time where a mode has no clock of each player', () => {
  it('is refused, saying why, where the only clock is shared, and offered where it means something', () => {
    const shared = makeRoom({ modeId: 'gold-rush', questions: MIXED_SET, common: { questionLimit: 0 } });
    const host = sub('host', null);
    shared.subscribe(host);
    const a = join(shared, 'Ana');
    vi.advanceTimersByTime(50);
    expect(host.last().host.extraTimeKind).toEqual({ kind: 'none', what: '' });
    const r = shared.hostCommand({ cmd: 'extraTime', playerId: a.id, share: 0.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/does not apply in Gold Rush/);
    // Taking it away is always allowed.
    expect(shared.hostCommand({ cmd: 'extraTime', playerId: a.id, share: 0 }).ok).toBe(true);
    const rounds = makeRoom();
    const h2 = sub('host', null);
    rounds.subscribe(h2);
    const b = join(rounds, 'Ben');
    expect(rounds.hostCommand({ cmd: 'extraTime', playerId: b.id, share: 0.5 }).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(h2.last().host.extraTimeKind.kind).toBe('rounds');
  });
});

describe('shared classroom devices', () => {
  it('is off by default, and the host can turn it on between games', () => {
    const room = makeRoom();
    expect(room.options.sharedDevices).toBe(false);
    expect(room.hostCommand({ cmd: 'configure', options: { sharedDevices: true } }).ok).toBe(true);
    expect(room.options.sharedDevices).toBe(true);
  });
});

describe('choosing reactions for the bar', () => {
  it('lets a player send only free reactions and those their account owns, on the bar they chose', () => {
    const room = makeRoom();
    const owner = room.join({ name: 'Ana', userId: 'u-ana', accountName: 'Ana', isGuestAccount: false, avatar: null, ownedReactions: ['party', 'not-a-reaction'], reactionBar: ['party', 'wave', 'star'] });
    const guest = room.join({ name: 'Ben', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!owner.ok || !guest.ok) throw new Error('join failed');
    const a = sub('player', owner.player.id);
    const b = sub('player', guest.player.id);
    room.subscribe(a);
    room.subscribe(b);
    vi.advanceTimersByTime(50);
    // Star is not owned, so it is dropped from the bar; party is owned.
    expect(a.last().me.reactions).toEqual(['party', 'wave']);
    expect(a.last().me.canReact).toContain('party');
    expect(b.last().me.reactions).toEqual(['wave', 'laugh', 'wow', 'clap', 'heart', 'fire', 'think', 'gg']);
    expect(room.react(owner.player.id, 'party', 'player').ok).toBe(true);
    vi.advanceTimersByTime(2000);
    const r = room.react(guest.player.id, 'party', 'player');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/not one of yours/);
    expect(room.react(guest.player.id, 'wave', 'player').ok).toBe(true);
    // In the room: a new bar, with anything not theirs left out.
    expect(room.playerRequest(guest.player.id, { op: 'reactionBar', emotes: ['gg', 'party', 'heart'] }).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(b.last().me.reactions).toEqual(['gg', 'heart']);
    expect(room.playerRequest(guest.player.id, { op: 'reactionBar', emotes: ['party'] }).ok).toBe(false);
  });
});
