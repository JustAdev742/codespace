/**
 * Quick add: a whole set typed in one box with a short, forgiving grammar, read as you type.
 * One question per line, or per block when choices follow on their own lines:
 *
 *   What is 7 x 8? = 56                  a number answer (a unit may follow: "= 12 cm")
 *   Capital of France? = Paris | paris   a typed answer, other accepted answers after a bar
 *   The Sun is a star. = true            true or false ("true", "false", "yes", "no", "T", "F")
 *   bonjour :: hello                     a flashcard
 *   Plants need [sunlight] and [water].  fill in the blanks
 *   Oldest first: Rome > Paris > Berlin  put in order (two or more ">")
 *   Match: cat = chat; dog = chien       match pairs
 *   Which are mammals?                   choices on the next lines: * or + marks a right one,
 *   * whale                              - or nothing a wrong one; one right answer is multiple
 *   - shark                              choice, several is "select all"
 *   * bat
 *
 * Pure: no React, no DOM. Every question is checked with the shared schema.
 */
import { questionSchema, type Question } from '@ludora/shared';

export interface QuickAddResult {
  questions: Question[];
  /** Lines that could not be read, with why, numbered from 1. */
  problems: { line: number; text: string; message: string }[];
}

const TRUE = new Set(['true', 't', 'yes', 'y', 'right', 'correct', 'vrai', 'verdadero']);
const FALSE = new Set(['false', 'f', 'no', 'n', 'wrong', 'incorrect', 'faux', 'falso']);
const CHOICE = /^\s*(?:([*+✓])|[-•]|[a-hA-H][).]|\d[).])\s*(.+)$/;
const NUMBER = /^\s*([-−]?\d[\d,]*(?:\.\d+)?)\s*([^\d\s].{0,19})?\s*$/;

function num(s: string): number {
  return Number(s.replace(/,/g, '').replace(/−/g, '-'));
}

interface Block {
  line: number;
  head: string;
  choices: { right: boolean; text: string }[];
}

/** Lines grouped into questions: a line, then any choice lines under it. */
function blocks(text: string): Block[] {
  const out: Block[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const choice = CHOICE.exec(line);
    const last = out[out.length - 1];
    if (choice && last && !/\s(=|::)\s|\[.+\]/.test(last.head) && !/\s(=|::)\s/.test(line)) {
      last.choices.push({ right: Boolean(choice[1]), text: choice[2]!.trim() });
      return;
    }
    out.push({ line: i + 1, head: line, choices: [] });
  });
  return out;
}

function candidate(b: Block, id: string): Record<string, unknown> | string {
  const head = b.head;
  if (b.choices.length) {
    if (b.choices.length < 2) return 'Give at least two choices, one per line.';
    const right = b.choices.filter((c) => c.right).length;
    if (!right) return 'Mark the right choice with * at the start of its line.';
    const choices = b.choices.slice(0, 8).map((c, k) => ({ id: `c${k + 1}`, text: c.text.slice(0, 200) }));
    const correct = b.choices.slice(0, 8).flatMap((c, k) => (c.right ? [`c${k + 1}`] : []));
    if (right === 1) return { id, type: 'mcq', prompt: head, choices: choices.slice(0, 6), correct: correct[0] };
    return { id, type: 'multi', prompt: head, choices, correct };
  }
  if (/\[[^\]]+\]/.test(head)) return { id, type: 'blanks', prompt: 'Fill in the blanks.', text: head };
  const match = /^(.*?match[^:]*):\s*(.+)$/i.exec(head);
  if (match && /=/.test(match[2]!)) {
    const pairs = match[2]!
      .split(/[;,]/)
      .map((p) => p.split('=').map((x) => x.trim()))
      .filter((p) => p.length === 2 && p[0] && p[1]);
    if (pairs.length < 2) return 'Give at least two pairs, like "cat = chat; dog = chien".';
    return { id, type: 'match', prompt: match[1]!.trim().replace(/^match$/i, 'Match the pairs.'), pairs: pairs.slice(0, 8).map(([left, right], k) => ({ id: `p${k + 1}`, left, right })) };
  }
  const order = /^(.*?):\s*(.+>.+>.+)$/.exec(head);
  if (order) {
    const items = order[2]!.split('>').map((x) => x.trim()).filter(Boolean);
    return { id, type: 'order', prompt: order[1]!.trim() || 'Put these in order.', items: items.slice(0, 8).map((text, k) => ({ id: `i${k + 1}`, text })) };
  }
  const card = /^(.+?)\s*::\s*(.+)$/.exec(head);
  if (card) return { id, type: 'flashcard', prompt: card[1]!.trim(), back: card[2]!.trim() };
  const eq = /^(.+?)\s*=\s*(.+)$/.exec(head);
  if (eq) {
    const prompt = eq[1]!.trim();
    const answer = eq[2]!.trim();
    const low = answer.toLowerCase();
    if (TRUE.has(low) || FALSE.has(low)) return { id, type: 'truefalse', prompt, correct: TRUE.has(low) };
    const n = NUMBER.exec(answer);
    if (n && Number.isFinite(num(n[1]!))) return { id, type: 'numeric', prompt, answer: num(n[1]!), ...(n[2] ? { unit: n[2].trim() } : {}) };
    return { id, type: 'short', prompt, accepted: answer.split('|').map((a) => a.trim()).filter(Boolean).slice(0, 10) };
  }
  const tf = /^(T|F|True|False)\s*:\s*(.+)$/i.exec(head);
  if (tf) return { id, type: 'truefalse', prompt: tf[2]!.trim(), correct: tf[1]!.toLowerCase().startsWith('t') };
  return 'Add the answer after an equals sign ("= Paris"), or choices on the lines below.';
}

export function parseQuickAdd(text: string, makeId: (n: number) => string = (n) => `qa${n}`): QuickAddResult {
  const questions: Question[] = [];
  const problems: QuickAddResult['problems'] = [];
  blocks(text).forEach((b, k) => {
    const c = candidate(b, makeId(k + 1));
    if (typeof c === 'string') {
      problems.push({ line: b.line, text: b.head, message: c });
      return;
    }
    const r = questionSchema.safeParse(c);
    if (r.success) questions.push(r.data);
    else problems.push({ line: b.line, text: b.head, message: r.error.issues[0]?.message.replace(/^Too (small|big).*/i, 'Something on this line is too long or too short.') ?? 'This line could not be read.' });
  });
  return { questions, problems };
}
