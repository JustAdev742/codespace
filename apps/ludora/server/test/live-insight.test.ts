import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roomOptionsSchema, type Question } from '@ludora/shared';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';
import { liveInsight, LOW_AFTER, RUN_TO_FLAG, type LiveAnswer } from '../src/modules/analytics/live.ts';

/*
 * Insight while a game is still being played (modules/analytics/live.ts): what it says, what it
 * leaves out (the question still open, practice bots), and who is sent it (the teacher's remote and
 * nobody else: not the big screen, not a player).
 */

const people = [
  { id: 'a', name: 'Ana', isBot: false },
  { id: 'b', name: 'Ben', isBot: false },
  { id: 'c', name: 'Cal', isBot: false },
  { id: 'bot', name: 'Bolt', isBot: true },
];
const ans = (playerId: string, qid: string, correct: boolean, given: string | null = null, kind = 'answer'): LiveAnswer => ({ playerId, qid, correct, responseMs: 2000, kind, given });
const promptOf = (qid: string) => `Prompt of ${qid}`;

describe('what the insight says', () => {
  it('counts the class on first tries, and leaves a practice bot out', () => {
    const i = liveInsight({ answers: [ans('a', 'q1', true), ans('b', 'q1', false, 'Venus'), ans('bot', 'q1', false, 'Venus'), ans('b', 'q1', true, 'Mars', 'attempt')], openQid: null, players: people, promptOf });
    expect(i.answered).toBe(2);
    expect(i.right).toBe(1);
  });

  it('names the wrong answer most of the class gave on the latest question where one was shared', () => {
    const answers = [
      ans('a', 'q1', false, 'Venus'), ans('b', 'q1', false, 'venus'), ans('c', 'q1', true, 'Mars'),
      ans('a', 'q2', true), ans('b', 'q2', true), ans('c', 'q2', false, 'Helium'),
    ];
    const i = liveInsight({ answers, openQid: null, players: people, promptOf });
    expect(i.talkAbout).toEqual({ questionId: 'q1', prompt: 'Prompt of q1', players: 3, right: 1, commonWrong: { text: 'Venus', count: 2 } });
    // Hardest first, and only questions somebody got wrong.
    expect(i.hardest.map((q) => q.questionId)).toEqual(['q1', 'q2']);
  });

  it('says nothing at all about the question still open', () => {
    const answers = [ans('a', 'q1', true), ans('b', 'q1', true), ans('a', 'q2', false, 'Venus'), ans('b', 'q2', false, 'Venus')];
    const open = liveInsight({ answers, openQid: 'q2', players: people, promptOf });
    expect(open.answered).toBe(2);
    expect(open.right).toBe(2);
    expect(open.talkAbout).toBeNull();
    expect(open.hardest).toEqual([]);
    expect(JSON.stringify(open)).not.toContain('Venus');
    // Once it has closed, it is there.
    expect(liveInsight({ answers, openQid: null, players: people, promptOf }).talkAbout?.questionId).toBe('q2');
  });

  it('suggests checking in with someone after three wrong in a row, or under half right', () => {
    const run = Array.from({ length: RUN_TO_FLAG }, (_, k) => ans('a', `q${k}`, false));
    const low = [ans('b', 'q0', true), ans('b', 'q1', false), ans('b', 'q2', false), ans('b', 'q3', true), ans('b', 'q4', false)];
    const fine = [ans('c', 'q0', true), ans('c', 'q1', false), ans('c', 'q2', true)];
    const i = liveInsight({ answers: [...run, ...low, ...fine], openQid: null, players: people, promptOf });
    expect(i.checkIn.map((p) => [p.name, p.reason])).toEqual([
      ['Ana', 'run'],
      ['Ben', 'low'],
    ]);
    expect(i.checkIn[0]).toMatchObject({ answered: 3, correct: 0, wrongRun: 3 });
    expect(LOW_AFTER).toBeGreaterThan(RUN_TO_FLAG);
  });

  it('a right answer ends a run, and one bad start is not a reason', () => {
    const i = liveInsight({ answers: [ans('a', 'q0', false), ans('a', 'q1', false), ans('a', 'q2', true)], openQid: null, players: people, promptOf });
    expect(i.checkIn).toEqual([]);
  });

  it('never repeats language the name filter stops, as a report never does', () => {
    const i = liveInsight({ answers: [ans('a', 'q1', false, 'shit'), ans('b', 'q1', false, 'shit')], openQid: null, players: people, promptOf });
    expect(i.talkAbout).toBeNull();
    expect(JSON.stringify(i)).not.toContain('shit');
  });
});

/* -------------------------------- in a room -------------------------------- */

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

function makeRoom() {
  const r = new Room(
    {
      code: '654321',
      hostUserId: 'host-user',
      hostName: 'Ms Host',
      modeId: 'classic',
      variantId: null,
      settings: { autoAdvance: false },
      common: { shuffleQuestions: false, questionLimit: 3 },
      options: roomOptionsSchema.parse({ tutorial: false }),
      set: { id: null, title: 'Facts', questions: TF },
      solo: false,
    },
    { now: () => Date.now(), persist: async () => null, onError: () => {}, onClosed: () => {} },
  );
  rooms.push(r);
  return r;
}

function sub(role: 'host' | 'player', playerId: string | null, id: string, remote = false) {
  const events: [string, any][] = [];
  const s: RoomSubscriber & { last: () => any } = { id, role, playerId, remote, emit: (e, p) => void events.push([e, p]), last: () => [...events].reverse().find(([e]) => e === 'room:view')?.[1] };
  return s;
}

function join(room: Room, name: string) {
  const r = room.join({ name, userId: null, accountName: null, isGuestAccount: true, avatar: null });
  if (!r.ok) throw new Error(r.error.message);
  const s = sub('player', r.player.id, `p-${r.player.id}`);
  room.subscribe(s);
  return { id: r.player.id, sub: s };
}

function answer(room: Room, playerId: string, right: boolean) {
  const sync = (room.runtime!.debugState() as { sync: { iid: string } }).sync;
  const reveal = room.runtime!.debugReveal(sync.iid) as { correct: boolean };
  return room.action(playerId, `act-${playerId}-${Math.random().toString(36).slice(2, 10)}`, { type: 'answer', iid: sync.iid, answer: { type: 'truefalse', value: right ? reveal.correct : !reveal.correct } });
}

describe('who is sent it', () => {
  it("the teacher's remote, once a question has closed; never the big screen or a player, and never the open question", () => {
    const room = makeRoom();
    const board = sub('host', null, 'board');
    const remote = sub('host', null, 'remote', true);
    room.subscribe(board);
    room.subscribe(remote);
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    const cal = join(room, 'Cal');
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    vi.advanceTimersByTime(4100);
    expect((room.runtime!.debugState() as { sync: { phase: string } }).sync.phase).toBe('question');

    // Two answers in, one to come: the question is open, and the insight has nothing in it yet.
    expect(answer(room, ana.id, false).ok).toBe(true);
    expect(answer(room, ben.id, false).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect(remote.last().host.insight).toMatchObject({ answered: 0, right: 0, talkAbout: null, checkIn: [] });
    expect(board.last().host.insight).toBeUndefined();
    expect(ana.sub.last().host).toBeUndefined();

    // The last answer closes it: now the remote knows two of three gave the same wrong answer.
    expect(answer(room, cal.id, true).ok).toBe(true);
    vi.advanceTimersByTime(50);
    expect((room.runtime!.debugState() as { sync: { phase: string } }).sync.phase).toBe('reveal');
    const insight = remote.last().host.insight;
    expect(insight).toMatchObject({ answered: 3, right: 1 });
    expect(insight.talkAbout).toMatchObject({ prompt: 'Bats are mammals.', players: 3, right: 1, commonWrong: { text: 'False', count: 2 } });
    expect(board.last().host.insight).toBeUndefined();
    expect(JSON.stringify(ana.sub.last())).not.toContain('insight');
  });
});
