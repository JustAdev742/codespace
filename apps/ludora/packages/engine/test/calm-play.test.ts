import { describe, expect, it } from 'vitest';
import { TUTORIAL_LIMITS, tutorialOf } from '@ludora/shared';
import { MODES, VARIANTS } from '../src/modes/index.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { goBegin, goEnd, goTimer, holdBegin, holdEnd, newTurn, putAway, shelterTimer, shiftClocks, thinking, turnTimerOf, turnView } from '../src/mechanics/oneThing.ts';
import { streamInit, streamSubmit } from '../src/mechanics/selfPaced.ts';
import { defineMode } from '../src/sdk/define.ts';
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { lanternRally } from '../src/modes/lantern-rally/index.ts';
import { CALM as RALLY_CALM, SPEED, BOOST } from '../src/modes/lantern-rally/meta.ts';
import { glowTag } from '../src/modes/glow-tag/index.ts';
import { CALM as TAG_CALM, FLAGS, SCORE } from '../src/modes/glow-tag/meta.ts';
import { bigCatch } from '../src/modes/big-catch/index.ts';
import { CALM as CATCH_CALM } from '../src/modes/big-catch/meta.ts';
import { cornerShop } from '../src/modes/corner-shop/index.ts';
import { CALM as SHOP_CALM } from '../src/modes/corner-shop/meta.ts';
import { drive, TRUE_SET } from './rule-helpers.ts';

/*
 * Calm play (the room's option, `ctx.calm`): one thing at a time.
 *
 * The rule, in the shared mode layer (mechanics/oneThing.ts): while a question is open for a
 * player, their action waits in neutral, where nothing can happen to it and nothing is gained;
 * after they answer it is their go, with no question open. These tests prove the rule for each
 * mode that has an action to steer, aim or time, that it cannot be used to gain an advantage,
 * and that a game without calm play is untouched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const calmModes = MODES.filter((m) => m.meta.calmPlay);

describe('one thing at a time: the shared rule', () => {
  /** A tiny mode built only from the helpers: answer, then a 5 second go, with a 20 second shelter. */
  const tiny = defineMode<any, any, any>({
    meta: { ...lanternRally.meta, id: 'tiny-turns', title: 'Tiny turns' },
    settings: [],
    action: z.object({ type: z.literal('answer'), iid: z.string(), answer: answerSchema }),
    init(ctx) {
      const s: any = { p: {} };
      for (const pl of ctx.players()) {
        s.p[pl.id] = { stream: streamInit(ctx), turn: newTurn(), clockA: 5_000, clockB: 0 };
        if (ctx.calm) holdBegin(s.p[pl.id].turn, pl.id, ctx, 20_000);
      }
      return s;
    },
    onAction(s, id, a, ctx) {
      const me = s.p[id];
      const res = streamSubmit(me.stream, id, a.iid, a.answer, ctx);
      if ('error' in res) return res;
      const from = me.turn.heldAt;
      const held = holdEnd(me.turn, id, ctx);
      if (from !== null) shiftClocks(me, ['clockA', 'clockB'], from, held);
      goBegin(me.turn, id, ctx, 5_000);
      return undefined;
    },
    onTimer(s, timerId, ctx) {
      const t = turnTimerOf(timerId);
      if (!t) return;
      const me = s.p[t.playerId];
      if (t.kind === 'go') {
        goEnd(me.turn, me.stream, t.playerId, ctx);
        holdBegin(me.turn, t.playerId, ctx, 20_000);
      } else {
        putAway(me.stream);
        holdEnd(me.turn, t.playerId, ctx);
        goBegin(me.turn, t.playerId, ctx, 5_000);
      }
    },
    view(s, viewer, ctx) {
      if (viewer.kind !== 'player') return {};
      const me = s.p[viewer.playerId];
      return { question: me.stream.iid ? ctx.questions.view(me.stream.iid) : null, calm: turnView(me.turn, me.stream, ctx), thinking: thinking(ctx, me.stream), clockA: me.clockA, clockB: me.clockB };
    },
    results: (_s, ctx) => ({ standings: ctx.everyone().map((p) => ({ playerId: p.id, score: 0, label: '' })), summary: '' }),
  });

  it('takes turns: a question, then a go with no question, then the next question', () => {
    const g = drive(tiny, { calm: true, questions: TRUE_SET, players: ['a'] });
    expect(g.view('a').calm).toEqual({ phase: 'question', goUntil: null, shelterUntil: 20_000 });
    expect(g.view('a').thinking).toBe(true);
    g.wait(3_000);
    expect(g.answer('a').ok).toBe(true);
    expect(g.view('a').question).toBeNull();
    expect(g.view('a').calm).toEqual({ phase: 'go', goUntil: 8_000, shelterUntil: null });
    g.tick(5_000);
    expect(g.view('a').question).not.toBeNull();
    expect(g.view('a').calm.phase).toBe('question');
    expect(g.errors).toEqual([]);
  });

  it('moves a piece’s own clocks on by the time it waited, and only those still to come', () => {
    const g = drive(tiny, { calm: true, questions: TRUE_SET, players: ['a'] });
    g.wait(3_000);
    g.answer('a');
    // clockA (5 s) was still to come when the wait began, so it moved on by the 3 s wait. clockB (0) had passed.
    expect(g.view('a').clockA).toBe(8_000);
    expect(g.view('a').clockB).toBe(0);
  });

  it('bounds the shelter: an unanswered question is put away, counts for nothing, and the go starts', () => {
    const g = drive(tiny, { calm: true, questions: TRUE_SET, players: ['a', { id: 'b', extra: 0.5 }] });
    g.tick(20_000);
    expect(g.view('a').question).toBeNull();
    expect(g.view('a').calm.phase).toBe('go');
    // A player the host gave extra time keeps their shelter that share longer.
    expect(g.view('b').calm).toEqual({ phase: 'question', goUntil: null, shelterUntil: 30_000 });
    g.rt.end('host');
    const a = g.rt.results!.standings.find((s) => s.playerId === 'a')!;
    expect(a.stats.answered).toBe(0);
    expect(g.errors).toEqual([]);
  });

  it('is off outside calm play: no turn, no timers', () => {
    const g = drive(tiny, { questions: TRUE_SET, players: ['a'] });
    expect(g.view('a').calm).toBeNull();
    expect(g.view('a').thinking).toBe(false);
    expect(g.rt.msUntilNextTimer()).toBeNull();
  });

  it('names its timers so a mode can tell them from its own', () => {
    expect(turnTimerOf(goTimer('p1'))).toEqual({ playerId: 'p1', kind: 'go' });
    expect(turnTimerOf(shelterTimer('p1'))).toEqual({ playerId: 'p1', kind: 'shelter' });
    expect(turnTimerOf('tick')).toBeNull();
  });
});

describe('calm play: which modes take turns', () => {
  it('is the four modes with an action to steer, aim or time', () => {
    expect(calmModes.map((m) => m.meta.id).sort()).toEqual(['big-catch', 'corner-shop', 'glow-tag', 'lantern-rally']);
  });

  for (const mode of calmModes) {
    it(`${mode.meta.title} plays to the end in calm play, through a pause, a disconnect, a late joiner and a leaver`, () => {
      for (const players of [mode.meta.players.min, 6]) {
        const r = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players, seed: 41 + players, calm: true, churn: true, pauseAt: 15_000 });
        expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.leaks).toEqual([]);
        expect(r.results?.endedBy).toBe('mode');
      }
    });
    it(`${mode.meta.title} plays with teams and replays exactly from a seed in calm play`, () => {
      const run = () => simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players: 6, common: { teamCount: 2 }, seed: 17, calm: true });
      const a = run();
      const b = run();
      expect(a.errors).toEqual([]);
      expect(a.stalled).toBe(false);
      expect(a.results?.standings.map((s) => [s.playerId, s.score])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score]));
    });
  }

  for (const variant of VARIANTS.filter((v) => calmModes.some((m) => m.meta.id === v.meta.modeId) && v.meta.status !== 'planned')) {
    it(`variant ${variant.meta.title} plays to the end in calm play`, () => {
      const mode = MODES.find((m) => m.meta.id === variant.meta.modeId)!;
      const r = simulateGame({ modeId: mode.meta.id, variantId: variant.meta.id, questions: MIXED_SET, players: Math.min(5, mode.meta.players.max), seed: 3, calm: true });
      expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    });
  }

  it('changes nothing in any other mode: the same seed gives the same game with calm play on or off', () => {
    for (const mode of MODES.filter((m) => !m.meta.calmPlay && m.meta.status !== 'planned')) {
      const players = Math.min(4, mode.meta.players.max);
      const off = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players, seed: 9 });
      const on = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players, seed: 9, calm: true });
      expect(on.results?.standings.map((s) => [s.playerId, s.score, s.label]), mode.meta.id).toEqual(off.results?.standings.map((s) => [s.playerId, s.score, s.label]));
      expect(on.gameMs, mode.meta.id).toBe(off.gameMs);
    }
  });

  it('shows no turn in a game without calm play', () => {
    for (const mode of calmModes) {
      const g = drive(mode, { questions: TRUE_SET, players: ['a', 'b'] });
      expect(g.view('a').you.calm ?? null, mode.meta.id).toBeNull();
    }
  });
});

describe('Lantern Rally in calm play', () => {
  const start = (o: Parameters<typeof drive>[1] = {}) => {
    const g = drive(lanternRally, { calm: true, questions: TRUE_SET, players: ['a', 'b'], settings: { laps: 6 }, ...o });
    // Off the grid: the lights go out 4 seconds in.
    g.tick(4_000);
    return g;
  };
  const kart = (g: ReturnType<typeof drive>, id: string) => g.state().karts[id];

  it('drives the kart itself while a question is open: cruising speed, nothing hits it, nothing is collected', () => {
    const g = start();
    const d0 = kart(g, 'a').d;
    for (let i = 0; i < 60; i++) g.tick(500);
    const k = kart(g, 'a');
    // 30 seconds at exactly the cruising speed, over puddles, cones and lanterns.
    expect(k.d - d0).toBeCloseTo(SPEED.cruise * 30, 0);
    expect(k.stats).toEqual({ hits: 0, shielded: 0, lanterns: 0, boosts: 0 });
    expect(g.view('a').you.calm).toMatchObject({ phase: 'question', coasting: true });
    expect(g.errors).toEqual([]);
  });

  it('refuses steering and boosting while a question is open, and allows them in the go', () => {
    const g = start();
    expect(g.rt.act('a', { type: 'steer', dir: 1 })).toMatchObject({ ok: false, message: 'Answer your question first. Your kart is driving itself.' });
    expect(g.answer('a').ok).toBe(true);
    expect(g.view('a').you.question).toBeNull();
    expect(g.view('a').you.calm).toMatchObject({ phase: 'go', coasting: false });
    expect(g.rt.act('a', { type: 'steer', dir: 1 }).ok).toBe(true);
    expect(g.rt.act('a', { type: 'boost' }).ok).toBe(true);
    expect(kart(g, 'a').stats.boosts).toBe(1);
  });

  it('opens the next question when the go ends, after a right answer and after a wrong one', () => {
    const g = start();
    g.answer('a', 'right');
    g.answer('b', 'wrong');
    g.tick(RALLY_CALM.goMs - 500);
    expect(g.view('a').you.question).toBeNull();
    expect(g.view('b').you.question).toBeNull();
    g.tick(500);
    expect(g.view('a').you.question).not.toBeNull();
    expect(g.view('b').you.question).not.toBeNull();
    expect(g.view('a').you.calm.phase).toBe('question');
  });

  it('keeps a boost for the driver: it waits while they answer and has as long to run afterwards', () => {
    const g = start();
    g.answer('a');
    g.tick(RALLY_CALM.goMs - 1_000);
    expect(g.rt.act('a', { type: 'boost' }).ok).toBe(true);
    // One second of the three is used, then the next question opens with two seconds of boost left.
    g.tick(1_000);
    expect(g.view('a').you.question).not.toBeNull();
    const dAt = kart(g, 'a').d;
    for (let i = 0; i < 20; i++) g.tick(500);
    expect(kart(g, 'a').d - dAt).toBeCloseTo(SPEED.cruise * 10, 0);
    g.answer('a');
    const left = g.view('a').you.boostUntil - g.state().simAt;
    expect(left).toBeGreaterThan(BOOST.ms - 1_000 - 150);
    expect(left).toBeLessThanOrEqual(BOOST.ms - 1_000 + 50);
  });

  it('cannot be used to gain: a driver who never answers only cruises, and finishes behind one who plays', () => {
    const g = start({ settings: { laps: 2 } });
    let guard = 0;
    while (g.rt.status !== 'ended' && guard++ < 2_000) {
      if (g.view('a').you?.question) g.answer('a', 'right');
      else if (g.view('a').you?.charges > 0 && g.view('a').you?.finished === null) g.rt.act('a', { type: 'boost' });
      g.tick(500);
    }
    const s = g.rt.results!.standings;
    expect(s.find((r) => r.playerId === 'a')!.rank).toBe(1);
    expect(s.find((r) => r.playerId === 'b')!.rank).toBe(2);
    expect(g.state().karts.b.stats).toEqual({ hits: 0, shielded: 0, lanterns: 0, boosts: 0 });
    expect(g.errors).toEqual([]);
  });

  it('tells every screen which karts are driving themselves', () => {
    const g = start();
    g.answer('a');
    g.tick(500);
    const flags = Object.fromEntries((g.rt.pulse() as any).k.map((k: any[]) => [k[0], k[4]]));
    expect(flags.a & 128).toBe(0);
    expect(flags.b & 128).toBe(128);
  });

  it('leaves the questions open on the grid and after the finish, where there is nothing to steer', () => {
    const g = drive(lanternRally, { calm: true, questions: TRUE_SET, players: ['a', 'b'] });
    // On the grid, before the lights: an answer brings the next question at once.
    g.answer('a');
    expect(g.view('a').you.question).not.toBeNull();
    expect(g.view('a').you.calm).toMatchObject({ phase: 'question', coasting: false });
  });
});

describe('Glow Tag in calm play', () => {
  const start = (o: Parameters<typeof drive>[1] = {}) => drive(glowTag, { calm: true, questions: TRUE_SET, players: ['a', 'b'], ...o });
  const me = (g: ReturnType<typeof drive>, id: string) => g.state().g[id];
  /** Put b right in front of a, facing each other, inside the ring. */
  const faceOff = (g: ReturnType<typeof drive>) => {
    const s = g.state();
    // The state is frozen in strict mode, so move the players through a copy the runtime adopts.
    const next = structuredClone(s);
    next.g.a.x = 0;
    next.g.a.z = 0;
    next.g.a.h = 0;
    next.g.b.x = 0;
    next.g.b.z = 6;
    next.g.b.h = Math.PI;
    next.map.cover = [];
    g.rt.debugSetState(next);
  };

  it('hides a player who is answering: they cannot walk or tag, and nobody can tag them', () => {
    const g = start();
    faceOff(g);
    expect(g.view('a').you.calm).toMatchObject({ phase: 'question', shelterUntil: TAG_CALM.shelterMs });
    expect(g.rt.act('a', { type: 'move', x: 1, z: 1, h: 0 })).toMatchObject({ ok: false, message: 'Answer your question first. Nobody can tag you while you think.' });
    // a answers and is in their go with 2 charges; b is still answering.
    expect(g.answer('a').ok).toBe(true);
    expect(g.view('a').you.question).toBeNull();
    expect(g.view('a').you.calm.phase).toBe('go');
    const before = me(g, 'a').charges;
    expect(g.rt.act('a', { type: 'tag', target: 'b' })).toMatchObject({ ok: false, message: 'That player is answering a question, and nobody can be tagged while they think.' });
    // A refused tag costs nothing.
    expect(me(g, 'a').charges).toBe(before);
    expect(me(g, 'b').glow).toBe(3);
    // Every screen is told: b is safe and thinking.
    const flags = Object.fromEntries((g.rt.pulse() as any).p.map((p: any[]) => [p[0], p[4]]));
    expect(flags.b & FLAGS.thinking).toBe(FLAGS.thinking);
    expect(flags.b & FLAGS.safe).toBe(FLAGS.safe);
    expect(flags.a & FLAGS.thinking).toBe(0);
  });

  it('lets a player be tagged in their go, and opens their next question when it ends', () => {
    const g = start();
    faceOff(g);
    g.answer('a');
    g.answer('b');
    expect(g.rt.act('a', { type: 'tag', target: 'b' }).ok).toBe(true);
    expect(me(g, 'b').glow).toBe(2);
    g.tick(TAG_CALM.goMs);
    expect(g.view('a').you.question).not.toBeNull();
    expect(g.view('a').you.calm.phase).toBe('question');
    expect(g.errors).toEqual([]);
  });

  it('bounds the shelter: after 30 seconds the question is put away, uncounted, and the go starts with nothing earned', () => {
    const g = start();
    g.tick(TAG_CALM.shelterMs);
    expect(g.view('a').you.question).toBeNull();
    expect(g.view('a').you.calm.phase).toBe('go');
    expect(me(g, 'a').charges).toBe(0);
    expect(me(g, 'a').stream.answered).toBe(0);
    expect(g.feedTo('a')).toContain('That question is put away for now. It is your go.');
    // And the cycle carries on: the next question opens after the go.
    g.tick(TAG_CALM.goMs);
    expect(g.view('a').you.question).not.toBeNull();
  });

  it('takes no glow from a hidden player outside the ring, nor for a moment after', () => {
    const g = start({ common: { timeLimitSec: 120 } });
    const far = structuredClone(g.state());
    far.g.a.x = far.map.size / 2 - 1;
    far.g.a.z = far.map.size / 2 - 1;
    g.rt.debugSetState(far);
    // b plays on so only a is hidden; run to well after the first shrink (25% of the time) with a never answering.
    for (let t = 0; t < 58_000; t += 1_000) {
      if (g.view('b').you.question && g.view('b').you.in) g.answer('b');
      g.tick(1_000);
      // a's shelter is renewed by the cycle; skip a's goes by answering wrong at once so a stays mostly hidden.
    }
    const a = me(g, 'a');
    // a was hidden for 30 of every 40 seconds and had 4 seconds of grace after each shelter: it lost glow only in its goes.
    expect(a.glow).toBeGreaterThanOrEqual(1);
    expect(a.in).toBe(true);
    expect(g.errors).toEqual([]);
    // The same corner in a game without calm play: the ring dims a player who stands there.
    const plain = drive(glowTag, { questions: TRUE_SET, players: ['a', 'b'], common: { timeLimitSec: 120 } });
    const corner = structuredClone(plain.state());
    corner.g.a.x = corner.map.size / 2 - 1;
    corner.g.a.z = corner.map.size / 2 - 1;
    plain.rt.debugSetState(corner);
    for (let t = 0; t < 58_000; t += 1_000) plain.tick(1_000);
    expect(plain.state().g.a.in).toBe(false);
  });

  it('pays no bonus for still glowing, so hiding can never score', () => {
    const calm = start({ common: { timeLimitSec: 60 } });
    const plain = drive(glowTag, { questions: TRUE_SET, players: ['a', 'b'], common: { timeLimitSec: 60 } });
    for (const g of [calm, plain]) {
      // Keep both players in the middle, inside every ring, doing nothing.
      const s = structuredClone(g.state());
      s.g.a.x = 0;
      s.g.a.z = 0;
      s.g.b.x = 1;
      s.g.b.z = 1;
      g.rt.debugSetState(s);
      let guard = 0;
      while (g.rt.status !== 'ended' && guard++ < 200) g.tick(1_000);
    }
    const score = (g: ReturnType<typeof drive>, id: string) => g.rt.results!.standings.find((s) => s.playerId === id)!.score;
    expect(score(plain, 'a')).toBe(SCORE.finalRing + SCORE.lastGlow);
    expect(score(calm, 'a')).toBe(0);
    expect(score(calm, 'b')).toBe(0);
  });

  it('leaves a dimmed player’s questions open, and starts their go when they relight', () => {
    const g = start();
    faceOff(g);
    g.answer('a');
    g.answer('b');
    // a tags b down to nothing over three goes (a tag every 1.5 s at most, 2 charges an answer).
    let guard = 0;
    while (me(g, 'b').in && guard++ < 200) {
      if (g.view('a').you.question) g.answer('a');
      if (g.view('b').you.question && me(g, 'b').in) g.answer('b', 'wrong');
      g.rt.act('a', { type: 'tag', target: 'b' });
      g.tick(500);
    }
    expect(me(g, 'b').in).toBe(false);
    // Dimmed: a question is open at once and stays open, with no turn.
    expect(g.view('b').you.question).not.toBeNull();
    expect(g.view('b').you.calm).toBeNull();
    g.answer('b');
    expect(g.view('b').you.question).not.toBeNull();
    g.answer('b');
    expect(me(g, 'b').in).toBe(true);
    expect(g.view('b').you.question).toBeNull();
    expect(g.view('b').you.calm.phase).toBe('go');
    expect(g.errors).toEqual([]);
  });
});

describe('Big Catch in calm play', () => {
  const start = () => drive(bigCatch, { calm: true, questions: TRUE_SET, players: ['a', 'b'] });
  const you = (g: ReturnType<typeof drive>, id = 'a') => g.view(id).you;

  it('never shows a question while the line is in the water, and refuses a cast while a question is open', () => {
    const g = start();
    expect(you(g).calm.phase).toBe('question');
    g.answer('a', 'wrong');
    // No cast earned: the next question comes at once.
    expect(you(g).question).not.toBeNull();
    g.answer('a', 'right');
    expect(you(g).casts).toBe(1);
    expect(you(g).question).toBeNull();
    expect(you(g).calm.phase).toBe('go');
    expect(g.rt.act('a', { type: 'cast' }).ok).toBe(true);
    // Waiting for the bite, then the bite itself: still no question.
    g.tick(1_000);
    expect(you(g).question).toBeNull();
    let guard = 0;
    while (you(g).line.phase === 'waiting' && guard++ < 100) g.tick(100);
    expect(you(g).line.phase).toBe('biting');
    expect(you(g).question).toBeNull();
    expect(g.rt.act('a', { type: 'reel' }).ok).toBe(true);
    expect(you(g).line.phase).toBe('landed');
    expect(you(g).question).toBeNull();
    expect(g.rt.act('a', { type: 'sell', seq: you(g).line.seq }).ok).toBe(true);
    // The catch is dealt with and no casts are left: the next question opens.
    expect(you(g).question).not.toBeNull();
    expect(g.rt.act('a', { type: 'cast' })).toMatchObject({ ok: false });
    expect(g.errors).toEqual([]);
  });

  it('brings the question back when a fish gets away', () => {
    const g = start();
    g.answer('a');
    g.rt.act('a', { type: 'cast' });
    // Nobody reels: the bite comes and goes.
    for (let i = 0; i < 20; i++) g.tick(500);
    expect(you(g).line.phase).toBe('idle');
    expect(you(g).question).not.toBeNull();
  });

  it('gives a player who sits on a cast their next question anyway, and keeps the cast', () => {
    const g = start();
    g.answer('a');
    g.tick(CATCH_CALM.idleMs - 100);
    expect(you(g).question).toBeNull();
    g.tick(100);
    expect(you(g).question).not.toBeNull();
    expect(you(g).casts).toBe(1);
    expect(g.rt.act('a', { type: 'cast' })).toMatchObject({ ok: false, message: 'Answer your question first, then cast.' });
    g.answer('a');
    expect(you(g).casts).toBe(2);
    expect(g.rt.act('a', { type: 'cast' }).ok).toBe(true);
  });
});

describe('Corner Shop in calm play', () => {
  const start = () => drive(cornerShop, { calm: true, questions: TRUE_SET, players: ['a', 'b'] });
  const you = (g: ReturnType<typeof drive>, id = 'a') => g.view(id).you;
  const shop = (g: ReturnType<typeof drive>, id = 'a') => g.state().shops[`p:${id}`];

  it('keeps the queue waiting politely while the clerk reads: customers arrive, nobody leaves, no patience is lost', () => {
    const g = start();
    // Two minutes with a question open and nobody at the till.
    for (let i = 0; i < 120; i++) g.tick(1_000);
    const s = shop(g);
    expect(s.left).toBe(0);
    expect(s.queue.length).toBeGreaterThan(0);
    expect(you(g).calm).toMatchObject({ phase: 'question', waiting: true });
    // In a game without calm play the same two minutes lose customers.
    const plain = drive(cornerShop, { questions: TRUE_SET, players: ['a', 'b'] });
    for (let i = 0; i < 120; i++) plain.tick(1_000);
    expect(plain.state().shops['p:a'].left).toBeGreaterThan(0);
    expect(g.errors).toEqual([]);
  });

  it('refuses the till while a question or a delivery is open, then gives the clerk their go', () => {
    const g = start();
    for (let i = 0; i < 30; i++) g.tick(1_000);
    expect(shop(g).queue.length).toBeGreaterThan(0);
    expect(g.rt.act('a', { type: 'serve' })).toMatchObject({ ok: false, message: 'Answer your question first. Your customers will wait.' });
    g.answer('a');
    expect(g.rt.act('a', { type: 'serve' })).toMatchObject({ ok: false, message: 'Pick your delivery first. Your customers will wait.' });
    expect(you(g).calm).toMatchObject({ phase: 'question', waiting: true });
    expect(g.rt.act('a', { type: 'pickDelivery', offer: you(g).offer.seq, index: 0 }).ok).toBe(true);
    // Their go: no question, the queue's clocks carry on from where they stopped.
    expect(you(g).question).toBeNull();
    expect(you(g).calm).toMatchObject({ phase: 'go', waiting: false });
    const first = you(g).queue[0];
    expect(first.leavesAt - g.rt.gameNow()).toBeGreaterThan(first.patienceMs - 50);
    expect(g.rt.act('a', { type: 'serve' }).ok).toBe(true);
    // A customer served straight after the wait tips as if they had not waited at all.
    expect(you(g).sales[0].waitedMs).toBeLessThan(100);
  });

  it('opens the next question when the queue is served, or when the go runs out', () => {
    const g = start();
    for (let i = 0; i < 14; i++) g.tick(1_000);
    g.answer('a');
    g.rt.act('a', { type: 'pickDelivery', offer: you(g).offer.seq, index: 0 });
    let guard = 0;
    while (you(g).queue.length && guard++ < 20) {
      g.rt.act('a', { type: 'serve' });
      g.tick(2_600);
    }
    expect(you(g).question).not.toBeNull();
    // b never serves: their go runs out and the question comes back.
    g.answer('b');
    g.rt.act('b', { type: 'pickDelivery', offer: you(g, 'b').offer.seq, index: 0 });
    if (you(g, 'b').calm.phase === 'go') {
      g.tick(SHOP_CALM.goMs);
      expect(you(g, 'b').question).not.toBeNull();
    }
    expect(g.errors).toEqual([]);
  });

  it('opens the next question at once when nobody is waiting', () => {
    const g = start();
    // Straight away, before the first customer.
    g.answer('a', 'wrong');
    expect(you(g).question).not.toBeNull();
  });
});

describe('the walkthrough every mode gives', () => {
  it('has two to four short steps, written for a phone', () => {
    for (const m of MODES) {
      const t = m.meta.tutorial;
      expect(t, m.meta.id).toBeDefined();
      expect(t!.steps.length, m.meta.id).toBeGreaterThanOrEqual(TUTORIAL_LIMITS.minSteps);
      expect(t!.steps.length, m.meta.id).toBeLessThanOrEqual(TUTORIAL_LIMITS.maxSteps);
      for (const s of t!.steps) {
        expect(s.title.length, `${m.meta.id}: ${s.title}`).toBeLessThanOrEqual(TUTORIAL_LIMITS.titleChars);
        expect(s.text.length, `${m.meta.id}: ${s.text}`).toBeLessThanOrEqual(TUTORIAL_LIMITS.textChars);
        expect(s.text.endsWith('.'), `${m.meta.id}: ${s.text}`).toBe(true);
      }
      expect(t!.controls?.length ?? 0, m.meta.id).toBeLessThanOrEqual(TUTORIAL_LIMITS.controls);
      // What calm play changes is a step of the walkthrough in a calm room, so it is held to the same length.
      if (m.meta.calmPlay) expect(m.meta.calmPlay.length, m.meta.id).toBeLessThanOrEqual(TUTORIAL_LIMITS.textChars);
      expect(tutorialOf(m.meta)).toBe(t);
    }
  });

  it('shows the controls of every mode that has an action besides answering', () => {
    const withActions = MODES.filter((m) => m.meta.stage === '3d' || m.meta.category === 'strategy').map((m) => m.meta.id);
    for (const id of withActions) expect(MODES.find((m) => m.meta.id === id)!.meta.tutorial?.controls?.length, id).toBeGreaterThan(0);
  });

  it('makes steps from the rules of a mode that has none of its own, such as a made game', () => {
    const t = tutorialOf({ rules: ['Answer to roll the dice. Then move.', 'Most coins wins.', 'Third.', 'Fourth.'] });
    expect(t.steps.map((s) => s.text)).toEqual(['Answer to roll the dice.', 'Most coins wins.', 'Third.']);
    expect(tutorialOf({ rules: ['Only one rule.'] }).steps).toHaveLength(2);
  });
});
