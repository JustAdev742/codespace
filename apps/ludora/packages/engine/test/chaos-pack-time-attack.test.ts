import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/* Exact behaviour of the time-attack pack. Bots stay idle; clocks and multipliers are set up by playing or patching the state. */

const sims: ChaosSim[] = [];
afterEach(() => {
  for (const sim of sims.splice(0)) expect(sim.errors).toEqual([]);
});

function game(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'time-attack', questions: MIXED_SET, players: 4, seed: 5, settings });
  for (const id of sim.ids) sim.idle.add(id);
  sims.push(sim);
  return sim;
}

function patch(sim: ChaosSim, fn: (s: any) => void) {
  const s = structuredClone(sim.state());
  fn(s);
  (sim.rt as unknown as { state: unknown }).state = s;
}

const runOf = (sim: ChaosSim, id: string) => sim.state().runs[id];
const left = (sim: ChaosSim, id: string) => (runOf(sim, id).endsAt - sim.now) / 1000;
const cast = (sim: ChaosSim, caster: string, cheat: string, target?: string) => sim.cast(caster, { cheatId: `time-attack.${cheat}`, target: target ?? null });
const streakOf = (sim: ChaosSim, id: string, inRow: number, multiplier: number) =>
  patch(sim, (s) => {
    s.runs[id].inRow = inRow;
    s.runs[id].multiplier = multiplier;
  });

function answer(sim: ChaosSim, id: string, right: boolean) {
  const a = sim.rt.botAction(id, right ? 1 : 0, createRng(3));
  expect(a).toBeTruthy();
  return sim.rt.act(id, a);
}

describe('time-attack pack: the clock', () => {
  it('borrowed time lends 10 seconds and takes 12 back after 20 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'borrowed-time')).toMatchObject({ ok: false });
    sim.run(15_000);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'borrowed-time').ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before + 10, 2);
    sim.run(20_000);
    expect(left(sim, 'p1')).toBeCloseTo(before + 10 - 20 - 12, 2);
  });

  it('chrono heist moves 4 seconds and never leaves the victim under 3', () => {
    const sim = game();
    sim.run(10_000);
    const [mine, theirs] = [left(sim, 'p1'), left(sim, 'p2')];
    expect(cast(sim, 'p1', 'chrono-heist', 'p2').ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(mine + 4, 2);
    expect(left(sim, 'p2')).toBeCloseTo(theirs - 4, 2);
    patch(sim, (s) => (s.runs.p3.endsAt = sim.now + 5000));
    expect(cast(sim, 'p4', 'chrono-heist', 'p3').ok).toBe(true);
    expect(left(sim, 'p3')).toBeCloseTo(3, 2);
  });

  it('stopwatch freeze holds the clock for 8 seconds, penalties included', () => {
    const sim = game();
    sim.run(5000);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'clock-freeze').ok).toBe(true);
    sim.run(3000);
    expect(left(sim, 'p1')).toBeCloseTo(before, 1);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    sim.run(3000);
    expect(left(sim, 'p1')).toBeCloseTo(before - 3, 1);
  });

  it('racing stopwatch makes the clock run at double speed for 10 seconds', () => {
    const sim = game();
    const before = left(sim, 'p2');
    expect(cast(sim, 'p1', 'clock-sprint', 'p2').ok).toBe(true);
    sim.run(10_000);
    const lost = before - left(sim, 'p2');
    expect(lost).toBeGreaterThanOrEqual(19);
    expect(lost).toBeLessThanOrEqual(20);
  });

  it('racing stopwatch stops at 3 seconds left', () => {
    const sim = game();
    patch(sim, (s) => (s.runs.p2.endsAt = sim.now + 7000));
    expect(cast(sim, 'p1', 'clock-sprint', 'p2').ok).toBe(true);
    sim.run(2000);
    expect(left(sim, 'p2')).toBeCloseTo(3, 2);
    // From there only the clock's own time runs.
    sim.run(1000);
    expect(left(sim, 'p2')).toBeCloseTo(2, 2);
    expect(runOf(sim, 'p2').over).toBeNull();
  });

  it('stopwatch swap trades time left', () => {
    const sim = game();
    patch(sim, (s) => (s.runs.p1.endsAt = sim.now + 20_000));
    expect(cast(sim, 'p1', 'clock-swap', 'p2').ok).toBe(true);
    expect([left(sim, 'p1'), left(sim, 'p2')]).toEqual([60, 20]);
  });

  it('penalty box doubles the seconds a wrong answer costs', () => {
    const sim = game();
    const before = left(sim, 'p2');
    expect(cast(sim, 'p1', 'penalty-box', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', false).ok).toBe(true);
    expect(left(sim, 'p2')).toBeCloseTo(before - 6, 2);
  });

  it('clock shield stops the penalty but not the multiplier reset', () => {
    const sim = game();
    streakOf(sim, 'p1', 6, 2);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'time-shield').ok).toBe(true);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before, 2);
    expect(runOf(sim, 'p1').multiplier).toBe(1);
  });

  it('penalty cheats are not offered in sudden death', () => {
    expect(cast(game({ suddenDeath: true }), 'p1', 'time-shield')).toMatchObject({ ok: false });
  });

  it('fuse splice adds 2 seconds per correct answer', () => {
    const sim = game();
    sim.run(10_000);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'fuse-splice').ok).toBe(true);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before + 2, 2);
  });

  it('fuse snuffer cancels bonus seconds', () => {
    const sim = game({ bonusSeconds: 2 });
    sim.run(10_000);
    const before = left(sim, 'p2');
    expect(cast(sim, 'p1', 'fuse-snuffer', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect(left(sim, 'p2')).toBeCloseTo(before, 2);
    expect(answer(sim, 'p3', true).ok).toBe(true);
    expect(left(sim, 'p3')).toBeCloseTo(before + 2, 2);
  });

  it('time is money sells 10 seconds for two answers at the multiplier', () => {
    const sim = game();
    streakOf(sim, 'p1', 5, 2);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'time-is-money').ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before - 10, 2);
    expect(runOf(sim, 'p1').score).toBe(400);
    patch(sim, (s) => (s.runs.p2.endsAt = sim.now + 12_000));
    expect(cast(sim, 'p2', 'time-is-money')).toMatchObject({ ok: false });
  });

  it('buy back the clock pays 15% of points for 6 seconds', () => {
    const sim = game();
    sim.run(10_000);
    patch(sim, (s) => (s.runs.p1.score = 1000));
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'buy-time').ok).toBe(true);
    expect(runOf(sim, 'p1').score).toBe(850);
    expect(left(sim, 'p1')).toBeCloseTo(before + 6, 2);
  });

  it('brain freeze blocks answers, only with 10 seconds left', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'brain-freeze', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true)).toMatchObject({ ok: false });
    sim.run(6100);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    patch(sim, (s) => (s.runs.p3.endsAt = sim.now + 9000));
    expect(cast(sim, 'p4', 'brain-freeze', 'p3')).toMatchObject({ ok: false });
  });

  it('stopwatch roulette needs room and moves the clock by a stated amount', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'clock-roulette')).toMatchObject({ ok: false });
    sim.run(15_000);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'clock-roulette').ok).toBe(true);
    const moved = Math.round(left(sim, 'p1') - before);
    expect([10, 4, -6]).toContain(moved);
  });
});

describe('time-attack pack: the multiplier', () => {
  it('multiplier lock keeps the multiplier through a wrong answer, from ×2 up', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'multiplier-lock')).toMatchObject({ ok: false });
    streakOf(sim, 'p1', 7, 2);
    expect(cast(sim, 'p1', 'multiplier-lock').ok).toBe(true);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow]).toEqual([2, 5]);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    expect(runOf(sim, 'p1').score).toBe(200);
  });

  it('multiplier crash resets multiplier and streak', () => {
    const sim = game();
    streakOf(sim, 'p2', 12, 3);
    expect(cast(sim, 'p1', 'multiplier-crash', 'p2').ok).toBe(true);
    expect([runOf(sim, 'p2').multiplier, runOf(sim, 'p2').inRow]).toEqual([1, 0]);
    expect(cast(sim, 'p3', 'multiplier-crash', 'p2')).toMatchObject({ ok: false });
  });

  it('multiplier bump raises one step with a matching streak, up to ×3, and can be undone', () => {
    const sim = game();
    const r = cast(sim, 'p1', 'multiplier-bump');
    expect(r.ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow]).toEqual([2, 5]);
    expect(r.ok && sim.rt.undoCast('p1', r.castId).ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow]).toEqual([1, 0]);
    streakOf(sim, 'p2', 10, 3);
    expect(cast(sim, 'p2', 'multiplier-bump')).toMatchObject({ ok: false });
  });

  it('overdrive lets the bump go past ×3', () => {
    const sim = game({ overdrive: true });
    streakOf(sim, 'p1', 10, 3);
    expect(cast(sim, 'p1', 'multiplier-bump').ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow]).toEqual([4, 15]);
  });

  it('multiplier swap trades multipliers and streaks', () => {
    const sim = game();
    streakOf(sim, 'p2', 11, 3);
    expect(cast(sim, 'p1', 'multiplier-swap', 'p2').ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow, runOf(sim, 'p2').multiplier, runOf(sim, 'p2').inRow]).toEqual([3, 11, 1, 0]);
  });

  it('streak jinx lets answers score without building the multiplier', () => {
    const sim = game();
    streakOf(sim, 'p2', 4, 1);
    expect(cast(sim, 'p1', 'streak-jinx', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect([runOf(sim, 'p2').score, runOf(sim, 'p2').inRow, runOf(sim, 'p2').multiplier]).toEqual([100, 4, 1]);
  });
});

describe('time-attack pack: questions', () => {
  it('safety net catches one wrong answer before it counts', () => {
    const sim = game();
    streakOf(sim, 'p1', 6, 2);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'safety-net').ok).toBe(true);
    expect(answer(sim, 'p1', false)).toMatchObject({ ok: false });
    expect([left(sim, 'p1'), runOf(sim, 'p1').multiplier, runOf(sim, 'p1').stream.answered]).toEqual([before, 2, 0]);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    expect(runOf(sim, 'p1').multiplier).toBe(1);
  });

  it('safety net lets right answers through untouched', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'safety-net').ok).toBe(true);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    expect(sim.chaos().effects).toHaveLength(1);
  });

  it('skip ticket swaps the question at no cost', () => {
    const sim = game();
    const before = runOf(sim, 'p1');
    expect(cast(sim, 'p1', 'skip-ticket').ok).toBe(true);
    const after = runOf(sim, 'p1');
    expect(after.stream.iid).not.toBe(before.stream.iid);
    expect([after.endsAt, after.multiplier, after.stream.answered]).toEqual([before.endsAt, before.multiplier, before.stream.answered]);
  });
});

describe('time-attack pack: more of the clock', () => {
  it('borrowed time stopped early is still paid back, and an undo cancels it', () => {
    const sim = game();
    sim.run(15_000);
    const before = left(sim, 'p1');
    const r = cast(sim, 'p1', 'borrowed-time');
    expect(r.ok && left(sim, 'p1')).toBeCloseTo(before + 10, 2);
    expect(r.ok && sim.rt.stopEffect('p1', r.effects[0]!).ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before - 2, 2);
    const b = left(sim, 'p2');
    const u = cast(sim, 'p2', 'borrowed-time');
    expect(u.ok && sim.rt.undoCast('p2', u.castId).ok).toBe(true);
    expect(left(sim, 'p2')).toBeCloseTo(b, 2);
    sim.run(21_000);
    expect(left(sim, 'p2')).toBeCloseTo(b - 21, 2);
  });

  it('stopwatch flip swaps time left with time used, never under 3 seconds', () => {
    const sim = game();
    patch(sim, (s) => {
      s.runs.p1.endsAt = sim.now + 15_000;
      s.runs.p3.endsAt = sim.now + 30_000;
    });
    expect(cast(sim, 'p1', 'stopwatch-flip').ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(45, 2);
    expect(cast(sim, 'p2', 'stopwatch-flip').ok).toBe(true);
    expect(left(sim, 'p2')).toBeCloseTo(3, 2);
    expect(cast(sim, 'p3', 'stopwatch-flip')).toMatchObject({ ok: false });
  });

  it('savings jar takes 8 seconds and gives back 12 after 20 seconds, or 8 if stopped', () => {
    const sim = game();
    patch(sim, (s) => (s.runs.p4.endsAt = sim.now + 11_000));
    expect(cast(sim, 'p4', 'time-savings')).toMatchObject({ ok: false });
    sim.run(10_000);
    const before = left(sim, 'p1');
    expect(cast(sim, 'p1', 'time-savings').ok).toBe(true);
    expect(left(sim, 'p1')).toBeCloseTo(before - 8, 2);
    sim.run(20_000);
    expect(left(sim, 'p1')).toBeCloseTo(before - 8 - 20 + 12, 2);
    const b = left(sim, 'p2');
    const r = cast(sim, 'p2', 'time-savings');
    expect(r.ok && sim.rt.stopEffect('p2', r.effects[0]!).ok).toBe(true);
    expect(left(sim, 'p2')).toBeCloseTo(b, 2);
  });

  it('last-second save puts 6 seconds back when the clock gets down to 2', () => {
    const sim = game();
    patch(sim, (s) => {
      s.runs.p1.endsAt = sim.now + 5000;
      s.runs.p2.endsAt = sim.now + 1500;
    });
    expect(cast(sim, 'p2', 'last-second-save')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'last-second-save').ok).toBe(true);
    sim.run(3000);
    expect(left(sim, 'p1')).toBeCloseTo(8, 2);
    expect(sim.chaos().effects).toHaveLength(0);
    sim.run(5000);
    expect(runOf(sim, 'p1').over).toBeNull();
  });

  it('time gift moves 5 seconds to a clock with room', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'time-gift', 'p2')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'time-gift', 'p1')).toMatchObject({ ok: false });
    sim.run(10_000);
    expect(cast(sim, 'p1', 'time-gift', 'p2').ok).toBe(true);
    expect([left(sim, 'p1'), left(sim, 'p2')]).toEqual([45, 55]);
  });

  it('stopwatch wager: the first right answer takes 5 seconds from the other', () => {
    const sim = game();
    sim.run(10_000);
    expect(cast(sim, 'p1', 'time-wager', 'p2').ok).toBe(true);
    // A wrong answer decides nothing.
    expect(answer(sim, 'p2', false).ok).toBe(true);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    sim.run(300);
    expect([left(sim, 'p1'), left(sim, 'p2')].map((x) => Math.round(x * 10) / 10)).toEqual([54.7, 41.7]);
    expect(sim.chaos().effects).toHaveLength(0);
    expect(cast(sim, 'p3', 'time-wager', 'p4').ok).toBe(true);
    expect(answer(sim, 'p4', true).ok).toBe(true);
    sim.run(300);
    expect([left(sim, 'p3'), left(sim, 'p4')].map((x) => Math.round(x * 10) / 10)).toEqual([44.4, 54.4]);
  });

  it('penalty pass puts the seconds a wrong answer costs on an opponent\'s clock', () => {
    const sim = game();
    sim.run(5000);
    const [mine, theirs] = [left(sim, 'p1'), left(sim, 'p2')];
    expect(cast(sim, 'p1', 'penalty-pass', 'p2').ok).toBe(true);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    sim.run(300);
    expect(left(sim, 'p1')).toBeCloseTo(mine - 0.3, 2);
    expect(left(sim, 'p2')).toBeCloseTo(theirs - 0.3 - 3, 2);
  });

  it('bonus heist moves an opponent\'s bonus seconds to your clock', () => {
    const sim = game({ bonusSeconds: 2 });
    sim.run(10_000);
    const [mine, theirs] = [left(sim, 'p1'), left(sim, 'p2')];
    expect(cast(sim, 'p1', 'bonus-heist', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    sim.run(300);
    expect(left(sim, 'p1')).toBeCloseTo(mine - 0.3 + 2, 2);
    expect(left(sim, 'p2')).toBeCloseTo(theirs - 0.3, 2);
  });

  it('stopwatch pressure takes a second off an opponent for each right answer you give', () => {
    const sim = game();
    sim.run(5000);
    const theirs = left(sim, 'p2');
    expect(cast(sim, 'p1', 'clock-pressure', 'p2').ok).toBe(true);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    expect(answer(sim, 'p1', true).ok).toBe(true);
    expect(answer(sim, 'p1', false).ok).toBe(true);
    sim.run(300);
    expect(left(sim, 'p2')).toBeCloseTo(theirs - 0.3 - 2, 2);
  });
});

describe('time-attack pack: more of the multiplier', () => {
  it('multiplier pinch moves one step, with streaks to match', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'multiplier-pinch', 'p3')).toMatchObject({ ok: false });
    streakOf(sim, 'p2', 7, 2);
    expect(cast(sim, 'p1', 'multiplier-pinch', 'p2').ok).toBe(true);
    expect([runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow, runOf(sim, 'p2').multiplier, runOf(sim, 'p2').inRow]).toEqual([2, 5, 1, 0]);
  });

  it('multiplier dice goes one step up or down, only from ×2 below the top', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'multiplier-dice')).toMatchObject({ ok: false });
    streakOf(sim, 'p2', 10, 3);
    expect(cast(sim, 'p2', 'multiplier-dice')).toMatchObject({ ok: false });
    streakOf(sim, 'p1', 6, 2);
    expect(cast(sim, 'p1', 'multiplier-dice').ok).toBe(true);
    expect([1, 3]).toContain(runOf(sim, 'p1').multiplier);
  });

  it('multiplier mute scores right answers at ×1 but keeps the multiplier building', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'multiplier-mute', 'p2')).toMatchObject({ ok: false });
    streakOf(sim, 'p2', 10, 3);
    expect(cast(sim, 'p1', 'multiplier-mute', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect([runOf(sim, 'p2').score, runOf(sim, 'p2').multiplier, runOf(sim, 'p2').inRow]).toEqual([100, 3, 11]);
    sim.run(15_100);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect(runOf(sim, 'p2').score).toBe(400);
  });

  it('multiplier echo steps you up when an opponent steps up', () => {
    const sim = game();
    streakOf(sim, 'p3', 10, 3);
    expect(cast(sim, 'p3', 'multiplier-echo', 'p2')).toMatchObject({ ok: false });
    streakOf(sim, 'p2', 4, 1);
    expect(cast(sim, 'p1', 'multiplier-echo', 'p2').ok).toBe(true);
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect([runOf(sim, 'p2').multiplier, runOf(sim, 'p1').multiplier, runOf(sim, 'p1').inRow]).toEqual([2, 2, 5]);
    // At the top, an echo has nowhere to go and says nothing.
    streakOf(sim, 'p1', 10, 3);
    streakOf(sim, 'p2', 9, 2);
    const said = sim.feed.length;
    expect(answer(sim, 'p2', true).ok).toBe(true);
    expect([runOf(sim, 'p2').multiplier, runOf(sim, 'p1').multiplier]).toEqual([3, 3]);
    expect(sim.feed.slice(said).some((f) => f.includes('Multiplier echo'))).toBe(false);
  });
});
