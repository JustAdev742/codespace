/**
 * The "missing things" pass: what a careful reviewer would point out before a set is played.
 * Questions with no explanation, pictures and sounds with no description or caption, repeated
 * questions, and answers that give themselves away (the answer is in the question, the right
 * choice is the long one, "all of the above", the right answer always in the same place).
 * Pure: no React, no DOM.
 */
import type { DraftQuestion } from './model.ts';

export type MissingKind = 'explanation' | 'description' | 'caption' | 'duplicate' | 'giveaway';

export interface Missing {
  kind: MissingKind;
  questionId: string | null;
  number: number | null;
  message: string;
}

export const MISSING_LABEL: Record<MissingKind, string> = {
  explanation: 'No explanation',
  description: 'No picture description',
  caption: 'No caption',
  duplicate: 'Repeated',
  giveaway: 'Gives itself away',
};

const norm = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const ABOVE = /^(all|none|both) of (the )?(above|these)$/;

function rightChoices(d: DraftQuestion) {
  return d.choices.filter((c) => d.correct.includes(c.id) && (c.text.trim() || c.media || c.sound));
}

function giveaway(d: DraftQuestion): string | null {
  const prompt = ` ${norm(d.prompt)} `;
  if (d.type === 'mcq' || d.type === 'multi') {
    const right = rightChoices(d);
    const wrong = d.choices.filter((c) => !d.correct.includes(c.id) && c.text.trim());
    for (const c of right) {
      const t = norm(c.text);
      if (ABOVE.test(t)) return `the right answer is "${c.text.trim()}", which players learn to pick without reading.`;
      if (t.length >= 4 && prompt.includes(` ${t} `)) return `the right answer, "${c.text.trim()}", is in the question.`;
    }
    if (d.type === 'mcq' && right[0] && wrong.length >= 2) {
      const r = right[0].text.trim().length;
      const longestWrong = Math.max(...wrong.map((c) => c.text.trim().length));
      if (r >= 20 && r > longestWrong * 1.6) return 'the right choice is much longer than the others, which gives it away.';
    }
  }
  if (d.type === 'short') {
    const hit = d.accepted.map((a) => a.text.trim()).find((a) => a.length >= 4 && prompt.includes(` ${norm(a)} `));
    if (hit) return `the answer, "${hit}", is in the question.`;
  }
  if (d.type === 'flashcard' && d.back.trim().length >= 4 && prompt.includes(` ${norm(d.back)} `)) return 'the back of the card is written on its front.';
  return null;
}

export function findMissing(drafts: readonly DraftQuestion[], opts: { shuffleAnswers?: boolean } = {}): Missing[] {
  const out: Missing[] = [];
  const seen = new Map<string, number>();
  drafts.forEach((d, i) => {
    const n = i + 1;
    if (!d.prompt.trim() && d.type !== 'blanks') return;
    const key = `${norm(d.prompt)}|${norm(d.sentence)}`;
    const first = seen.get(key);
    if (first !== undefined) out.push({ kind: 'duplicate', questionId: d.id, number: n, message: `Question ${n} repeats question ${first}.` });
    else seen.set(key, n);
    if (d.type !== 'poll' && !d.explanation.trim()) out.push({ kind: 'explanation', questionId: d.id, number: n, message: `Question ${n} has no explanation. One sentence on why the answer is right helps players who got it wrong.` });
    if ((d.media && !d.media.alt.trim()) || d.choices.some((c) => c.media && !c.media.alt.trim())) out.push({ kind: 'description', questionId: d.id, number: n, message: `Question ${n} has a picture with no description.` });
    if ((d.sound && !d.sound.caption.trim()) || d.choices.some((c) => c.sound && !c.sound.caption.trim())) out.push({ kind: 'caption', questionId: d.id, number: n, message: `Question ${n} has a sound with no caption, so players who cannot hear it are left out.` });
    const g = giveaway(d);
    if (g) out.push({ kind: 'giveaway', questionId: d.id, number: n, message: `Question ${n}: ${g}` });
  });
  // The right answer always in the same place, when answers are not shuffled.
  if (!opts.shuffleAnswers) {
    const places = drafts.filter((d) => d.type === 'mcq').map((d) => d.choices.findIndex((c) => d.correct.includes(c.id)));
    if (places.length >= 4 && places.every((p) => p >= 0 && p === places[0])) {
      out.push({ kind: 'giveaway', questionId: null, number: null, message: `The right answer is always choice ${String.fromCharCode(65 + places[0]!)}. Turn on "Shuffle the answers" in the set details, or move some.` });
    }
  }
  return out;
}
