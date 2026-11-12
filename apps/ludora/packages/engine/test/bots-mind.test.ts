import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { estimateDifficulty, makeProfile, MIN_ANSWER_MS, nearNumber, practiceRoster, PracticeMind, type BotProfile } from '../src/bots/index.ts';
import { gradeAnswer } from '../src/questions/grade.ts';
import { MIXED_SET, NEW_TYPES_SET } from '../src/testing/fixtures.ts';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { classic } from '../src/modes/classic/index.ts';
import { createRng, type PracticeLevel } from '@ludora/shared';

const GRADED = [...MIXED_SET, ...NEW_TYPES_SET].filter((q) => q.type !== 'poll');

/** Every bot of a level answers each question once (fresh questions, no memory), with a generous clock. */
function sample(level: PracticeLevel, questions: readonly Question[] = GRADED, rosters = 120) {
  let right = 0;
  let n = 0;
  const times: number[] = [];
  for (let s = 0; s < rosters; s++) {
    for (const prof of practiceRoster(level, 4, s * 97 + 3)) {
      const m = new PracticeMind(prof);
      let now = 0;
      for (const q of questions) {
        const p = m.plan({ iid: `${q.id}#${s}`, q, shownAt: now, deadline: null, now, progress: null });
        n++;
        if (p.correct) right++;
        times.push(p.readyAt - now);
        m.commit(p.iid, p.readyAt);
        now = p.readyAt + 400;
      }
    }
  }
  return { accuracy: right / n, times };
}

const quantile = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * f)]!;

describe('a practice bot’s mind', () => {
  it('keeps each level’s accuracy in its band, with hard well above easy', () => {
    const easy = sample('easy').accuracy;
    const medium = sample('medium').accuracy;
    const hard = sample('hard').accuracy;
    const mixed = sample('mixed').accuracy;
    expect(easy).toBeGreaterThan(0.3);
    expect(easy).toBeLessThan(0.52);
    expect(medium).toBeGreaterThan(0.58);
    expect(medium).toBeLessThan(0.78);
    expect(hard).toBeGreaterThan(0.82);
    expect(hard).toBeLessThan(0.97);
    expect(mixed).toBeGreaterThan(easy);
    expect(mixed).toBeLessThan(hard);
  });

  it('misses hard questions more than easy ones', () => {
    const easyQs: Question[] = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, type: 'truefalse', prompt: `Short statement ${i}.`, correct: i % 2 === 0, difficulty: 'easy' }));
    const hardQs: Question[] = Array.from({ length: 10 }, (_, i) => ({
      id: `h${i}`,
      type: 'order',
      difficulty: 'hard',
      prompt: `Put these ${i} historical events in the order in which they happened, earliest first, thinking carefully about each one.`,
      items: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, text: `Event ${id}` })),
    }));
    expect(estimateDifficulty(hardQs[0]!)).toBeGreaterThan(estimateDifficulty(easyQs[0]!) + 0.4);
    const onEasy = sample('medium', easyQs, 60).accuracy;
    const onHard = sample('medium', hardQs, 60).accuracy;
    expect(onEasy).toBeGreaterThan(onHard + 0.3);
  });

  it('gets a question right more often the second time it sees it in a game', () => {
    let first = 0;
    let second = 0;
    let n = 0;
    for (let s = 0; s < 150; s++) {
      for (const prof of practiceRoster('medium', 4, s + 1)) {
        const m = new PracticeMind(prof);
        let now = 0;
        for (const round of [0, 1]) {
          for (const q of GRADED) {
            const p = m.plan({ iid: `${q.id}#${round}`, q, shownAt: now, deadline: null, now, progress: null });
            if (p.correct) {
              if (round === 0) first++;
              else second++;
            }
            if (round === 0) n++;
            m.commit(p.iid, p.readyAt);
            now = p.readyAt + 300;
          }
        }
      }
    }
    expect(second / n).toBeGreaterThan(first / n + 0.08);
  });

  it('answers with a human spread of times: bunched, a long tail, never instant, quicker when sure', () => {
    const { times } = sample('medium');
    expect(Math.min(...times)).toBeGreaterThanOrEqual(MIN_ANSWER_MS);
    const p10 = quantile(times, 0.1);
    const p50 = quantile(times, 0.5);
    const p95 = quantile(times, 0.95);
    // Right-skewed: the slow tail stretches much further above the middle than the quick end below it.
    expect(p95 - p50).toBeGreaterThan((p50 - p10) * 1.5);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    expect(mean).toBeGreaterThan(p50);
    // Sure answers come quicker than unsure ones on the same questions.
    let sureMs = 0;
    let sureN = 0;
    let unsureMs = 0;
    let unsureN = 0;
    for (let s = 0; s < 80; s++) {
      const m = new PracticeMind(makeProfile('steady', 'medium', s + 11));
      for (const q of GRADED) {
        const p = m.plan({ iid: `${q.id}#${s}`, q, shownAt: 0, deadline: null, now: 0, progress: null });
        if (p.sure > 0.5) {
          sureMs += p.readyAt;
          sureN++;
        } else {
          unsureMs += p.readyAt;
          unsureN++;
        }
      }
    }
    expect(sureMs / sureN).toBeLessThan(unsureMs / unsureN);
  });

  it('runs out of time on long questions with a short clock, and a guesser throws in more last-second answers', () => {
    const long: Question = {
      id: 'long',
      type: 'match',
      prompt: 'Match each of these words to the meaning that fits it best, reading every option carefully before you decide which goes where.',
      pairs: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, left: `Word ${id}`, right: `A meaning for the word ${id}` })),
    };
    const outcome = (persona: 'careful' | 'guesser') => {
      let timedOut = 0;
      let late = 0;
      for (let s = 0; s < 300; s++) {
        const m = new PracticeMind(makeProfile(persona, 'medium', s + 1));
        const p = m.plan({ iid: `x${s}`, q: long, shownAt: 0, deadline: 9000, now: 0, progress: null });
        if (!Number.isFinite(p.readyAt)) timedOut++;
        else if (p.readyAt > 7000) late++;
      }
      return { timedOut, late };
    };
    const careful = outcome('careful');
    const guesser = outcome('guesser');
    expect(careful.timedOut).toBeGreaterThan(30);
    expect(guesser.late).toBeGreaterThan(careful.late);
    expect(guesser.timedOut).toBeLessThan(careful.timedOut);
  });

  it('is wrong like a person: near numbers, look-alike choices, one swap in an order', () => {
    const rng = createRng(5);
    let near = 0;
    for (let i = 0; i < 400; i++) {
      const v = nearNumber(rng, 56, 0, 0.5);
      expect(v).not.toBe(56);
      if (Math.abs(v - 56) <= 6 || v === 65) near++;
    }
    expect(near / 400).toBeGreaterThan(0.7);

    // Of three wrong choices, the one that looks like the answer is picked far more than its share.
    const q: Question = { id: 'm', type: 'mcq', prompt: 'What is 7 × 8?', choices: [{ id: 'a', text: '56' }, { id: 'b', text: '57' }, { id: 'c', text: 'Purple' }, { id: 'd', text: 'Elephant' }], correct: 'a' };
    const picks: Record<string, number> = { b: 0, c: 0, d: 0 };
    const order: Question = { id: 'o', type: 'order', prompt: 'Smallest to largest.', items: ['w', 'x', 'y', 'z'].map((id) => ({ id, text: id })) };
    let oneSwap = 0;
    let orderWrong = 0;
    let partials = 0;
    for (let s = 0; s < 300; s++) {
      const m = new PracticeMind(makeProfile('quick', 'easy', s + 1));
      const p = m.plan({ iid: `m${s}`, q, shownAt: 0, deadline: null, now: 0, progress: null });
      if (p.answer.type === 'mcq' && p.answer.choiceId !== 'a') picks[p.answer.choiceId]!++;
      const o = new PracticeMind(makeProfile('careful', 'medium', s + 1)).plan({ iid: `o${s}`, q: order, shownAt: 0, deadline: null, now: 0, progress: null });
      if (!o.correct && o.answer.type === 'order') {
        orderWrong++;
        partials += gradeAnswer(order, o.answer).partial;
        // The common slip: everything in place but two neighbours the wrong way round.
        const moved = o.answer.itemIds.filter((id, i) => id !== order.items[i]!.id).length;
        if (moved === 2) oneSwap++;
      }
    }
    expect(picks.b!).toBeGreaterThan(picks.c! + picks.d!);
    // A random order of four has about a quarter in place; a person's wrong order keeps far more.
    expect(partials / orderWrong).toBeGreaterThan(0.4);
    expect(oneSwap / orderWrong).toBeGreaterThan(0.4);
  });

  it('gives two bots of the same personality different traits and answers, and replays exactly from a seed', () => {
    const [a, b] = [makeProfile('steady', 'medium', 1), makeProfile('steady', 'medium', 2)];
    expect(a.traits).not.toEqual(b.traits);
    const run = (p: BotProfile) => {
      const m = new PracticeMind(p);
      return GRADED.map((q, i) => {
        const plan = m.plan({ iid: `i${i}`, q, shownAt: i * 20_000, deadline: null, now: i * 20_000, progress: null });
        m.commit(plan.iid, plan.readyAt);
        return [plan.correct, Math.round(plan.readyAt)];
      });
    };
    expect(run(a)).not.toEqual(run(b));
    expect(run(a)).toEqual(run(makeProfile('steady', 'medium', 1)));
    expect(practiceRoster('mixed', 5, 9)).toEqual(practiceRoster('mixed', 5, 9));
  });

  it('feels a run of results: confidence grows on a streak, and a nervous bot is knocked harder by mistakes than a steady one', () => {
    const tf: Question = { id: 't', type: 'truefalse', prompt: 'A statement.', correct: true };
    const after = (persona: 'nervous' | 'steady', correct: boolean) => {
      const m = new PracticeMind(makeProfile(persona, 'medium', 3));
      // Force the outcome: a question it can only get right, or one it can only get wrong.
      for (let i = 0; i < 4; i++) {
        const p = m.plan({ iid: `${persona}${i}`, q: tf, shownAt: 0, deadline: null, now: 0, progress: null });
        (p as { correct: boolean }).correct = correct;
        m.commit(p.iid, 1000);
      }
      return m.mood;
    };
    expect(after('steady', true)).toBeGreaterThan(0.3);
    expect(after('nervous', false)).toBeLessThan(after('steady', false) - 0.3);
  });

  it('“My level” edges towards the player it follows', () => {
    const run = (theirs: number) => {
      let right = 0;
      let n = 0;
      for (let s = 0; s < 60; s++) {
        const m = new PracticeMind(makeProfile('steady', 'mine', s + 1), { follow: () => ({ answered: 20, correct: Math.round(20 * theirs), responseMsSum: 20 * 6000 }) });
        let now = 0;
        GRADED.forEach((q, i) => {
          const p = m.plan({ iid: `${i}`, q, shownAt: now, deadline: null, now, progress: null });
          if (i >= 10) {
            n++;
            if (p.correct) right++;
          }
          m.commit(p.iid, p.readyAt);
          now = p.readyAt + 200;
        });
      }
      return right / n;
    };
    expect(run(0.95)).toBeGreaterThan(run(0.3) + 0.15);
  });

  it('holds the action until it has thought, then answers through the runtime; without a mind the bot is untouched', () => {
    const t = { now: 0 };
    const make = () =>
      new GameRuntime({
        mode: classic,
        settings: { scoring: 'speed', leaderboard: true, autoAdvance: true, stealth: false, sudden: false, encore: false, doubleOrNothing: false, comeback: false, beat: false },
        common: { questionTimeSec: 30, timeLimitSec: 0, questionLimit: 0, shuffleQuestions: false, shuffleChoices: false, teamCount: 0, adaptive: false } as never,
        questions: MIXED_SET,
        players: [{ id: 'b1', name: 'Bot', teamId: null, isBot: true }],
        teams: [],
        seed: 1,
        clock: { now: () => t.now },
      });
    const rt = make();
    rt.start();
    const mind = new PracticeMind(makeProfile('careful', 'medium', 4));
    // Move into the first question.
    for (let i = 0; i < 20 && !(rt.view({ kind: 'player', playerId: 'b1' }) as { sync?: { phase: string } }).sync?.phase.startsWith('question'); i++) {
      t.now += rt.msUntilNextTimer() ?? 1000;
      rt.fireDueTimers();
    }
    const rng = createRng(1);
    expect(rt.botAction('b1', 0.5, rng, mind)).toBeNull();
    const wait = rt.botDelay('b1', rng, mind);
    expect(wait).toBeGreaterThan(300);
    t.now += wait;
    const act = rt.botAction('b1', 0.5, rng, mind) as { type: string } | null;
    expect(act?.type).toBe('answer');
    expect(mind.record.answered).toBe(1);
  });
});
