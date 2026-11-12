import { parseBlanks, type Question, type QuestionType, type ReadingTime, type SetDefaults, type SetFeel } from './questions.ts';

/*
 * What a set is like, read from its questions and its author's choices: the mix of question
 * types, pictures and sounds, how much there is to read, how many answers are numbers. Hosting
 * ranks modes and fills in settings from it, the room lays its question screens out from it, and
 * the engine gives long questions their reading time from `readingGraceMs`. Pure: no I/O.
 */

/** Characters a player reads before answering: the prompt and every answer shown with it. */
export function readingChars(q: Question): number {
  const t = (s: string | undefined) => (s ?? '').trim().length;
  let n = t(q.prompt);
  switch (q.type) {
    case 'mcq':
    case 'multi':
    case 'poll':
      for (const c of q.choices) n += t(c.text);
      break;
    case 'order':
      for (const i of q.items) n += t(i.text);
      break;
    case 'sort':
      for (const i of q.items) n += t(i.text);
      for (const g of q.groups) n += t(g.label);
      break;
    case 'match':
      for (const p of q.pairs) n += t(p.left) + t(p.right);
      break;
    case 'blanks':
      n += parseBlanks(q.text).pieces.reduce((a, p) => a + p.trim().length, 0);
      break;
    default:
      break;
  }
  return n;
}

/** Up to this many characters, everyone has read the question before speed starts to matter. */
export const READING_FREE_CHARS = 140;
/** Each character past that adds this much reading time: about a slow young reader's pace. */
export const READING_MS_PER_CHAR = 45;
/** Reading time never grows past this, however long the question. */
export const READING_MAX_MS = 9000;

/**
 * How long a player may spend reading this question before the clock starts to count against
 * them in modes that reward speed. Short questions get none; a sound to listen to adds its length.
 */
export function readingGraceMs(q: Question): number {
  const extra = Math.max(0, readingChars(q) - READING_FREE_CHARS) * READING_MS_PER_CHAR;
  const listen = q.sound?.kind === 'clip' ? q.sound.seconds * 1000 : q.sound?.kind === 'speech' ? Math.min(6000, q.sound.text.length * 70) : q.sound ? 1500 : 0;
  return Math.min(READING_MAX_MS, Math.round(extra + listen));
}

export interface SetProfile {
  count: number;
  /** How many questions of each type. */
  types: Partial<Record<QuestionType, number>>;
  /** Questions with a picture on the question or on a choice. */
  pictures: number;
  /** Questions with a sound on the question or on a choice. */
  sounds: number;
  /** Questions whose prompt plays a sound: listen first, then answer. */
  listening: number;
  numeric: number;
  /** Mean and longest characters to read per question. */
  readMean: number;
  readMax: number;
  /** Questions long enough to get extra reading time. */
  longReads: number;
  /** Longest answer a player sees on a tile or item, in characters. */
  answerMax: number;
  hints: number;
  difficulty: { easy: number; medium: number; hard: number; unset: number };
  /** Every tag on any question, with how many questions carry it. */
  tags: Record<string, number>;
  feel: SetFeel;
  play: { readingTime: ReadingTime; readingChosen: boolean; shuffleAnswers: boolean; modes: string[]; randomCount: number | null };
  /** Seconds per question that suit this set, from the author's reading time choice. */
  questionSec: number;
  /** Seconds per question worked out from the questions themselves, whatever the author chose. */
  autoQuestionSec: number;
}

function answerLengths(q: Question): number[] {
  switch (q.type) {
    case 'mcq':
    case 'multi':
    case 'poll':
      return q.choices.map((c) => c.text.trim().length);
    case 'order':
    case 'sort':
      return q.items.map((i) => i.text.trim().length);
    case 'match':
      return q.pairs.flatMap((p) => [p.left.trim().length, p.right.trim().length]);
    default:
      return [];
  }
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5;

/** Seconds per question for a set's reading time: fixed paces, or "auto" from the questions themselves. */
export function suggestedQuestionSec(questions: readonly Question[], readingTime: ReadingTime = 'normal'): number {
  if (readingTime === 'short') return 15;
  if (readingTime === 'normal') return 20;
  if (readingTime === 'long') return 30;
  if (!questions.length) return 20;
  // Auto: time to read at about 12 characters a second, plus time to think and tap, plus more for
  // typing, ordering and sorting, which take longer than a tap. Kept between 10 and 60 seconds.
  const per = questions.map((q) => {
    const act = q.type === 'short' || q.type === 'numeric' || q.type === 'blanks' ? 10 : q.type === 'order' || q.type === 'sort' || q.type === 'match' ? 14 : 6;
    const listen = q.sound?.kind === 'clip' ? q.sound.seconds : q.sound ? 3 : 0;
    return 4 + readingChars(q) / 12 + act + listen;
  });
  const sorted = [...per].sort((a, b) => a - b);
  // The 75th percentile: most questions fit, and the longest few still have their own time limits.
  const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]!;
  return Math.max(10, Math.min(60, roundTo5(p75)));
}

export function setProfile(set: { questions: readonly Question[]; defaults?: SetDefaults | null }): SetProfile {
  const qs = set.questions;
  const types: Partial<Record<QuestionType, number>> = {};
  const difficulty = { easy: 0, medium: 0, hard: 0, unset: 0 };
  const tags: Record<string, number> = {};
  let pictures = 0;
  let sounds = 0;
  let listening = 0;
  let numeric = 0;
  let longReads = 0;
  let answerMax = 0;
  let hints = 0;
  let readSum = 0;
  let readMax = 0;
  for (const q of qs) {
    types[q.type] = (types[q.type] ?? 0) + 1;
    const choices = 'choices' in q ? q.choices : [];
    if (q.media || choices.some((c) => c.media)) pictures++;
    if (q.sound || choices.some((c) => c.sound)) sounds++;
    if (q.sound) listening++;
    if (q.type === 'numeric') numeric++;
    const chars = readingChars(q);
    readSum += chars;
    readMax = Math.max(readMax, chars);
    if (chars > READING_FREE_CHARS) longReads++;
    answerMax = Math.max(answerMax, ...answerLengths(q), 0);
    if (q.hint) hints++;
    difficulty[q.difficulty ?? 'unset']++;
    for (const t of q.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
  }
  const d = set.defaults ?? {};
  const readingTime = d.readingTime ?? 'normal';
  return {
    count: qs.length,
    types,
    pictures,
    sounds,
    listening,
    numeric,
    readMean: qs.length ? Math.round(readSum / qs.length) : 0,
    readMax,
    longReads,
    answerMax,
    hints,
    difficulty,
    tags,
    feel: d.feel ?? {},
    play: { readingTime, readingChosen: d.readingTime !== undefined, shuffleAnswers: d.shuffleAnswers === true, modes: d.modes ?? [], randomCount: d.randomCount ?? null },
    questionSec: suggestedQuestionSec(qs, readingTime),
    autoQuestionSec: suggestedQuestionSec(qs, 'auto'),
  };
}

/** How a question screen should lay itself out, from the question alone. */
export type QuestionLayout = 'listen' | 'picture' | 'long' | 'plain';

export function questionLayout(q: { prompt: string; media?: unknown; sound?: unknown }): QuestionLayout {
  if (q.sound) return 'listen';
  if (q.media) return 'picture';
  if (q.prompt.length > 160) return 'long';
  return 'plain';
}
