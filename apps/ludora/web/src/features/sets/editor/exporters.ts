/**
 * Writes a set as a Ludora file (JSON) or a spreadsheet (CSV) in exactly the
 * shape the importers read, so exporting and importing gives the same set.
 * Pure: no React, no DOM.
 */
import { escapeListPart, guardCell, toCsv } from './csv.ts';
import { CSV_COLUMNS, CSV_TEMPLATE_ROWS, EXPORT_FORMAT_ID, EXPORT_FORMAT_VERSION, type CsvColumn } from './formats.ts';
import { splitTags, type SetDetails } from './model.ts';

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A whole set: details (not who can see it) and every question as saved. */
export function exportJson(details: SetDetails, questions: unknown[]): string {
  const set = {
    title: details.title.trim(),
    description: details.description.trim(),
    subject: details.subject || undefined,
    gradeBand: details.gradeBand.trim() || undefined,
    language: details.language,
    tags: splitTags(details.tags),
    cover: details.cover ?? undefined,
  };
  return `${JSON.stringify({ format: EXPORT_FORMAT_ID, version: EXPORT_FORMAT_VERSION, set, questions }, null, 2)}\n`;
}

/** The correct choice by its text, or by its letter when the text is empty or used twice. */
function choiceRef(choices: { id: string; text: string }[], id: string): string {
  const index = choices.findIndex((c) => c.id === id);
  if (index < 0) return '';
  const t = choices[index]!.text.trim();
  const unique = t !== '' && choices.filter((c) => c.text.trim().toLowerCase() === t.toLowerCase()).length === 1;
  return unique ? t : String.fromCharCode(65 + index);
}

/** One question as a CSV row. Tolerates half-finished questions, so an export never fails. */
export function questionToCsvRow(q: Loose): Record<CsvColumn, string> {
  const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])) as Record<CsvColumn, string>;
  row.type = text(q.type);
  row.prompt = text(q.prompt);
  row.explanation = text(q.explanation);
  row.time_limit = text(q.timeLimitSec);
  row.points = text(q.points);
  row.difficulty = text(q.difficulty);
  row.tags = list(q.tags)
    .map((t) => escapeListPart(text(t)))
    .join('|');
  row.id = text(q.id);
  switch (q.type) {
    case 'mcq':
    case 'multi': {
      const choices = list(q.choices)
        .filter(isObj)
        .map((c) => ({ id: text(c.id), text: text(c.text) }));
      row.choices = choices.map((c) => escapeListPart(c.text)).join('|');
      const correct = q.type === 'mcq' ? [text(q.correct)] : list(q.correct).map(text);
      row.correct = correct
        .map((id) => choiceRef(choices, id))
        .filter(Boolean)
        .map((ref) => escapeListPart(ref))
        .join('|');
      break;
    }
    case 'truefalse':
      row.answer = q.correct === true ? 'True' : q.correct === false ? 'False' : '';
      break;
    case 'short':
      row.answer = list(q.accepted)
        .map((a) => escapeListPart(text(a)))
        .join('|');
      if (q.caseSensitive === true) row.case_sensitive = 'yes';
      if (q.fuzzy === false) row.fuzzy = 'no';
      break;
    case 'numeric':
      row.answer = text(q.answer);
      row.tolerance = text(q.tolerance);
      row.unit = text(q.unit);
      break;
    case 'order':
      row.items = list(q.items)
        .filter(isObj)
        .map((i) => escapeListPart(text(i.text)))
        .join('|');
      break;
    case 'match':
      row.items = list(q.pairs)
        .filter(isObj)
        .map((p) => `${escapeListPart(text(p.left), '=')} = ${escapeListPart(text(p.right), '=')}`)
        .join('|');
      break;
    case 'flashcard':
      row.answer = text(q.back);
      break;
    default:
      break;
  }
  return row;
}

/** Every question as a spreadsheet. Starts with a byte order mark so Excel reads accents correctly. */
export function exportCsv(questions: unknown[]): string {
  const rows = [[...CSV_COLUMNS] as string[], ...questions.filter(isObj).map((q) => {
    const row = questionToCsvRow(q);
    return CSV_COLUMNS.map((c) => guardCell(row[c]));
  })];
  return `﻿${toCsv(rows)}`;
}

/** The header row and one example of every question type. */
export function csvTemplate(): string {
  return `﻿${toCsv([[...CSV_COLUMNS], ...CSV_TEMPLATE_ROWS.map((r) => CSV_COLUMNS.map((c) => r[c] ?? ''))])}`;
}

/** "Rivers & Mountains!" becomes "rivers-mountains". */
export function fileSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'question-set';
}
