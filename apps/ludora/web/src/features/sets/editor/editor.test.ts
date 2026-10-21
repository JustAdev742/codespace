// The set editor's pure modules: CSV, importers, exporters, the draft model and validation.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { questionSchema, type Question } from '@ludora/shared';
import { parseCsv, toCsv, splitList, splitPair, guardCell, unguardCell, escapeListPart, detectDelimiter } from './csv.ts';
import { parseImport, detectFormat, parseNumberAnswer, normaliseType, resolveChoice, jsonErrorOffset } from './importers.ts';
import { exportCsv, exportJson, csvTemplate, fileSlug, questionToCsvRow } from './exporters.ts';
import { PASTE_EXAMPLE, JSON_EXAMPLE } from './formats.ts';
import { blankDetails, blankQuestion, changeType, fromQuestion, toCandidate, parseNumberText, splitTags, reviveQuestion, isBlankQuestion, answerSummary, newId, ID_PATTERN } from './model.ts';
import { validateSet, problemsFromServer } from './validation.ts';


/* ------------------------------- CSV parser -------------------------------- */
test('csv: quoted commas, newlines, doubled quotes, CRLF, BOM', () => {
  const r = parseCsv('﻿a,b,c\r\n"x, y","line1\r\nline2","say ""hi"""\r\n');
  assert.deepEqual(r.records.map((x) => x.cells), [['a', 'b', 'c'], ['x, y', 'line1\nline2', 'say "hi"']]);
  assert.equal(r.records[1]!.line, 2);
  assert.equal(r.unterminated, false);
});
test('csv: semicolons and tabs detected', () => {
  assert.equal(detectDelimiter('type;prompt;answer\n'), ';');
  assert.equal(detectDelimiter('type\tprompt\tanswer'), '\t');
  assert.deepEqual(parseCsv('a;b\n1;"2;3"').records.map((x) => x.cells), [['a', 'b'], ['1', '2;3']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2').records.map((x) => x.cells), [['a', 'b'], ['1', '2']]);
});
test('csv: space before an opening quote, padding after closing quote', () => {
  assert.deepEqual(parseCsv('a, "b, c" ,d').records[0]!.cells, ['a', 'b, c', 'd']);
});
test('csv: stray quote inside unquoted cell is kept', () => {
  assert.deepEqual(parseCsv('5" screen,x').records[0]!.cells, ['5" screen', 'x']);
});
test('csv: unterminated quote reported', () => {
  const r = parseCsv('a,"b\nc');
  assert.equal(r.unterminated, true);
  assert.deepEqual(r.records[0]!.cells, ['a', 'b\nc']);
});
test('csv: line numbers of records spanning lines', () => {
  const r = parseCsv('h\n"1\n2"\nlast');
  assert.deepEqual(r.records.map((x) => x.line), [1, 2, 4]);
});
test('csv: writer round trip of tricky cells', () => {
  const rows = [['plain', 'with, comma', 'with "quote"', 'multi\nline', ' padded ', '', 'semi;colon']];
  const back = parseCsv(toCsv(rows)).records.map((x) => x.cells);
  assert.deepEqual(back, rows);
});
test('csv: list split, escapes and pairs', () => {
  assert.deepEqual(splitList(' Venus | Mars ||Jupiter'), ['Venus', 'Mars', 'Jupiter']);
  assert.deepEqual(splitList('Fish \\| chips|peas'), ['Fish | chips', 'peas']);
  assert.deepEqual(splitList('a\nb'), ['a', 'b']);
  assert.deepEqual(splitList(escapeListPart('a|b\\c') + '|d'), ['a|b\\c', 'd']);
  assert.deepEqual(splitPair('Cat = kitten'), ['Cat', 'kitten']);
  assert.deepEqual(splitPair('2 + 2 \\= 4 = four'), ['2 + 2 = 4', 'four']);
  assert.deepEqual(splitPair('Dog -> puppy'), ['Dog', 'puppy']);
  assert.equal(splitPair('no separator'), null);
});
test('csv: formula guard', () => {
  assert.equal(guardCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(guardCell('-5'), '-5');
  assert.equal(guardCell('-5 + 3 = ?'), "'-5 + 3 = ?");
  assert.equal(guardCell('@home'), "'@home");
  assert.equal(guardCell('Paris'), 'Paris');
  assert.equal(unguardCell("'=SUM(A1)"), '=SUM(A1)');
  assert.equal(unguardCell("'tis"), "'tis");
});

/* --------------------------------- Numbers --------------------------------- */
test('numbers: parseNumberText', () => {
  assert.equal(parseNumberText('3.5'), 3.5);
  assert.equal(parseNumberText(' -2 '), -2);
  assert.equal(parseNumberText('1,000'), 1000);
  assert.equal(parseNumberText('1 000'), 1000);
  assert.equal(parseNumberText('−4'), -4);
  assert.equal(parseNumberText('1e+21'), 1e21);
  assert.equal(parseNumberText('.5'), 0.5);
  assert.ok(Number.isNaN(parseNumberText('1,5')));
  assert.ok(Number.isNaN(parseNumberText('ten')));
  assert.ok(Number.isNaN(parseNumberText('')));
});
test('numbers: parseNumberAnswer with unit and tolerance', () => {
  assert.deepEqual(parseNumberAnswer('30 cm'), { answer: 30, unit: 'cm' });
  assert.deepEqual(parseNumberAnswer('9.8 ± 0.1'), { answer: 9.8, tolerance: 0.1 });
  assert.deepEqual(parseNumberAnswer('9.8 +/- 0.1 m/s²'), { answer: 9.8, tolerance: 0.1, unit: 'm/s²' });
  assert.deepEqual(parseNumberAnswer('50%'), { answer: 50, unit: '%' });
  assert.equal(parseNumberAnswer('4th'), null);
  assert.equal(parseNumberAnswer('12:30'), null);
  assert.equal(parseNumberAnswer('3/4'), null);
  assert.equal(parseNumberAnswer('Paris'), null);
  assert.equal(parseNumberAnswer('£5'), null);
});
test('types and refs', () => {
  assert.equal(normaliseType('Multiple choice'), 'mcq');
  assert.equal(normaliseType('MCQ'), 'mcq');
  assert.equal(normaliseType('true/false'), 'truefalse');
  assert.equal(normaliseType('Select all that apply'), 'multi');
  assert.equal(normaliseType('Type the answer'), 'short');
  assert.equal(normaliseType('flash card'), 'flashcard');
  assert.equal(normaliseType('mutli'), null);
  assert.equal(resolveChoice('mars', ['Venus', 'Mars']), 1);
  assert.equal(resolveChoice('B', ['Venus', 'Mars']), 1);
  assert.equal(resolveChoice('2', ['Venus', 'Mars']), 1);
  assert.equal(resolveChoice('(b)', ['Venus', 'Mars']), 1);
  assert.equal(resolveChoice('C', ['Venus', 'Mars']), -1);
});
test('tags', () => {
  assert.deepEqual(splitTags('space, Planets ,space,,'), ['space', 'Planets']);
});

/* ---------------------------------- Detect --------------------------------- */
test('detect format', () => {
  assert.equal(detectFormat('[{"type":"mcq"}]'), 'json');
  assert.equal(detectFormat('  {"questions": []}'), 'json');
  assert.equal(detectFormat('type,prompt,answer\nshort,a,b'), 'csv');
  assert.equal(detectFormat('Question;Answer\nx;y'), 'csv');
  assert.equal(detectFormat(PASTE_EXAMPLE), 'text');
  assert.equal(detectFormat('anything', 'set.csv'), 'csv');
  assert.equal(detectFormat('anything', 'set.JSON'), 'json');
});

/* --------------------------------- Template -------------------------------- */
test('template imports cleanly with all 8 types', () => {
  const r = parseImport(csvTemplate(), 'csv');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.questions.map((q) => q.type), ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'flashcard']);
  const mcq = r.questions[0]!;
  assert.ok(mcq.type === 'mcq' && mcq.choices.find((c) => c.id === mcq.correct)?.text === 'Mars');
  assert.equal(mcq.timeLimitSec, 20);
  assert.deepEqual(mcq.tags, ['space']);
  const multi = r.questions[1]!;
  assert.ok(multi.type === 'multi' && multi.correct.length === 2);
  const num = r.questions[4]!;
  assert.ok(num.type === 'numeric' && num.answer === 100 && num.unit === 'cm');
  const match = r.questions[6]!;
  assert.ok(match.type === 'match' && match.pairs[1]!.left === 'Dog' && match.pairs[1]!.right === 'puppy');
  for (const q of r.questions) assert.ok(ID_PATTERN.test(q.id));
  assert.equal(new Set(r.questions.map((q) => q.id)).size, 8);
});

/* --------------------------------- Forgiving -------------------------------- */
test('csv forgiving: aliases, inference, yes/no, letters, stars, semicolons', () => {
  const csv = [
    'Question;Choices;Correct answer;Answer;Time limit (seconds);Difficulty;Notes',
    ' What is 2 + 2? ; 3 | 4 | 5 ; B ; ; 20s ; Easy ; ignored',
    'Pick the even numbers;1|*2|3|*4;;;;;',
    'The Earth is flat.;;;no;;;',
    'Capital of Italy?;;;Rome|Roma;;;',
    'How many legs does a spider have?;;;8;;;',
    '"A cell with ; a semicolon";Yes|No;;Yes;;;',
  ].join('\n');
  const r = parseImport(csv, 'csv');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.questions.map((q) => q.type), ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'mcq']);
  const [mcq, multi, tf, short, num] = r.questions as [Question, Question, Question, Question, Question];
  assert.ok(mcq.type === 'mcq' && mcq.prompt === 'What is 2 + 2?' && mcq.choices.find((c) => c.id === mcq.correct)!.text === '4' && mcq.timeLimitSec === 20 && mcq.difficulty === 'easy');
  assert.ok(multi.type === 'multi' && multi.correct.length === 2 && multi.choices.map((c) => c.text).join() === '1,2,3,4');
  assert.ok(tf.type === 'truefalse' && tf.correct === false);
  assert.ok(short.type === 'short' && short.accepted.join() === 'Rome,Roma');
  assert.ok(num.type === 'numeric' && num.answer === 8);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0]!, /Notes/);
});
test('csv problems are specific and numbered by spreadsheet row', () => {
  const csv = ['type,prompt,choices,correct,answer,points', 'mutli,x,a|b,a,,', 'mcq,Capital of France?,Paris|Lyon,Pariss,,', 'mcq,,a|b,a,,', 'truefalse,Sky is blue,,,maybe,', 'numeric,Ten?,,,ten,', 'short,ok?,,,yes,10.5', '', 'short,Fine,,,answer,'].join('\n');
  const r = parseImport(csv, 'csv');
  const text = r.problems.map((p) => `${p.where}${p.field ? `, ${p.field}` : ''}: ${p.message}`);
  assert.deepEqual(text, [
    'Row 2: “mutli” is not a question type. Use mcq, multi, truefalse, short, numeric, order, match or flashcard.',
    'Row 3: “Pariss” is not one of the choices.',
    'Row 4, prompt: Write the question.',
    'Row 5: “maybe” is not True or False.',
    'Row 6: “ten” is not a number.',
    'Row 7, points: Use a whole number from 0 to 10,000, or leave it empty.',
  ]);
  assert.equal(r.questions.length, 1);
  assert.equal(r.total, 7);
});
test('csv: missing header is explained', () => {
  const r = parseImport('What is 2+2?,4\n', 'csv');
  assert.equal(r.questions.length, 0);
  assert.match(r.problems[0]!.message, /first row must name the columns/);
});
test('csv: match as aligned columns and order', () => {
  const r = parseImport('type,prompt,items,answer\nmatch,Match them,Zeus|Ares,Jupiter|Mars\norder,Order them,1st|2nd|3rd,\n', 'csv');
  assert.deepEqual(r.problems, []);
  const m = r.questions[0]!;
  assert.ok(m.type === 'match' && m.pairs[1]!.left === 'Ares' && m.pairs[1]!.right === 'Mars');
  const o = r.questions[1]!;
  assert.ok(o.type === 'order' && o.items.map((i) => i.text).join() === '1st,2nd,3rd');
});
test('csv: mcq with several correct becomes multi; too many choices explained', () => {
  const r = parseImport('type,prompt,choices,correct\nmcq,Which are prime?,2|3|4,2|3\nmcq,Too many,a|b|c|d|e|f|g,a\n', 'csv');
  assert.equal(r.questions[0]!.type, 'multi');
  assert.deepEqual(r.problems.map((p) => `${p.where}, ${p.field}: ${p.message}`), ['Row 3, choices: Use no more than 6 choices.']);
});

/* ---------------------------------- Paste ---------------------------------- */
test('paste: the documented example', () => {
  const r = parseImport(PASTE_EXAMPLE, 'text');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.questions.map((q) => q.type), ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'flashcard', 'flashcard']);
  const [mcq, multi, tf, short, num, card] = r.questions as Question[];
  assert.ok(mcq!.type === 'mcq' && mcq!.choices.find((c) => c.id === mcq!.correct)!.text === 'Mars' && mcq!.choices.length === 3);
  assert.ok(multi!.type === 'multi' && multi!.correct.length === 2);
  assert.ok(tf!.type === 'truefalse' && tf!.correct === true);
  assert.ok(short!.type === 'short' && short!.accepted[0] === 'Paris' && short!.prompt === 'What is the capital of France?');
  assert.ok(num!.type === 'numeric' && num!.answer === 8);
  assert.ok(card!.type === 'flashcard' && card!.prompt === 'le chien' && card!.back === 'the dog');
});
test('paste: quiz-book style', () => {
  const text = [
    '1. What is the capital of Spain?',
    'a) Lisbon',
    'b) Madrid',
    'c) Rome',
    'Answer: b',
    '',
    'Q: Name a primary colour.',
    'A: red | blue | yellow',
    '',
    '2) Which gas do plants take in?',
    '- Oxygen',
    '- *Carbon dioxide',
    '',
    'Q: Water boils at what temperature? A: 100 °C',
    'Q: g on Earth A: 9.8 +- 0.2 m/s²',
    '',
    'E. coli is a',
    '*bacterium',
    'virus',
  ].join('\n');
  const r = parseImport(text, 'text');
  assert.deepEqual(r.problems, []);
  const qs = r.questions;
  assert.deepEqual(qs.map((q) => q.type), ['mcq', 'short', 'mcq', 'numeric', 'numeric', 'mcq']);
  const spain = qs[0]!;
  assert.ok(spain.type === 'mcq' && spain.prompt === 'What is the capital of Spain?' && spain.choices.map((c) => c.text).join() === 'Lisbon,Madrid,Rome' && spain.choices.find((c) => c.id === spain.correct)!.text === 'Madrid');
  assert.ok(qs[1]!.type === 'short' && qs[1]!.accepted.length === 3);
  assert.ok(qs[2]!.type === 'mcq' && qs[2]!.prompt === 'Which gas do plants take in?' && qs[2]!.choices.find((c) => c.id === (qs[2] as { correct: string }).correct)!.text === 'Carbon dioxide');
  assert.ok(qs[3]!.type === 'numeric' && qs[3]!.answer === 100 && qs[3]!.unit === '°C');
  assert.ok(qs[4]!.type === 'numeric' && qs[4]!.tolerance === 0.2 && qs[4]!.unit === 'm/s²');
  const ecoli = qs[5]!;
  assert.ok(ecoli.type === 'mcq' && ecoli.prompt === 'E. coli is a' && ecoli.choices[0]!.text === 'bacterium');
});
test('paste: problems are explained with line numbers', () => {
  const text = ['Which is biggest?', 'Mouse', 'Elephant', '', 'Q: What is 2+2?', '', 'Lonely question with no choices', '', 'Q: Capital? A: Paris', 'front ::'].join('\n');
  const r = parseImport(text, 'text');
  const text2 = r.problems.map((p) => `${p.where}: ${p.message}`);
  assert.deepEqual(text2, [
    'Line 1: Start the correct choice with *.',
    'Line 5: Add the choices on the lines below the question, one per line, or write it as Q: question A: answer.',
    'Line 7: Add the choices on the lines below the question, one per line, or write it as Q: question A: answer.',
    'Line 10: Write the back of the card.',
  ]);
  assert.equal(r.questions.length, 1);
});
test('paste: single True line and lettered A: choices', () => {
  const r = parseImport('The Moon orbits the Earth.\nTrue\n\nWhich is a mammal?\nA: Shark\n*B: Whale', 'text');
  assert.deepEqual(r.problems, []);
  assert.ok(r.questions[0]!.type === 'truefalse' && r.questions[0]!.correct === true);
  const q = r.questions[1]!;
  assert.ok(q.type === 'mcq' && q.choices.map((c) => c.text).join() === 'Shark,Whale');
});

/* ----------------------------------- JSON ---------------------------------- */
const SAMPLE: Question[] = [
  { id: 'q1', type: 'mcq', prompt: 'Which planet is red?', choices: [{ id: 'a', text: 'Venus' }, { id: 'b', text: 'Mars, the "red" one' }, { id: 'c', text: 'Pipe | planet' }], correct: 'b', explanation: 'Rust.\nIron oxide.', timeLimitSec: 30, points: 500, difficulty: 'easy', tags: ['space', 'planets'] },
  { id: 'q2', type: 'multi', prompt: 'Pick primes', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }], correct: ['a', 'c'] },
  { id: 'q3', type: 'truefalse', prompt: '=The sun is a star', correct: true },
  { id: 'q4', type: 'short', prompt: 'Colour of grass?', accepted: ['green', 'Green | verde'], caseSensitive: true, fuzzy: false },
  { id: 'q5', type: 'numeric', prompt: 'Freezing point of water?', answer: -0.5, tolerance: 0.5, unit: '°C' },
  { id: 'q6', type: 'order', prompt: 'Order these', items: [{ id: 'i1', text: 'first' }, { id: 'i2', text: 'second, really' }, { id: 'i3', text: '-third' }] },
  { id: 'q7', type: 'match', prompt: 'Match', pairs: [{ id: 'p1', left: '2+2=4', right: 'true = yes' }, { id: 'p2', left: 'Cat', right: 'kitten' }] },
  { id: 'q8', type: 'flashcard', prompt: 'le chien', back: 'the dog | le chien' },
  { id: 'q9', type: 'mcq', prompt: 'Duplicate texts', choices: [{ id: 'x', text: 'Same' }, { id: 'y', text: 'Same' }], correct: 'y' },
];
for (const q of SAMPLE) assert.ok(questionSchema.safeParse(q).success, `sample ${q.id} valid`);

const details = { ...blankDetails(), title: 'Round trip', subject: 'science' as const, tags: 'a, b' };

test('json: export then import gives the same questions', () => {
  const text = exportJson(details, SAMPLE);
  const r = parseImport(text, 'json');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.questions, SAMPLE);
  assert.equal(r.details?.title, 'Round trip');
  assert.equal(r.details?.subject, 'science');
  assert.deepEqual(r.details?.tags, ['a', 'b']);
});
test('json: forgiving hand-written questions', () => {
  const text = JSON.stringify([
    { type: 'Multiple choice', question: 'Capital of France?', choices: ['Paris', 'Lyon'], correct: 'Paris' },
    { type: 'multi', prompt: 'Evens', choices: [{ text: '2' }, { text: '3' }, { text: '4' }], correct: ['2', '4'] },
    { type: 'truefalse', prompt: 'Sky is blue', answer: 'true' },
    { type: 'short', prompt: 'Grass?', answer: 'green' },
    { type: 'numeric', prompt: 'Ten?', answer: '10' },
    { type: 'order', prompt: 'Order', items: ['a', 'b'] },
    { type: 'match', prompt: 'Match', pairs: [['Cat', 'kitten'], ['Dog', 'puppy']] },
    { type: 'flashcard', prompt: 'chien', answer: 'dog' },
    { type: 'mcq', prompt: 'Broken', choices: ['x', 'y'], correct: 'z' },
  ]);
  const r = parseImport(text, 'json');
  assert.equal(r.questions.length, 8);
  assert.deepEqual(r.problems.map((p) => `${p.where}, ${p.field}: ${p.message}`), ['Question 9, correct: Mark the correct choice.']);
  const multi = r.questions[1]!;
  assert.ok(multi.type === 'multi' && multi.correct.length === 2);
});
test('json: the documented example imports', () => {
  const r = parseImport(JSON_EXAMPLE, 'json');
  assert.deepEqual(r.problems, []);
  assert.equal(r.questions.length, 2);
});
test('json: syntax error names the line', () => {
  const r = parseImport('[\n  {"type": "mcq",\n  "prompt": }\n]', 'json');
  assert.equal(r.problems[0]!.message, 'This is not valid JSON. Check line 3, column 13.');
  assert.equal(jsonErrorOffset('{"a": [1, 2,]}'), 12);
  assert.equal(jsonErrorOffset('{"a": "unterminated}'), 20);
  assert.equal(jsonErrorOffset('[1] x'), 4);
  assert.equal(jsonErrorOffset('{"ok": [true, null, -1.5e3, "x\\"y"]}'), -1);
});
test('json: duplicate question ids are made unique', () => {
  const r = parseImport(JSON.stringify([SAMPLE[2], SAMPLE[2]]), 'json');
  assert.equal(r.questions.length, 2);
  assert.notEqual(r.questions[0]!.id, r.questions[1]!.id);
});
test('json: server response shape is accepted', () => {
  const r = parseImport(JSON.stringify({ set: { title: 'From the API', subject: 'math' }, editable: true, questions: SAMPLE.slice(0, 2) }), 'json');
  assert.equal(r.questions.length, 2);
  assert.equal(r.details?.title, 'From the API');
});

/* ----------------------------------- CSV round trip ------------------------ */
/** Choice, item and pair ids are not in a CSV; compare by position instead. */
function withoutInnerIds(q: Question): unknown {
  const c = structuredClone(q) as Record<string, unknown> & Question;
  if (c.type === 'mcq' || c.type === 'multi') {
    const index = new Map(c.choices.map((ch, i) => [ch.id, i]));
    const correct = c.type === 'mcq' ? index.get(c.correct) : c.correct.map((id) => index.get(id));
    return { ...c, choices: c.choices.map((ch) => ch.text), correct };
  }
  if (c.type === 'order') return { ...c, items: c.items.map((i) => i.text) };
  if (c.type === 'match') return { ...c, pairs: c.pairs.map((p) => [p.left, p.right]) };
  return c;
}
test('csv: export then import gives the same questions', () => {
  const csv = exportCsv(SAMPLE);
  assert.ok(csv.startsWith('﻿type,prompt,answer,choices,items,correct,'));
  assert.ok(csv.includes("'=The sun is a star"), 'formula guarded');
  const r = parseImport(csv, 'csv');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.questions.map(withoutInnerIds), SAMPLE.map(withoutInnerIds));
  assert.deepEqual(r.questions.map((q) => q.id), SAMPLE.map((q) => q.id));
});
test('csv: duplicate choice texts fall back to letters', () => {
  assert.equal(questionToCsvRow(SAMPLE[8] as never).correct, 'B');
});
test('csv: semicolon export variant re-imports (Excel in Europe re-saves with ;)', () => {
  const csv = exportCsv(SAMPLE);
  const rows = parseCsv(csv).records.map((r) => r.cells);
  const semi = toCsv(rows, ';');
  const r = parseImport(semi, 'csv');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.questions.map(withoutInnerIds), SAMPLE.map(withoutInnerIds));
});

/* ---------------------------------- Model ---------------------------------- */
test('model: fromQuestion then toCandidate keeps every question', () => {
  for (const q of SAMPLE) {
    const back = questionSchema.parse(toCandidate(fromQuestion(q)).question);
    assert.deepEqual(back, q, q.id);
  }
});
test('model: media kept untouched', () => {
  const q: Question = { id: 'm1', type: 'mcq', prompt: 'Which?', media: { kind: 'image', url: '/uploads/a.png', alt: 'A map' }, choices: [{ id: 'a', text: '', media: { kind: 'image', url: '/uploads/b.png', alt: 'B' } }, { id: 'b', text: 'Text' }], correct: 'a' };
  const back = questionSchema.parse(toCandidate(fromQuestion(q)).question);
  assert.deepEqual(back, q);
});
test('model: blank rows are left out and errors map back to the right row', () => {
  const d = blankQuestion('mcq', 'qa');
  d.prompt = 'Pick';
  d.choices[1]!.text = 'Yes';
  d.choices[3]!.text = 'x'.repeat(201);
  d.correct = [d.choices[1]!.id];
  const v = validateSet({ ...details }, [d]);
  assert.equal(v.ok, false);
  assert.deepEqual(v.problems.questions.qa, { 'choices.3': 'Use up to 200 characters for each choice.' });
});
test('model: validation messages for an empty question of each type', () => {
  const qs = (['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'flashcard'] as const).map((t) => blankQuestion(t, `q${t}`));
  const v = validateSet({ ...blankDetails() }, qs);
  assert.deepEqual(v.problems.details, { title: 'Give the set a title.', subject: 'Choose a subject.' });
  assert.deepEqual(v.problems.questions, {
    qmcq: { prompt: 'Write the question.', choices: 'Fill in at least 2 choices.', correct: 'Mark the correct choice.' },
    qmulti: { prompt: 'Write the question.', choices: 'Fill in at least 2 choices.', correct: 'Mark at least one correct choice.' },
    qtruefalse: { prompt: 'Write the statement.', correct: 'Choose whether the statement is true or false.' },
    qshort: { prompt: 'Write the question.', accepted: 'Fill in at least one accepted answer.' },
    qnumeric: { prompt: 'Write the question.', answer: 'Enter the answer as a number, for example 12 or 3.5.' },
    qorder: { prompt: 'Write the question.', items: 'Fill in at least 2 items.' },
    qmatch: { prompt: 'Write the question.', pairs: 'Fill in at least 2 pairs.' },
    qflashcard: { prompt: 'Write the front of the card.', back: 'Write the back of the card.' },
  });
});
test('model: optional field errors', () => {
  const d = fromQuestion(SAMPLE[2]!);
  d.timeLimit = '3';
  d.points = '1.5';
  d.tags = 'x'.repeat(31);
  const half = fromQuestion(SAMPLE[6]!);
  half.pairs[0]!.right = '';
  const n = fromQuestion(SAMPLE[4]!);
  n.answer = 'ten';
  n.tolerance = '-1';
  const v = validateSet(details, [d, half, n]);
  assert.deepEqual(v.problems.questions.q3, { timeLimit: 'Use a whole number of seconds from 5 to 300, or leave it empty.', points: 'Use a whole number from 0 to 10,000, or leave it empty.', tags: 'Keep each tag to 30 characters.' });
  assert.deepEqual(v.problems.questions.q7, { 'pairs.0.right': 'Fill in both sides of the pair.' });
  assert.deepEqual(v.problems.questions.q5, { answer: 'Enter the answer as a number, for example 12 or 3.5.', tolerance: 'The margin cannot be below 0.' });
});
test('model: valid set returns trimmed payload', () => {
  const d = fromQuestion(SAMPLE[0]!);
  d.prompt = '  Which planet is red?  ';
  const v = validateSet({ ...details, title: '  Round trip ' }, [d]);
  assert.ok(v.ok);
  assert.equal(v.data!.title, 'Round trip');
  assert.equal(v.data!.questions[0]!.prompt, 'Which planet is red?');
  assert.deepEqual(v.data!.tags, ['a', 'b']);
});
test('model: server field errors map to questions', () => {
  const qs = SAMPLE.slice(0, 2).map(fromQuestion);
  const p = problemsFromServer({ title: 'Too small: expected string to have >=1 characters', 'questions.1.choices': 'Too big: expected array to have <=8 items', 'questions.0.correct': 'The correct answer must be one of the choices', '_': 'Odd' }, qs);
  assert.deepEqual(p.details, { title: 'Give the set a title.' });
  assert.deepEqual(p.general, ['Odd.']);
  assert.deepEqual(p.questions, { q1: { correct: 'Mark the correct choice.' }, q2: { choices: 'Use no more than 8 choices.' } });
});
test('model: duplicate question ids reported', () => {
  const a = fromQuestion(SAMPLE[2]!);
  const v = validateSet(details, [a, { ...a }]);
  assert.deepEqual(v.problems.general, ['Question ids must be unique.']);
});
test('model: changing type keeps what it can', () => {
  const mcq = fromQuestion(SAMPLE[0]!);
  const multi = changeType(mcq, 'multi');
  assert.deepEqual(multi.correct, ['b']);
  assert.equal(multi.choices.length, 3);
  const back = changeType(fromQuestion(SAMPLE[1]!), 'mcq');
  assert.deepEqual(back.correct, ['a']);
  const order = changeType(mcq, 'order');
  assert.deepEqual(order.items.map((i) => i.text), ['Venus', 'Mars, the "red" one', 'Pipe | planet']);
  const card = changeType(fromQuestion(SAMPLE[3]!), 'flashcard');
  assert.equal(card.back, 'green');
  const fresh = blankQuestion('match', 'qm');
  assert.equal(fresh.pairs.length, 3);
  assert.equal(blankQuestion('mcq', 'x').choices.length, 4);
  assert.equal(changeType(blankQuestion('mcq', 'x'), 'order').items.length, 3);
});
test('model: revive draft from storage', () => {
  const d = fromQuestion(SAMPLE[0]!);
  const back = reviveQuestion(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back, d);
  assert.equal(reviveQuestion({ id: 'bad id', type: 'mcq' }), null);
  assert.equal(reviveQuestion({ id: 'ok', type: 'nope' }), null);
  const odd = reviveQuestion({ id: 'ok', type: 'order', items: 'x' });
  assert.equal(odd!.items.length, 3);
});
test('model: blank detection and summaries', () => {
  assert.ok(isBlankQuestion(blankQuestion('mcq', 'x')));
  assert.ok(!isBlankQuestion(fromQuestion(SAMPLE[0]!)));
  assert.equal(answerSummary(fromQuestion(SAMPLE[0]!)), 'Mars, the "red" one');
  assert.equal(answerSummary(fromQuestion(SAMPLE[4]!)), '-0.5 ± 0.5 °C');
  assert.equal(answerSummary(fromQuestion(SAMPLE[6]!)), '2+2=4 and true = yes; Cat and kitten');
});
test('ids and slugs', () => {
  const taken = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = newId('q', taken);
    assert.ok(ID_PATTERN.test(id));
    assert.ok(!taken.has(id));
    taken.add(id);
  }
  assert.equal(fileSlug('Rivers & Mountains!'), 'rivers-mountains');
  assert.equal(fileSlug('Café crème'), 'cafe-creme');
  assert.equal(fileSlug('!!!'), 'question-set');
});
