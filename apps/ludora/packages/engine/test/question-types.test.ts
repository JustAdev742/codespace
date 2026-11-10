import { describe, expect, it } from 'vitest';
import { createRng, parseBlanks, questionSchema, type Question } from '@ludora/shared';
import { MODES } from '../src/modes/index.ts';
import { adaptQuestions } from '../src/questions/adapt.ts';
import { correctAnswerFor, gradeAnswer, isGraded, revealAnswer, wrongAnswerFor } from '../src/questions/grade.ts';
import { answerFromTokens, answerToTokens, presentationOrder, revealToTokens, toPublicQuestion } from '../src/questions/present.ts';
import { prepareQuestions } from '../src/registry.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { ChaosSim } from '../src/testing/extras.ts';
import { NEW_TYPES_SET } from '../src/testing/fixtures.ts';

/* Poll, fill in the blanks and sort into groups: the schema, grading, what players see, bots, and how every mode copes. */

const byId = (id: string) => NEW_TYPES_SET.find((q) => q.id === id)!;
const valid = (q: unknown) => questionSchema.safeParse(q).success;

describe('new question types: schema', () => {
  it('accepts the fixtures', () => {
    for (const q of NEW_TYPES_SET) expect(valid(q), q.id).toBe(true);
  });
  it('needs one to three gaps, each with an answer, and closed brackets', () => {
    const base = { id: 'b', type: 'blanks', prompt: 'Fill in the blanks.' };
    expect(valid({ ...base, text: 'No gaps here.' })).toBe(false);
    expect(valid({ ...base, text: '[a] [b] [c] [d]' })).toBe(false);
    expect(valid({ ...base, text: 'An empty [] gap.' })).toBe(false);
    expect(valid({ ...base, text: 'An [open gap.' })).toBe(false);
    expect(valid({ ...base, text: 'Three [a] [b|bee] [c].' })).toBe(true);
  });
  it('puts every sorted item in a real group and every group to use', () => {
    const q = byId('n4') as Extract<Question, { type: 'sort' }>;
    expect(valid({ ...q, items: q.items.map((i, k) => (k === 0 ? { ...i, group: 'nope' } : i)) })).toBe(false);
    expect(valid({ ...q, items: q.items.map((i) => ({ ...i, group: 'm' })) })).toBe(false);
    expect(valid({ ...q, items: q.items.slice(0, 3) })).toBe(false);
    expect(valid({ ...q, groups: [q.groups[0]] })).toBe(false);
  });
  it('splits a sentence into pieces around its gaps, with other accepted answers after a bar', () => {
    expect(parseBlanks('Plants need [sunlight|light] and [water].')).toEqual({ pieces: ['Plants need ', ' and ', '.'], gaps: [{ accepted: ['sunlight', 'light'] }, { accepted: ['water'] }] });
  });
});

describe('new question types: grading', () => {
  it('gives a poll no right answer and no score', () => {
    const q = byId('n1');
    expect(isGraded(q)).toBe(false);
    expect(gradeAnswer(q, { type: 'poll', choiceId: 'b' })).toEqual({ correct: false, partial: 0, ungraded: true });
  });
  it('marks each typed gap, forgiving small typos and other accepted answers', () => {
    const q = byId('n2');
    expect(gradeAnswer(q, { type: 'blanks', values: ['Sunlihgt', 'water'] })).toEqual({ correct: true, partial: 1 });
    expect(gradeAnswer(q, { type: 'blanks', values: ['light', 'WATER!'] }).correct).toBe(true);
    expect(gradeAnswer(q, { type: 'blanks', values: ['soil', 'water'] })).toEqual({ correct: false, partial: 0.5 });
    expect(gradeAnswer(q, { type: 'blanks', values: [] })).toEqual({ correct: false, partial: 0 });
  });
  it('never forgives a number in a gap, and wants the exact word from a word bank', () => {
    expect(gradeAnswer(byId('n7'), { type: 'blanks', values: ['10'] }).correct).toBe(false);
    expect(gradeAnswer(byId('n7'), { type: 'blanks', values: ['0'] }).correct).toBe(true);
    expect(gradeAnswer(byId('n3'), { type: 'blanks', values: ['stra'] }).correct).toBe(false);
    expect(gradeAnswer(byId('n3'), { type: 'blanks', values: ['star'] }).correct).toBe(true);
  });
  it('gives part marks for each item sorted into the right group', () => {
    const q = byId('n4');
    expect(gradeAnswer(q, { type: 'sort', placement: { dog: 'm', owl: 'b', cat: 'm', hen: 'b', bat: 'm' } })).toEqual({ correct: true, partial: 1 });
    expect(gradeAnswer(q, { type: 'sort', placement: { dog: 'm', owl: 'b', cat: 'm', hen: 'b', bat: 'b' } })).toEqual({ correct: false, partial: 0.8 });
    expect(gradeAnswer(q, { type: 'sort', placement: {} }).partial).toBe(0);
  });
  it('reveals the right words and groups', () => {
    expect(revealAnswer(byId('n2'))).toEqual({ type: 'blanks', answers: ['sunlight', 'water'] });
    expect(revealAnswer(byId('n1'))).toEqual({ type: 'poll' });
    expect(revealAnswer(byId('n4'))).toMatchObject({ type: 'sort', placement: { dog: 'm', owl: 'b' } });
  });
  it('gives bots a right and a wrong answer for each type', () => {
    for (const q of NEW_TYPES_SET.filter(isGraded)) {
      expect(gradeAnswer(q, correctAnswerFor(q)).correct, q.id).toBe(true);
      expect(gradeAnswer(q, wrongAnswerFor(q, () => 0.4)).correct, q.id).toBe(false);
    }
    const poll = byId('n1') as Extract<Question, { type: 'poll' }>;
    expect(poll.choices.map((c) => c.id)).toContain((wrongAnswerFor(poll, () => 0.9) as { choiceId: string }).choiceId);
  });
});

describe('new question types: what players see', () => {
  const rng = createRng(5);
  it('shows a sort question with tokens only, the items shuffled and no group on any item', () => {
    const q = byId('n4');
    for (let k = 0; k < 10; k++) {
      const order = presentationOrder(q, rng, false)!;
      const pub = toPublicQuestion(q, order);
      const json = JSON.stringify(pub);
      expect(json).not.toMatch(/"(dog|owl|cat|hen|bat|m|b)"/);
      if (pub.type !== 'sort') throw new Error('sort expected');
      expect(pub.items.every((i) => Object.keys(i).sort().join() === 'id,text')).toBe(true);
      expect(pub.groups.map((g) => g.id)).toEqual(['g0', 'g1']);
      expect(order).not.toEqual(['dog', 'owl', 'cat', 'hen', 'bat']);
      // A player's right answer in tokens grades right, and the reveal comes back in the same tokens.
      const right = answerToTokens(q, order, correctAnswerFor(q));
      expect(gradeAnswer(q, answerFromTokens(q, order, right)).correct).toBe(true);
      const reveal = revealToTokens(q, order, revealAnswer(q));
      expect(reveal).toEqual({ type: 'sort', placement: (right as { placement: Record<string, string> }).placement });
      // Made-up tokens grade as wrong.
      expect(gradeAnswer(q, answerFromTokens(q, order, { type: 'sort', placement: { i0: 'g9', x: 'g0' } })).correct).toBe(false);
    }
  });
  it('shows a sentence with gaps but not their answers, and a shuffled word bank only when asked for', () => {
    const typed = toPublicQuestion(byId('n2'), presentationOrder(byId('n2'), rng, false));
    expect(typed).toEqual({ type: 'blanks', prompt: 'Fill in the blanks.', pieces: ['Plants need ', ' and ', ' to grow.'] });
    const q = byId('n3');
    const seen = new Set<string>();
    for (let k = 0; k < 12; k++) {
      const pub = toPublicQuestion(q, presentationOrder(q, rng, false));
      if (pub.type !== 'blanks') throw new Error('blanks expected');
      expect([...pub.bank!].sort()).toEqual(['comet', 'moon', 'planet', 'star']);
      seen.add(pub.bank!.join());
    }
    // Never in the stored order (the answers, then the extra words), and not always the same.
    expect(seen.has('star,planet,moon,comet')).toBe(false);
    expect(seen.size).toBeGreaterThan(1);
  });
  it('shows a poll as choices with tokens', () => {
    const q = byId('n1');
    const order = presentationOrder(q, rng, true);
    const pub = toPublicQuestion(q, order);
    expect(pub.type).toBe('poll');
    if (pub.type === 'poll') expect(pub.choices.map((c) => c.id).sort()).toEqual(['c0', 'c1', 'c2']);
    expect(answerFromTokens(q, order, { type: 'poll', choiceId: 'c1' })).toEqual({ type: 'poll', choiceId: order![1] });
  });
});

describe('new question types: modes that cannot show them', () => {
  it('turns a one-gap sentence into a typed question, or a choice from its word bank', () => {
    const r = adaptQuestions(NEW_TYPES_SET, ['mcq', 'short'], createRng(3));
    const typed = r.questions.find((q) => q.id === 'n7');
    expect(typed).toMatchObject({ type: 'short', prompt: 'Complete the sentence. Water freezes at _____ degrees Celsius.', accepted: ['0'] });
    const bank = r.questions.find((q) => q.id === 'n3');
    expect(bank?.type).toBe('mcq');
    if (bank?.type === 'mcq') {
      expect(bank.choices.find((c) => c.id === bank.correct)?.text).toBe('star');
      expect(bank.prompt).toBe('Choose the missing word. The Sun is a _____.');
    }
  });
  it('leaves out polls, sorting and longer sentences with a reason the host can read', () => {
    const r = adaptQuestions(NEW_TYPES_SET, ['mcq', 'short'], createRng(3));
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));
    expect(reasons.n1).toMatch(/cannot show polls/);
    expect(reasons.n4).toMatch(/cannot show sorting/);
    expect(reasons.n2).toMatch(/more than one gap/);
  });
  it('declares or cleanly leaves out each new type in every mode', () => {
    for (const mode of MODES.filter((m) => m.meta.status !== 'planned')) {
      const r = adaptQuestions(NEW_TYPES_SET, mode.meta.questionTypes, createRng(1));
      for (const q of NEW_TYPES_SET) {
        const kept = r.questions.find((x) => x.id === q.id);
        const skipped = r.skipped.find((x) => x.id === q.id);
        expect(Boolean(kept) !== Boolean(skipped), `${mode.meta.id} ${q.id}`).toBe(true);
        if (kept && kept.type !== q.type) expect(mode.meta.questionTypes, `${mode.meta.id} converted ${q.id}`).toContain(kept.type);
        if (skipped) expect(skipped.reason.length, `${mode.meta.id} ${q.id}`).toBeGreaterThan(20);
      }
      // A poll only goes where a mode can show the room's split and score nothing.
      expect(mode.meta.questionTypes.includes('poll'), mode.meta.id).toBe(mode.meta.id === 'classic');
    }
  });
});

describe('new question types: played with bots in every mode that shows them', () => {
  for (const mode of MODES.filter((m) => m.meta.status !== 'planned' && (m.meta.questionTypes.includes('sort') || m.meta.questionTypes.includes('blanks')))) {
    it(`${mode.meta.id} plays a game of them to the end`, () => {
      const prepared = prepareQuestions(mode, NEW_TYPES_SET, 7);
      if (prepared.problem) throw new Error(prepared.problem);
      const r = simulateGame({ modeId: mode.meta.id, questions: NEW_TYPES_SET, players: Math.max(2, Math.min(4, mode.meta.players.max)), seed: 21 });
      expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
      expect(r.results).not.toBeNull();
    });
  }
});

describe('a poll in Classic', () => {
  const run = (settings: Record<string, unknown>) => {
    const sim = new ChaosSim({ modeId: 'classic', questions: [byId('n1'), byId('n5'), byId('n8'), byId('n2')], players: 4, seed: 3, settings, common: { shuffleQuestions: false } });
    return sim;
  };
  it('scores nothing, keeps streaks and shows how the room split at the reveal', () => {
    const sim = run({});
    for (let t = 0; t < 60_000 && sim.state().sync.phase !== 'reveal'; t += 250) sim.run(250);
    const st = sim.state();
    expect(st.sync.round).toBe(0);
    expect(Object.values(st.sync.scores).every((v) => v === 0)).toBe(true);
    const answers = Object.values(st.sync.answers) as { ungraded?: boolean; points: number }[];
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every((a) => a.ungraded && a.points === 0)).toBe(true);
    const view = (sim.rt.view({ kind: 'player', playerId: 'p1' }) as { sync: { reveal: unknown; distribution: Record<string, number>; you: { correct: boolean | null } } }).sync;
    expect(view.reveal).toEqual({ type: 'poll' });
    expect(Object.values(view.distribution).reduce((a, b) => a + b, 0)).toBe(answers.length);
    expect(view.you.correct).toBeNull();
  });
  it('knocks nobody out in sudden death and leaves a poll out of the results', () => {
    const sim = run({ suddenDeath: true });
    for (let t = 0; t < 60_000 && sim.state().sync.round < 1; t += 250) sim.run(250);
    expect(Object.keys(sim.state().out)).toEqual([]);
    for (let t = 0; t < 300_000 && sim.rt.status === 'running'; t += 1000) sim.run(1000);
    const results = sim.rt.results;
    expect(results).not.toBeNull();
    expect(results!.answers.some((a) => a.qid === 'n5')).toBe(true);
    expect(results!.answers.some((a) => a.qid === 'n1')).toBe(false);
  });
});

describe('double points and why notes', () => {
  const base: Question[] = [
    { id: 'd1', type: 'mcq', prompt: 'Which gas do plants take in?', choices: [{ id: 'o', text: 'Oxygen', why: 'Plants give oxygen out.' }, { id: 'c', text: 'Carbon dioxide' }, { id: 'n', text: 'Neon' }], correct: 'c', doublePoints: true },
    { id: 'd2', type: 'truefalse', prompt: 'Ice floats.', correct: true },
    { id: 'd3', type: 'truefalse', prompt: 'Fish fly.', correct: false },
  ];
  it('keeps why notes off the question and sends them, in tokens, with the reveal', () => {
    const q = base[0]!;
    const order = presentationOrder(q, createRng(2), true);
    expect(JSON.stringify(toPublicQuestion(q, order))).not.toContain('Plants give');
    expect(toPublicQuestion(q, order).double).toBe(true);
    const reveal = revealToTokens(q, order, revealAnswer(q));
    const oxygen = `c${order!.indexOf('o')}`;
    expect(reveal).toMatchObject({ type: 'mcq', whys: { [oxygen]: 'Plants give oxygen out.' } });
  });
  it('doubles the points of a double-points question in a quiz round', () => {
    const play = (questions: Question[]) => {
      const sim = new ChaosSim({ modeId: 'classic', questions, players: 3, seed: 4, skill: 1, settings: {}, common: { shuffleQuestions: false } });
      for (let t = 0; t < 60_000 && sim.state().sync.phase !== 'reveal'; t += 250) sim.run(250);
      return Object.values(sim.state().sync.answers as Record<string, { points: number }>).map((a) => a.points);
    };
    const doubled = play(base);
    const plain = play([{ ...base[0]!, doublePoints: undefined } as Question, base[1]!, base[2]!]);
    expect(doubled.length).toBeGreaterThan(0);
    expect(doubled).toEqual(plain.map((p) => p * 2));
  });
});
