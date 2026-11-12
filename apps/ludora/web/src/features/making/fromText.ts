/**
 * From notes to questions, in code: no AI, no network. A teacher pastes whatever they have (class
 * notes, a word list, a table copied from a spreadsheet, a timeline, sentences from a textbook)
 * and gets questions back as suggestions to keep, change or throw away.
 *
 * What it reads, in this order:
 *   - the quick add grammar from the set editor ("Capital of France? = Paris", "a :: b", "[gaps]")
 *   - questions and answers on their own lines ("Q: ...", "A: ...")
 *   - tables: tab, pipe or comma separated, with or without a header row
 *   - groups to sort: "Mammals: whale, bat, dog" on two or three lines
 *   - lists in order: a heading that says so ("Stages of mitosis in order:") or a numbered list
 *   - word pairs: "bonjour - hello", "photosynthesis: how plants make food"
 *   - definitions: "A noun is a naming word", "Osmosis means ..."
 *   - number facts: "Mount Everest is 8,849 metres high" (the number becomes the answer)
 *   - any other sentence: one key word becomes a gap to fill
 *
 * Every question is checked with the shared schema; anything that fails is not suggested.
 * Pure: no React, no DOM; `random` makes the order of choices repeatable in tests.
 */
import { questionSchema, type Question } from '@ludora/shared';
import { parseQuickAdd } from '../sets/editor/quickAdd.ts';

type Random = () => number;

export type SuggestionKind = 'quick' | 'qa' | 'table' | 'sort' | 'order' | 'pair' | 'definition' | 'number' | 'blanks';

export const KIND_LABEL: Record<SuggestionKind, string> = {
  quick: 'Written as a question',
  qa: 'Question and answer',
  table: 'From a table',
  sort: 'Sort into groups',
  order: 'Put in order',
  pair: 'Word and meaning',
  definition: 'Definition',
  number: 'Number fact',
  blanks: 'Fill the gap',
};

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  /** The text it was made from, shown so the person can see why. */
  from: string;
  question: Question;
}

export interface FromTextResult {
  suggestions: Suggestion[];
  /** Lines nothing could be made from, as typed. */
  unread: string[];
  /** A title for the set, from a heading line at the top, if there was one. */
  title: string | null;
}

const STOP = new Set(
  'a an the and or but if of to in on at by for with from into onto over under is are was were be been being it its this that these those there their they them he she his her we our you your i my me as than then so not no do does did has have had can could will would should may might must also very just only about which who whom what when where why how all any each some such more most other'.split(
    ' ',
  ),
);

function shuffle<T>(list: readonly T[], random: Random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string) => s.split(/\s+/).filter(Boolean);
/** Bullets and list numbers at the start of a line. */
const BULLET = /^\s*(?:[-*•‣◦▪●]|\(?\d{1,2}[.)]|\(?[a-hA-H][.)])\s+/;
const NUMBERED = /^\s*\(?\d{1,2}[.)]\s+/;
const stripBullet = (s: string) => s.replace(BULLET, '').trim();
const ORDER_HEAD = /\b(in order|order|steps|stages|sequence|process|timeline|chronolog\w*|smallest to|largest to|first to last|earliest)\b/i;

function valid(q: unknown): Question | null {
  const r = questionSchema.safeParse(q);
  return r.success ? r.data : null;
}

/* ------------------------------ pieces of text ------------------------------ */

/** A paragraph cut into sentences. Keeps "Dr." "e.g." and decimals together. */
export function sentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]+(?=\s+["“(]?[A-Z0-9]|\s*$)/g;
  for (const m of t.matchAll(re)) {
    const end = m.index! + m[0].length;
    const piece = t.slice(start, end).trim();
    // An abbreviation before the full stop: keep going.
    if (/(?:^|\s)(?:Dr|Mr|Mrs|Ms|St|e\.g|i\.e|etc|approx|vs|No)\.$/i.test(piece)) continue;
    if (piece) out.push(piece);
    start = end;
  }
  const rest = t.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Cells of a table row, or null when the line is not one. */
function cells(line: string): string[] | null {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  if (/^\|.*\|$/.test(line.trim())) return line.trim().slice(1, -1).split('|').map((c) => c.trim());
  return null;
}

/** A comma separated row: only when every line of the block has the same number of commas and no sentence punctuation. */
function csvRows(lines: string[]): string[][] | null {
  if (lines.length < 2) return null;
  const counts = lines.map((l) => (l.match(/,/g) ?? []).length);
  if (counts[0]! < 1 || counts[0]! > 4 || counts.some((c) => c !== counts[0])) return null;
  const rows = lines.map((l) => l.split(',').map((c) => c.trim()));
  if (rows.some((r) => r.some((c) => !c || words(c).length > 12))) return null;
  return rows;
}

const HEADER_WORDS = /^(term|word|words|key ?word|vocab\w*|question|questions|answer|answers|meaning|definition|translation|english|french|spanish|german|latin|name|date|year|when|event|country|capital|element|symbol|thing|value|fact|front|back)s?$/i;

function tableRows(lines: string[]): string[][] | null {
  const split = lines.map(cells);
  let rows: string[][] | null = null;
  if (split.every((r) => r !== null)) rows = (split as string[][]).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || !c));
  else rows = csvRows(lines);
  if (!rows || rows.length < 2) return null;
  if (rows.some((r) => r.length < 2 || !r[0] || !r[1])) return null;
  // A header row: every cell a header word, or the first row is the only one with no digits where the rest have them.
  if (rows[0]!.slice(0, 2).every((c) => HEADER_WORDS.test(c.replace(/[^\p{L} ]/gu, '').trim()))) rows = rows.slice(1);
  return rows.length >= 2 ? rows : null;
}

/* ------------------------------ question builders ------------------------------ */

let counter = 0;
const nextId = () => `m${++counter}`;

function numberAnswer(s: string): number | null {
  const m = /^\s*([-−]?\d[\d,]*(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, '').replace(/−/g, '-'));
  return Number.isFinite(n) ? n : null;
}

/** A typed answer, a number, or true or false, for a question and its answer. */
function answerQuestion(prompt: string, answer: string): unknown {
  const p = clip(prompt.trim(), 500);
  const a = answer.trim();
  const low = a.toLowerCase();
  if (['true', 'false', 'yes', 'no'].includes(low)) return { id: nextId(), type: 'truefalse', prompt: p, correct: low === 'true' || low === 'yes' };
  const n = numberAnswer(a);
  if (n !== null) return { id: nextId(), type: 'numeric', prompt: p, answer: n };
  const unit = /^\s*([-−]?\d[\d,]*(?:\.\d+)?)\s*([^\d\s].{0,19})$/.exec(a);
  if (unit && numberAnswer(unit[1]!) !== null) return { id: nextId(), type: 'numeric', prompt: p, answer: numberAnswer(unit[1]!)!, unit: unit[2]!.trim() };
  return { id: nextId(), type: 'short', prompt: p, accepted: a.split(/\s*[|/]\s*/).filter(Boolean).map((x) => clip(x, 120)).slice(0, 10), fuzzy: true };
}

interface Pair {
  term: string;
  meaning: string;
  from: string;
  kind: 'pair' | 'definition' | 'table';
}

/** Questions from word pairs: a choice question each when there are enough to make wrong answers, and matching in fours. */
function pairQuestions(pairs: Pair[], random: Random): Suggestion[] {
  const out: Suggestion[] = [];
  const terms = [...new Set(pairs.map((p) => p.term))];
  const meanings = [...new Set(pairs.map((p) => p.meaning))];
  const long = pairs.reduce((n, p) => n + p.meaning.length, 0) / Math.max(1, pairs.length) > 40;
  for (const p of pairs) {
    let q: unknown;
    if (terms.length >= 3 && long) {
      // Long meanings: the meaning is the question and the short words are the choices.
      const wrong = shuffle(terms.filter((t) => t !== p.term), random).slice(0, 3);
      const texts = shuffle([p.term, ...wrong], random);
      const choices = texts.map((t, k) => ({ id: `c${k + 1}`, text: clip(t, 200) }));
      q = { id: nextId(), type: 'mcq', prompt: clip(p.kind === 'definition' ? `Which word is this? ${p.meaning}` : `Which matches this: ${p.meaning}`, 500), choices, correct: choices[texts.indexOf(p.term)]!.id };
    } else if (meanings.length >= 3) {
      const wrong = shuffle(meanings.filter((m) => m !== p.meaning), random).slice(0, 3);
      const texts = shuffle([p.meaning, ...wrong], random);
      const choices = texts.map((t, k) => ({ id: `c${k + 1}`, text: clip(t, 200) }));
      q = { id: nextId(), type: 'mcq', prompt: clip(p.kind === 'definition' ? `What is ${lowerFirst(p.term)}?` : `What does “${p.term}” mean?`, 500), choices, correct: choices[texts.indexOf(p.meaning)]!.id };
    } else {
      q = { id: nextId(), type: 'short', prompt: clip(`Which word means: ${p.meaning}`, 500), accepted: [clip(p.term, 120)], fuzzy: true };
    }
    const v = valid(q);
    if (v) out.push({ id: v.id, kind: p.kind, from: p.from, question: v });
  }
  if (pairs.length >= 4) {
    for (let k = 0; k + 2 <= pairs.length; k += 4) {
      // A last group of one joins the group before it, so no pair is left out.
      const group = pairs.slice(k, pairs.length - (k + 4) === 1 ? k + 5 : k + 4);
      if (group.length === 5) k++;
      if (group.length < 2 || new Set(group.map((g) => g.term)).size < group.length) continue;
      const v = valid({ id: nextId(), type: 'match', prompt: 'Match each one to its meaning.', pairs: group.map((g, j) => ({ id: `p${j + 1}`, left: clip(g.term, 120), right: clip(g.meaning, 120) })) });
      if (v) out.push({ id: v.id, kind: group[0]!.kind, from: group.map((g) => g.term).join(', '), question: v });
    }
  }
  return out;
}

function lowerFirst(s: string): string {
  // Keep capitals on names ("the Nile"), acronyms ("DNA") and two-word names ("New York"); lower an ordinary first word ("Photosynthesis").
  if (/^[A-Z][a-z]+$/.test(s) || /^[A-Z][a-z]+\s+[a-z]/.test(s)) return s[0]!.toLowerCase() + s.slice(1);
  return s;
}

/** "Word - meaning", "word: meaning", "word = meaning" (handled by quick add), with a short word on the left. */
function readPair(line: string): Pair | null {
  const m = /^(.{1,60}?)\s+[-–—]\s+(.+)$/.exec(line) ?? /^([^:]{1,60}):\s+(.+)$/.exec(line);
  if (!m) return null;
  const term = m[1]!.trim();
  const meaning = m[2]!.trim().replace(/[.;]$/, '');
  if (!term || !meaning || words(term).length > 6 || /[.?!]$/.test(term) || meaning.length < 1) return null;
  // "Mammals: whale, bat, dog" is a group, not a pair.
  if (/,/.test(meaning) && meaning.split(',').every((x) => words(x).length <= 3) && meaning.split(',').length >= 2) return null;
  return { term: clip(term, 120), meaning: clip(meaning, 300), from: line, kind: 'pair' };
}

/** "A noun is a naming word." "Osmosis means the movement of water ..." */
function readDefinition(sentence: string): Pair | null {
  const m = /^(?:(?:an?|the)\s+)?(.{1,60}?)\s+(?:is|are|means|refers to|is called|is defined as)\s+(.{6,})$/i.exec(sentence.replace(/[.!]$/, ''));
  if (!m) return null;
  const term = m[1]!.trim();
  const meaning = m[2]!.trim();
  if (words(term).length > 5 || /\d/.test(term) || STOP.has(term.toLowerCase()) || /^(it|this|that|there|they|he|she)$/i.test(term)) return null;
  // "Paris is in France" or "the cat is black": too short to be a definition worth a question.
  if (words(meaning).length < 3) return null;
  // "The Nile" keeps its article and its capital; "A noun" and "Photosynthesis" are ordinary words.
  const article = /^(?:(an?|the)\s+)/i.exec(sentence)?.[1];
  const named = article?.toLowerCase() === 'the' && /^\p{Lu}/u.test(term);
  return { term: clip(named ? `the ${term}` : term, 120), meaning: clip(meaning, 300), from: sentence, kind: 'definition' };
}

const NUMBER_IN_TEXT = /(?<![\w.])([-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-−]?\d+(?:\.\d+)?)(?![\w.]*\d)(?!\w)/g;

/** "Mount Everest is 8,849 metres high." The number becomes the answer to type. Years are preferred. */
function readNumberFact(sentence: string): unknown | null {
  if (words(sentence).length < 4 || words(sentence).length > 40) return null;
  const found = [...sentence.matchAll(NUMBER_IN_TEXT)].filter((m) => {
    const before = sentence.slice(0, m.index);
    // Skip list numbers, times like 9:30, and numbers glued to letters (COVID-19, A4).
    return !/[A-Za-z]-?$/.test(before) && !/:\s?$/.test(before) && !sentence.slice(m.index! + m[0].length).startsWith(':');
  });
  if (!found.length || found.length > 3) return null;
  const year = found.find((m) => /^\d{4}$/.test(m[1]!) && Number(m[1]) >= 1000 && Number(m[1]) <= 2100);
  const pick = year ?? found[found.length - 1]!;
  const answer = numberAnswer(pick[1]!);
  if (answer === null) return null;
  const prompt = `${sentence.slice(0, pick.index)}___${sentence.slice(pick.index! + pick[0].length)}`.trim();
  if (prompt.replace(/[_\s.,!?]/g, '').length < 8) return null;
  return { id: nextId(), type: 'numeric', prompt: clip(prompt, 500), answer };
}

/** The word most worth asking for: a name in the middle of the sentence, else the longest word that carries meaning. */
export function keyWord(sentence: string): string | null {
  const tokens = [...sentence.matchAll(/[\p{L}][\p{L}'’-]*/gu)].map((m) => ({ w: m[0], i: m.index! }));
  if (tokens.length < 5) return null;
  const usable = tokens.filter((t) => !STOP.has(t.w.toLowerCase()) && t.w.length >= 4);
  const names = usable.filter((t) => t.i > 0 && /^\p{Lu}/u.test(t.w) && !/^\p{Lu}+$/u.test(t.w));
  if (names.length) return names.sort((a, b) => b.w.length - a.w.length)[0]!.w;
  if (!usable.length) return null;
  return usable.sort((a, b) => b.w.length - a.w.length || a.i - b.i)[0]!.w;
}

function blanksQuestion(sentence: string, distractorPool: string[], random: Random): unknown | null {
  if (sentence.length > 290 || /[[\]]/.test(sentence)) return null;
  const word = keyWord(sentence);
  if (!word) return null;
  const at = new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').exec(sentence);
  if (!at) return null;
  const text = `${sentence.slice(0, at.index)}[${word}]${sentence.slice(at.index + word.length)}`;
  const others = shuffle([...new Set(distractorPool.filter((w) => w.toLowerCase() !== word.toLowerCase()))], random).slice(0, 3);
  return { id: nextId(), type: 'blanks', prompt: 'Fill in the gap.', text, ...(others.length >= 2 ? { bank: true, distractors: others } : {}) };
}

/* ------------------------------------ main ------------------------------------ */

interface Block {
  lines: string[];
}

function toBlocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      if (cur.length) out.push({ lines: cur });
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) out.push({ lines: cur });
  return out;
}

/** "Mammals: whale, bat, dog" */
function readGroup(line: string): { label: string; items: string[] } | null {
  const m = /^([^:]{1,40}):\s*(.+)$/.exec(stripBullet(line));
  if (!m) return null;
  const items = m[2]!.split(/\s*[,;]\s*/).map((x) => x.replace(/\.$/, '').trim()).filter(Boolean);
  if (items.length < 2 || items.some((x) => words(x).length > 4 || x.length > 80)) return null;
  return { label: m[1]!.trim(), items };
}

/** Lines in the quick add grammar: these are already questions. */
function isQuick(line: string): boolean {
  return /\s=\s|\s::\s|\[[^\]]+\]|^match\b.*:|^.{1,80}:\s*[^>]+>[^>]+>/i.test(line) || /^(T|F|True|False)\s*:/i.test(line);
}

export function suggestFromText(text: string, random: Random = Math.random): FromTextResult {
  counter = 0;
  const suggestions: Suggestion[] = [];
  const unread: string[] = [];
  const pairs: Pair[] = [];
  const loose: string[] = [];
  let title: string | null = null;
  const blocks = toBlocks(text.slice(0, 20_000));

  blocks.forEach((block, bi) => {
    let lines = block.lines.map((l) => l.trim());
    // A heading on its own at the very top names the set ("Year 7 Science: cells").
    if (bi === 0 && !title && lines.length && lines[0]!.length <= 80 && !/[.?!=:]$/.test(lines[0]!) && !isQuick(lines[0]!) && !cells(lines[0]!) && !readPair(lines[0]!) && (lines.length === 1 || blocks.length > 1) && words(lines[0]!).length <= 10) {
      title = lines[0]!.replace(/^#+\s*/, '');
      lines = lines.slice(1);
      if (!lines.length) return;
    } else if (/^#+\s/.test(lines[0] ?? '')) {
      lines = lines.slice(1);
      if (!lines.length) return;
    }

    // A table.
    const rows = tableRows(lines);
    if (rows) {
      const numeric = rows.every((r) => numberAnswer(r[1]!) !== null);
      if (numeric) {
        for (const r of rows) {
          const v = valid({ id: nextId(), type: 'numeric', prompt: clip(/[?]$/.test(r[0]!) ? r[0]! : `${r[0]}?`, 500), answer: numberAnswer(r[1]!)! });
          if (v) suggestions.push({ id: v.id, kind: 'table', from: r.join(' | '), question: v });
        }
      } else for (const r of rows) pairs.push({ term: clip(r[0]!, 120), meaning: clip(r.slice(1).filter(Boolean).join(', '), 300), from: r.join(' | '), kind: 'table' });
      return;
    }

    // Groups to sort: two or three "Label: a, b, c" lines together.
    const groups = lines.map(readGroup);
    if (lines.length >= 2 && lines.length <= 3 && groups.every(Boolean)) {
      const g = groups as { label: string; items: string[] }[];
      const total = g.reduce((n, x) => n + x.items.length, 0);
      if (total >= 4) {
        // Up to eight items, shared fairly between the groups.
        const per = Math.max(1, Math.floor(8 / g.length));
        const v = valid({
          id: nextId(),
          type: 'sort',
          prompt: `Sort these: ${g.map((x) => x.label).join(' or ')}?`.slice(0, 500),
          groups: g.map((x, k) => ({ id: `g${k + 1}`, label: clip(x.label, 40) })),
          items: g.flatMap((x, k) => x.items.slice(0, per).map((t, j) => ({ id: `i${k + 1}${j + 1}`, text: clip(t, 80), group: `g${k + 1}` }))),
        });
        if (v) {
          suggestions.push({ id: v.id, kind: 'sort', from: lines.join(' / '), question: v });
          return;
        }
      }
    }

    // A list in order: a heading that says so, or every line numbered.
    const head = lines[0]!;
    const orderHead = head.endsWith(':') && ORDER_HEAD.test(head);
    const numbered = lines.length >= 3 && lines.every((l) => NUMBERED.test(l));
    if ((orderHead && lines.length >= 3) || numbered) {
      const items = (orderHead ? lines.slice(1) : lines).map(stripBullet).filter(Boolean);
      const prompt = orderHead ? `Put these in order: ${head.replace(/:$/, '')}`.replace(/\s+in order\s*$/i, '') : 'Put these in the right order.';
      for (let k = 0; k < items.length; k += 8) {
        const chunk = items.slice(k, k + 8);
        if (chunk.length < 2 || new Set(chunk).size < chunk.length) continue;
        const v = valid({ id: nextId(), type: 'order', prompt: clip(prompt, 500), items: chunk.map((t, j) => ({ id: `i${j + 1}`, text: clip(t, 120) })) });
        if (v) suggestions.push({ id: v.id, kind: 'order', from: chunk.join(' > '), question: v });
      }
      return;
    }

    // Line by line.
    for (let i = 0; i < lines.length; i++) {
      const line = stripBullet(lines[i]!);
      if (!line) continue;
      // Q: ... / A: ...
      const qm = /^(?:Q|Question)\s*\d*\s*[:.)-]\s*(.+)$/i.exec(line);
      const next = lines[i + 1] ? stripBullet(lines[i + 1]!) : '';
      const am = /^(?:A|Answer|Ans)\s*\d*\s*[:.)-]\s*(.+)$/i.exec(next);
      if (qm && am) {
        const v = valid(answerQuestion(qm[1]!, am[1]!));
        if (v) suggestions.push({ id: v.id, kind: 'qa', from: `${line} / ${next}`, question: v });
        else unread.push(line);
        i++;
        continue;
      }
      if (isQuick(line)) {
        const r = parseQuickAdd(line, () => nextId());
        if (r.questions.length) for (const q of r.questions) suggestions.push({ id: q.id, kind: 'quick', from: line, question: q });
        else unread.push(line);
        continue;
      }
      const pair = readPair(line);
      if (pair) {
        pairs.push(pair);
        continue;
      }
      loose.push(line);
    }
  });

  // Loose text: sentence by sentence.
  const pool: string[] = [];
  const pending: { sentence: string; kind: 'number' | 'blanks' }[] = [];
  for (const para of loose) {
    for (const s of sentences(para)) {
      const def = readDefinition(s);
      if (def && !readNumberFact(s)) {
        pairs.push(def);
        continue;
      }
      if (readNumberFact(s)) pending.push({ sentence: s, kind: 'number' });
      else if (words(s).length >= 5) {
        pending.push({ sentence: s, kind: 'blanks' });
        const k = keyWord(s);
        if (k) pool.push(k);
      } else unread.push(s);
    }
  }
  for (const p of pending) {
    const q = p.kind === 'number' ? readNumberFact(p.sentence) : blanksQuestion(p.sentence, pool, random);
    const v = q ? valid(q) : null;
    if (v) suggestions.push({ id: v.id, kind: p.kind, from: p.sentence, question: v });
    else unread.push(p.sentence);
  }
  suggestions.push(...pairQuestions(pairs, random));

  return { suggestions: suggestions.slice(0, 250), unread, title };
}

/* --------------------------- changing a suggestion --------------------------- */

/** The one answer a person can change in place, for the question types that have one. */
export function mainAnswer(q: Question): string | null {
  switch (q.type) {
    case 'short':
      return q.accepted[0] ?? '';
    case 'numeric':
      return String(q.answer);
    case 'blanks':
      return q.text;
    case 'flashcard':
      return q.back;
    case 'mcq':
      return q.choices.find((c) => c.id === q.correct)?.text ?? '';
    case 'truefalse':
      return q.correct ? 'true' : 'false';
    default:
      return null;
  }
}

/** The question with a new prompt and answer, or a message saying what is wrong. */
export function editSuggestion(q: Question, prompt: string, answer: string | null): Question | string {
  let next: Record<string, unknown> = { ...q, prompt: prompt.trim() };
  if (answer !== null) {
    const a = answer.trim();
    switch (q.type) {
      case 'short':
        next = { ...next, accepted: [a, ...q.accepted.slice(1).filter((x) => x !== a)] };
        break;
      case 'numeric': {
        const n = numberAnswer(a);
        if (n === null) return 'Type a number for the answer, like 42 or 3.5.';
        next = { ...next, answer: n };
        break;
      }
      case 'blanks':
        next = { ...next, text: a };
        break;
      case 'flashcard':
        next = { ...next, back: a };
        break;
      case 'mcq':
        next = { ...next, choices: q.choices.map((c) => (c.id === q.correct ? { ...c, text: a } : c)) };
        break;
      case 'truefalse': {
        const low = a.toLowerCase();
        if (!['true', 'false'].includes(low)) return 'Type true or false.';
        next = { ...next, correct: low === 'true' };
        break;
      }
      default:
        break;
    }
  }
  const r = questionSchema.safeParse(next);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  if (issue?.path[0] === 'prompt') return 'Write the question: it cannot be empty, and keep it under 500 characters.';
  if (q.type === 'blanks') return issue?.message ?? 'Put the answer in [square brackets].';
  return 'The answer cannot be empty, and keep it short.';
}
