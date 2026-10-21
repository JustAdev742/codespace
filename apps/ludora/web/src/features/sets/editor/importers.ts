/**
 * Reads questions from a Ludora file (JSON), a spreadsheet (CSV) or plain
 * text a teacher typed. Every question is checked with the shared schema, so
 * what the preview calls ready is exactly what the server will accept.
 * Pure: no React, no DOM.
 */
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  SET_COVER_GLYPHS,
  SUBJECTS,
  questionSchema,
  type Question,
  type QuestionType,
  type SetCoverGlyph,
  type Subject,
} from '@ludora/shared';
import { detectDelimiter, parseCsv, splitList, splitPair, unescapeCell, unguardCell } from './csv.ts';
import { CSV_HEADER_ALIASES, EXPORT_FORMAT_ID, normaliseHeader, type CsvColumn } from './formats.ts';
import { ID_PATTERN, LIMITS, newId, parseNumberText, splitTags, type CoverChoice } from './model.ts';
import { questionIssues, type IssueLike } from './validation.ts';

export type ImportFormat = 'text' | 'csv' | 'json';

export interface ImportProblem {
  /** "Row 4", "Line 12", "Question 3" or "File". */
  where: string;
  /** The column or field, when the problem is about one. */
  field?: string;
  message: string;
}

export interface ImportedDetails {
  title?: string;
  description?: string;
  subject?: Subject;
  gradeBand?: string;
  language?: string;
  tags?: string[];
  cover?: CoverChoice;
}

export interface ImportResult {
  format: ImportFormat;
  /** Ready to add, with ids unique among themselves. */
  questions: Question[];
  problems: ImportProblem[];
  /** Things worth knowing that are not problems, such as ignored columns. */
  notes: string[];
  /** Set details from a Ludora file, if it had any. */
  details: ImportedDetails | null;
  /** Rows, blocks or entries read, including the ones with problems. */
  total: number;
}

/** More rows than a set can hold are not worth reading. */
const MAX_ENTRIES = 500;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/* --------------------------------- Helpers --------------------------------- */

const TYPE_ALIASES: Record<string, QuestionType> = (() => {
  const map: Record<string, QuestionType> = {};
  const add = (t: QuestionType, ...names: string[]) => {
    for (const n of names) map[n] = t;
  };
  for (const t of QUESTION_TYPES) add(t, t, QUESTION_TYPE_LABELS[t].toLowerCase());
  add('mcq', 'multiple choice', 'mc', 'choice', 'single choice', 'quiz');
  add('multi', 'select all', 'select all that apply', 'multiple answers', 'multiple answer', 'multiple select', 'multiselect', 'multiple response', 'checkbox', 'checkboxes');
  add('truefalse', 'true false', 'true or false', 'tf', 't f', 'boolean', 'yes no');
  add('short', 'short answer', 'type answer', 'typed answer', 'typed', 'text', 'open', 'fill in', 'fill in the blank', 'free text');
  add('numeric', 'number', 'numerical', 'num', 'integer', 'decimal');
  add('order', 'ordering', 'sequence', 'sort', 'sorting', 'rank', 'ranking');
  add('match', 'matching', 'pairs', 'pair');
  add('flashcard', 'flash card', 'flashcards', 'card', 'cards');
  return map;
})();

/** "Multiple choice", "MCQ", "true/false" and friends, to a question type. */
export function normaliseType(raw: string): QuestionType | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/]+/g, ' ')
    .replace(/[^a-z ]/g, '')
    .trim();
  return TYPE_ALIASES[key] ?? TYPE_ALIASES[key.replace(/ /g, '')] ?? null;
}

/** True, False, yes, no, t, f, y, n, 1 and 0, in any case. */
export function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (['true', 't', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'f', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

/** "30 cm", "9.8 ± 0.1", "1,000" or "-4" as a number answer, or null when it is not one. */
export function parseNumberAnswer(raw: string): { answer: number; tolerance?: number; unit?: string } | null {
  let s = raw.trim();
  let tolerance: number | undefined;
  const tol = /\s*(?:±|\+\/-|\+-)\s*(\d[\d,]*(?:\.\d+)?|\.\d+)/.exec(s);
  if (tol) {
    tolerance = parseNumberText(tol[1]!);
    if (Number.isNaN(tolerance)) return null;
    s = (s.slice(0, tol.index) + s.slice(tol.index + tol[0].length)).trim();
  }
  const m = /^([-+−]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)\s*(.*)$/i.exec(s);
  if (!m) return null;
  const answer = parseNumberText(m[1]!);
  if (Number.isNaN(answer)) return null;
  const unit = m[2]!.trim();
  // "4th" is a typed answer, and so is anything with more numbers in it ("12:30", "3/4").
  if (unit && (/\d/.test(unit) || unit.length > LIMITS.unit || /^(st|nd|rd|th)$/i.test(unit))) return null;
  return { answer, ...(tolerance !== undefined ? { tolerance } : {}), ...(unit ? { unit } : {}) };
}

function parseSeconds(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  const clock = /^(\d+):([0-5]\d)$/.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const mins = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)$/.exec(s);
  if (mins) return Math.round(Number(mins[1]) * 60);
  const secs = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)?$/.exec(s);
  return secs ? Number(secs[1]) : null;
}

function parseDifficulty(raw: string): 'easy' | 'medium' | 'hard' | null {
  const s = raw.trim().toLowerCase();
  if (s === 'easy') return 'easy';
  if (s === 'medium' || s === 'med') return 'medium';
  if (s === 'hard') return 'hard';
  return null;
}

/** Finds a choice by its text, its letter (A is the first) or its number (1 is the first). -1 if none matches. */
export function resolveChoice(ref: string, texts: string[]): number {
  const r = ref.trim();
  let i = texts.findIndex((t) => t === r);
  if (i >= 0) return i;
  const lower = r.toLowerCase();
  i = texts.findIndex((t) => t.toLowerCase() === lower);
  if (i >= 0) return i;
  const letter = /^(?:option\s+|choice\s+)?\(?([a-h])\)?[.)]?$/i.exec(r);
  if (letter) {
    i = letter[1]!.toLowerCase().charCodeAt(0) - 97;
    if (i < texts.length) return i;
  }
  if (/^\d{1,2}$/.test(r)) {
    i = Number(r) - 1;
    if (i >= 0 && i < texts.length) return i;
  }
  return -1;
}

function withIds<T extends object>(list: T[], prefix: string): (T & { id: string })[] {
  const taken = new Set<string>();
  return list.map((x) => {
    const id = newId(prefix, taken);
    taken.add(id);
    return { ...x, id };
  });
}

type Built = { value: Record<string, unknown>; error?: undefined } | { value?: undefined; error: string };

/** Gives the question an id: its own if usable and not taken, otherwise a new one. */
function assignId(q: Record<string, unknown>, own: string, ids: Set<string>) {
  q.id = own && ID_PATTERN.test(own) && !ids.has(own) ? own : newId('q', ids);
  ids.add(q.id as string);
}

/** Validates a built question and records it as ready or as a problem. */
function accept(out: ImportResult, built: Built, where: string, fieldName: (key: string) => string | undefined) {
  out.total++;
  if (built.error !== undefined) {
    out.problems.push({ where, message: built.error });
    return;
  }
  const r = questionSchema.safeParse(built.value);
  if (r.success) {
    out.questions.push(r.data);
    return;
  }
  const type = typeof built.value.type === 'string' ? (built.value.type as QuestionType) : undefined;
  for (const { key, message } of questionIssues(r.error.issues as IssueLike[], type)) {
    const field = fieldName(key.split('.')[0]!);
    out.problems.push(field ? { where, field, message } : { where, message });
  }
}

function emptyResult(format: ImportFormat): ImportResult {
  return { format, questions: [], problems: [], notes: [], details: null, total: 0 };
}

/* ---------------------------------- Detect --------------------------------- */

/** Guesses the format from the file name, then from the text itself. */
export function detectFormat(text: string, fileName?: string): ImportFormat {
  const name = fileName?.toLowerCase() ?? '';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return 'csv';
  const t = text.replace(/^﻿/, '').trimStart();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  const firstLine = t.split('\n', 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const headers = firstLine.split(delimiter).map((h) => normaliseHeader(h.replace(/"/g, '')));
  const known = headers.map((h) => CSV_HEADER_ALIASES[h]).filter(Boolean);
  if (headers.length > 1 && (known.includes('prompt') || known.length >= 2)) return 'csv';
  return 'text';
}

/* ----------------------------------- CSV ----------------------------------- */

const CSV_FIELD: Record<string, CsvColumn> = {
  prompt: 'prompt',
  choices: 'choices',
  correct: 'correct',
  accepted: 'answer',
  answer: 'answer',
  tolerance: 'tolerance',
  unit: 'unit',
  items: 'items',
  pairs: 'items',
  back: 'answer',
  explanation: 'explanation',
  timeLimit: 'time_limit',
  points: 'points',
  difficulty: 'difficulty',
  tags: 'tags',
  type: 'type',
};

function csvRowToQuestion(get: (c: CsvColumn) => string, ids: Set<string>): Built {
  const prompt = get('prompt');
  const rawType = get('type');
  let type: QuestionType | null = rawType ? normaliseType(rawType) : null;
  if (rawType && !type) return { error: `“${rawType}” is not a question type. Use mcq, multi, truefalse, short, numeric, order, match or flashcard.` };
  const answer = get('answer');
  const correct = get('correct');
  const choicesCell = get('choices');
  const itemsCell = get('items');
  const given = answer || correct;

  if (!type) {
    if (choicesCell) {
      const stars = splitList(choicesCell, true).filter((p) => p.startsWith('*')).length;
      type = splitList(correct || answer).length > 1 || (!given && stars > 1) ? 'multi' : 'mcq';
    } else if (itemsCell) {
      type = splitList(itemsCell, true).some((p) => splitPair(p)) ? 'match' : 'order';
    } else if (/^(true|false|yes|no)$/i.test(given)) {
      type = 'truefalse';
    } else if (given) {
      type = parseNumberAnswer(given) ? 'numeric' : 'short';
    } else {
      return { error: 'Add a type, or an answer so the type can be worked out.' };
    }
  }

  const q: Record<string, unknown> = { type, prompt };
  switch (type) {
    case 'mcq':
    case 'multi': {
      const explicit = correct || answer;
      const starred: number[] = [];
      const texts: string[] = [];
      for (const part of splitList(choicesCell || itemsCell, true)) {
        let text = part;
        if (!explicit && text.startsWith('*')) {
          starred.push(texts.length);
          text = text.slice(1).trim();
        }
        text = unescapeCell(text).trim();
        if (text) texts.push(text);
      }
      if (!texts.length) return { error: 'Add the choices in the choices column, separated by |.' };
      let picked = starred;
      if (explicit) {
        picked = [];
        for (const ref of splitList(explicit)) {
          const i = resolveChoice(ref, texts);
          if (i < 0) return { error: `“${ref}” is not one of the choices.` };
          if (!picked.includes(i)) picked.push(i);
        }
      }
      if (!picked.length) return { error: 'Say which choice is correct in the correct column.' };
      // Several correct choices only make sense as select all that apply.
      if (type === 'mcq' && picked.length > 1) type = q.type = 'multi';
      const choices = withIds(
        texts.map((text) => ({ text })),
        'c',
      );
      q.choices = choices;
      q.correct = type === 'mcq' ? choices[picked[0]!]!.id : picked.map((i) => choices[i]!.id);
      break;
    }
    case 'truefalse': {
      const value = parseBool(given);
      if (value === null) return { error: given ? `“${given}” is not True or False.` : 'Write True or False in the answer column.' };
      q.correct = value;
      break;
    }
    case 'short': {
      const accepted = splitList(given);
      if (!accepted.length) return { error: 'Write the answer in the answer column.' };
      q.accepted = accepted;
      const cs = get('case_sensitive');
      if (cs) {
        const v = parseBool(cs);
        if (v === null) return { error: 'case_sensitive must be yes or no.' };
        if (v) q.caseSensitive = true;
      }
      const fuzzy = get('fuzzy');
      if (fuzzy) {
        const v = parseBool(fuzzy);
        if (v === null) return { error: 'fuzzy must be yes or no.' };
        if (!v) q.fuzzy = false;
      }
      break;
    }
    case 'numeric': {
      if (!given) return { error: 'Write the number in the answer column.' };
      const n = parseNumberAnswer(given);
      if (!n) return { error: `“${given}” is not a number.` };
      q.answer = n.answer;
      const tol = get('tolerance');
      if (tol) {
        const t = parseNumberText(tol);
        if (Number.isNaN(t)) return { error: 'tolerance must be a number, for example 0.5.' };
        q.tolerance = t;
      } else if (n.tolerance !== undefined) q.tolerance = n.tolerance;
      const unit = get('unit') || n.unit;
      if (unit) q.unit = unit;
      break;
    }
    case 'order': {
      const items = splitList(itemsCell || choicesCell);
      if (!items.length) return { error: 'Add the items in the items column, in the correct order, separated by |.' };
      q.items = withIds(
        items.map((text) => ({ text })),
        'i',
      );
      break;
    }
    case 'match': {
      const parts = splitList(itemsCell || choicesCell, true);
      if (!parts.length) return { error: 'Add the pairs in the items column, for example Cat = kitten|Dog = puppy.' };
      const split = parts.map(splitPair);
      let pairs: [string, string][];
      if (split.every((p) => p !== null)) {
        pairs = split as [string, string][];
      } else if (split.every((p) => p === null) && splitList(answer).length === parts.length) {
        // Lefts in items and rights in answer, in the same order.
        const rights = splitList(answer);
        pairs = parts.map((left, i) => [unescapeCell(left).trim(), rights[i]!]);
      } else {
        return { error: 'Write each pair as left = right, for example Cat = kitten.' };
      }
      q.pairs = withIds(
        pairs.map(([left, right]) => ({ left, right })),
        'p',
      );
      break;
    }
    case 'flashcard': {
      if (!given) return { error: 'Write the back of the card in the answer column.' };
      q.back = given;
      break;
    }
  }

  const explanation = get('explanation');
  if (explanation) q.explanation = explanation;
  const time = get('time_limit');
  if (time) {
    const t = parseSeconds(time);
    if (t === null) return { error: `time_limit must be a number of seconds, from ${LIMITS.timeMin} to ${LIMITS.timeMax}.` };
    q.timeLimitSec = t;
  }
  const points = get('points');
  if (points) {
    const p = parseNumberText(points);
    if (Number.isNaN(p)) return { error: 'points must be a whole number, for example 100.' };
    q.points = p;
  }
  const difficulty = get('difficulty');
  if (difficulty) {
    const d = parseDifficulty(difficulty);
    if (!d) return { error: 'difficulty must be easy, medium or hard.' };
    q.difficulty = d;
  }
  const tags = splitTags(get('tags'), /[|,]/);
  if (tags.length) q.tags = tags;
  assignId(q, get('id'), ids);
  return { value: q };
}

function importCsv(text: string): ImportResult {
  const out = emptyResult('csv');
  const { records, unterminated } = parseCsv(text);
  const headerIndex = records.findIndex((r) => r.cells.some((c) => c.trim()));
  if (headerIndex < 0) {
    out.problems.push({ where: 'File', message: 'There is nothing to import.' });
    return out;
  }
  const header = records[headerIndex]!;
  const columns = header.cells.map((h) => CSV_HEADER_ALIASES[normaliseHeader(h)] ?? null);
  if (!columns.includes('prompt')) {
    out.problems.push({ where: `Row ${headerIndex + 1}`, message: 'The first row must name the columns, including prompt. Download the template to see them.' });
    return out;
  }
  const index = new Map<CsvColumn, number>();
  columns.forEach((c, i) => {
    if (c && !index.has(c)) index.set(c, i);
  });
  const ignored = header.cells.filter((h, i) => h.trim() && (!columns[i] || index.get(columns[i]!) !== i)).map((h) => h.trim());
  if (ignored.length) out.notes.push(`Ignored ${ignored.length === 1 ? 'a column' : 'columns'} Ludora does not use: ${ignored.join(', ')}.`);

  const ids = new Set<string>();
  for (let r = headerIndex + 1; r < records.length; r++) {
    const record = records[r]!;
    if (!record.cells.some((c) => c.trim())) continue;
    if (out.total >= MAX_ENTRIES) {
      out.notes.push(`Only the first ${MAX_ENTRIES} rows were read. A set can hold up to ${LIMITS.questions} questions.`);
      break;
    }
    const get = (c: CsvColumn) => {
      const i = index.get(c);
      return i === undefined ? '' : unguardCell((record.cells[i] ?? '').trim());
    };
    accept(out, csvRowToQuestion(get, ids), `Row ${r + 1}`, (key) => CSV_FIELD[key]);
  }
  if (unterminated) out.problems.push({ where: 'File', message: 'A quoted cell has no closing quote, so everything after it was read as one cell.' });
  if (out.total === 0 && !out.problems.length) out.problems.push({ where: 'File', message: 'There are no questions under the header row.' });
  return out;
}

/* ------------------------------- Plain text -------------------------------- */

const QUESTION_MARK = /^(?:q|question)\s*\d*\s*[:.)]\s*/i;
const ANSWER_LINE = /^(?:a|answer)\s*:\s*/i;

/** "Q: … A: …" on one line: splits at the last A:, since answers are short and questions are long. */
function splitAnswer(rest: string): { prompt: string; answer: string } | null {
  const re = /(?:^|\s)(?:a|answer)\s*:/gi;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(rest); m; m = re.exec(rest)) last = m;
  if (!last) return null;
  return { prompt: rest.slice(0, last.index).trim(), answer: rest.slice(last.index + last[0].length).trim() };
}

/** "1. What…" and "Q3) What…" lose their numbering. */
function stripNumbering(s: string): string {
  return s.replace(/^(?:\d{1,3}[.)]|q\d{1,3}[.:)]?)\s+/i, '').trim();
}

function answerQuestion(prompt: string, answer: string): Built {
  const a = answer.trim();
  if (!a) return { error: 'Add the answer after A:, for example Q: What is the capital of France? A: Paris' };
  if (/^(true|false)$/i.test(a)) return { value: { type: 'truefalse', prompt, correct: a.toLowerCase() === 'true' } };
  const n = parseNumberAnswer(a);
  if (n) return { value: { type: 'numeric', prompt, ...n } };
  return { value: { type: 'short', prompt, accepted: splitList(a) } };
}

/** Removes a star and list markers ("- ", "•", "a)", "B.", "3)") from choice lines. Letters and numbers only count when every line has them in sequence. */
function readChoiceLines(lines: string[]): { text: string; star: boolean }[] {
  const starred = lines.map((raw) => {
    let text = raw.trim();
    let star = false;
    if (text.startsWith('*')) {
      star = true;
      text = text.slice(1).trim();
    }
    text = text.replace(/^[-•–]\s+/, '');
    return { text, star };
  });
  const letters = starred.map((c) => /^\(?([a-h])[.):]\s+/i.exec(c.text));
  const lettered = letters.every((m, i) => m && m[1]!.toLowerCase().charCodeAt(0) - 97 === i);
  const numbers = starred.map((c) => /^(\d{1,2})[.)]\s+/.exec(c.text));
  const numbered = numbers.every((m, i) => m && Number(m[1]) === i + 1);
  return starred.map((c, i) => {
    let text = c.text;
    if (lettered) text = text.slice(letters[i]![0].length);
    else if (numbered) text = text.slice(numbers[i]![0].length);
    let star = c.star;
    if (text.startsWith('*')) {
      star = true;
      text = text.slice(1).trim();
    }
    return { text: text.trim(), star };
  });
}

function choiceQuestion(prompt: string, lines: string[]): Built {
  if (!lines.length) return { error: 'Add the choices on the lines below the question, one per line, or write it as Q: question A: answer.' };
  const last = lines[lines.length - 1]!;
  if (lines.length === 1 && ANSWER_LINE.test(last)) return answerQuestion(prompt, last.replace(ANSWER_LINE, ''));
  // Quiz books often end with "Answer: B".
  const answerLine = /^(?:answer|correct(?:\s+answer)?)\s*:\s*(.+)$/i.exec(last);
  const choiceLines = answerLine ? lines.slice(0, -1) : lines;
  const choices = readChoiceLines(choiceLines).filter((c) => c.text);
  if (choices.length === 1 && !answerLine && /^(true|false)$/i.test(choices[0]!.text)) {
    return { value: { type: 'truefalse', prompt, correct: choices[0]!.text.toLowerCase() === 'true' } };
  }
  if (choices.length < 2) return { error: 'Add at least two choices, one per line, or write it as Q: question A: answer.' };
  const texts = choices.map((c) => c.text);
  let picked: number[];
  if (answerLine) {
    picked = [];
    // "Answer: B" or "Answer: A, C"; a choice that itself contains a comma still matches whole.
    const refs = splitList(answerLine[1]!).flatMap((r) => (resolveChoice(r, texts) >= 0 ? [r] : r.split(/\s*,\s*/)));
    for (const ref of refs) {
      const i = resolveChoice(ref, texts);
      if (i < 0) return { error: `“${ref}” is not one of the choices.` };
      if (!picked.includes(i)) picked.push(i);
    }
  } else {
    picked = choices.flatMap((c, i) => (c.star ? [i] : []));
  }
  if (!picked.length) return { error: 'Start the correct choice with *.' };
  const lower = texts.map((t) => t.toLowerCase());
  if (texts.length === 2 && picked.length === 1 && lower.includes('true') && lower.includes('false')) {
    return { value: { type: 'truefalse', prompt, correct: lower[picked[0]!] === 'true' } };
  }
  const withId = withIds(
    texts.map((text) => ({ text })),
    'c',
  );
  return picked.length > 1
    ? { value: { type: 'multi', prompt, choices: withId, correct: picked.map((i) => withId[i]!.id) } }
    : { value: { type: 'mcq', prompt, choices: withId, correct: withId[picked[0]!]!.id } };
}

function importText(text: string): ImportResult {
  const out = emptyResult('text');
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: { line: number; text: string }[][] = [];
  let current: { line: number; text: string }[] = [];
  lines.forEach((raw, i) => {
    if (raw.trim() === '') {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push({ line: i + 1, text: raw.trim() });
    }
  });
  if (current.length) blocks.push(current);

  const ids = new Set<string>();
  const add = (line: number, built: Built) => {
    if (out.total >= MAX_ENTRIES) return;
    if (built.value) assignId(built.value, '', ids);
    accept(out, built, `Line ${line}`, () => undefined);
  };
  const startsQuestion = (t: string) => QUESTION_MARK.test(t) || t.includes('::');

  for (const block of blocks) {
    let i = 0;
    while (i < block.length) {
      const { line, text: t } = block[i]!;
      const qMark = QUESTION_MARK.exec(t);
      if (qMark) {
        const rest = t.slice(qMark[0].length);
        const same = splitAnswer(rest);
        if (same) {
          add(line, answerQuestion(stripNumbering(same.prompt), same.answer));
          i++;
          continue;
        }
        const next = block[i + 1];
        if (next && ANSWER_LINE.test(next.text)) {
          add(line, answerQuestion(stripNumbering(rest), next.text.replace(ANSWER_LINE, '')));
          i += 2;
          continue;
        }
        // No answer given: read it as a multiple choice question below.
      } else if (t.includes('::')) {
        const at = t.indexOf('::');
        add(line, { value: { type: 'flashcard', prompt: stripNumbering(t.slice(0, at)), back: t.slice(at + 2).trim() } });
        i++;
        continue;
      }
      const prompt = stripNumbering(qMark ? t.slice(qMark[0].length) : t);
      let j = i + 1;
      const choiceLines: string[] = [];
      while (j < block.length && !startsQuestion(block[j]!.text)) {
        choiceLines.push(block[j]!.text);
        j++;
      }
      add(line, choiceQuestion(prompt, choiceLines));
      i = j;
    }
  }
  if (out.total >= MAX_ENTRIES) out.notes.push(`Only the first ${MAX_ENTRIES} questions were read. A set can hold up to ${LIMITS.questions} questions.`);
  if (out.total === 0) out.problems.push({ where: 'Text', message: 'There is nothing to import.' });
  return out;
}

/* ----------------------------------- JSON ---------------------------------- */

const JSON_FIELD: Record<string, string> = { timeLimit: 'timeLimitSec' };

/**
 * Where JSON.parse gave up. Browsers do not all say (Chrome and Safari often
 * name only the token), so this walks the text with the JSON grammar and
 * returns the offset of the first thing that does not fit, or -1.
 */
export function jsonErrorOffset(s: string): number {
  let i = 0;
  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const fail = (): never => {
    throw i;
  };
  const ws = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
  };
  const string = () => {
    i++;
    while (i < s.length) {
      const c = s[i]!;
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\\') i += 2;
      else if (c < ' ') fail();
      else i++;
    }
    fail();
  };
  const value = (): void => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++;
      ws();
      if (s[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (s[i] !== '"') fail();
        string();
        ws();
        if (s[i] !== ':') fail();
        i++;
        value();
        ws();
        if (s[i] === ',') i++;
        else if (s[i] === '}') {
          i++;
          return;
        } else fail();
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (s[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (s[i] === ',') i++;
        else if (s[i] === ']') {
          i++;
          return;
        } else fail();
      }
    }
    if (c === '"') return string();
    NUMBER.lastIndex = i;
    const n = NUMBER.exec(s);
    if (n) {
      i += n[0].length;
      return;
    }
    for (const word of ['true', 'false', 'null']) {
      if (s.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    fail();
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
    return -1;
  } catch (at) {
    return typeof at === 'number' ? at : -1;
  }
}

function jsonErrorMessage(text: string): string {
  const at = jsonErrorOffset(text);
  if (at < 0) return 'This is not valid JSON.';
  const before = text.slice(0, at);
  const line = before.split('\n').length;
  const column = at - before.lastIndexOf('\n');
  return `This is not valid JSON. Check line ${line}, column ${column}.`;
}

function pickDetails(source: unknown): ImportedDetails | null {
  if (!isObj(source)) return null;
  const d: ImportedDetails = {};
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  if (s(source.title)) d.title = s(source.title)!.slice(0, LIMITS.title);
  if (s(source.description)) d.description = s(source.description)!.slice(0, LIMITS.description);
  if ((SUBJECTS as readonly unknown[]).includes(source.subject)) d.subject = source.subject as Subject;
  if (s(source.gradeBand)) d.gradeBand = s(source.gradeBand)!.slice(0, LIMITS.gradeBand);
  if (s(source.language) && s(source.language)!.length <= 10) d.language = s(source.language);
  if (Array.isArray(source.tags)) {
    const tags = source.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '' && t.trim().length <= LIMITS.tag).map((t) => t.trim());
    if (tags.length) d.tags = tags.slice(0, LIMITS.tags);
  }
  if (isObj(source.cover) && (SET_COVER_GLYPHS as readonly unknown[]).includes(source.cover.glyph) && typeof source.cover.hue === 'number' && Number.isInteger(source.cover.hue) && source.cover.hue >= 0 && source.cover.hue <= 359) {
    d.cover = { glyph: source.cover.glyph as SetCoverGlyph, hue: source.cover.hue };
  }
  return Object.keys(d).length ? d : null;
}

/** Lists of objects without ids get ids; an id used twice or not usable is replaced. Returns old id to new id. */
function giveIds(list: unknown[], prefix: string): Map<string, string> {
  const taken = new Set<string>();
  const remap = new Map<string, string>();
  for (const entry of list) {
    if (!isObj(entry)) continue;
    const own = typeof entry.id === 'string' || typeof entry.id === 'number' ? String(entry.id).trim() : '';
    const id = own && ID_PATTERN.test(own) && !taken.has(own) ? own : newId(prefix, taken);
    if (own && !remap.has(own)) remap.set(own, id);
    taken.add(id);
    entry.id = id;
  }
  return remap;
}

/** Accepts the exported shape and the obvious hand-written variations (choices as strings, correct by text). */
function normaliseJsonQuestion(raw: unknown, ids: Set<string>): Built {
  if (!isObj(raw)) return { error: 'This entry is not a question.' };
  const q: Record<string, unknown> = { ...raw };
  if (typeof q.type === 'string') q.type = normaliseType(q.type) ?? q.type;
  q.prompt ??= q.question ?? q.front ?? q.text;
  const type = q.type;
  assignId(q, typeof q.id === 'string' || typeof q.id === 'number' ? String(q.id).trim() : '', ids);

  if ((type === 'mcq' || type === 'multi') && Array.isArray(q.choices)) {
    const choices = q.choices.map((c) => (typeof c === 'string' || typeof c === 'number' ? { text: String(c) } : isObj(c) ? { ...c, text: c.text ?? c.label ?? '' } : c));
    const remap = giveIds(choices, 'c');
    q.choices = choices;
    const resolve = (ref: unknown): unknown => {
      if (typeof ref === 'boolean' || ref === null || ref === undefined || typeof ref === 'object') return ref;
      const r = String(ref).trim();
      if (choices.some((c) => isObj(c) && c.id === r)) return r;
      if (remap.has(r)) return remap.get(r);
      const byText = choices.find((c) => isObj(c) && typeof c.text === 'string' && c.text.trim().toLowerCase() === r.toLowerCase());
      return isObj(byText) ? byText.id : r;
    };
    const given = q.correct ?? q.answer;
    if (type === 'mcq') q.correct = resolve(Array.isArray(given) && given.length === 1 ? given[0] : given);
    else q.correct = (Array.isArray(given) ? given : given === undefined ? [] : [given]).map(resolve);
  }
  if (type === 'truefalse') {
    const given = q.correct ?? q.answer;
    q.correct = typeof given === 'string' ? (parseBool(given) ?? given) : given;
  }
  if (type === 'short') {
    const given = q.accepted ?? q.answers ?? q.answer;
    q.accepted = typeof given === 'string' ? splitList(given) : typeof given === 'number' ? [String(given)] : given;
  }
  if (type === 'numeric') {
    for (const k of ['answer', 'tolerance'] as const) {
      const v = q[k];
      if (typeof v === 'string' && v.trim()) q[k] = parseNumberText(v);
    }
  }
  if (type === 'order' && Array.isArray(q.items)) {
    q.items = q.items.map((it) => (typeof it === 'string' || typeof it === 'number' ? { text: String(it) } : isObj(it) ? { ...it } : it));
    giveIds(q.items as unknown[], 'i');
  }
  if (type === 'match' && Array.isArray(q.pairs)) {
    q.pairs = q.pairs.map((p) => (Array.isArray(p) && p.length === 2 ? { left: String(p[0]), right: String(p[1]) } : isObj(p) ? { ...p } : p));
    giveIds(q.pairs as unknown[], 'p');
  }
  if (type === 'flashcard') q.back ??= q.answer;
  for (const k of ['timeLimitSec', 'points'] as const) {
    const v = q[k];
    if (typeof v === 'string' && v.trim()) q[k] = parseNumberText(v);
  }
  if (typeof q.tags === 'string') q.tags = splitTags(q.tags, /[|,]/);
  return { value: q };
}

function importJson(text: string): ImportResult {
  const out = emptyResult('json');
  const source = text.replace(/^﻿/, '');
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    out.problems.push({ where: 'File', message: jsonErrorMessage(source) });
    return out;
  }
  let list: unknown[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (isObj(data)) {
    if (Array.isArray(data.questions)) {
      list = data.questions;
      out.details = pickDetails(isObj(data.set) ? data.set : data);
    } else if (isObj(data.set) && Array.isArray(data.set.questions)) {
      list = data.set.questions;
      out.details = pickDetails(data.set);
    } else if ('type' in data && 'prompt' in data) {
      list = [data];
    }
  }
  if (!list) {
    out.problems.push({ where: 'File', message: 'This file has no questions. A Ludora file has a list called questions.' });
    return out;
  }
  if (isObj(data) && data.format !== undefined && data.format !== EXPORT_FORMAT_ID) out.notes.push('This file was not made by Ludora, so some questions may need changes.');
  const ids = new Set<string>();
  list.slice(0, MAX_ENTRIES).forEach((raw, i) => accept(out, normaliseJsonQuestion(raw, ids), `Question ${i + 1}`, (key) => JSON_FIELD[key] ?? key));
  if (list.length > MAX_ENTRIES) out.notes.push(`Only the first ${MAX_ENTRIES} questions were read. A set can hold up to ${LIMITS.questions} questions.`);
  if (list.length === 0) out.problems.push({ where: 'File', message: 'The list of questions is empty.' });
  return out;
}

/* ----------------------------------- Entry --------------------------------- */

export function parseImport(text: string, format: ImportFormat): ImportResult {
  if (!text.trim()) return emptyResult(format);
  if (format === 'json') return importJson(text);
  if (format === 'csv') return importCsv(text);
  return importText(text);
}
