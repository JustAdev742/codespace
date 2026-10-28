import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/* Exact behaviour of the Confidence cheat pack. Every bot is kept idle; wagers and answers are made by hand. */

function game(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'confidence', questions: MIXED_SET, players: 4, seed: 21, settings });
  for (const id of sim.ids) sim.idle.add(id);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();

/** Play on until the given phase is running with at least `minLeft` ms left. */
function until(sim: ChaosSim, phase: 'wager' | 'question', minLeft = 2500) {
  for (let t = 0; t < 120_000; t += 100) {
    const s = st(sim);
    const ends = s.phase === 'question' ? s.deadline : s.phaseEndsAt;
    if (s.phase === phase && ends - sim.now > minLeft) return;
    sim.run(100);
  }
  throw new Error(`no ${phase} phase`);
}

function untilScored(sim: ChaosSim) {
  for (let t = 0; t < 60_000 && st(sim).phase !== 'reveal'; t += 100) sim.run(100);
}

const wager = (sim: ChaosSim, id: string, level: number) => sim.rt.act(id, { type: 'wager', level });
function right(sim: ChaosSim, id: string) {
  const a = sim.rt.botAction(id, 1, createRng(3));
  expect(a).toMatchObject({ type: 'answer' });
  expect(sim.rt.act(id, a).ok).toBe(true);
}
const wrong = (sim: ChaosSim, id: string) => expect(sim.rt.act(id, { type: 'answer', iid: st(sim).iid, answer: { type: 'short', text: 'nope nope' } }).ok).toBe(true);

/** One full question: wagers, then answers (true right, false wrong, absent no answer), then scoring. */
function play(sim: ChaosSim, wagers: Record<string, number>, answers: Record<string, boolean>, during?: () => void) {
  until(sim, 'wager');
  for (const [id, l] of Object.entries(wagers)) expect(wager(sim, id, l).ok).toBe(true);
  during?.();
  until(sim, 'question', 1000);
  for (const [id, ok] of Object.entries(answers)) (ok ? right : wrong)(sim, id);
  untilScored(sim);
}

describe('confidence pack: wagers', () => {
  it('Second Thoughts changes your confidence after the choices appear, only before you answer', () => {
    const sim = game();
    until(sim, 'wager');
    expect(sim.cast('p1', { cheatId: 'confidence.second-thoughts', params: { level: '3' } })).toMatchObject({ ok: false });
    until(sim, 'question');
    expect(sim.cast('p1', { cheatId: 'confidence.second-thoughts', params: { level: '1' } })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'confidence.second-thoughts', params: { level: '3' } }).ok).toBe(true);
    expect(st(sim).wagers.p1).toBe(3);
    wrong(sim, 'p2');
    expect(sim.cast('p2', { cheatId: 'confidence.second-thoughts', params: { level: '3' } })).toMatchObject({ ok: false });
  });

  it('Whisper Campaign sets an opponent\'s confidence and locks it for the wager window', () => {
    const sim = game();
    until(sim, 'wager');
    expect(sim.cast('p1', { cheatId: 'confidence.whisper-campaign', target: 'p2', params: { level: '3' } }).ok).toBe(true);
    expect(st(sim).wagers.p2).toBe(3);
    const locked = wager(sim, 'p2', 1);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.message).toMatch(/locked/);
    expect(st(sim).wagers.p2).toBe(3);
    until(sim, 'question');
    expect(sim.cast('p3', { cheatId: 'confidence.whisper-campaign', target: 'p2', params: { level: '1' } })).toMatchObject({ ok: false });
  });

  it('Nerve Shake-Up moves every other player to a different level', () => {
    const sim = game();
    until(sim, 'wager');
    expect(wager(sim, 'p2', 2).ok).toBe(true);
    expect(wager(sim, 'p1', 3).ok).toBe(true);
    expect(sim.cast('p1', { cheatId: 'confidence.nerve-shake-up' }).ok).toBe(true);
    const w = st(sim).wagers;
    expect(w.p1).toBe(3);
    expect([1, 3]).toContain(w.p2);
    expect([2, 3]).toContain(w.p3);
    expect([2, 3]).toContain(w.p4);
  });
});

describe('confidence pack: clock', () => {
  it('Confidence Crunch closes the wager window or the question 3 seconds from now', () => {
    const sim = game({ wagerSeconds: 15 });
    until(sim, 'wager', 5000);
    expect(sim.cast('p1', { cheatId: 'confidence.snap-decision' }).ok).toBe(true);
    expect(st(sim).phaseEndsAt).toBe(sim.now + 3000);
    until(sim, 'question', 5000);
    expect(sim.cast('p2', { cheatId: 'confidence.snap-decision' }).ok).toBe(true);
    expect(st(sim).deadline).toBe(sim.now + 3000);
    sim.run(4000);
    expect(st(sim).phase).toBe('reveal');
  });

  it('Mull It Over adds the chosen seconds to the running phase', () => {
    const sim = game();
    until(sim, 'wager');
    const before = st(sim).phaseEndsAt;
    expect(sim.cast('p1', { cheatId: 'confidence.mull-it-over', params: { seconds: 6 } }).ok).toBe(true);
    expect(st(sim).phaseEndsAt).toBe(before + 6000);
    until(sim, 'question');
    const deadline = st(sim).deadline;
    expect(sim.cast('p2', { cheatId: 'confidence.mull-it-over', params: { seconds: 10 } }).ok).toBe(true);
    expect(st(sim).deadline).toBe(deadline + 10_000);
  });
});

describe('confidence pack: scoring', () => {
  it('All In scores certain as a fourth level: +400 right, -150 wrong (-400 with high stakes)', () => {
    const sim = game();
    play(sim, { p1: 3 }, { p1: true }, () => expect(sim.cast('p1', { cheatId: 'confidence.all-in' }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(400);
    expect(st(sim).outcomes.p1.change).toBe(400);
    sim.run(60_000);
    play(sim, { p1: 3 }, { p1: false }, () => expect(sim.cast('p1', { cheatId: 'confidence.all-in' }).ok).toBe(true));
    expect(st(sim).lastGain.p1).toBe(-150);

    const high = game({ highStakes: true });
    play(high, { p1: 3 }, { p1: true });
    play(high, { p1: 3 }, { p1: true });
    expect(st(high).scores.p1).toBe(600);
    play(high, { p1: 3 }, { p1: false }, () => expect(high.cast('p1', { cheatId: 'confidence.all-in' }).ok).toBe(true));
    expect(st(high).scores.p1).toBe(200);
  });

  it('Tied Fates swaps what the question did to two scores', () => {
    const sim = game();
    play(sim, { p1: 3, p2: 1 }, { p1: true, p2: false }, () => expect(sim.cast('p1', { cheatId: 'confidence.tied-fates', target: 'p2' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 0, p2: 300 });
    expect(st(sim).outcomes.p2.change).toBe(300);
  });

  it('Doubt Collector collects the points others lose to wrong wagers', () => {
    const sim = game();
    play(sim, { p2: 3 }, { p2: true });
    expect(st(sim).scores.p2).toBe(300);
    play(sim, { p2: 3 }, { p2: false }, () => expect(sim.cast('p1', { cheatId: 'confidence.doubt-collector' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 100, p2: 200 });
  });
});

describe('confidence pack: returning questions', () => {
  it('Call the Comet Back queues the question; Deflect the Comet removes it', () => {
    const sim = game({ returning: true });
    until(sim, 'wager');
    const len = st(sim).order.length;
    expect(sim.cast('p1', { cheatId: 'confidence.comet-return' }).ok).toBe(true);
    expect(st(sim).order).toHaveLength(len + 1);
    expect(st(sim).order.at(-1)).toBe(st(sim).order[st(sim).round]);
    expect(sim.cast('p2', { cheatId: 'confidence.comet-return' })).toMatchObject({ ok: false });
    expect(sim.cast('p2', { cheatId: 'confidence.comet-deflect' }).ok).toBe(true);
    expect(st(sim).order).toHaveLength(len);
    expect(sim.cast('p3', { cheatId: 'confidence.comet-deflect' })).toMatchObject({ ok: false });
    expect(game().cast('p1', { cheatId: 'confidence.comet-return' })).toMatchObject({ ok: false });
  });
});
