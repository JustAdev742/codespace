import { describe, expect, it } from 'vitest';
import { createRng, type Question } from '@ludora/shared';
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

const id = (slug: string) => `confidence.${slug}`;
const banner = (sim: ChaosSim, who: string) => sim.view(who).overlays.find((o) => o.kind === 'banner')?.text;
const questionOf = (sim: ChaosSim) => (sim.rt as unknown as { questionMap: Map<string, Question> }).questionMap.get(st(sim).order[st(sim).round])!;

describe('confidence pack: more wagers', () => {
  it('Confidence Swap trades two players\' confidence, only before either has answered', () => {
    const sim = game();
    until(sim, 'wager');
    expect(wager(sim, 'p1', 3).ok).toBe(true);
    expect(wager(sim, 'p2', 1).ok).toBe(true);
    expect(sim.cast('p1', { cheatId: id('confidence-swap'), target: 'p2' }).ok).toBe(true);
    expect(st(sim).wagers).toMatchObject({ p1: 1, p2: 3 });
    // Not choosing counts as guessing, which is what Bot 1 is now.
    expect(sim.cast('p3', { cheatId: id('confidence-swap'), target: 'p1' })).toMatchObject({ ok: false });
    until(sim, 'question');
    right(sim, 'p1');
    expect(sim.cast('p2', { cheatId: id('confidence-swap'), target: 'p1' })).toMatchObject({ ok: false });
  });

  it('Butterflies stops an opponent being certain, and drops a certain they had chosen', () => {
    const sim = game();
    until(sim, 'wager');
    expect(wager(sim, 'p2', 3).ok).toBe(true);
    expect(sim.cast('p1', { cheatId: id('butterflies'), target: 'p2' }).ok).toBe(true);
    expect(st(sim).wagers.p2).toBe(2);
    const r = wager(sim, 'p2', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Butterflies/);
    expect(wager(sim, 'p2', 1).ok).toBe(true);
    expect(wager(sim, 'p3', 3).ok).toBe(true);
  });
});

describe('confidence pack: seeing more', () => {
  it('Read the Room shows how sure everyone else is, live, until the choices appear', () => {
    const sim = game();
    until(sim, 'wager');
    expect(wager(sim, 'p2', 3).ok).toBe(true);
    expect(sim.cast('p1', { cheatId: id('read-the-room') }).ok).toBe(true);
    expect(banner(sim, 'p1')).toBe('How sure they are: Bot 2 certain, Bot 3 not chosen yet, Bot 4 not chosen yet.');
    expect(banner(sim, 'p2')).toBeUndefined();
    expect(wager(sim, 'p3', 1).ok).toBe(true);
    sim.run(300);
    expect(banner(sim, 'p1')).toBe('How sure they are: Bot 2 certain, Bot 3 guessing, Bot 4 not chosen yet.');
    until(sim, 'question');
    sim.run(300);
    expect(banner(sim, 'p1')).toBeUndefined();
    expect(sim.cast('p2', { cheatId: id('read-the-room') })).toMatchObject({ ok: false });
  });

  it('Choice Glimpse shows the coming choices during the wager, only for a question with choices', () => {
    const sim = game();
    const tried = new Set<string>();
    for (let i = 0; i < 12 && tried.size < 2; i++) {
      until(sim, 'wager');
      const q = questionOf(sim);
      const kind = q.type === 'mcq' ? 'mcq' : q.type === 'multi' ? 'multi' : 'none';
      if (kind === 'none' && !tried.has('none')) {
        expect(sim.cast('p1', { cheatId: id('choice-glimpse') })).toMatchObject({ ok: false });
        tried.add('none');
      } else if (kind === 'mcq' && !tried.has('mcq')) {
        expect(sim.cast('p1', { cheatId: id('choice-glimpse') }).ok).toBe(true);
        const texts = (q as { choices: { text: string }[] }).choices.map((c) => c.text).sort((a, b) => a.localeCompare(b));
        expect(banner(sim, 'p1')).toBe(`Coming up: ${texts.join(' · ')}`);
        until(sim, 'question');
        sim.run(300);
        expect(banner(sim, 'p1')).toBeUndefined();
        tried.add('mcq');
      }
      until(sim, 'question');
    }
    expect([...tried].sort()).toEqual(['mcq', 'none']);
  });

  it('Scout Report shows an opponent\'s record at each level, to the caster only', () => {
    const sim = game();
    until(sim, 'wager');
    expect(sim.cast('p1', { cheatId: id('scout-report'), target: 'p2' })).toMatchObject({ ok: false });
    play(sim, { p2: 3 }, { p2: true });
    play(sim, { p2: 2 }, { p2: false });
    expect(sim.cast('p1', { cheatId: id('scout-report'), target: 'p2' }).ok).toBe(true);
    expect(banner(sim, 'p1')).toBe('Bot 2 so far: guessing 0 (0 right), fairly sure 1 (0 right), certain 1 (1 right).');
    expect(banner(sim, 'p2')).toBeUndefined();
  });
});

describe('confidence pack: more scoring', () => {
  it('Honest Guess pays a wrong guess what a right one would, and nothing else', () => {
    const sim = game();
    play(sim, { p1: 1 }, { p1: false }, () => expect(sim.cast('p1', { cheatId: id('honest-guess') }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(100);
    expect(st(sim).outcomes.p1).toMatchObject({ correct: false, change: 100 });
    sim.run(60_000);
    play(sim, { p1: 2 }, { p1: false }, () => expect(sim.cast('p1', { cheatId: id('honest-guess') }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(50);
  });

  it('Danger Round makes wrong answers cost High Stakes points; not in a High Stakes game', () => {
    const sim = game();
    play(sim, { p2: 3 }, { p2: true });
    play(sim, { p2: 2, p3: 1 }, { p2: false, p3: false }, () => expect(sim.cast('p1', { cheatId: id('danger-round') }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p2: 100, p3: 0 });
    expect(st(sim).outcomes.p2.change).toBe(-200);
    const high = game({ highStakes: true });
    until(high, 'wager');
    expect(high.cast('p1', { cheatId: id('danger-round') })).toMatchObject({ ok: false });
  });

  it('Phone a Friend scores you as right or wrong as the friend was, at your own confidence', () => {
    const sim = game();
    play(sim, { p1: 3, p2: 1 }, { p1: false, p2: true }, () => expect(sim.cast('p1', { cheatId: id('phone-a-friend'), target: 'p2' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 300, p2: 100 });
    // The record of the answer itself stays honest.
    expect(st(sim).outcomes.p1).toMatchObject({ correct: false, change: 300 });
    sim.run(60_000);
    play(sim, { p1: 2, p2: 2 }, { p1: true, p2: true }, () => expect(sim.cast('p1', { cheatId: id('phone-a-friend'), target: 'p2' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 500, p2: 300 });
    expect(game().cast('p1', { cheatId: id('phone-a-friend'), target: 'p1' })).toMatchObject({ ok: false });
  });

  it('Against the Crowd doubles a right answer that fewer than half got', () => {
    const sim = game();
    play(sim, { p1: 2 }, { p1: true }, () => expect(sim.cast('p1', { cheatId: id('against-the-crowd') }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(400);
    sim.run(60_000);
    play(sim, { p1: 2 }, { p1: true, p2: true, p3: true }, () => expect(sim.cast('p1', { cheatId: id('against-the-crowd') }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(600);
  });

  it('Side Bet moves 100 points between you and the opponent, whichever way their answer goes', () => {
    const sim = game();
    play(sim, { p1: 1, p2: 1, p3: 1 }, { p1: true, p2: true, p3: true });
    play(sim, { p2: 1 }, { p2: false }, () => expect(sim.cast('p1', { cheatId: id('side-bet'), target: 'p2' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 200, p2: 0 });
    expect([st(sim).outcomes.p1.change, st(sim).outcomes.p2.change]).toEqual([100, -100]);
    sim.run(60_000);
    until(sim, 'wager');
    expect(sim.cast('p1', { cheatId: id('side-bet'), target: 'p2' })).toMatchObject({ ok: false });
    play(sim, { p3: 1 }, { p3: true }, () => expect(sim.cast('p1', { cheatId: id('side-bet'), target: 'p3' }).ok).toBe(true));
    expect(st(sim).scores).toMatchObject({ p1: 100, p3: 300 });
  });

  it('Called It pays a right call about the room 100 and costs a wrong one 50', () => {
    const sim = game();
    play(sim, { p1: 1 }, { p1: true });
    play(sim, { p1: 1 }, { p1: true }, () => expect(sim.cast('p1', { cheatId: id('called-it'), params: { call: 'few' } }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(300);
    sim.run(60_000);
    play(sim, { p1: 1 }, { p1: true }, () => expect(sim.cast('p1', { cheatId: id('called-it'), params: { call: 'most' } }).ok).toBe(true));
    expect(st(sim).scores.p1).toBe(350);
  });
});
