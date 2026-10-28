import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { commonSettingsSchema } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { defineMode } from '../src/sdk/define.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { classic } from '../src/modes/classic/index.ts';
import { parseSettings } from '../src/sdk/settings.ts';

const common = commonSettingsSchema.parse({});

function fakeClock(start = 1000) {
  const c = { t: start, now: () => c.t };
  return c;
}

/** A tiny mode for exercising the runtime: count clicks, explode on request. */
const counter = defineMode<{ n: Record<string, number>; ticks: number }, Record<string, never>, { type: 'click' } | { type: 'boom' } | { type: 'bad' }>({
  meta: { ...classic.meta, id: 'counter', title: 'Counter' },
  settings: [],
  action: z.discriminatedUnion('type', [z.object({ type: z.literal('click') }), z.object({ type: z.literal('boom') }), z.object({ type: z.literal('bad') })]),
  init(ctx) {
    ctx.setTimer('tick', ctx.now() + 1000);
    return { n: {}, ticks: 0 };
  },
  onAction(s, pid, a, ctx) {
    s.n[pid] = (s.n[pid] ?? 0) + 1;
    if (a.type === 'boom') throw new Error('kaboom');
    if (a.type === 'bad') return { error: 'not like that' };
    ctx.feed(`click ${pid}`);
  },
  onTimer(s, id, ctx) {
    if (id === 'tick') {
      s.ticks++;
      if (s.ticks < 5) ctx.setTimer('tick', ctx.now() + 1000);
      else ctx.endGame('ticked out');
    }
  },
  view(s, viewer) {
    return { n: viewer.kind === 'player' ? (s.n[viewer.playerId] ?? 0) : s.n, ticks: s.ticks };
  },
  results(s, ctx) {
    return { standings: ctx.players().map((p) => ({ playerId: p.id, score: s.n[p.id] ?? 0, label: String(s.n[p.id] ?? 0) })), summary: 'done' };
  },
});

function makeRuntime(clock = fakeClock(), errors: unknown[] = []) {
  return new GameRuntime({
    mode: counter,
    settings: {},
    common,
    questions: MIXED_SET,
    players: [
      { id: 'a', name: 'A', teamId: null, isBot: false },
      { id: 'b', name: 'B', teamId: null, isBot: false },
    ],
    teams: [],
    seed: 1,
    clock,
    strict: true,
    listener: { error: (e) => errors.push(e) },
  });
}

describe('GameRuntime', () => {
  it('commits accepted actions and bumps the version', () => {
    const rt = makeRuntime();
    rt.start();
    const v = rt.version;
    expect(rt.act('a', { type: 'click' })).toEqual({ ok: true });
    expect(rt.view({ kind: 'player', playerId: 'a' })).toMatchObject({ n: 1 });
    expect(rt.version).toBeGreaterThan(v);
  });

  it('rolls back state when an action is rejected', () => {
    const rt = makeRuntime();
    rt.start();
    const r = rt.act('a', { type: 'bad' });
    expect(r).toMatchObject({ ok: false, code: 'rejected', message: 'not like that' });
    expect(rt.view({ kind: 'player', playerId: 'a' })).toMatchObject({ n: 0 });
  });

  it('rejects actions that fail the schema and players not in the game', () => {
    const rt = makeRuntime();
    rt.start();
    expect(rt.act('a', { type: 'hack' }).ok).toBe(false);
    expect(rt.act('zed', { type: 'click' }).ok).toBe(false);
  });

  it('isolates mode errors: rolls back, then stops the game after three, keeping results', () => {
    const errors: unknown[] = [];
    const rt = makeRuntime(fakeClock(), errors);
    rt.start();
    rt.act('a', { type: 'click' });
    expect(rt.act('a', { type: 'boom' })).toMatchObject({ ok: false, code: 'internal' });
    expect(rt.view({ kind: 'player', playerId: 'a' })).toMatchObject({ n: 1 });
    expect(rt.status).toBe('running');
    rt.act('a', { type: 'boom' });
    rt.act('a', { type: 'boom' });
    expect(rt.status).toBe('ended');
    expect(rt.results?.endedBy).toBe('error');
    expect(rt.results?.standings.find((s) => s.playerId === 'a')?.score).toBe(1);
    expect(errors).toHaveLength(3);
  });

  it('fires timers in game time and stops the clock while paused', () => {
    const clock = fakeClock();
    const rt = makeRuntime(clock);
    rt.start();
    clock.t += 1000;
    rt.fireDueTimers();
    expect(rt.view({ kind: 'host' })).toMatchObject({ ticks: 1 });
    rt.pause();
    clock.t += 10_000;
    expect(rt.gameNow()).toBe(1000);
    expect(rt.msUntilNextTimer()).toBeNull();
    rt.fireDueTimers();
    expect(rt.view({ kind: 'host' })).toMatchObject({ ticks: 1 });
    expect(rt.act('a', { type: 'click' })).toMatchObject({ ok: false, code: 'invalid_state' });
    rt.resume();
    expect(rt.msUntilNextTimer()).toBe(1000);
    for (let i = 0; i < 4; i++) {
      clock.t += 1000;
      rt.fireDueTimers();
    }
    expect(rt.status).toBe('ended');
    expect(rt.results?.summary).toBe('ticked out');
  });

  it('sends feed lines only for committed actions', () => {
    const lines: string[] = [];
    const rt = new GameRuntime({
      mode: counter, settings: {}, common, questions: MIXED_SET, teams: [], seed: 1, clock: fakeClock(),
      players: [{ id: 'a', name: 'A', teamId: null, isBot: false }],
      listener: { feed: (f) => lines.push(f.text) },
    });
    rt.start();
    rt.act('a', { type: 'click' });
    rt.act('a', { type: 'bad' });
    expect(lines).toEqual(['click a']);
  });

  it('keeps players who leave in the results', () => {
    const rt = makeRuntime();
    rt.start();
    rt.act('b', { type: 'click' });
    rt.removePlayer('b');
    const res = rt.end('host');
    const b = res?.standings.find((s) => s.playerId === 'b');
    expect(b?.left).toBe(true);
  });

  it('ranks ties together', () => {
    const rt = makeRuntime();
    rt.start();
    rt.act('a', { type: 'click' });
    rt.act('b', { type: 'click' });
    const res = rt.end('host')!;
    expect(res.standings.map((s) => s.rank)).toEqual([1, 1]);
  });
});

describe('Classic scoring and anti-cheat', () => {
  function classicGame(clock = fakeClock()) {
    const rt = new GameRuntime({
      mode: classic,
      settings: parseSettings(classic.settings, {}),
      common: { ...common, questionTimeSec: 20, shuffleQuestions: false },
      questions: MIXED_SET.filter((q) => q.type === 'mcq'),
      players: [
        { id: 'a', name: 'A', teamId: null, isBot: false },
        { id: 'b', name: 'B', teamId: null, isBot: false },
      ],
      teams: [],
      seed: 9,
      clock,
      strict: true,
    });
    rt.start();
    clock.t += 4000;
    rt.fireDueTimers();
    return rt;
  }

  it('hides correctness until the reveal and refuses double answers', () => {
    const clock = fakeClock();
    const rt = classicGame(clock);
    const v = rt.view({ kind: 'player', playerId: 'a' }) as any;
    expect(v.sync.phase).toBe('question');
    const iid = v.sync.question.iid;
    const choice = v.sync.question.q.choices[0].id;
    expect(rt.act('a', { type: 'answer', iid, answer: { type: 'mcq', choiceId: choice } }).ok).toBe(true);
    const after = rt.view({ kind: 'player', playerId: 'a' }) as any;
    expect(after.sync.you.answered).toBe(true);
    expect(after.sync.you.correct).toBeNull();
    expect(after.sync.reveal).toBeNull();
    expect(rt.act('a', { type: 'answer', iid, answer: { type: 'mcq', choiceId: choice } })).toMatchObject({ ok: false });
  });

  it('closes the round when everyone has answered, then reveals', () => {
    const rt = classicGame();
    const v = rt.view({ kind: 'player', playerId: 'a' }) as any;
    const iid = v.sync.question.iid;
    const c = v.sync.question.q.choices[0].id;
    rt.act('a', { type: 'answer', iid, answer: { type: 'mcq', choiceId: c } });
    rt.act('b', { type: 'answer', iid, answer: { type: 'mcq', choiceId: c } });
    const after = rt.view({ kind: 'player', playerId: 'a' }) as any;
    expect(after.sync.phase).toBe('reveal');
    expect(after.sync.reveal).not.toBeNull();
    expect(after.sync.distribution[c]).toBe(2);
  });

  it('refuses answers after the deadline', () => {
    const clock = fakeClock();
    const rt = classicGame(clock);
    const v = rt.view({ kind: 'player', playerId: 'a' }) as any;
    clock.t += 20_000 + 700;
    expect(rt.act('a', { type: 'answer', iid: v.sync.question.iid, answer: { type: 'mcq', choiceId: 'c0' } }).ok).toBe(false);
  });

  it('pays more for faster correct answers', async () => {
    const { classicPoints } = await import('../src/modes/classic/index.ts');
    const opts = { speedBonus: true, streakBonus: true, scale: 1 };
    const fast = classicPoints({ correct: true, partial: 1, responseMs: 1000, limitMs: 20_000, streak: 1 }, opts);
    const slow = classicPoints({ correct: true, partial: 1, responseMs: 19_000, limitMs: 20_000, streak: 1 }, opts);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeLessThanOrEqual(1000);
    expect(classicPoints({ correct: false, partial: 0, responseMs: 1, limitMs: 20_000, streak: 0 }, opts)).toBe(0);
  });
});

/** A mode where walking is quiet: it changes the state but only asks for a pulse. */
const walker = defineMode<{ at: Record<string, number> }, Record<string, never>, { type: 'walk'; x: number } | { type: 'shout' }>({
  meta: { ...classic.meta, id: 'walker', title: 'Walker' },
  settings: [],
  action: z.discriminatedUnion('type', [z.object({ type: z.literal('walk'), x: z.number() }), z.object({ type: z.literal('shout') })]),
  init: () => ({ at: {} }),
  onAction(s, pid, a, ctx) {
    if (a.type === 'shout') {
      ctx.feed(`${pid} shouts`);
      return { quiet: true };
    }
    s.at[pid] = a.x;
    return { quiet: true };
  },
  view: (s) => ({ at: s.at }),
  pulse: (s) => Object.entries(s.at).map(([id, x]) => [id, x]),
  results: (_s, ctx) => ({ standings: ctx.players().map((p) => ({ playerId: p.id, score: 0, label: '' })), summary: 'done' }),
});

describe('quiet actions and pulses', () => {
  function walkerRuntime() {
    const calls = { changed: 0, pulsed: 0 };
    const rt = new GameRuntime({
      mode: walker,
      settings: {},
      common,
      questions: MIXED_SET,
      players: [{ id: 'a', name: 'A', teamId: null, isBot: false }],
      teams: [],
      seed: 1,
      clock: fakeClock(),
      strict: true,
      listener: { changed: () => calls.changed++, pulsed: () => calls.pulsed++ },
    });
    rt.start();
    calls.changed = 0;
    return { rt, calls };
  }

  it('keeps a quiet change and asks only for a pulse', () => {
    const { rt, calls } = walkerRuntime();
    const v = rt.version;
    expect(rt.act('a', { type: 'walk', x: 3 })).toEqual({ ok: true });
    expect(calls).toEqual({ changed: 0, pulsed: 1 });
    expect(rt.version).toBeGreaterThan(v);
    expect(rt.pulse()).toEqual([['a', 3]]);
    expect(rt.view({ kind: 'player', playerId: 'a' })).toEqual({ at: { a: 3 } });
  });

  it('treats a quiet action that also made news as a full change', () => {
    const { rt, calls } = walkerRuntime();
    rt.act('a', { type: 'shout' });
    expect(calls).toEqual({ changed: 1, pulsed: 0 });
  });

  it('has no pulse for modes without one', () => {
    const rt = makeRuntime();
    rt.start();
    expect(rt.pulse()).toBeNull();
  });
});
