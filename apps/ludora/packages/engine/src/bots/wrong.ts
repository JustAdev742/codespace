import { parseBlanks, type Answer, type Question, type Rng } from '@ludora/shared';
import { normalizeAnswerText, typoAllowance } from '../questions/grade.ts';
import { similarity } from './difficulty.ts';

/*
 * Wrong answers a person would give. Not a coin flip to a random option: the
 * distractor that looks most like the answer, the number one off or with two
 * digits swapped, the word from another question, two neighbours in an order
 * swapped, half of a matching right.
 *
 * `grip` is how close the bot came (0 lost, 1 almost had it): a bot that half
 * knew an order swaps one pair; one that had no idea scrambles it.
 */

export interface WrongContext {
  rng: Rng;
  grip: number;
  /** Short answers from other questions in this game: the similar word a player reaches for. */
  pool: readonly string[];
}

/** Pick one item with weights. */
export function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  const ws = items.map((t) => Math.max(0, weight(t)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rng.next() * items.length)]!;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** A choice to guess when unsure: the ones that look like the answer pull hardest. Can land on the right one. */
export function guessChoice(rng: Rng, choices: readonly { id: string; text: string }[], correct: readonly string[]): string {
  const right = choices.filter((c) => correct.includes(c.id)).map((c) => c.text);
  return weighted(rng, choices, (c) => {
    const near = right.length ? Math.max(...right.map((r) => similarity(r, c.text))) : 0;
    return correct.includes(c.id) ? 1.3 : 0.6 + near * 1.6;
  }).id;
}

function swapAdjacent<T>(rng: Rng, list: T[]): T[] {
  if (list.length < 2) return list;
  const i = rng.int(0, list.length - 2);
  const out = [...list];
  [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
  return out;
}

/** A number a person might write instead of `answer`, always outside the tolerance. */
export function nearNumber(rng: Rng, answer: number, tolerance = 0, grip = 0.5): number {
  const int = Number.isInteger(answer);
  const digits = String(Math.abs(Math.round(answer)));
  const kinds: [string, number][] = [
    ['one', 0.3 + grip * 0.2],
    ['few', 0.2],
    ['tenth', 0.15],
    ['swap', digits.length >= 2 && new Set(digits).size > 1 ? 0.15 : 0],
    ['place', Math.abs(answer) >= 10 ? 0.1 * (1.2 - grip) : 0],
    ['sign', answer !== 0 ? 0.04 : 0],
  ];
  const kind = weighted(rng, kinds, ([, w]) => w)[0];
  const sign = rng.next() < 0.5 ? -1 : 1;
  let v: number;
  switch (kind) {
    case 'one':
      v = answer + sign * (int ? 1 : Math.max(0.1, Math.abs(answer) * 0.02));
      break;
    case 'few':
      v = answer + sign * (int ? rng.int(2, 4) : Math.abs(answer) * (0.05 + rng.next() * 0.05));
      break;
    case 'tenth':
      v = answer + sign * Math.max(int ? 2 : 0.2, Math.round(Math.abs(answer) * 0.1));
      break;
    case 'swap': {
      const i = rng.int(0, digits.length - 2);
      const d = digits.split('');
      [d[i], d[i + 1]] = [d[i + 1]!, d[i]!];
      v = Math.sign(answer || 1) * Number(d.join(''));
      break;
    }
    case 'place':
      v = rng.next() < 0.5 ? answer * 10 : answer / 10;
      break;
    default:
      v = -answer;
  }
  if (!int) v = Math.round(v * 100) / 100;
  if (Math.abs(v - answer) <= tolerance) v = answer + sign * (tolerance + (int ? 1 : Math.max(0.1, Math.abs(answer) * 0.05)));
  if (v === answer) v = answer + 1;
  return v;
}

/** A misspelling bad enough to be marked wrong (it goes past the typo allowance). */
function misspell(rng: Rng, word: string): string {
  const w = word.trim();
  const need = typoAllowance(normalizeAnswerText(w).length) + 1;
  let out = w.split('');
  for (let k = 0; k < need + 1 && out.length > 1; k++) {
    const i = rng.int(0, out.length - 1);
    const r = rng.next();
    if (r < 0.4) out.splice(i, 1);
    else if (r < 0.7) out[i] = 'aeiou'[rng.int(0, 4)]!;
    else if (i < out.length - 1) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
    else out.push(out[i]!);
  }
  if (out.join('') === w) out = [...out, 'e'];
  return out.join('');
}

/** A typed answer a person might give instead: a similar word from elsewhere in the game, or a bad misspelling. */
export function nearWord(rng: Rng, accepted: readonly string[], pool: readonly string[], grip: number): string {
  const want = accepted[0] ?? '';
  if (/^-?\d+(\.\d+)?$/.test(want.trim())) return String(nearNumber(rng, Number(want), 0, grip));
  const others = pool.filter((p) => !accepted.some((a) => normalizeAnswerText(a) === normalizeAnswerText(p)));
  // Close to knowing: a misspelling. Further off: another answer that comes to mind.
  if (!others.length || rng.next() < grip * 0.6) return misspell(rng, want);
  return weighted(rng, others, (o) => 0.2 + similarity(o, want) * 2);
}

export function humanWrongAnswer(q: Question, cx: WrongContext): Answer {
  const { rng, grip, pool } = cx;
  switch (q.type) {
    case 'mcq': {
      const right = q.choices.find((c) => c.id === q.correct)?.text ?? '';
      const others = q.choices.filter((c) => c.id !== q.correct);
      return { type: 'mcq', choiceId: weighted(rng, others, (c) => 0.35 + similarity(right, c.text) * 2).id };
    }
    case 'multi': {
      const right = [...q.correct];
      const wrong = q.choices.filter((c) => !q.correct.includes(c.id));
      const rightTexts = q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.text);
      const lure = wrong.length ? weighted(rng, wrong, (c) => 0.3 + Math.max(...rightTexts.map((t) => similarity(t, c.text))) * 2).id : null;
      const r = rng.next();
      // Most often one right answer left out, or one look-alike added; sometimes one swapped for a look-alike.
      if (right.length > 1 && (r < 0.4 || !lure)) {
        const drop = rng.int(0, right.length - 1);
        const kept = right.filter((_, i) => i !== drop);
        if (grip < 0.35 && kept.length > 1 && rng.next() < 0.5) kept.splice(rng.int(0, kept.length - 1), 1);
        return { type: 'multi', choiceIds: kept };
      }
      if (lure && r < 0.75) return { type: 'multi', choiceIds: [...right, lure] };
      if (lure) return { type: 'multi', choiceIds: right.length > 1 ? [...right.slice(0, right.length - 1), lure] : [lure] };
      return { type: 'multi', choiceIds: right.slice(1) };
    }
    case 'truefalse':
      return { type: 'truefalse', value: !q.correct };
    case 'short':
      return { type: 'short', text: nearWord(rng, q.accepted, pool, grip) };
    case 'numeric':
      return { type: 'numeric', value: nearNumber(rng, q.answer, q.tolerance ?? 0, grip) };
    case 'order': {
      let ids = q.items.map((i) => i.id);
      // The common swap: two neighbours the wrong way round. Lost, it is mostly scrambled.
      const swaps = grip > 0.35 ? 1 : grip > 0.12 ? 2 : Math.max(2, Math.ceil(ids.length / 2));
      for (let k = 0; k < swaps; k++) ids = swapAdjacent(rng, ids);
      if (ids.every((id, i) => id === q.items[i]!.id)) ids = swapAdjacent(rng, ids.length > 1 ? ids : ids);
      if (ids.every((id, i) => id === q.items[i]!.id) && ids.length > 1) [ids[0], ids[1]] = [ids[1]!, ids[0]!];
      return { type: 'order', itemIds: ids };
    }
    case 'match': {
      const ids = q.pairs.map((p) => p.id);
      const rights = [...ids];
      // Half a matching right: one or two pairs mixed up, more when lost.
      const mixes = grip > 0.35 ? 1 : grip > 0.12 ? 2 : Math.max(2, Math.ceil(ids.length / 2));
      for (let k = 0; k < mixes; k++) {
        const a = rng.int(0, ids.length - 1);
        let b = rng.int(0, ids.length - 2);
        if (b >= a) b++;
        [rights[a], rights[b]] = [rights[b]!, rights[a]!];
      }
      if (rights.every((r, i) => r === ids[i])) [rights[0], rights[1]] = [rights[1]!, rights[0]!];
      return { type: 'match', pairs: Object.fromEntries(ids.map((id, i) => [id, rights[i]!])) };
    }
    case 'flashcard':
      return { type: 'flashcard', knew: false };
    case 'poll':
      return { type: 'poll', choiceId: q.choices[rng.int(0, q.choices.length - 1)]!.id };
    case 'blanks': {
      const gaps = parseBlanks(q.text).gaps;
      const words = gaps.map((g) => g.accepted[0] ?? '');
      const misses = grip > 0.4 || gaps.length === 1 ? 1 : rng.int(1, gaps.length);
      const order = rng.shuffle(gaps.map((_, i) => i)).slice(0, misses);
      return {
        type: 'blanks',
        values: gaps.map((g, i) => {
          if (!order.includes(i)) return g.accepted[0] ?? '';
          // From the bank: a distractor or another gap's word. Typed: a near word.
          const bank = [...(q.distractors ?? []), ...words.filter((_, j) => j !== i)];
          if (q.bank && bank.length) return weighted(rng, bank, (w) => 0.3 + similarity(w, g.accepted[0] ?? '') * 2);
          return nearWord(rng, g.accepted, [...bank, ...pool], grip);
        }),
      };
    }
    case 'sort': {
      const groups = q.groups.map((g) => g.id);
      const moves = grip > 0.35 ? 1 : grip > 0.12 ? 2 : Math.ceil(q.items.length / 2);
      const moved = new Set(rng.shuffle(q.items.map((i) => i.id)).slice(0, moves));
      return {
        type: 'sort',
        placement: Object.fromEntries(
          q.items.map((i) => {
            if (!moved.has(i.id)) return [i.id, i.group];
            const others = groups.filter((g) => g !== i.group);
            return [i.id, others[rng.int(0, others.length - 1)]!];
          }),
        ),
      };
    }
  }
}
