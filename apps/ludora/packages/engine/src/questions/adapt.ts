import { parseBlanks, type Question, type QuestionType, type Rng } from '@ludora/shared';
import { normalizeAnswerText } from './grade.ts';

/**
 * Modes declare which question types they can present. Sets often mix
 * types, so before a game starts each question is either kept, converted to
 * a type the mode supports, or skipped with a reason the host can read.
 */

export interface AdaptResult {
  questions: Question[];
  skipped: { id: string; type: QuestionType; reason: string }[];
  converted: number;
}

/** Plausible wrong answers for a question, drawn from the other answers in the same set. */
function answerText(q: Question): string | null {
  switch (q.type) {
    case 'mcq':
      return q.choices.find((c) => c.id === q.correct)?.text || null;
    case 'short':
      return q.accepted[0] ?? null;
    case 'flashcard':
      return q.back;
    case 'numeric':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    default:
      return null;
  }
}

/**
 * The kind of thing an answer is, so a wrong option never stands out from the
 * right one: a number or amount ("34%", "120 min", "3/4"), a word or short name
 * (up to three words), or a phrase such as a definition.
 */
export type AnswerShape = 'number' | 'word' | 'phrase';

const NUMBER_LIKE = /^[-\u2212+]?[£$€]?\d[\d,.\s/:]*(%|°\s?[cfk]?|[a-z]{1,5}\.?|[a-z]{1,5}\s?[²³])?$/i;

export function answerShape(text: string): AnswerShape {
  const t = text.trim();
  if (NUMBER_LIKE.test(t)) return 'number';
  return t.split(/\s+/).length <= 3 ? 'word' : 'phrase';
}

/**
 * Wrong options for a question that has none of its own, taken from the other
 * answers in the set. Answers to questions of the same type come first and only
 * need to agree on being a number or not (a set of definitions mixes long and
 * short ones); answers borrowed from other types must be the same shape, so a
 * definition is never offered beside "34%" or a one-word name.
 */
function distractorsFor(q: Question, correct: string, all: readonly Question[], rng: Rng, want: number): string[] {
  const seen = new Set([normalizeAnswerText(correct)]);
  const shape = answerShape(correct);
  const isNumber = shape === 'number';
  const sameType: string[] = [];
  const otherType: string[] = [];
  for (const other of all) {
    if (other.id === q.id) continue;
    const same = other.type === q.type;
    const texts = other.type === 'mcq' ? other.choices.map((c) => c.text) : [answerText(other)];
    for (const t of texts) {
      if (!t) continue;
      const key = normalizeAnswerText(t);
      if (!key || seen.has(key)) continue;
      const s = answerShape(t);
      if (same ? (s === 'number') !== isNumber : s !== shape) continue;
      seen.add(key);
      (same ? sameType : otherType).push(t);
    }
  }
  return [...rng.shuffle(sameType), ...rng.shuffle(otherType)].slice(0, want);
}

function numericDistractors(answer: number, rng: Rng): number[] {
  const isInt = Number.isInteger(answer);
  const step = isInt ? Math.max(1, Math.round(Math.abs(answer) * 0.1)) : Math.max(0.1, Math.abs(answer) * 0.1);
  const candidates = [answer + step, answer - step, answer + 2 * step, answer - 2 * step, answer * 2, answer + 10 * step];
  const out: number[] = [];
  for (const c of rng.shuffle(candidates)) {
    const v = isInt ? Math.round(c) : Math.round(c * 100) / 100;
    if (v !== answer && !out.includes(v)) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

function asMcq(q: Question, correct: string, wrong: string[], rng: Rng): Question {
  const texts = rng.shuffle([correct, ...wrong]);
  const choices = texts.map((text, i) => ({ id: `a${i}`, text }));
  const correctId = choices[texts.indexOf(correct)]!.id;
  return {
    id: q.id,
    type: 'mcq',
    prompt: q.prompt,
    choices,
    correct: correctId,
    ...(q.media ? { media: q.media } : {}),
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.timeLimitSec ? { timeLimitSec: q.timeLimitSec } : {}),
    ...(q.points !== undefined ? { points: q.points } : {}),
    ...(q.difficulty ? { difficulty: q.difficulty } : {}),
    ...(q.doublePoints ? { doublePoints: true } : {}),
  };
}

function convert(q: Question, supported: ReadonlySet<QuestionType>, all: readonly Question[], rng: Rng): Question | string {
  const mcq = supported.has('mcq');
  const short = supported.has('short');
  switch (q.type) {
    case 'flashcard': {
      if (mcq) {
        const wrong = distractorsFor(q, q.back, all, rng, 3);
        if (wrong.length >= 2) return asMcq(q, q.back, wrong, rng);
      }
      if (short) return { id: q.id, type: 'short', prompt: q.prompt, accepted: [q.back], fuzzy: true, ...(q.media ? { media: q.media } : {}) };
      return 'This mode cannot show flashcards and the set has too few other answers to turn it into a choice question.';
    }
    case 'short': {
      if (mcq) {
        const wrong = distractorsFor(q, q.accepted[0]!, all, rng, 3);
        if (wrong.length >= 2) return asMcq(q, q.accepted[0]!, wrong, rng);
      }
      return 'This mode needs choices, and the set has too few other answers to make some.';
    }
    case 'truefalse':
      if (mcq) {
        return {
          id: q.id,
          type: 'mcq',
          prompt: q.prompt,
          choices: [
            { id: 't', text: 'True' },
            { id: 'f', text: 'False' },
          ],
          correct: q.correct ? 't' : 'f',
          ...(q.media ? { media: q.media } : {}),
          ...(q.explanation ? { explanation: q.explanation } : {}),
          ...(q.timeLimitSec ? { timeLimitSec: q.timeLimitSec } : {}),
          ...(q.doublePoints ? { doublePoints: true } : {}),
        };
      }
      return 'This mode cannot show true-or-false questions.';
    case 'numeric': {
      const fmt = (v: number) => `${v}${q.unit ? ` ${q.unit}` : ''}`;
      if (mcq) return asMcq(q, fmt(q.answer), numericDistractors(q.answer, rng).map(fmt), rng);
      if (short && (q.tolerance ?? 0) === 0) return { id: q.id, type: 'short', prompt: q.prompt, accepted: [String(q.answer)], fuzzy: false };
      return 'This mode cannot show number questions.';
    }
    case 'multi':
      if (mcq && q.correct.length === 1) return { ...q, type: 'mcq', correct: q.correct[0]! };
      return 'This mode cannot show select-all questions.';
    case 'mcq':
      if (short) {
        const text = q.choices.find((c) => c.id === q.correct)?.text;
        if (text) return { id: q.id, type: 'short', prompt: q.prompt, accepted: [text], fuzzy: true };
      }
      return 'This mode cannot show choice questions.';
    case 'order':
      return 'This mode cannot show ordering questions.';
    case 'match':
      return 'This mode cannot show matching questions.';
    case 'poll':
      return 'This mode cannot show polls: they have no right answer to play for.';
    case 'sort':
      return 'This mode cannot show sorting questions.';
    case 'blanks': {
      // A sentence with one gap reads as a question with the gap as a line: typed, or a choice from its word bank.
      const { pieces, gaps } = parseBlanks(q.text);
      if (gaps.length === 1) {
        const prompt = `${q.prompt.trim()} ${pieces[0]}_____${pieces[1]}`.trim().slice(0, 500);
        const accepted = gaps[0]!.accepted;
        const keep = { ...(q.media ? { media: q.media } : {}), ...(q.explanation ? { explanation: q.explanation } : {}), ...(q.timeLimitSec ? { timeLimitSec: q.timeLimitSec } : {}), ...(q.points !== undefined ? { points: q.points } : {}), ...(q.doublePoints ? { doublePoints: true } : {}) };
        const words = (q.distractors ?? []).filter((w) => !accepted.some((a) => normalizeAnswerText(a) === normalizeAnswerText(w)));
        if (mcq && (q.bank || !short) && words.length >= 2) return asMcq({ ...q, prompt }, accepted[0]!, rng.shuffle(words).slice(0, 3), rng);
        if (short) return { id: q.id, type: 'short', prompt, accepted: accepted.slice(0, 10), fuzzy: !q.bank, ...(q.caseSensitive ? { caseSensitive: true } : {}), ...keep };
        if (mcq && words.length >= 2) return asMcq({ ...q, prompt }, accepted[0]!, rng.shuffle(words).slice(0, 3), rng);
      }
      return gaps.length > 1 ? 'This mode cannot show fill-in-the-blanks questions with more than one gap.' : 'This mode cannot show fill-in-the-blanks questions.';
    }
  }
}

export function adaptQuestions(questions: readonly Question[], supported: readonly QuestionType[], rng: Rng): AdaptResult {
  const allowed = new Set(supported);
  const out: Question[] = [];
  const skipped: AdaptResult['skipped'] = [];
  let converted = 0;
  for (const q of questions) {
    if (allowed.has(q.type)) {
      out.push(q);
      continue;
    }
    const result = convert(q, allowed, questions, rng);
    if (typeof result === 'string') skipped.push({ id: q.id, type: q.type, reason: result });
    else {
      out.push(result);
      converted++;
    }
  }
  return { questions: out, skipped, converted };
}
