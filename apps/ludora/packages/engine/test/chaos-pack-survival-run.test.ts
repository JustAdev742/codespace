import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { FLOOR_MS, START_MS, timerAfter } from '../src/modes/survival-run/index.ts';

/* Exact behaviour of the survival-run pack. Bots stay idle; hearts and timers are set up by patching the state. */

const sims: ChaosSim[] = [];
afterEach(() => {
  for (const sim of sims.splice(0)) expect(sim.errors).toEqual([]);
});

function run(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'survival-run', questions: MIXED_SET, players: 4, seed: 5, settings });
  for (const id of sim.ids) sim.idle.add(id);
  sims.push(sim);
  return sim;
}

function patch(sim: ChaosSim, fn: (s: any) => void) {
  const s = structuredClone(sim.state());
  fn(s);
  (sim.rt as unknown as { state: unknown }).state = s;
}

const setHearts = (sim: ChaosSim, h: Record<string, number>) => patch(sim, (s) => Object.entries(h).forEach(([id, n]) => (s.runners[id].hearts = n)));
const hearts = (sim: ChaosSim, id: string) => sim.state().runners[id].hearts as number;
const runner = (sim: ChaosSim, id: string) => sim.state().runners[id];
const cast = (sim: ChaosSim, caster: string, cheat: string, target?: string) => sim.cast(caster, { cheatId: `survival-run.${cheat}`, target: target ?? null });

/** Answer the question on screen (moving on from a result screen first). */
function answer(sim: ChaosSim, id: string, right: boolean) {
  for (let i = 0; i < 2; i++) {
    const a = sim.rt.botAction(id, right ? 1 : 0, createRng(3)) as { type: string };
    expect(a).toBeTruthy();
    expect(sim.rt.act(id, a).ok).toBe(true);
    if (a.type === 'answer') return;
  }
}

describe('survival-run pack: hearts', () => {
  it('first aid wins back a heart, never above the run\'s most', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'first-aid')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 2 });
    expect(cast(sim, 'p1', 'first-aid').ok).toBe(true);
    expect(hearts(sim, 'p1')).toBe(3);
  });

  it('the host\'s heart cap is the limit', () => {
    const sim = run({ heartCap: 5 });
    expect(cast(sim, 'p1', 'first-aid').ok).toBe(true);
    expect(hearts(sim, 'p1')).toBe(4);
  });

  it('heartbreak takes a heart but never the last', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heartbreak', 'p2').ok).toBe(true);
    expect(hearts(sim, 'p2')).toBe(2);
    setHearts(sim, { p3: 1 });
    expect(cast(sim, 'p1', 'heartbreak', 'p3')).toMatchObject({ ok: false });
    expect(hearts(sim, 'p3')).toBe(1);
  });

  it('vampire bite moves one heart, needs room and leaves the victim one', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'vampire-bite', 'p2')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 2, p3: 1 });
    expect(cast(sim, 'p1', 'vampire-bite', 'p3')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'vampire-bite', 'p2').ok).toBe(true);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([3, 2]);
  });

  it('blood pact swaps heart counts', () => {
    const sim = run();
    setHearts(sim, { p1: 1 });
    expect(cast(sim, 'p1', 'blood-pact', 'p2').ok).toBe(true);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([3, 1]);
    expect(cast(sim, 'p3', 'blood-pact', 'p4')).toMatchObject({ ok: false });
  });

  it('guardian heart keeps the next heart, once', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'guardian-heart').ok).toBe(true);
    answer(sim, 'p1', false);
    expect(hearts(sim, 'p1')).toBe(3);
    answer(sim, 'p1', false);
    expect(hearts(sim, 'p1')).toBe(2);
  });

  it('guardian heart does not cover the last heart', () => {
    const sim = run();
    setHearts(sim, { p1: 1 });
    expect(cast(sim, 'p1', 'guardian-heart').ok).toBe(true);
    answer(sim, 'p1', false);
    expect(runner(sim, 'p1').phase).toBe('over');
  });

  it('lifesteal heals on correct answers, only when a heart is missing', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'lifesteal')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 1 });
    expect(cast(sim, 'p1', 'lifesteal').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(hearts(sim, 'p1')).toBe(2);
    answer(sim, 'p1', true);
    answer(sim, 'p1', true);
    expect(hearts(sim, 'p1')).toBe(3);
  });

  it('glass heart breaks a second heart with each loss, but never the last', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'glass-heart', 'p2').ok).toBe(true);
    answer(sim, 'p2', false);
    expect(hearts(sim, 'p2')).toBe(1);
    expect(runner(sim, 'p2').phase).not.toBe('over');
    setHearts(sim, { p3: 2 });
    expect(cast(sim, 'p4', 'glass-heart', 'p3')).toMatchObject({ ok: false });
  });

  it('ticking heart takes a heart after 15 seconds without a right answer', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'ticking-heart', 'p2').ok).toBe(true);
    sim.run(15_050);
    expect(hearts(sim, 'p2')).toBe(2);
  });

  it('ticking heart is stopped by a right answer', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'ticking-heart', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(sim.chaos().effects).toHaveLength(0);
    sim.run(15_050);
    expect(hearts(sim, 'p2')).toBe(3);
  });

  it('heart roulette needs a heart to bet and room to win', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heart-roulette')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 2, p2: 1 });
    expect(cast(sim, 'p2', 'heart-roulette')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'heart-roulette').ok).toBe(true);
    expect([1, 3]).toContain(hearts(sim, 'p1'));
  });

  it('last stand only on the last heart, and wins back two', () => {
    const sim = run();
    setHearts(sim, { p1: 2, p2: 1 });
    expect(cast(sim, 'p1', 'last-stand')).toMatchObject({ ok: false });
    expect(cast(sim, 'p2', 'last-stand').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(hearts(sim, 'p2')).toBe(3);
  });
});

describe('survival-run pack: the question timer', () => {
  it('slow motion adds 4 seconds to the question now and to the next one', () => {
    const sim = run();
    const before = runner(sim, 'p1').deadline;
    expect(cast(sim, 'p1', 'slow-motion').ok).toBe(true);
    expect(runner(sim, 'p1').deadline).toBe(before + 4000);
    answer(sim, 'p1', true);
    expect(runner(sim, 'p1').phase).toBe('result');
    sim.rt.act('p1', { type: 'next' });
    // The next question gets its extra time on the effect's next tick.
    sim.run(300);
    const q = runner(sim, 'p1');
    expect(q.deadline - sim.now).toBeGreaterThan(q.timerMs);
  });

  it('shrink ray drops the timer to the floor until a right answer, not on a last heart', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'shrink-ray', 'p2').ok).toBe(true);
    expect(runner(sim, 'p2').timerMs).toBe(FLOOR_MS);
    answer(sim, 'p2', false);
    expect(runner(sim, 'p2').timerMs).toBe(FLOOR_MS);
    answer(sim, 'p2', true);
    expect(runner(sim, 'p2').timerMs).toBeGreaterThan(FLOOR_MS);
    setHearts(sim, { p3: 1 });
    expect(cast(sim, 'p1', 'shrink-ray', 'p3')).toMatchObject({ ok: false });
  });

  it('seconds thief moves up to 4 seconds of question time', () => {
    const sim = run();
    const [mine, theirs] = [runner(sim, 'p1').deadline, runner(sim, 'p2').deadline];
    expect(cast(sim, 'p1', 'seconds-thief', 'p2').ok).toBe(true);
    expect(runner(sim, 'p1').deadline - mine).toBe(4000);
    expect(theirs - runner(sim, 'p2').deadline).toBe(4000);
    setHearts(sim, { p3: 1 });
    expect(cast(sim, 'p4', 'seconds-thief', 'p3')).toMatchObject({ ok: false });
  });

  it('seconds thief always leaves the victim 3 seconds', () => {
    const sim = run();
    sim.run(11_000);
    expect(cast(sim, 'p1', 'seconds-thief', 'p2').ok).toBe(true);
    expect(runner(sim, 'p2').deadline - sim.now).toBe(3000);
  });

  it('hourglass swap trades question timers', () => {
    const sim = run();
    patch(sim, (s) => (s.runners.p1.timerMs = 8000));
    expect(cast(sim, 'p1', 'hourglass-swap', 'p2').ok).toBe(true);
    expect([runner(sim, 'p1').timerMs, runner(sim, 'p2').timerMs]).toEqual([15_000, 8000]);
  });

  it('tripwire blocks answers for 6 seconds without letting the timer run out', () => {
    const sim = run();
    sim.run(12_000);
    expect(cast(sim, 'p1', 'tripwire', 'p2').ok).toBe(true);
    const r = runner(sim, 'p2');
    expect(r.deadline).toBeGreaterThanOrEqual(sim.now + 7000);
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, createRng(3)))).toMatchObject({ ok: false });
    sim.run(6100);
    expect(hearts(sim, 'p2')).toBe(3);
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, createRng(3))).ok).toBe(true);
  });

  it('sidestep swaps the question with a fresh timer and costs nothing', () => {
    const sim = run();
    sim.run(5000);
    const before = runner(sim, 'p1');
    expect(cast(sim, 'p1', 'sidestep').ok).toBe(true);
    const after = runner(sim, 'p1');
    expect(after.stream.iid).not.toBe(before.stream.iid);
    expect(after.deadline).toBe(sim.now + after.timerMs);
    expect([after.hearts, after.stream.answered]).toEqual([before.hearts, before.stream.answered]);
  });
});

describe('survival-run pack: second wind', () => {
  it('second wind rush makes waiting questions due now', () => {
    const sim = run({ secondWind: true });
    expect(cast(sim, 'p1', 'second-wind-rush')).toMatchObject({ ok: false });
    answer(sim, 'p1', false);
    const answered = runner(sim, 'p1').stream.answered;
    expect(runner(sim, 'p1').returns[0].after).toBe(answered + 3);
    expect(cast(sim, 'p1', 'second-wind-rush').ok).toBe(true);
    expect(runner(sim, 'p1').returns[0].after).toBe(answered);
    sim.rt.act('p1', { type: 'next' });
    expect(runner(sim, 'p1').returning).toBe(true);
  });

  it('second wind swipe moves an opponent\'s waiting question to you, where it can win you a heart', () => {
    const sim = run({ secondWind: true });
    expect(cast(sim, 'p1', 'second-wind-swipe', 'p2')).toMatchObject({ ok: false });
    answer(sim, 'p2', false);
    const qid = runner(sim, 'p2').returns[0].qid;
    setHearts(sim, { p1: 2 });
    expect(cast(sim, 'p1', 'second-wind-swipe', 'p2').ok).toBe(true);
    expect(runner(sim, 'p2').returns).toEqual([]);
    expect(runner(sim, 'p1').returns).toEqual([{ qid, after: 3 }]);
    for (let i = 0; i < 3; i++) answer(sim, 'p1', true);
    sim.rt.act('p1', { type: 'next' });
    expect(runner(sim, 'p1').returning).toBe(true);
    answer(sim, 'p1', true);
    expect(hearts(sim, 'p1')).toBe(3);
  });
});

/** Play on for `ms` while the runner answers right every 10 seconds, so their own timer never costs them a heart. */
function keepRunning(sim: ChaosSim, id: string, ms: number) {
  for (let left = ms; left > 0; left -= 10_000) {
    sim.run(Math.min(10_000, left));
    answer(sim, id, true);
  }
}

describe('survival-run pack: trading hearts', () => {
  it('heart piggy bank takes a heart now and pays back two after 30 seconds', () => {
    const sim = run({ heartCap: 5 });
    expect(cast(sim, 'p1', 'heart-bank').ok).toBe(true);
    expect(hearts(sim, 'p1')).toBe(2);
    keepRunning(sim, 'p1', 30_000);
    expect(hearts(sim, 'p1')).toBe(4);
  });

  it('heart piggy bank stopped early gives back just the heart, and needs two hearts', () => {
    const sim = run();
    const r = cast(sim, 'p1', 'heart-bank');
    expect(r.ok && hearts(sim, 'p1')).toBe(2);
    expect(r.ok && sim.rt.stopEffect('p1', r.effects[0]!).ok).toBe(true);
    expect(hearts(sim, 'p1')).toBe(3);
    setHearts(sim, { p2: 1 });
    expect(cast(sim, 'p2', 'heart-bank')).toMatchObject({ ok: false });
  });

  it('heart loan lends a heart and takes two back when it ends, never the last', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heart-loan')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 2, p2: 1 });
    const r = cast(sim, 'p1', 'heart-loan');
    expect(r.ok && hearts(sim, 'p1')).toBe(3);
    // Stopping the loan early makes it due at once.
    expect(r.ok && sim.rt.stopEffect('p1', r.effects[0]!).ok).toBe(true);
    expect(hearts(sim, 'p1')).toBe(1);
    expect(cast(sim, 'p2', 'heart-loan').ok).toBe(true);
    expect(hearts(sim, 'p2')).toBe(2);
    keepRunning(sim, 'p2', 30_000);
    expect(hearts(sim, 'p2')).toBe(1);
    expect(runner(sim, 'p2').phase).not.toBe('over');
  });

  it('heart shop trades 3 correct answers for a heart', () => {
    const sim = run();
    patch(sim, (s) => {
      Object.assign(s.runners.p1, { hearts: 2 });
      s.runners.p1.stream.correct = 5;
      Object.assign(s.runners.p2, { hearts: 2 });
      s.runners.p2.stream.correct = 2;
    });
    expect(cast(sim, 'p1', 'heart-shop').ok).toBe(true);
    expect([runner(sim, 'p1').stream.correct, hearts(sim, 'p1')]).toEqual([2, 3]);
    expect(cast(sim, 'p2', 'heart-shop')).toMatchObject({ ok: false });
    patch(sim, (s) => (s.runners.p3.stream.correct = 5));
    expect(cast(sim, 'p3', 'heart-shop')).toMatchObject({ ok: false });
  });

  it('heart sale trades a heart for 3 correct answers, never the last heart', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heart-sale').ok).toBe(true);
    expect([hearts(sim, 'p1'), runner(sim, 'p1').stream.correct]).toEqual([2, 3]);
    setHearts(sim, { p2: 1 });
    expect(cast(sim, 'p2', 'heart-sale')).toMatchObject({ ok: false });
  });

  it('heart gift moves one heart to a runner with room, never the giver\'s last', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heart-gift', 'p2')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'heart-gift', 'p1')).toMatchObject({ ok: false });
    setHearts(sim, { p2: 2, p3: 1, p4: 1 });
    expect(cast(sim, 'p1', 'heart-gift', 'p2').ok).toBe(true);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([2, 3]);
    expect(cast(sim, 'p3', 'heart-gift', 'p4')).toMatchObject({ ok: false });
  });
});

describe('survival-run pack: hearts that move as you play', () => {
  it('heart seal stops the run restoring a heart', () => {
    const sim = run();
    patch(sim, (s) => {
      for (const id of ['p2', 'p3']) {
        s.runners[id].hearts = 2;
        s.runners[id].stream.correct = 9;
      }
    });
    expect(cast(sim, 'p1', 'heart-seal', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    answer(sim, 'p3', true);
    expect([hearts(sim, 'p2'), hearts(sim, 'p3')]).toEqual([2, 3]);
  });

  it('heart seal stops second-wind hearts too', () => {
    const sim = run({ secondWind: true, restores: false });
    answer(sim, 'p2', false);
    expect(cast(sim, 'p1', 'heart-seal', 'p2').ok).toBe(true);
    for (let i = 0; i < 3; i++) answer(sim, 'p2', true);
    sim.rt.act('p2', { type: 'next' });
    expect(runner(sim, 'p2').returning).toBe(true);
    answer(sim, 'p2', true);
    expect(hearts(sim, 'p2')).toBe(2);
  });

  it('heart seal cannot share a runner with a lasting healing cheat', () => {
    const sim = run();
    setHearts(sim, { p2: 2, p3: 2 });
    expect(cast(sim, 'p1', 'heart-seal', 'p2').ok).toBe(true);
    expect(cast(sim, 'p2', 'lifesteal')).toMatchObject({ ok: false, message: expect.stringContaining('conflicts') });
    expect(cast(sim, 'p3', 'lifesteal').ok).toBe(true);
    expect(cast(sim, 'p4', 'heart-seal', 'p3')).toMatchObject({ ok: false, message: expect.stringContaining('conflicts') });
  });

  it('heartstrings: every heart an opponent loses, you win, after glass and guardian hearts', () => {
    // A runner with every heart has no room to win one.
    expect(cast(run(), 'p1', 'heartstrings', 'p2')).toMatchObject({ ok: false });
    const sim = run({ heartCap: 5 });
    setHearts(sim, { p1: 1 });
    expect(cast(sim, 'p1', 'heartstrings', 'p2').ok).toBe(true);
    expect(cast(sim, 'p3', 'glass-heart', 'p2').ok).toBe(true);
    answer(sim, 'p2', false);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([3, 1]);
    setHearts(sim, { p3: 1 });
    expect(cast(sim, 'p4', 'guardian-heart').ok).toBe(true);
    expect(cast(sim, 'p3', 'heartstrings', 'p4').ok).toBe(true);
    answer(sim, 'p4', false);
    expect([hearts(sim, 'p3'), hearts(sim, 'p4')]).toEqual([1, 3]);
  });

  it('heartstrings wins only as many hearts as there is room for', () => {
    const sim = run();
    setHearts(sim, { p1: 2 });
    expect(cast(sim, 'p1', 'heartstrings', 'p2').ok).toBe(true);
    expect(cast(sim, 'p3', 'glass-heart', 'p2').ok).toBe(true);
    answer(sim, 'p2', false);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([3, 1]);
    expect(sim.feed.some((f) => f.includes('lost 2 hearts, so Bot 1 won 1 heart'))).toBe(true);
  });

  it('heart duel: the first right answer takes a heart', () => {
    const sim = run();
    setHearts(sim, { p1: 2 });
    expect(cast(sim, 'p1', 'heart-duel', 'p2').ok).toBe(true);
    answer(sim, 'p1', true);
    sim.run(300);
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([3, 2]);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('heart duel can be lost, and never takes a last heart', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'heart-duel', 'p2').ok).toBe(true);
    // A wrong answer decides nothing.
    answer(sim, 'p1', false);
    answer(sim, 'p2', true);
    sim.run(300);
    // p2 won but had no room, so p1 just lost the heart.
    expect([hearts(sim, 'p1'), hearts(sim, 'p2')]).toEqual([1, 3]);
    setHearts(sim, { p3: 2, p4: 1 });
    expect(cast(sim, 'p3', 'heart-duel', 'p4').ok).toBe(true);
    answer(sim, 'p3', true);
    sim.run(300);
    expect([hearts(sim, 'p3'), hearts(sim, 'p4')]).toEqual([2, 1]);
  });

  it('safety rope catches one wrong answer on the last heart', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'safety-rope')).toMatchObject({ ok: false });
    setHearts(sim, { p1: 1 });
    expect(cast(sim, 'p1', 'safety-rope').ok).toBe(true);
    expect(sim.rt.act('p1', sim.rt.botAction('p1', 0, createRng(3)))).toMatchObject({ ok: false });
    expect(runner(sim, 'p1')).toMatchObject({ phase: 'question', hearts: 1 });
    answer(sim, 'p1', false);
    expect(runner(sim, 'p1').phase).toBe('over');
  });

  it('tempo lock keeps right answers from shortening the timer', () => {
    const sim = run();
    expect(cast(sim, 'p1', 'tempo-lock').ok).toBe(true);
    answer(sim, 'p1', true);
    answer(sim, 'p2', true);
    expect([runner(sim, 'p1').timerMs, runner(sim, 'p2').timerMs]).toEqual([START_MS, timerAfter(1)]);
    answer(sim, 'p1', true);
    expect(runner(sim, 'p1').timerMs).toBe(START_MS);
  });
});
