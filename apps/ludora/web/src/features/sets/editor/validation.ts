/**
 * Checks a draft with the same zod schemas the server uses and says what is
 * wrong in plain words, on the question and field it belongs to.
 * Pure: no React, no DOM.
 */
import { questionSetInputSchema, QUESTION_TYPES, type QuestionSetInput, type QuestionType } from '@ludora/shared';
import { buildSetCandidate, LIMITS, LIST_LIMITS, toCandidate, type DraftQuestion, type IndexMaps, type SetDetails } from './model.ts';

/** The parts of a zod issue we read. Server field errors are turned into this shape too. */
export interface IssueLike {
  code: string;
  path: PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  expected?: string;
}

/** Field key (in draft terms, such as "choices.2" or "timeLimit") to message. */
export type FieldErrors = Record<string, string>;

export interface Problems {
  /** Set detail field (title, subject…) to message. */
  details: FieldErrors;
  /** Question id to its field errors. */
  questions: Record<string, FieldErrors>;
  /** Anything that belongs to no single field. */
  general: string[];
  count: number;
}

export const NO_PROBLEMS: Problems = { details: {}, questions: {}, general: [], count: 0 };

const num = (v: number | bigint | undefined) => (v === undefined ? Number.NaN : Number(v));
const fmt = (n: number) => new Intl.NumberFormat('en-GB').format(n);
const sentence = (s: string) => {
  const t = s.trim();
  return /[.?!]$/.test(t) ? t : `${t}.`;
};

/** Translates a schema path inside one question into the draft field it belongs to. */
export function questionFieldKey(rest: PropertyKey[], maps?: IndexMaps): string {
  const [head, index, sub] = rest;
  const at = (list: keyof IndexMaps) => (typeof index === 'number' ? (maps ? (maps[list][index] ?? index) : index) : undefined);
  switch (head) {
    case 'choices': {
      const i = at('choices');
      if (i === undefined || sub === 'id') return 'choices';
      return sub === 'media' ? `choices.${i}.media` : `choices.${i}`;
    }
    case 'accepted': {
      const i = at('accepted');
      return i === undefined ? 'accepted' : `accepted.${i}`;
    }
    case 'items': {
      const i = at('items');
      return i === undefined || sub === 'id' ? 'items' : `items.${i}`;
    }
    case 'pairs': {
      const i = at('pairs');
      if (i === undefined || sub === 'id' || (sub !== 'left' && sub !== 'right')) return 'pairs';
      return `pairs.${i}.${sub}`;
    }
    case 'timeLimitSec':
      return 'timeLimit';
    case 'tags':
      return 'tags';
    case 'media':
      return 'media';
    case undefined:
      return '_';
    default:
      return String(head);
  }
}

function generic(issue: IssueLike): string {
  const min = num(issue.minimum);
  const max = num(issue.maximum);
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') return min <= 1 ? 'Fill this in.' : `Use at least ${fmt(min)} characters.`;
      if (issue.origin === 'array') return `Add at least ${fmt(min)}.`;
      return `Use ${fmt(min)} or more.`;
    case 'too_big':
      if (issue.origin === 'string') return `Use up to ${fmt(max)} characters.`;
      if (issue.origin === 'array') return `Use no more than ${fmt(max)}.`;
      return `Use ${fmt(max)} or less.`;
    case 'invalid_type':
      return issue.expected === 'number' || issue.expected === 'int' ? 'Enter a number.' : 'Fill this in.';
    case 'invalid_value':
    case 'invalid_union':
      return 'Choose one of the options.';
    case 'invalid_format':
      return 'Use letters, numbers, dashes or underscores only.';
    case 'custom':
      return sentence(issue.message);
    default:
      return 'Check this field.';
  }
}

/** A plain-English message for one problem with one question field. */
export function questionMessage(key: string, issue: IssueLike, type: QuestionType | undefined): string {
  const field = key.split('.')[0];
  const small = issue.code === 'too_small';
  const big = issue.code === 'too_big';
  const max = num(issue.maximum);
  const isList = !key.includes('.');
  switch (field) {
    case 'prompt':
      if (small || issue.code === 'invalid_type') return type === 'flashcard' ? 'Write the front of the card.' : type === 'truefalse' ? 'Write the statement.' : 'Write the question.';
      if (big) return `Use up to ${fmt(max)} characters.`;
      break;
    case 'choices': {
      const limits = type === 'multi' ? LIST_LIMITS.multi : LIST_LIMITS.mcq;
      if (isList && (small || issue.code === 'invalid_type')) return `Fill in at least ${limits.min} choices.`;
      if (isList && big) return `Use no more than ${limits.max} choices.`;
      if (key.endsWith('.media')) return 'This image cannot be used. Remove the choice and add it again.';
      if (big) return `Use up to ${fmt(max)} characters for each choice.`;
      if (issue.code === 'custom' && /text or an image/.test(issue.message)) return 'Every choice needs text.';
      if (issue.code === 'custom' && /unique/.test(issue.message)) return 'Two choices share an id. Remove one and add it again.';
      break;
    }
    case 'correct':
      if (type === 'truefalse') return 'Choose whether the statement is true or false.';
      if (type === 'multi') return issue.code === 'custom' && /twice/.test(issue.message) ? 'A correct choice is listed twice.' : 'Mark at least one correct choice.';
      return 'Mark the correct choice.';
    case 'accepted':
      if (isList && (small || issue.code === 'invalid_type')) return 'Fill in at least one accepted answer.';
      if (isList && big) return `Use no more than ${LIST_LIMITS.short.max} accepted answers.`;
      if (big) return `Use up to ${fmt(max)} characters.`;
      break;
    case 'answer':
      return 'Enter the answer as a number, for example 12 or 3.5.';
    case 'tolerance':
      if (small) return 'The margin cannot be below 0.';
      return 'Enter the margin as a number, or leave it empty.';
    case 'unit':
      return `Use up to ${LIMITS.unit} characters for the unit.`;
    case 'items':
      if (isList && (small || issue.code === 'invalid_type')) return `Fill in at least ${LIST_LIMITS.order.min} items.`;
      if (isList && big) return `Use no more than ${LIST_LIMITS.order.max} items.`;
      if (big) return `Use up to ${fmt(max)} characters for each item.`;
      if (issue.code === 'custom') return 'Two items share an id. Remove one and add it again.';
      break;
    case 'pairs':
      if (isList && (small || issue.code === 'invalid_type')) return `Fill in at least ${LIST_LIMITS.match.min} pairs.`;
      if (isList && big) return `Use no more than ${LIST_LIMITS.match.max} pairs.`;
      if (small) return 'Fill in both sides of the pair.';
      if (big) return `Use up to ${fmt(max)} characters for each side.`;
      if (issue.code === 'custom') return 'Two pairs share an id. Remove one and add it again.';
      break;
    case 'back':
      if (small || issue.code === 'invalid_type') return 'Write the back of the card.';
      if (big) return `Use up to ${fmt(max)} characters.`;
      break;
    case 'explanation':
      return `Use up to ${fmt(LIMITS.explanation)} characters.`;
    case 'timeLimit':
      return `Use a whole number of seconds from ${LIMITS.timeMin} to ${LIMITS.timeMax}, or leave it empty.`;
    case 'points':
      return `Use a whole number from 0 to ${fmt(LIMITS.pointsMax)}, or leave it empty.`;
    case 'difficulty':
      return 'Choose easy, medium or hard.';
    case 'tags':
      if (big && issue.origin === 'array') return `Use up to ${LIMITS.tags} tags.`;
      if (big) return `Keep each tag to ${LIMITS.tag} characters.`;
      break;
    case 'media':
      if (big) return `Use up to ${fmt(LIMITS.alt)} characters for the image description.`;
      return 'This image is not a Ludora upload, so it cannot be used.';
    case 'type':
      return `Choose a question type: ${QUESTION_TYPES.join(', ')}.`;
    case 'id':
      return 'This question has an id Ludora cannot use.';
    default:
      break;
  }
  return generic(issue);
}

/** A plain-English message for a set detail field. */
export function detailMessage(field: string, issue: IssueLike): string {
  const big = issue.code === 'too_big';
  switch (field) {
    case 'title':
      return big ? `Use up to ${LIMITS.title} characters.` : 'Give the set a title.';
    case 'description':
      return `Use up to ${LIMITS.description} characters.`;
    case 'subject':
      return 'Choose a subject.';
    case 'gradeBand':
      return `Use up to ${LIMITS.gradeBand} characters.`;
    case 'language':
      return 'Choose a language.';
    case 'tags':
      return big && issue.origin === 'array' ? `Use up to ${LIMITS.tags} tags.` : `Keep each tag to ${LIMITS.tag} characters.`;
    case 'visibility':
      return 'Choose who can see the set.';
    case 'cover':
      return 'Choose a picture and a colour for the cover.';
    case 'questions':
      if (issue.code === 'too_small') return 'Add at least one question.';
      if (issue.code === 'too_big') return `A set can hold up to ${LIMITS.questions} questions.`;
      return sentence(issue.message);
    default:
      return generic(issue);
  }
}

/** Set fields the details form shows; anything else goes in the general list. */
const DETAIL_FIELDS = new Set(['title', 'description', 'subject', 'gradeBand', 'language', 'tags', 'visibility', 'cover']);

function emptyProblems(): Problems {
  return { details: {}, questions: {}, general: [], count: 0 };
}

function addIssue(p: Problems, issue: IssueLike, questions: readonly { id: string; type: QuestionType }[], maps: (IndexMaps | undefined)[]) {
  const [head, index] = issue.path;
  if (head === 'questions' && typeof index === 'number') {
    const q = questions[index];
    if (!q) {
      p.general.push(sentence(issue.message));
      return;
    }
    const key = questionFieldKey(issue.path.slice(2), maps[index]);
    const errs = (p.questions[q.id] ??= {});
    if (errs[key] === undefined) {
      errs[key] = questionMessage(key, issue, q.type);
      p.count++;
    }
    return;
  }
  const field = head === undefined ? '_' : String(head);
  if (!DETAIL_FIELDS.has(field)) {
    const msg = detailMessage(field, issue);
    if (!p.general.includes(msg)) {
      p.general.push(msg);
      p.count++;
    }
    return;
  }
  if (p.details[field] === undefined) {
    p.details[field] = detailMessage(field, issue);
    p.count++;
  }
}

export type ValidationResult = { ok: true; data: QuestionSetInput; problems: Problems } | { ok: false; data: null; problems: Problems };

/** Validates the whole set exactly as the server will. On success `data` is the trimmed payload to send. */
export function validateSet(details: SetDetails, questions: DraftQuestion[]): ValidationResult {
  const candidates = questions.map(toCandidate);
  const result = questionSetInputSchema.safeParse(buildSetCandidate(details, candidates.map((c) => c.question)));
  if (result.success) return { ok: true, data: result.data, problems: NO_PROBLEMS };
  const problems = emptyProblems();
  const maps = candidates.map((c) => c.maps);
  for (const issue of result.error.issues) addIssue(problems, issue as IssueLike, questions, maps);
  return { ok: false, data: null, problems };
}

/** The server sends zod's default wording; read the numbers back out so we can say it our way. */
export function issueFromServerMessage(path: PropertyKey[], message: string): IssueLike {
  const small = /^Too small: expected (\w+) to (?:have|be) >=?\s*(-?[\d.]+)/.exec(message);
  if (small) return { code: 'too_small', path, message, origin: small[1], minimum: Number(small[2]) };
  const big = /^Too big: expected (\w+) to (?:have|be) <=?\s*(-?[\d.]+)/.exec(message);
  if (big) return { code: 'too_big', path, message, origin: big[1], maximum: Number(big[2]) };
  const type = /^Invalid input: expected (\w+)/.exec(message);
  if (type) return { code: 'invalid_type', path, message, expected: type[1] };
  if (/^Invalid (option|discriminator)/.test(message)) return { code: 'invalid_value', path, message };
  return { code: 'custom', path, message };
}

/** Maps ApiError.fields (keys such as "questions.3.choices") onto the questions that were sent. */
export function problemsFromServer(fields: Record<string, string>, questions: DraftQuestion[]): Problems {
  const problems = emptyProblems();
  const maps = questions.map((q) => toCandidate(q).maps);
  for (const [key, message] of Object.entries(fields)) {
    const path = key === '_' ? [] : key.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
    addIssue(problems, issueFromServerMessage(path, message), questions, maps);
  }
  return problems;
}

/** Field errors for one question, keyed in draft terms, with schema paths and plain messages. Used by the importers. */
export function questionIssues(issues: readonly IssueLike[], type: QuestionType | undefined): { key: string; message: string }[] {
  const seen = new Set<string>();
  const out: { key: string; message: string }[] = [];
  for (const issue of issues) {
    const key = questionFieldKey(issue.path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, message: questionMessage(key, issue, type) });
  }
  return out;
}
