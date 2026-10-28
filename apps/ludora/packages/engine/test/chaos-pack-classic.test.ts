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

describe('classic pack: the clock', () => {
  /** `id` answers right `afterMs` into the open question; returns the points the answer scored. */
  function answerAfter(sim: ChaosSim, afterMs: number, id = 'p1') {
    const s = st(sim).sync;
    sim.run(Math.max(0, s.startedAt + afterMs - sim.now));
    right(sim, id);
    return st(sim).sync.answers[id].points as number;
  }

  it('Stopped Clock gives your answer the whole speed bonus, once, and only before you answer', () => {
    for (const scale of ['1', '2']) {
      const a = game({ settings: { scale } });
      untilQuestion(a);
      expect(a.cast('p1', { cheatId: 'classic.stopped-clock' }).ok).toBe(true);
      const b = game({ settings: { scale } });
      untilQuestion(b);
      const boosted = answerAfter(a, 6000);
      const plain = answerAfter(b, 6000);
      // 500 for being right and all 500 for speed, against 500 + 500 * (1 - 6/20) = 850.
      expect(boosted).toBe(1000 * Number(scale));
      expect(plain).toBe(850 * Number(scale));
      expect(st(a).sync.scores.p1).toBe(1000 * Number(scale));
      expect(a.chaos().effects).toHaveLength(0);
    }
    const sim = game();
    untilQuestion(sim);
    right(sim, 'p1');
    expect(sim.cast('p1', { cheatId: 'classic.stopped-clock' })).toMatchObject({ ok: false });
  });

  it('Stopped Clock and Tortoise Round are not offered without the speed bonus, in Split the Pot or in Fading Lights', () => {
    for (const settings of [{ speedBonus: false }, { scoring: 'pot' }, { knockout: true }]) {
      const sim = game({ settings });
      untilQuestion(sim);
      for (const cheatId of ['classic.stopped-clock', 'classic.tortoise-round']) {
        const r = sim.cast('p1', { cheatId });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.message).toMatch(/does not work here/);
      }
    }
  });

  it('Tortoise Round runs the speed bonus backwards for everyone on that question only', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p3', { cheatId: 'classic.tortoise-round' }).ok).toBe(true);
    // Answers 2 and 16 seconds into a 20-second question: the speed share becomes 0.1 and 0.8.
    expect(answerAfter(sim, 2000, 'p1')).toBe(550);
    expect(answerAfter(sim, 16_000, 'p2')).toBe(900);
    untilClosed(sim);
    // It checks four times a second whether its question is over.
    sim.run(300);
    expect(sim.chaos().effects).toHaveLength(0);
    untilQuestion(sim);
    // Back to normal: 500 + 500 * (1 - 2/20), plus the 50 streak bonus for a second right answer in a row.
    expect(answerAfter(sim, 2000, 'p1')).toBe(1000);
  });

  it('Tortoise Round must be cast before anyone answers the open question', () => {
    const sim = game();
    untilQuestion(sim);
    right(sim, 'p1');
    const r = sim.cast('p2', { cheatId: 'classic.tortoise-round' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/already answered/);
  });
});

describe('classic pack: Fresh Card Deal and Sneak Preview', () => {
  it('Fresh Card Deal swaps the open question for an unused one with a fresh clock', () => {
    const sim = game();
    untilQuestion(sim);
    sim.run(4000);
    const before = st(sim).sync;
    const old = before.order.slice();
    expect(sim.cast('p1', { cheatId: 'classic.fresh-deal' }).ok).toBe(true);
    const after = st(sim).sync;
    expect(after.order).toHaveLength(old.length);
    expect(old).not.toContain(after.order[after.round]);
    expect(after.order.filter((_q: string, i: number) => i !== after.round)).toEqual(old.filter((_q: string, i: number) => i !== before.round));
    expect(after.iid).not.toBe(before.iid);
    expect(after.startedAt).toBe(sim.now);
    expect(after.deadline - after.startedAt).toBe(20_000);
    right(sim, 'p1');
    expect(sim.cast('p2', { cheatId: 'classic.fresh-deal' })).toMatchObject({ ok: false });
  });

  it('Fresh Card Deal refuses once anyone has answered', () => {
    const sim = game();
    untilQuestion(sim);
    wrong(sim, 'p2');
    const r = sim.cast('p1', { cheatId: 'classic.fresh-deal' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/already answered/);
  });

  it('Sneak Preview shows the next question\'s words to the caster until that question opens', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.sneak-preview' }).ok).toBe(true);
    const s = st(sim).sync;
    const banner = sim.view('p1').overlays.find((o) => o.kind === 'banner');
    expect(banner?.text).toBe(`Coming up next: ${MIXED_SET.find((q) => q.id === s.order[s.round + 1])!.prompt}`);
    expect(sim.view('p2').overlays).toEqual([]);
    untilClosed(sim);
    sim.run(300);
    expect(sim.chaos().effects).toHaveLength(1);
    untilQuestion(sim);
    sim.run(300);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Sneak Preview goes away if the next question is scrapped', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.sneak-preview' }).ok).toBe(true);
    expect(sim.cast('p2', { cheatId: 'classic.scrap-question' }).ok).toBe(true);
    sim.run(500);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Sneak Preview refuses on the last question', () => {
    const sim = game({ common: { questionLimit: 3 } });
    for (let q = 0; q < 3; q++) {
      untilQuestion(sim);
      if (q < 2) untilClosed(sim);
    }
    expect(sim.cast('p1', { cheatId: 'classic.sneak-preview' })).toMatchObject({ ok: false });
  });
});

describe('classic pack: Reprieve Bell and Rollover Pot', () => {
  it('Reprieve Bell keeps everyone in for one question, then the knockout rule is back', () => {
    const sim = game({ settings: { suddenDeath: true } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.reprieve-bell' }).ok).toBe(true);
    right(sim, 'p1');
    wrong(sim, 'p3');
    untilClosed(sim);
    expect(st(sim).out).toEqual({});
    expect(sim.feed.some((f) => /reprieve bell rang: Bot 2, Bot 3, Bot 4 stay in/.test(f))).toBe(true);
    expect(sim.chaos().effects).toHaveLength(0);
    untilQuestion(sim);
    right(sim, 'p1');
    right(sim, 'p2');
    untilClosed(sim);
    expect(Object.keys(st(sim).out).sort()).toEqual(['p3', 'p4']);
  });

  it('Reprieve Bell needs a knockout rule', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'classic.reprieve-bell' })).toMatchObject({ ok: false });
  });

  it('Rollover Pot carries an unclaimed pot to the next question\'s winners', () => {
    const play = (roll: boolean) => {
      const sim = game({ settings: { scoring: 'pot' } });
      untilQuestion(sim);
      if (roll) expect(sim.cast('p1', { cheatId: 'classic.rollover' }).ok).toBe(true);
      wrong(sim, 'p1');
      untilClosed(sim);
      untilQuestion(sim);
      right(sim, 'p1');
      right(sim, 'p2');
      untilClosed(sim);
      return sim;
    };
    expect(st(play(false)).sync.scores).toMatchObject({ p1: 2000, p2: 2000 });
    const sim = play(true);
    // The pot of 4,000 nobody won is shared on top of the next pot of 4,000.
    expect(st(sim).sync.scores).toMatchObject({ p1: 4000, p2: 4000, p3: 0, p4: 0 });
    expect(st(sim).sync.answers.p1.points).toBe(4000);
    expect(st(sim).sync.lastGain.p2).toBe(4000);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Rollover Pot ends without paying anything when someone wins the first pot', () => {
    const sim = game({ settings: { scoring: 'pot' } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.rollover' }).ok).toBe(true);
    right(sim, 'p2');
    untilClosed(sim);
    expect(st(sim).sync.scores.p2).toBe(4000);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Rollover Pot is only offered in Split the Pot', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.rollover' })).toMatchObject({ ok: false });
  });
});

describe('classic pack: wagers', () => {
  /** p1 answers one question right, then the next question opens. */
  function withPoints(o: Opts = {}) {
    const sim = game(o);
    untilQuestion(sim);
    right(sim, 'p1');
    untilClosed(sim);
    untilQuestion(sim);
    return sim;
  }

  it('Back Yourself wins a fifth of your points for a right answer and loses it for a wrong or missing one', () => {
    for (const outcome of ['right', 'wrong', 'none'] as const) {
      const sim = withPoints();
      const before = st(sim).sync.scores.p1;
      expect(sim.cast('p1', { cheatId: 'classic.back-yourself' }).ok).toBe(true);
      if (outcome === 'right') right(sim, 'p1');
      if (outcome === 'wrong') wrong(sim, 'p1');
      const answered = st(sim).sync.answers.p1?.points ?? 0;
      untilClosed(sim);
      const stake = Math.round(before / 5);
      expect(st(sim).sync.scores.p1).toBe(before + answered + (outcome === 'right' ? stake : -stake));
      expect(sim.chaos().effects).toHaveLength(0);
    }
  });

  it('Back Yourself needs points and must come before your answer', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.back-yourself' })).toMatchObject({ ok: false });
    const rich = withPoints();
    right(rich, 'p1');
    expect(rich.cast('p1', { cheatId: 'classic.back-yourself' })).toMatchObject({ ok: false });
  });

  it('Sizzling Answers costs 200 points (times the scale) for each wrong answer, and nothing for no answer', () => {
    for (const scale of ['1', '2']) {
      const sim = withPoints({ settings: { scale } });
      const before = st(sim).sync.scores.p1;
      expect(sim.cast('p2', { cheatId: 'classic.sizzling-answers', target: 'p1' }).ok).toBe(true);
      wrong(sim, 'p1');
      untilClosed(sim);
      expect(st(sim).sync.scores.p1).toBe(before - 200 * Number(scale));
      untilQuestion(sim);
      untilClosed(sim);
      expect(st(sim).sync.scores.p1).toBe(before - 200 * Number(scale));
    }
  });

  it('Sizzling Answers never takes a score below 0, and leaves right answers alone', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p2', { cheatId: 'classic.sizzling-answers', target: 'p1' }).ok).toBe(true);
    expect(sim.cast('p2', { cheatId: 'classic.sizzling-answers', target: 'p3' })).toMatchObject({ ok: false });
    expect(sim.cast('p4', { cheatId: 'classic.sizzling-answers', target: 'p3' }).ok).toBe(true);
    wrong(sim, 'p1');
    right(sim, 'p3');
    const p3 = st(sim).sync.scores.p3;
    untilClosed(sim);
    expect(st(sim).sync.scores.p1).toBe(0);
    expect(st(sim).sync.scores.p3).toBe(p3);
  });
});

describe('classic pack: Streak Snatch and Harmony Swap', () => {
  it('Streak Snatch adds an opponent\'s streak to yours, capped at the questions asked so far', () => {
    const sim = game();
    for (let q = 0; q < 2; q++) {
      untilQuestion(sim);
      right(sim, 'p2');
      if (q === 1) right(sim, 'p1');
      untilClosed(sim);
    }
    expect(st(sim).sync.streaks).toMatchObject({ p1: 1, p2: 2 });
    expect(sim.cast('p1', { cheatId: 'classic.streak-snatch', target: 'p3' })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'classic.streak-snatch', target: 'p2' }).ok).toBe(true);
    // Two questions asked: a streak of 1 + 2 is cut to 2.
    expect(st(sim).sync.streaks).toMatchObject({ p1: 2, p2: 0 });
  });

  it('Harmony Swap trades the two teams\' unison bonuses, and refuses equal ones', () => {
    const sim = game({ settings: { unisonBonus: 500 }, common: { teamCount: 2 } });
    const mine = teamOf(sim, 'p1');
    const theirs = teamOf(sim, 'p2');
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'classic.harmony-swap', target: theirs })).toMatchObject({ ok: false });
    for (const id of sim.ids) if (teamOf(sim, id) === theirs) right(sim, id);
    untilClosed(sim);
    expect(st(sim).teamBonus).toMatchObject({ [theirs]: 500 });
    expect(sim.cast('p1', { cheatId: 'classic.harmony-swap', target: theirs }).ok).toBe(true);
    expect(st(sim).teamBonus).toMatchObject({ [mine]: 500, [theirs]: 0 });
  });
});
