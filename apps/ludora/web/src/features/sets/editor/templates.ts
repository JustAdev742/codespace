/**
 * Question templates: maths drills with generated numbers (every answer worked out and checked
 * here, never typed by hand), vocabulary pairs turned into several question types at once, and a
 * timeline turned into ordering questions. Pure: no React, no DOM; `random` makes them repeatable.
 */
import { questionSchema, type Question } from '@ludora/shared';

type Random = () => number;

function shuffle<T>(list: readonly T[], random: Random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const int = (min: number, max: number, random: Random) => min + Math.floor(random() * (max - min + 1));

/** Only questions the shared rules accept. */
function valid(qs: unknown[]): Question[] {
  return qs.flatMap((q) => {
    const r = questionSchema.safeParse(q);
    return r.success ? [r.data] : [];
  });
}

/* --------------------------------- maths drills --------------------------------- */

export type DrillOp = 'add' | 'subtract' | 'multiply' | 'divide';
export const DRILL_SIGN: Record<DrillOp, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };

export interface DrillOptions {
  ops: DrillOp[];
  min: number;
  max: number;
  count: number;
  /** Typed number answers, or four choices. */
  as: 'numeric' | 'mcq';
  /** Subtraction never goes below zero. */
  noNegatives?: boolean;
}

export interface Sum {
  a: number;
  b: number;
  op: DrillOp;
  answer: number;
}

/** One sum, its answer computed. Division is built backwards from a product, so it always comes out whole. */
export function makeSum(op: DrillOp, min: number, max: number, random: Random, noNegatives = true): Sum {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (op === 'divide') {
    const b = Math.max(1, int(Math.max(1, lo), Math.max(1, hi), random));
    const answer = int(lo, hi, random);
    return { a: answer * b, b, op, answer };
  }
  let a = int(lo, hi, random);
  let b = int(lo, hi, random);
  if (op === 'subtract' && noNegatives && b > a) [a, b] = [b, a];
  const answer = op === 'add' ? a + b : op === 'subtract' ? a - b : a * b;
  return { a, b, op, answer };
}

/** Checks a sum the way a teacher would, from its own numbers. */
export function checkSum(s: Sum): boolean {
  switch (s.op) {
    case 'add':
      return s.a + s.b === s.answer;
    case 'subtract':
      return s.a - s.b === s.answer;
    case 'multiply':
      return s.a * s.b === s.answer;
    case 'divide':
      return s.b !== 0 && s.answer * s.b === s.a;
  }
}

/** Wrong answers near the right one that a slip would give: off by one, by ten, or the wrong operation. */
function slips(s: Sum, random: Random): number[] {
  const pool = new Set<number>();
  const other = s.op === 'add' ? s.a - s.b : s.op === 'subtract' ? s.a + s.b : s.op === 'multiply' ? s.a + s.b : s.a - s.b;
  for (const v of [other, s.answer + 1, s.answer - 1, s.answer + 10, s.answer - 10, s.answer + s.b, s.answer - s.b, s.answer + 2]) {
    if (v !== s.answer && (v >= 0 || s.answer < 0)) pool.add(v);
  }
  return shuffle([...pool], random).slice(0, 3);
}

export function mathsDrill(o: DrillOptions, random: Random = Math.random): Question[] {
  const ops = o.ops.length ? o.ops : (['add'] as DrillOp[]);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (let tries = 0; out.length < Math.min(o.count, 100) && tries < o.count * 20; tries++) {
    const s = makeSum(ops[out.length % ops.length]!, o.min, o.max, random, o.noNegatives !== false);
    const key = `${s.a}${s.op}${s.b}`;
    if (seen.has(key) || !checkSum(s)) continue;
    seen.add(key);
    const prompt = `${s.a} ${DRILL_SIGN[s.op]} ${s.b} = ?`;
    const id = `drill${out.length + 1}`;
    if (o.as === 'numeric') out.push({ id, type: 'numeric', prompt, answer: s.answer, tags: ['drill'] });
    else {
      const texts = shuffle([s.answer, ...slips(s, random)], random).map(String);
      const choices = texts.map((text, k) => ({ id: `c${k}`, text }));
      out.push({ id, type: 'mcq', prompt, choices, correct: choices[texts.indexOf(String(s.answer))]!.id, tags: ['drill'] });
    }
  }
  return valid(out);
}

/* ------------------------------- vocabulary pairs -------------------------------- */

export type VocabType = 'flashcard' | 'choice' | 'reverse' | 'typed' | 'match';
export const VOCAB_LABEL: Record<VocabType, string> = {
  flashcard: 'Flashcards',
  choice: 'Pick the meaning',
  reverse: 'Pick the word',
  typed: 'Type the word',
  match: 'Match pairs (four at a time)',
};

/** "word = meaning", "word - meaning", "word: meaning" or a tab between, one pair a line. */
export function readPairs(text: string): { pairs: [string, string][]; skipped: string[] } {
  const pairs: [string, string][] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s*(?:\t|=|:| [-–—] )\s*(.+)$/.exec(line);
    if (m && m[1]!.trim() && m[2]!.trim()) pairs.push([m[1]!.trim().slice(0, 120), m[2]!.trim().slice(0, 120)]);
    else skipped.push(line);
  }
  return { pairs, skipped };
}

export function vocabQuestions(pairs: readonly [string, string][], types: readonly VocabType[], random: Random = Math.random): Question[] {
  const out: unknown[] = [];
  let n = 0;
  const id = () => `voc${++n}`;
  const others = (i: number, side: 0 | 1) => shuffle(pairs.filter((_, k) => k !== i).map((p) => p[side]), random).filter((t, k, all) => all.indexOf(t) === k && t !== pairs[i]![side]).slice(0, 3);
  pairs.forEach(([word, meaning], i) => {
    if (types.includes('flashcard')) out.push({ id: id(), type: 'flashcard', prompt: word, back: meaning.slice(0, 300) });
    if (types.includes('choice') && pairs.length >= 3) {
      const texts = shuffle([meaning, ...others(i, 1)], random);
      const choices = texts.map((text, k) => ({ id: `c${k}`, text }));
      out.push({ id: id(), type: 'mcq', prompt: `What does "${word}" mean?`, choices, correct: choices[texts.indexOf(meaning)]!.id });
    }
    if (types.includes('reverse') && pairs.length >= 3) {
      const texts = shuffle([word, ...others(i, 0)], random);
      const choices = texts.map((text, k) => ({ id: `c${k}`, text }));
      out.push({ id: id(), type: 'mcq', prompt: `Which word means "${meaning}"?`, choices, correct: choices[texts.indexOf(word)]!.id });
    }
    if (types.includes('typed')) out.push({ id: id(), type: 'short', prompt: `Type the word that means "${meaning}".`, accepted: [word], fuzzy: true });
  });
  if (types.includes('match')) {
    for (let k = 0; k + 2 <= pairs.length; k += 4) {
      const group = pairs.slice(k, k + 4);
      if (group.length < 2) break;
      out.push({ id: id(), type: 'match', prompt: 'Match each word to its meaning.', pairs: group.map(([left, right], j) => ({ id: `p${j}`, left, right })) });
    }
  }
  return valid(out);
}

/* ------------------------------------ timeline ----------------------------------- */

export interface TimelineEvent {
  /** A year (negative for BC) or any number to sort by. */
  when: number;
  label: string;
  what: string;
}

/** "1066 Battle of Hastings", "1066: Battle of Hastings", "55 BC Caesar lands" or "AD 43 ...", one a line. */
export function readTimeline(text: string): { events: TimelineEvent[]; skipped: string[] } {
  const events: TimelineEvent[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(?:AD\s*)?(-?\d{1,6})\s*(BC|BCE|AD|CE)?\s*[:,.\-–—]?\s+(.+)$/i.exec(line);
    if (!m) {
      skipped.push(line);
      continue;
    }
    const year = Number(m[1]);
    const bc = /^bc/i.test(m[2] ?? '');
    events.push({ when: bc ? -year : year, label: `${m[1]}${m[2] ? ` ${m[2].toUpperCase()}` : ''}`, what: m[3]!.trim().slice(0, 120) });
  }
  return { events, skipped };
}

export function timelineQuestions(events: readonly TimelineEvent[], o: { perQuestion: number; firstOf: boolean }, random: Random = Math.random): Question[] {
  const out: unknown[] = [];
  const size = Math.max(2, Math.min(8, o.perQuestion));
  const mixed = shuffle(events, random);
  let n = 0;
  for (let k = 0; k + 2 <= mixed.length; k += size) {
    const group = mixed.slice(k, k + size).sort((a, b) => a.when - b.when);
    if (group.length < 2 || new Set(group.map((e) => e.when)).size < group.length) continue;
    out.push({ id: `time${++n}`, type: 'order', prompt: 'Put these in order, earliest first.', items: group.map((e, j) => ({ id: `i${j}`, text: e.what })), explanation: group.map((e) => `${e.label}: ${e.what}`).join('. ').slice(0, 600) });
  }
  if (o.firstOf) {
    const again = shuffle(events, random);
    for (let k = 0; k + 3 <= again.length; k += 3) {
      const three = again.slice(k, k + 3);
      if (new Set(three.map((e) => e.when)).size < 3) continue;
      const first = [...three].sort((a, b) => a.when - b.when)[0]!;
      const choices = three.map((e, j) => ({ id: `c${j}`, text: e.what }));
      out.push({ id: `time${++n}`, type: 'mcq', prompt: 'Which came first?', choices, correct: choices[three.indexOf(first)]!.id, explanation: three.map((e) => `${e.label}: ${e.what}`).join('. ').slice(0, 600) });
    }
  }
  return valid(out);
}
