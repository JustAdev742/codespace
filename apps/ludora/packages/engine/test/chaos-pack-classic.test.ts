import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/* Exact behaviour of the Classic cheat pack. Every bot is kept idle and answers are made by hand, so each test controls who answers what. */

type Opts = { players?: number; settings?: Record<string, unknown>; common?: Record<string, unknown> };

function game(o: Opts = {}) {
  const sim = new ChaosSim({ modeId: 'classic', questions: MIXED_SET, players: o.players ?? 4, seed: 11, settings: o.settings ?? {}, common: o.common ?? {} });
  for (const id of sim.ids) sim.idle.add(id);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();

/** Play on until a question is open with at least 5 seconds left. */
function untilQuestion(sim: ChaosSim) {
  for (let t = 0; t < 120_000; t += 100) {
    const s = st(sim).sync;
    if (s.phase === 'question' && s.deadline - sim.now > 5000) return;
    sim.run(100);
  }
  throw new Error('no question opened');
}

function untilClosed(sim: ChaosSim) {
  for (let t = 0; t < 60_000 && st(sim).sync.phase === 'question'; t += 100) sim.run(100);
}

function right(sim: ChaosSim, id: string) {
  const a = sim.rt.botAction(id, 1, createRng(3));
  expect(a).not.toBeNull();
  expect(sim.rt.act(id, a).ok).toBe(true);
}

function wrong(sim: ChaosSim, id: string) {
  expect(sim.rt.act(id, { type: 'answer', iid: st(sim).sync.iid, answer: { type: 'short', text: 'nope nope' } }).ok).toBe(true);
}

const teamOf = (sim: ChaosSim, id: string) => sim.rt.playerList().find((p) => p.id === id)!.teamId!;

describe('classic pack: streaks', () => {
  it('Streak Swap trades streaks, and refuses equal ones', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.streak-swap', target: 'p2' }).ok).toBe(false);
    right(sim, 'p1');
    expect(sim.cast('p1', { cheatId: 'classic.streak-swap', target: 'p3' }).ok).toBe(true);
    expect(st(sim).sync.streaks).toMatchObject({ p1: 0, p3: 1 });
  });

  it('Cold Streak stops a streak growing while points still count, then wears off', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p2', { cheatId: 'classic.cold-streak', target: 'p1' }).ok).toBe(true);
    right(sim, 'p1');
    expect(st(sim).sync.streaks.p1).toBe(0);
    expect(st(sim).sync.scores.p1).toBeGreaterThan(0);
    sim.run(31_000);
    untilQuestion(sim);
    right(sim, 'p1');
    expect(st(sim).sync.streaks.p1).toBe(1);
  });

  it('Cash In the Streak pays 100 per answer in the streak (times the points scale) and resets it', () => {
    for (const scale of ['1', '2']) {
      const sim = game({ settings: { scale } });
      untilQuestion(sim);
      expect(sim.cast('p1', { cheatId: 'classic.cash-in-streak' })).toMatchObject({ ok: false });
      right(sim, 'p1');
      untilClosed(sim);
      untilQuestion(sim);
      right(sim, 'p1');
      expect(st(sim).sync.streaks.p1).toBe(2);
      const before = st(sim).sync.scores.p1;
      expect(sim.cast('p1', { cheatId: 'classic.cash-in-streak' }).ok).toBe(true);
      expect(st(sim).sync.scores.p1 - before).toBe(200 * Number(scale));
      expect(st(sim).sync.streaks.p1).toBe(0);
    }
  });

  it('streak cheats are not offered when streaks pay nothing (Split the Pot)', () => {
    const sim = game({ settings: { scoring: 'pot' } });
    untilQuestion(sim);
    const r = sim.cast('p1', { cheatId: 'classic.streak-swap', target: 'p2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/does not work here/);
  });
});

describe('classic pack: the question list', () => {
  it('Curtain Call queues the open question as an encore once; Cut the Encore removes it', () => {
    const sim = game({ settings: { encore: true } });
    untilQuestion(sim);
    const s0 = st(sim).sync;
    const len = s0.order.length;
    expect(sim.cast('p1', { cheatId: 'classic.curtain-call' }).ok).toBe(true);
    expect(st(sim).sync.order).toHaveLength(len + 1);
    expect(st(sim).sync.order.at(-1)).toBe(s0.order[s0.round]);
    const again = sim.cast('p2', { cheatId: 'classic.curtain-call' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toMatch(/already coming back/);
    expect(sim.cast('p2', { cheatId: 'classic.cut-the-encore' }).ok).toBe(true);
    expect(st(sim).sync.order).toHaveLength(len);
    expect(sim.cast('p3', { cheatId: 'classic.cut-the-encore' })).toMatchObject({ ok: false });
  });

  it('encore cheats need the Encore rule', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.curtain-call' })).toMatchObject({ ok: false });
  });

  it('Bonus Round Ticket adds an unused question before any encores', () => {
    const sim = game();
    untilQuestion(sim);
    const old = st(sim).sync.order.slice();
    const base = st(sim).baseRounds;
    expect(sim.cast('p1', { cheatId: 'classic.bonus-question' }).ok).toBe(true);
    const now = st(sim).sync.order;
    expect(now).toHaveLength(old.length + 1);
    expect(st(sim).baseRounds).toBe(base + 1);
    expect(old).not.toContain(now[base]);
  });

  it('Scrap the Next Card removes the next question but never the last one left', () => {
    const sim = game({ common: { questionLimit: 3 } });
    untilQuestion(sim);
    const old = st(sim).sync.order.slice();
    expect(sim.cast('p1', { cheatId: 'classic.scrap-question' }).ok).toBe(true);
    expect(st(sim).sync.order).toEqual([old[0], old[2]]);
    expect(st(sim).baseRounds).toBe(2);
    const last = sim.cast('p2', { cheatId: 'classic.scrap-question' });
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.message).toMatch(/last question/);
  });
});

describe('classic pack: knockouts', () => {
  it('Spotlight Immunity keeps a player in once, then the knockout rule applies again', () => {
    const sim = game({ settings: { suddenDeath: true } });
    untilQuestion(sim);
    expect(sim.cast('p2', { cheatId: 'classic.spotlight-immunity', target: 'p1' }).ok).toBe(true);
    for (const id of ['p2', 'p3', 'p4']) right(sim, id);
    untilClosed(sim);
    expect(st(sim).out.p1).toBeUndefined();
    expect(sim.feed.some((f) => /Spotlight Immunity kept them in/.test(f))).toBe(true);
    expect(sim.chaos().effects).toHaveLength(0);
    untilQuestion(sim);
    for (const id of ['p2', 'p3', 'p4']) right(sim, id);
    untilClosed(sim);
    expect(st(sim).out.p1).toBeDefined();
  });

  it('Spotlight Immunity stands aside when everyone else is out too, so it never decides the game', () => {
    const sim = game({ players: 2, settings: { suddenDeath: true } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.spotlight-immunity', target: 'p1' }).ok).toBe(true);
    untilClosed(sim);
    expect(st(sim).out.p1).toBeDefined();
    expect(st(sim).out.p2).toBeDefined();
  });

  it('needs a knockout rule', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'classic.spotlight-immunity', target: 'p1' })).toMatchObject({ ok: false });
  });
});

describe('classic pack: rule options', () => {
  it('Underdog Disguise doubles your points for the open question, only before you answer', () => {
    const a = game({ settings: { comeback: true } });
    untilQuestion(a);
    const caster = a.ids.find((id) => !st(a).boosted.includes(id))!;
    expect(a.cast(caster, { cheatId: 'classic.underdog-disguise' }).ok).toBe(true);
    expect(st(a).boosted).toContain(caster);
    right(a, caster);
    const b = game({ settings: { comeback: true } });
    untilQuestion(b);
    right(b, caster);
    expect(st(a).sync.scores[caster]).toBe(2 * st(b).sync.scores[caster]);
    const late = a.ids.find((id) => id !== caster && !st(a).boosted.includes(id));
    if (late) {
      right(a, late);
      expect(a.cast(late, { cheatId: 'classic.underdog-disguise' })).toMatchObject({ ok: false });
    }
  });

  it('Revoke the Comeback takes a bottom-half player\'s double points away', () => {
    const sim = game({ settings: { comeback: true } });
    untilQuestion(sim);
    // Two players pull ahead, so the other two are in the bottom half for the next question.
    right(sim, 'p1');
    right(sim, 'p3');
    untilClosed(sim);
    untilQuestion(sim);
    expect(st(sim).boosted).toContain('p2');
    expect(sim.cast('p1', { cheatId: 'classic.revoke-comeback', target: 'p2' }).ok).toBe(true);
    expect(st(sim).boosted).not.toContain('p2');
    expect(sim.cast('p3', { cheatId: 'classic.revoke-comeback', target: 'p2' })).toMatchObject({ ok: false });
  });

  it('Ember Collector pays you exactly what the penalty takes from others', () => {
    const sim = game({ settings: { wrongPenalty: 200 } });
    untilQuestion(sim);
    right(sim, 'p2');
    untilClosed(sim);
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.penalty-collector' }).ok).toBe(true);
    const before = { p1: st(sim).sync.scores.p1, p2: st(sim).sync.scores.p2 };
    wrong(sim, 'p2');
    expect(st(sim).sync.scores.p2 - before.p2).toBe(-200);
    expect(st(sim).sync.scores.p1 - before.p1).toBe(200);
  });

  it('Off-Key moves the next unison bonus an enemy team earns to your team', () => {
    const sim = game({ settings: { unisonBonus: 500 }, common: { teamCount: 2 } });
    const mine = teamOf(sim, 'p1');
    const theirs = teamOf(sim, 'p2');
    expect(mine).not.toBe(theirs);
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.off-key', target: theirs }).ok).toBe(true);
    for (const id of sim.ids) if (teamOf(sim, id) === theirs) right(sim, id);
    for (const id of sim.ids) if (teamOf(sim, id) === mine) wrong(sim, id);
    untilClosed(sim);
    expect(st(sim).teamBonus[theirs] ?? 0).toBe(0);
    expect(st(sim).teamBonus[mine]).toBe(500);
  });

  it('Stand-In Singer pays the unison bonus when all but one are right, and not when two miss', () => {
    for (const misses of [1, 2]) {
      const sim = game({ settings: { unisonBonus: 500 }, common: { teamCount: 2 } });
      const team = teamOf(sim, 'p1');
      const mates = sim.ids.filter((id) => teamOf(sim, id) === team);
      untilQuestion(sim);
      expect(sim.cast('p1', { cheatId: 'classic.stand-in-singer' }).ok).toBe(true);
      mates.forEach((id, i) => (i < misses ? wrong(sim, id) : right(sim, id)));
      for (const id of sim.ids) if (!mates.includes(id)) wrong(sim, id);
      untilClosed(sim);
      expect(st(sim).teamBonus[team] ?? 0).toBe(misses === 1 ? 500 : 0);
    }
  });

  it('Double Dip counts your answer twice when the pot is shared', () => {
    const play = (dip: boolean) => {
      const sim = game({ settings: { scoring: 'pot' } });
      untilQuestion(sim);
      if (dip) expect(sim.cast('p1', { cheatId: 'classic.double-dip' }).ok).toBe(true);
      right(sim, 'p1');
      right(sim, 'p2');
      wrong(sim, 'p3');
      wrong(sim, 'p4');
      untilClosed(sim);
      return st(sim).sync;
    };
    expect(play(false).scores).toMatchObject({ p1: 2000, p2: 2000 });
    const s = play(true);
    // A pot of 4,000 shared 2 : 1, rounded to tens.
    expect(s.scores).toMatchObject({ p1: 2670, p2: 1330, p3: 0, p4: 0 });
    expect(s.answers.p1.points).toBe(2670);
    expect(s.lastGain.p2).toBe(1330);
  });
});
