/**
 * The editor's working copy of a question set.
 *
 * A draft keeps what the author typed (numbers as text, half-finished lists)
 * and the fields of every question type, so switching a question from
 * multiple choice to select all keeps its choices. `toCandidate` turns a draft
 * into the shape the shared zod schema checks; only that shape is ever saved.
 * Pure: no React, no DOM.
 */
import {
  DIFFICULTIES,
  MEDIA_URL_PATTERN,
  QUESTION_TYPES,
  SET_COVER_GLYPHS,
  SUBJECTS,
  VISIBILITIES,
  type Difficulty,
  type Media,
  type Question,
  type QuestionType,
  type SetCoverGlyph,
  type Subject,
  type Visibility,
} from '@ludora/shared';
import { SUBJECT_COVER_DEFAULTS } from '../covers.ts';

/** Limits from packages/shared/src/questions.ts, repeated so the editor can show them before validating. The schema stays the judge. */
export const LIMITS = {
  questions: 250,
  title: 80,
  description: 500,
  gradeBand: 30,
  tags: 10,
  tag: 30,
  prompt: 500,
  explanation: 600,
  choice: 200,
  item: 120,
  accepted: 120,
  back: 300,
  unit: 20,
  alt: 300,
  timeMin: 5,
  timeMax: 300,
  pointsMax: 10_000,
} as const;

export const LIST_LIMITS = {
  mcq: { min: 2, max: 6 },
  multi: { min: 2, max: 8 },
  short: { min: 1, max: 10 },
  order: { min: 2, max: 8 },
  match: { min: 2, max: 8 },
} as const;

/* ----------------------------------- Ids ----------------------------------- */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Same rule as idSchema in questions.ts. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** A short random id such as "qk3x9ab" that is not in `taken`. */
export function newId(prefix: string, taken?: { has(id: string): boolean }): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    let id = prefix;
    for (const b of bytes) id += ID_ALPHABET.charAt(b % ID_ALPHABET.length);
    if (!taken?.has(id)) return id;
  }
}

/* --------------------------------- Drafts ---------------------------------- */

export interface DraftChoice {
  id: string;
  text: string;
  /** Kept exactly as loaded. There is no upload yet, so the editor never adds one. */
  media?: Media;
}
export interface DraftItem {
  id: string;
  text: string;
}
export interface DraftPair {
  id: string;
  left: string;
  right: string;
}

export interface DraftQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  media?: Media;
  explanation: string;
  /** As typed; empty means "use the game's setting". */
  timeLimit: string;
  points: string;
  difficulty: Difficulty | '';
  /** Comma separated, as typed. */
  tags: string;
  /** mcq and multi. */
  choices: DraftChoice[];
  /** Ids of the correct choices: one for mcq, one or more for multi. */
  correct: string[];
  /** truefalse. Null until the author picks. */
  truth: boolean | null;
  /** short. The ids only keep React keys stable and are never saved. */
  accepted: DraftItem[];
  caseSensitive: boolean;
  fuzzy: boolean;
  /** numeric, as typed. */
  answer: string;
  tolerance: string;
  unit: string;
  /** order, listed in the correct order. */
  items: DraftItem[];
  /** match. */
  pairs: DraftPair[];
  /** flashcard. */
  back: string;
}

function blankFields(): Omit<DraftQuestion, 'id' | 'type'> {
  return {
    prompt: '',
    explanation: '',
    timeLimit: '',
    points: '',
    difficulty: '',
    tags: '',
    choices: [],
    correct: [],
    truth: null,
    accepted: [],
    caseSensitive: false,
    fuzzy: true,
    answer: '',
    tolerance: '',
    unit: '',
    items: [],
    pairs: [],
    back: '',
  };
}

const hasText = (s: string) => s.trim() !== '';
const choiceFilled = (c: DraftChoice) => hasText(c.text) || Boolean(c.media);

function padList<T extends { id: string }>(list: T[], to: number, make: (id: string) => T, prefix: string): T[] {
  const out = [...list];
  const taken = new Set(out.map((x) => x.id));
  while (out.length < to) {
    const id = newId(prefix, taken);
    taken.add(id);
    out.push(make(id));
  }
  return out;
}

function withFreshIds(texts: string[], prefix: string): DraftItem[] {
  const taken = new Set<string>();
  return texts.map((text) => {
    const id = newId(prefix, taken);
    taken.add(id);
    return { id, text };
  });
}

/** How many empty rows a brand new question of each type starts with. */
const STARTING_ROWS: Partial<Record<QuestionType, number>> = { mcq: 4, multi: 4, order: 3, match: 3, short: 1 };

/**
 * Makes sure a draft has what its type needs: enough rows to fill in, and a
 * correct answer that still points at a real choice. Content from another
 * type carries over when the target is empty (choices become items and back).
 */
export function withShape(d: DraftQuestion): DraftQuestion {
  const q: DraftQuestion = { ...d };
  const start = STARTING_ROWS[q.type] ?? 0;
  switch (q.type) {
    case 'mcq':
    case 'multi': {
      const limits = LIST_LIMITS[q.type];
      if (!q.choices.some(choiceFilled)) {
        const carried = q.items.map((i) => i.text).filter(hasText);
        if (carried.length) q.choices = withFreshIds(carried.slice(0, limits.max), 'c');
      }
      const blank = !q.choices.some(choiceFilled);
      q.choices = padList(q.choices, Math.max(limits.min, blank ? start : 0), (id) => ({ id, text: '' }), 'c');
      const ids = new Set(q.choices.map((c) => c.id));
      q.correct = q.correct.filter((id) => ids.has(id));
      if (q.type === 'mcq') q.correct = q.correct.slice(0, 1);
      break;
    }
    case 'short': {
      if (!q.accepted.some((a) => hasText(a.text)) && hasText(q.back)) q.accepted = [{ id: newId('a'), text: q.back }];
      q.accepted = padList(q.accepted, LIST_LIMITS.short.min, (id) => ({ id, text: '' }), 'a');
      break;
    }
    case 'order': {
      if (!q.items.some((i) => hasText(i.text))) {
        const carried = q.choices.map((c) => c.text).filter(hasText);
        if (carried.length) q.items = withFreshIds(carried.slice(0, LIST_LIMITS.order.max), 'i');
      }
      const blank = !q.items.some((i) => hasText(i.text));
      q.items = padList(q.items, Math.max(LIST_LIMITS.order.min, blank ? start : 0), (id) => ({ id, text: '' }), 'i');
      break;
    }
    case 'match': {
      const blank = !q.pairs.some((p) => hasText(p.left) || hasText(p.right));
      q.pairs = padList(q.pairs, Math.max(LIST_LIMITS.match.min, blank ? start : 0), (id) => ({ id, left: '', right: '' }), 'p');
      break;
    }
    case 'flashcard': {
      if (!hasText(q.back)) {
        const first = q.accepted.find((a) => hasText(a.text));
        if (first) q.back = first.text;
      }
      break;
    }
    default:
      break;
  }
  return q;
}

export function blankQuestion(type: QuestionType, id: string): DraftQuestion {
  return withShape({ id, type, ...blankFields() });
}

export function changeType(d: DraftQuestion, type: QuestionType): DraftQuestion {
  return d.type === type ? d : withShape({ ...d, type });
}

/** A copy with a new question id. Choice and item ids only need to be unique inside one question, so they stay. */
export function cloneQuestion(d: DraftQuestion, id: string): DraftQuestion {
  return {
    ...d,
    id,
    choices: d.choices.map((c) => ({ ...c })),
    correct: [...d.correct],
    accepted: d.accepted.map((a) => ({ ...a })),
    items: d.items.map((i) => ({ ...i })),
    pairs: d.pairs.map((p) => ({ ...p })),
  };
}

export function fromQuestion(q: Question): DraftQuestion {
  const d: DraftQuestion = {
    id: q.id,
    type: q.type,
    ...blankFields(),
    prompt: q.prompt,
    explanation: q.explanation ?? '',
    timeLimit: q.timeLimitSec === undefined ? '' : String(q.timeLimitSec),
    points: q.points === undefined ? '' : String(q.points),
    difficulty: q.difficulty ?? '',
    tags: (q.tags ?? []).join(', '),
  };
  if (q.media) d.media = q.media;
  switch (q.type) {
    case 'mcq':
      d.choices = q.choices.map((c) => ({ ...c }));
      d.correct = [q.correct];
      break;
    case 'multi':
      d.choices = q.choices.map((c) => ({ ...c }));
      d.correct = [...q.correct];
      break;
    case 'truefalse':
      d.truth = q.correct;
      break;
    case 'short': {
      const taken = new Set<string>();
      d.accepted = q.accepted.map((text) => {
        const id = newId('a', taken);
        taken.add(id);
        return { id, text };
      });
      d.caseSensitive = q.caseSensitive ?? false;
      d.fuzzy = q.fuzzy ?? true;
      break;
    }
    case 'numeric':
      d.answer = String(q.answer);
      d.tolerance = q.tolerance === undefined ? '' : String(q.tolerance);
      d.unit = q.unit ?? '';
      break;
    case 'order':
      d.items = q.items.map((i) => ({ ...i }));
      break;
    case 'match':
      d.pairs = q.pairs.map((p) => ({ ...p }));
      break;
    case 'flashcard':
      d.back = q.back;
      break;
  }
  return d;
}

/* ------------------------------ Numbers, tags ------------------------------ */

/**
 * Reads a number as people type it: "3.5", "-2", "1,000", "1 000", "1e6".
 * Returns NaN for anything else, so validation can say so.
 */
export function parseNumberText(input: string): number {
  let s = input.trim().replace(/[\s  _]/g, '').replace(/[−–]/g, '-');
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number.NaN;
  return Number(s);
}

/** "space, Planets ,space" becomes ["space", "Planets"]: trimmed, no blanks, no repeats. */
export function splitTags(text: string, separators: RegExp = /,/): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(separators)) {
    const tag = raw.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/* -------------------------------- Candidates ------------------------------- */

/** For each list sent to the schema, the draft row each entry came from. Blank rows are left out. */
export interface IndexMaps {
  choices: number[];
  accepted: number[];
  items: number[];
  pairs: number[];
}

/**
 * The question as the schema should see it. Blank rows (an empty fourth
 * choice, an unused pair) are left out rather than reported, so the author
 * only has to fill in what they need.
 */
export function toCandidate(d: DraftQuestion): { question: Record<string, unknown>; maps: IndexMaps } {
  const maps: IndexMaps = { choices: [], accepted: [], items: [], pairs: [] };
  const q: Record<string, unknown> = { id: d.id, type: d.type, prompt: d.prompt };
  if (d.media) q.media = d.media;
  if (hasText(d.explanation)) q.explanation = d.explanation;
  if (hasText(d.timeLimit)) q.timeLimitSec = parseNumberText(d.timeLimit);
  if (hasText(d.points)) q.points = parseNumberText(d.points);
  if (d.difficulty) q.difficulty = d.difficulty;
  const tags = splitTags(d.tags);
  if (tags.length) q.tags = tags;

  switch (d.type) {
    case 'mcq':
    case 'multi': {
      const kept: DraftChoice[] = [];
      d.choices.forEach((c, i) => {
        if (!choiceFilled(c)) return;
        kept.push(c);
        maps.choices.push(i);
      });
      q.choices = kept.map((c) => (c.media ? { id: c.id, text: c.text, media: c.media } : { id: c.id, text: c.text }));
      const ids = new Set(kept.map((c) => c.id));
      const correct = d.correct.filter((id) => ids.has(id));
      q.correct = d.type === 'mcq' ? (correct[0] ?? '') : correct;
      break;
    }
    case 'truefalse':
      if (d.truth !== null) q.correct = d.truth;
      break;
    case 'short': {
      const kept: string[] = [];
      d.accepted.forEach((a, i) => {
        if (!hasText(a.text)) return;
        kept.push(a.text);
        maps.accepted.push(i);
      });
      q.accepted = kept;
      if (d.caseSensitive) q.caseSensitive = true;
      if (!d.fuzzy) q.fuzzy = false;
      break;
    }
    case 'numeric':
      if (hasText(d.answer)) q.answer = parseNumberText(d.answer);
      if (hasText(d.tolerance)) q.tolerance = parseNumberText(d.tolerance);
      if (hasText(d.unit)) q.unit = d.unit;
      break;
    case 'order': {
      const kept: DraftItem[] = [];
      d.items.forEach((item, i) => {
        if (!hasText(item.text)) return;
        kept.push(item);
        maps.items.push(i);
      });
      q.items = kept.map((item) => ({ id: item.id, text: item.text }));
      break;
    }
    case 'match': {
      const kept: DraftPair[] = [];
      d.pairs.forEach((p, i) => {
        if (!hasText(p.left) && !hasText(p.right)) return;
        kept.push(p);
        maps.pairs.push(i);
      });
      q.pairs = kept.map((p) => ({ id: p.id, left: p.left, right: p.right }));
      break;
    }
    case 'flashcard':
      q.back = d.back;
      break;
  }
  return { question: q, maps };
}

/** True for a question nobody has typed into yet. */
export function isBlankQuestion(d: DraftQuestion): boolean {
  return (
    !hasText(d.prompt) &&
    !d.media &&
    !hasText(d.explanation) &&
    !d.choices.some(choiceFilled) &&
    d.truth === null &&
    !d.accepted.some((a) => hasText(a.text)) &&
    !hasText(d.answer) &&
    !d.items.some((i) => hasText(i.text)) &&
    !d.pairs.some((p) => hasText(p.left) || hasText(p.right)) &&
    !hasText(d.back)
  );
}

/** A one-line answer for a collapsed question. Empty when there is none yet. */
export function answerSummary(d: DraftQuestion): string {
  switch (d.type) {
    case 'mcq':
    case 'multi':
      return d.choices
        .filter((c) => d.correct.includes(c.id) && choiceFilled(c))
        .map((c) => c.text.trim() || 'an image')
        .join(', ');
    case 'truefalse':
      return d.truth === null ? '' : d.truth ? 'True' : 'False';
    case 'short':
      return d.accepted.map((a) => a.text.trim()).filter(Boolean).join(' or ');
    case 'numeric':
      return hasText(d.answer) ? `${d.answer.trim()}${hasText(d.tolerance) ? ` ± ${d.tolerance.trim()}` : ''}${hasText(d.unit) ? ` ${d.unit.trim()}` : ''}` : '';
    case 'order':
      return d.items.map((i) => i.text.trim()).filter(Boolean).join(', ');
    case 'match':
      return d.pairs
        .filter((p) => hasText(p.left) || hasText(p.right))
        .map((p) => `${p.left.trim()} and ${p.right.trim()}`)
        .join('; ');
    case 'flashcard':
      return d.back.trim();
  }
}

/* ------------------------------- Set details ------------------------------- */

export interface CoverChoice {
  glyph: SetCoverGlyph;
  hue: number;
}

export interface SetDetails {
  title: string;
  description: string;
  subject: Subject | '';
  gradeBand: string;
  language: string;
  /** Comma separated, as typed. */
  tags: string;
  visibility: Visibility;
  /** Null shows the subject's own cover. */
  cover: CoverChoice | null;
}

export function blankDetails(): SetDetails {
  return { title: '', description: '', subject: '', gradeBand: '', language: 'en', tags: '', visibility: 'private', cover: null };
}

export interface LoadedSet {
  title: string;
  description: string;
  subject: string;
  gradeBand: string | null;
  tags: string[];
  visibility: Visibility;
  cover: { glyph: string; hue: number } | null;
  /** Not in the set summary yet; read when the server sends it. */
  language?: string;
}

export function detailsFromSet(set: LoadedSet): SetDetails {
  return {
    title: set.title,
    description: set.description ?? '',
    subject: (SUBJECTS as readonly string[]).includes(set.subject) ? (set.subject as Subject) : '',
    gradeBand: set.gradeBand ?? '',
    language: set.language || 'en',
    tags: (set.tags ?? []).join(', '),
    visibility: set.visibility,
    cover: set.cover && (SET_COVER_GLYPHS as readonly string[]).includes(set.cover.glyph) ? { glyph: set.cover.glyph as SetCoverGlyph, hue: set.cover.hue } : null,
  };
}

/** The whole set as questionSetInputSchema should see it. */
export function buildSetCandidate(details: SetDetails, questions: Record<string, unknown>[]): Record<string, unknown> {
  return {
    title: details.title,
    description: details.description,
    subject: details.subject || undefined,
    gradeBand: hasText(details.gradeBand) ? details.gradeBand : undefined,
    language: details.language,
    tags: splitTags(details.tags),
    visibility: details.visibility,
    ...(details.cover ? { cover: details.cover } : {}),
    questions,
  };
}

export { SUBJECT_COVER_DEFAULTS };

export function coverFor(details: Pick<SetDetails, 'cover' | 'subject'>): CoverChoice {
  return details.cover ?? SUBJECT_COVER_DEFAULTS[details.subject || 'general'];
}

export const GLYPH_LABELS: Record<SetCoverGlyph, string> = {
  atom: 'Atom',
  globe: 'Globe',
  book: 'Book',
  calculator: 'Calculator',
  palette: 'Paint palette',
  music: 'Music note',
  leaf: 'Leaf',
  flask: 'Flask',
  landmark: 'Landmark',
  languages: 'Languages',
  cpu: 'Computer chip',
  heart: 'Heart',
  star: 'Star',
  puzzle: 'Puzzle piece',
};

/** Language codes offered for a set. A set saved with any other code keeps it. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'cy', label: 'Welsh' },
  { code: 'ga', label: 'Irish' },
  { code: 'gd', label: 'Scottish Gaelic' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ro', label: 'Romanian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ur', label: 'Urdu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'la', label: 'Latin' },
];

/* ------------------------- Reading back a saved draft ---------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const validId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);

function reviveMedia(v: unknown): Media | undefined {
  if (!isObj(v) || v.kind !== 'image' || typeof v.url !== 'string' || !MEDIA_URL_PATTERN.test(v.url)) return undefined;
  return { kind: 'image', url: v.url, alt: str(v.alt) };
}

function reviveList<T extends { id: string }>(v: unknown, prefix: string, make: (o: Record<string, unknown>, id: string) => T): T[] {
  if (!Array.isArray(v)) return [];
  const taken = new Set<string>();
  const out: T[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    const id = validId(raw.id) && !taken.has(raw.id) ? raw.id : newId(prefix, taken);
    taken.add(id);
    out.push(make(raw, id));
  }
  return out;
}

/** Turns a draft read from storage back into a well-formed one, or null if it is not one. */
export function reviveQuestion(raw: unknown): DraftQuestion | null {
  if (!isObj(raw) || !validId(raw.id) || !(QUESTION_TYPES as readonly unknown[]).includes(raw.type)) return null;
  const d: DraftQuestion = {
    id: raw.id,
    type: raw.type as QuestionType,
    ...blankFields(),
    prompt: str(raw.prompt),
    explanation: str(raw.explanation),
    timeLimit: str(raw.timeLimit),
    points: str(raw.points),
    difficulty: (DIFFICULTIES as readonly unknown[]).includes(raw.difficulty) ? (raw.difficulty as Difficulty) : '',
    tags: str(raw.tags),
    choices: reviveList(raw.choices, 'c', (o, id) => {
      const media = reviveMedia(o.media);
      return media ? { id, text: str(o.text), media } : { id, text: str(o.text) };
    }),
    correct: Array.isArray(raw.correct) ? raw.correct.filter(validId) : [],
    truth: typeof raw.truth === 'boolean' ? raw.truth : null,
    accepted: reviveList(raw.accepted, 'a', (o, id) => ({ id, text: str(o.text) })),
    caseSensitive: raw.caseSensitive === true,
    fuzzy: raw.fuzzy !== false,
    answer: str(raw.answer),
    tolerance: str(raw.tolerance),
    unit: str(raw.unit),
    items: reviveList(raw.items, 'i', (o, id) => ({ id, text: str(o.text) })),
    pairs: reviveList(raw.pairs, 'p', (o, id) => ({ id, left: str(o.left), right: str(o.right) })),
    back: str(raw.back),
  };
  const media = reviveMedia(raw.media);
  if (media) d.media = media;
  return withShape(d);
}

export function reviveDetails(raw: unknown): SetDetails | null {
  if (!isObj(raw)) return null;
  const cover = isObj(raw.cover) && (SET_COVER_GLYPHS as readonly unknown[]).includes(raw.cover.glyph) && typeof raw.cover.hue === 'number' ? { glyph: raw.cover.glyph as SetCoverGlyph, hue: Math.round(Math.min(359, Math.max(0, raw.cover.hue))) } : null;
  return {
    title: str(raw.title),
    description: str(raw.description),
    subject: (SUBJECTS as readonly unknown[]).includes(raw.subject) ? (raw.subject as Subject) : '',
    gradeBand: str(raw.gradeBand),
    language: str(raw.language, 'en') || 'en',
    tags: str(raw.tags),
    visibility: (VISIBILITIES as readonly unknown[]).includes(raw.visibility) ? (raw.visibility as Visibility) : 'private',
    cover,
  };
}
