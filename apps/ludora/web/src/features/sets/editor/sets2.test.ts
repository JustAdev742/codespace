import { describe, expect, it } from 'vitest';
import { questionSchema, SET_BACKDROPS, SOUND_BANK_IDS, type Question } from '@ludora/shared';
import { parseQuickAdd } from './quickAdd.ts';
import { checkSum, makeSum, mathsDrill, readPairs, readTimeline, timelineQuestions, vocabQuestions, type DrillOp } from './templates.ts';
import { findMissing } from './missing.ts';
import { blankDetails, blankQuestion, buildSetCandidate, detailsFromSet, fromQuestion, reviveDetails, reviveQuestion, toCandidate } from './model.ts';
import { findMatches, replaceAll } from './findReplace.ts';
import { downmix, encodeWav, fitSide, trimSilence } from '../sound/encode.ts';
import { SOUND_BANK } from '../../../lib/sound/bank.ts';
import { BACKDROPS } from '../../room/game/Backdrop.tsx';

let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const valid = (qs: Question[]) => qs.every((q) => questionSchema.safeParse(q).success);

describe('quick add', () => {
  const text = `What is 7 x 8? = 56
Capital of France? = Paris | paris
How long is the pencil? = 12 cm
The Sun is a star. = true
F: Bats are birds.
bonjour :: hello
Plants need [sunlight] and [water].
Oldest first: Rome > Paris > Berlin
Match: cat = chat; dog = chien; bird = oiseau
Which are mammals?
* whale
- shark
+ bat
Which planet is red?
a) Venus
* Mars
c) Jupiter
Not finished yet
Only a question
- one choice`;
  const r = parseQuickAdd(text);

  it('reads every kind of line into the right question type', () => {
    expect(r.questions.map((q) => q.type)).toEqual(['numeric', 'short', 'numeric', 'truefalse', 'truefalse', 'flashcard', 'blanks', 'order', 'match', 'multi', 'mcq']);
    expect(valid(r.questions)).toBe(true);
    const [n, s, unit, t, f] = r.questions;
    expect(n).toMatchObject({ answer: 56 });
    expect(s).toMatchObject({ accepted: ['Paris', 'paris'] });
    expect(unit).toMatchObject({ answer: 12, unit: 'cm' });
    expect(t).toMatchObject({ correct: true });
    expect(f).toMatchObject({ correct: false, prompt: 'Bats are birds.' });
    const multi = r.questions[9]!;
    expect(multi.type === 'multi' && multi.correct).toEqual(['c1', 'c3']);
    const mcq = r.questions[10]!;
    expect(mcq.type === 'mcq' && mcq.choices.find((c) => c.id === mcq.correct)?.text).toBe('Mars');
    const order = r.questions[7]!;
    expect(order.type === 'order' && order.items.map((i) => i.text)).toEqual(['Rome', 'Paris', 'Berlin']);
  });

  it('names the lines it could not read, with what to do', () => {
    expect(r.problems.map((p) => p.line)).toEqual([18, 19]);
    expect(r.problems[0]!.message).toMatch(/equals sign/);
    expect(r.problems[1]!.message).toMatch(/at least two choices/);
  });

  it('asks for a right answer to be marked', () => {
    expect(parseQuickAdd('Pick one\n- a\n- b').problems[0]!.message).toMatch(/Mark the right choice/);
  });

  it('copes with blank lines, spaces and an empty box', () => {
    expect(parseQuickAdd('').questions).toEqual([]);
    expect(parseQuickAdd('\n\n   2 + 2   =   4   \n\n').questions[0]).toMatchObject({ type: 'numeric', prompt: '2 + 2', answer: 4 });
  });
});

describe('templates', () => {
  it('generates maths drills whose every answer checks out, for each operation', () => {
    for (const op of ['add', 'subtract', 'multiply', 'divide'] as DrillOp[]) {
      for (let k = 0; k < 200; k++) expect(checkSum(makeSum(op, 1, 12, random))).toBe(true);
      const qs = mathsDrill({ ops: [op], min: 2, max: 12, count: 10, as: 'numeric' }, random);
      expect(qs).toHaveLength(10);
      for (const q of qs) {
        const [a, b] = q.prompt.match(/\d+/g)!.map(Number);
        const want = op === 'add' ? a! + b! : op === 'subtract' ? a! - b! : op === 'multiply' ? a! * b! : a! / b!;
        expect(q.type === 'numeric' && q.answer).toBe(want);
        expect(want).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(want)).toBe(true);
      }
    }
  });

  it('makes choice drills with one right answer and no repeats', () => {
    const qs = mathsDrill({ ops: ['multiply', 'add'], min: 2, max: 9, count: 12, as: 'mcq' }, random);
    expect(valid(qs)).toBe(true);
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(qs.length);
    for (const q of qs) {
      if (q.type !== 'mcq') throw new Error('mcq expected');
      expect(new Set(q.choices.map((c) => c.text)).size).toBe(q.choices.length);
    }
  });

  it('turns vocabulary pairs into several question types at once', () => {
    const { pairs, skipped } = readPairs('chat = cat\nchien - dog\noiseau: bird\npoisson\tfish\nnot a pair');
    expect(pairs).toHaveLength(4);
    expect(skipped).toEqual(['not a pair']);
    const qs = vocabQuestions(pairs, ['flashcard', 'choice', 'reverse', 'typed', 'match'], random);
    expect(valid(qs)).toBe(true);
    const types = qs.map((q) => q.type);
    expect(types.filter((t) => t === 'flashcard')).toHaveLength(4);
    expect(types.filter((t) => t === 'mcq')).toHaveLength(8);
    expect(types.filter((t) => t === 'short')).toHaveLength(4);
    expect(types.filter((t) => t === 'match')).toHaveLength(1);
    const pick = qs.find((q) => q.type === 'mcq' && q.prompt.includes('"chat"'));
    expect(pick?.type === 'mcq' && pick.choices.find((c) => c.id === pick.correct)?.text).toBe('cat');
  });

  it('turns a timeline into ordering questions in the right order', () => {
    const { events, skipped } = readTimeline('1066 Battle of Hastings\n1215: Magna Carta\n55 BC Caesar lands in Britain\nAD 43 Romans invade\n1666 Great Fire of London\n1945 End of the Second World War\nnope');
    expect(events).toHaveLength(6);
    expect(skipped).toEqual(['nope']);
    expect(events.find((e) => e.what.startsWith('Caesar'))?.when).toBe(-55);
    const qs = timelineQuestions(events, { perQuestion: 3, firstOf: true }, random);
    expect(valid(qs)).toBe(true);
    const when = new Map(events.map((e) => [e.what, e.when]));
    for (const q of qs) {
      if (q.type === 'order') {
        const years = q.items.map((i) => when.get(i.text)!);
        expect([...years].sort((a, b) => a - b)).toEqual(years);
      }
      if (q.type === 'mcq') {
        const right = when.get(q.choices.find((c) => c.id === q.correct)!.text)!;
        expect(Math.min(...q.choices.map((c) => when.get(c.text)!))).toBe(right);
      }
    }
    expect(qs.some((q) => q.type === 'order')).toBe(true);
    expect(qs.some((q) => q.type === 'mcq')).toBe(true);
  });
});

describe('missing things', () => {
  const q = (o: Partial<Question> & { type: Question['type'] }) => fromQuestion({ id: `q${Math.floor(random() * 1e6)}`, prompt: 'Question?', ...o } as Question);
  it('finds no explanation, no description, no caption, repeats and giveaways', () => {
    const drafts = [
      q({ type: 'mcq', prompt: 'Which is a mammal, the whale or the shark?', choices: [{ id: 'a', text: 'whale' }, { id: 'b', text: 'shark' }], correct: 'a', explanation: 'Whales breathe air.' }),
      q({ type: 'mcq', prompt: 'Pick one', choices: [{ id: 'a', text: 'All of the above' }, { id: 'b', text: 'x' }], correct: 'a', explanation: 'e' }),
      q({ type: 'mcq', prompt: 'Why is the sky blue?', choices: [{ id: 'a', text: 'Because air scatters blue light more than red' }, { id: 'b', text: 'Paint' }, { id: 'c', text: 'Magic' }], correct: 'a', explanation: 'e' }),
      q({ type: 'truefalse', prompt: 'Listen.', correct: true, explanation: 'e', sound: { kind: 'bank', id: 'tone-high', caption: '' }, media: { kind: 'image', url: '/uploads/a.png', alt: '' } }),
      q({ type: 'short', prompt: 'Spell elephant', accepted: ['elephant'] }),
      q({ type: 'short', prompt: 'Spell elephant', accepted: ['elephant'] }),
    ];
    const found = findMissing(drafts, { shuffleAnswers: true });
    const kinds = (n: number) => found.filter((f) => f.number === n).map((f) => f.kind);
    expect(kinds(1)).toEqual(['giveaway']);
    expect(kinds(2)).toEqual(['giveaway']);
    expect(kinds(3)).toEqual(['giveaway']);
    expect(kinds(4)).toEqual(['description', 'caption']);
    expect(kinds(5)).toEqual(['explanation', 'giveaway']);
    expect(kinds(6)).toEqual(['duplicate', 'explanation', 'giveaway']);
  });

  it('notices the right answer is always in the same place when answers are not shuffled', () => {
    const drafts = Array.from({ length: 4 }, (_, i) => q({ type: 'mcq', prompt: `Q${i}`, choices: [{ id: 'a', text: `right ${i}` }, { id: 'b', text: `wrong ${i}` }], correct: 'a', explanation: 'e' }));
    expect(findMissing(drafts).some((f) => f.questionId === null && /always choice A/.test(f.message))).toBe(true);
    expect(findMissing(drafts, { shuffleAnswers: true }).some((f) => f.questionId === null)).toBe(false);
  });
});

describe('find and replace', () => {
  const drafts = [
    fromQuestion({ id: 'a', type: 'mcq', prompt: 'Colour of the sky?', choices: [{ id: 'x', text: 'Blue colour' }, { id: 'y', text: 'Red' }], correct: 'x', explanation: 'The colour comes from light.', hint: 'Look up at the colour' }),
    fromQuestion({ id: 'b', type: 'short', prompt: 'Spell colour', accepted: ['colour', 'color'] }),
  ];
  it('counts matches in prompts, answers, explanations and hints, with or without case', () => {
    expect(findMatches(drafts, "colour", { matchCase: false }).total).toBe(6);
    expect(findMatches(drafts, 'Colour', { matchCase: true }).total).toBe(1);
    expect(findMatches(drafts, '', { matchCase: false }).total).toBe(0);
  });
  it('replaces every match and leaves ids alone', () => {
    const out = replaceAll(drafts, 'colour', 'color', { matchCase: false });
    expect(out[0]!.prompt).toBe('color of the sky?');
    expect(out[0]!.choices[0]!.text).toBe('Blue color');
    expect(out[0]!.explanation).toBe('The color comes from light.');
    expect(out[0]!.hint).toBe('Look up at the color');
    expect(out[1]!.accepted.map((a) => a.text)).toEqual(['color', 'color']);
    expect(out[0]!.choices[0]!.id).toBe('x');
    // A search string with regex characters is taken as plain text.
    expect(findMatches(drafts, '?', { matchCase: false }).total).toBe(1);
  });
});

describe('sound, hints and feel in the editor model', () => {
  it('saves a sound, a choice sound and a hint, and reads them back', () => {
    const q: Question = { id: 'q1', type: 'mcq', prompt: 'Which note is higher?', hint: 'Listen twice', sound: { kind: 'speech', text: 'Which is higher?', lang: 'en-GB', caption: 'The question is read out' }, choices: [{ id: 'a', text: '', sound: { kind: 'bank', id: 'note-c5', caption: 'A high note' } }, { id: 'b', text: '', sound: { kind: 'bank', id: 'note-c4', caption: 'A low note' } }], correct: 'a' };
    const d = fromQuestion(q);
    expect(questionSchema.parse(toCandidate(d).question)).toEqual(q);
    expect(reviveQuestion(JSON.parse(JSON.stringify(d)))).toMatchObject({ hint: 'Listen twice', sound: q.sound, choices: [{ sound: { id: 'note-c5' } }, { sound: { id: 'note-c4' } }] });
  });

  it('keeps a half-finished sound in a draft but not a made-up one', () => {
    const d = { ...blankQuestion('truefalse', 'q2'), sound: { kind: 'bank', id: 'nope', caption: '' } };
    expect(reviveQuestion(d)?.sound).toBeUndefined();
    const ok = { ...blankQuestion('truefalse', 'q3'), sound: { kind: 'clip', url: `/uploads/${'a'.repeat(32)}.wav`, seconds: 2, caption: '' } };
    expect(reviveQuestion(ok)?.sound).toMatchObject({ kind: 'clip', caption: '' });
  });

  it('saves the feel and play choices with the set, and only when chosen', () => {
    const details = { ...blankDetails(), title: 'T', subject: 'music' as const, readingTime: 'auto' as const, madeFor: ['classic'], feel: { right: 'note-c5' as const, accent: 120 } };
    const c = buildSetCandidate(details, []);
    expect(c.defaults).toEqual({ readingTime: 'auto', modes: ['classic'], feel: { right: 'note-c5', accent: 120 } });
    expect(buildSetCandidate({ ...blankDetails(), title: 'T' }, []).defaults).toBeUndefined();
    const back = detailsFromSet({ title: 'T', description: '', subject: 'music', gradeBand: null, tags: [], visibility: 'private', cover: null, defaults: c.defaults as never });
    expect(back).toMatchObject({ readingTime: 'auto', madeFor: ['classic'], feel: { right: 'note-c5', accent: 120 } });
    expect(reviveDetails(JSON.parse(JSON.stringify(back)))).toMatchObject({ readingTime: 'auto', madeFor: ['classic'], feel: { right: 'note-c5', accent: 120 } });
  });
});

describe('clip preparation and picture shrinking', () => {
  it('mixes channels, trims silence and writes a 16-bit mono WAV', () => {
    expect(Array.from(downmix([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([0.5, 0]);
    const rate = 1000;
    const s = new Float32Array(3000);
    s.fill(0.5, 1000, 2000);
    const t = trimSilence(s, rate);
    expect(t.length).toBe(1000 + 2 * 80);
    expect(trimSilence(new Float32Array(100), rate).length).toBe(0);
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768]);
  });

  it('fits a picture inside a longest side without stretching it', () => {
    expect(fitSide(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitSide(300, 200, 1600)).toEqual({ width: 300, height: 200 });
    expect(fitSide(1000, 4000, 800)).toEqual({ width: 200, height: 800 });
  });
});

describe('the sound bank and backdrops', () => {
  it('has a sound, a label and a caption for every bank id', () => {
    for (const id of SOUND_BANK_IDS) {
      const b = SOUND_BANK[id];
      expect(b.label, id).toBeTruthy();
      expect(b.caption, id).toBeTruthy();
      expect(Boolean(b.sfx) !== Boolean(b.voice), id).toBe(true);
    }
  });
  it('offers the same backdrops a set can choose as the big screen draws', () => {
    expect([...SET_BACKDROPS]).toEqual([...BACKDROPS]);
  });
});
