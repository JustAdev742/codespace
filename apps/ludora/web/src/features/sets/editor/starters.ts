/**
 * Starters that write real questions: times tables, number bonds, a spelling
 * list and flashcards from pairs. Each returns finished questions the editor
 * adds like an import. Pure: no React, no DOM. `random` makes them repeatable in tests.
 */
import type { Question } from '@ludora/shared';

type Random = () => number;

function shuffle<T>(list: T[], random: Random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Three wrong numbers near the answer, never below zero and never the answer. */
function nearMisses(answer: number, random: Random, extra: number[] = []): number[] {
  const pool = new Set<number>(extra.filter((n) => n !== answer && n >= 0));
  for (const d of shuffle([1, -1, 2, -2, 10, -10, 3, -3], random)) {
    if (pool.size >= 6) break;
    const v = answer + d;
    if (v >= 0 && v !== answer) pool.add(v);
  }
  return shuffle([...pool], random).slice(0, 3);
}

function choiceQuestion(id: string, prompt: string, answer: number, wrong: number[], random: Random): Question {
  const texts = shuffle([answer, ...wrong], random).map(String);
  const choices = texts.map((text, i) => ({ id: `c${i}`, text }));
  return { id, type: 'mcq', prompt, choices, correct: choices[texts.indexOf(String(answer))]!.id };
}

export interface TablesOptions {
  tables: number[];
  /** Up to which multiplier (10 or 12). */
  upTo: number;
  style: 'typed' | 'choices';
  /** Most questions to make; picked at random when there are more. */
  count: number;
}

export function timesTables(o: TablesOptions, random: Random = Math.random): Question[] {
  const facts: [number, number][] = [];
  for (const t of o.tables) for (let k = 1; k <= o.upTo; k++) facts.push([t, k]);
  const picked = shuffle(facts, random).slice(0, Math.min(o.count, 250));
  return picked.map(([t, k], i) => {
    const prompt = random() < 0.5 ? `${t} × ${k} = ?` : `${k} × ${t} = ?`;
    const answer = t * k;
    return o.style === 'typed' ? { id: `tt${i + 1}`, type: 'numeric', prompt, answer } : choiceQuestion(`tt${i + 1}`, prompt, answer, nearMisses(answer, random, [t * (k + 1), t * (k - 1), (t + 1) * k]), random);
  });
}

export interface BondsOptions {
  /** The total each pair makes, such as 10, 20 or 100. */
  total: number;
  style: 'typed' | 'choices';
  count: number;
}

export function numberBonds(o: BondsOptions, random: Random = Math.random): Question[] {
  const step = o.total > 20 ? (o.total % 10 === 0 ? 10 : 1) : 1;
  const parts: number[] = [];
  for (let a = 0; a <= o.total; a += step) parts.push(a);
  const picked = shuffle(parts, random).slice(0, Math.min(o.count, 250));
  return picked.map((a, i) => {
    const prompt = `${a} + ? = ${o.total}`;
    const answer = o.total - a;
    return o.style === 'typed' ? { id: `nb${i + 1}`, type: 'numeric', prompt, answer } : choiceQuestion(`nb${i + 1}`, prompt, answer, nearMisses(answer, random, [answer + step, answer - step]), random);
  });
}

/** A misspelling a learner might write: a doubled or dropped letter, or two letters swapped. */
function misspell(word: string, random: Random): string[] {
  const out = new Set<string>();
  const w = word;
  for (let tries = 0; tries < 30 && out.size < 3 && w.length > 2; tries++) {
    const i = 1 + Math.floor(random() * (w.length - 2));
    const kind = Math.floor(random() * 3);
    const v = kind === 0 ? w.slice(0, i) + w[i] + w.slice(i) : kind === 1 ? w.slice(0, i) + w.slice(i + 1) : w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    if (v.toLowerCase() !== w.toLowerCase()) out.add(v);
  }
  return [...out];
}

export interface SpellingOptions {
  /** One word per line; an optional sentence or clue after a dash: "necessary - It is necessary to sleep." */
  text: string;
  style: 'typed' | 'choices';
}

export function spellingList(o: SpellingOptions, random: Random = Math.random): { questions: Question[]; skipped: string[] } {
  const questions: Question[] = [];
  const skipped: string[] = [];
  for (const raw of o.text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [wordPart, ...rest] = line.split(/\s+[-–]\s+/);
    const word = wordPart!.trim();
    if (!/^[\p{L}'’-]{2,40}$/u.test(word)) {
      skipped.push(line);
      continue;
    }
    const clue = rest.join(' - ').trim();
    const id = `sp${questions.length + 1}`;
    if (o.style === 'typed') {
      // The sentence with the word blanked out is the clue players type from.
      const sentence = clue ? clue.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[' + word + ']') : '';
      if (sentence.includes('[')) questions.push({ id, type: 'blanks', prompt: 'Spell the missing word.', text: sentence.slice(0, 300), caseSensitive: false });
      else questions.push({ id, type: 'short', prompt: clue ? `Spell the word: ${clue}` : 'Spell the word your teacher says.', accepted: [word], fuzzy: false });
    } else {
      const wrong = misspell(word, random);
      if (wrong.length < 2) {
        skipped.push(line);
        continue;
      }
      const texts = shuffle([word, ...wrong], random);
      const choices = texts.map((text, i) => ({ id: `c${i}`, text }));
      questions.push({ id, type: 'mcq', prompt: clue ? `Which is spelt correctly? ${clue}` : 'Which is spelt correctly?', choices, correct: choices[texts.indexOf(word)]!.id });
    }
    if (questions.length >= 250) break;
  }
  return { questions, skipped };
}

export interface PairsOptions {
  /** One pair per line, separated by a tab, " - ", ":", "=" or a comma. */
  text: string;
}

export function flashcardsFromPairs(o: PairsOptions): { questions: Question[]; skipped: string[] } {
  const questions: Question[] = [];
  const skipped: string[] = [];
  for (const raw of o.text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s*(?:\t|\s[-–]\s|:|=|,)\s*(.+)$/.exec(line);
    if (!m || m[1]!.length > 500 || m[2]!.length > 300) {
      skipped.push(line);
      continue;
    }
    questions.push({ id: `fc${questions.length + 1}`, type: 'flashcard', prompt: m[1]!.trim(), back: m[2]!.trim() });
    if (questions.length >= 250) break;
  }
  return { questions, skipped };
}
