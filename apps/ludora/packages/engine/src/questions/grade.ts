import type { Answer, AnswerReveal, Question } from '@ludora/shared';

export interface GradeResult {
  correct: boolean;
  /** 0..1 credit for partially right answers (multi, order, match). Equals 1 when correct. */
  partial: number;
}

/** Lowercase, strip accents and punctuation, collapse spaces. "Paris!" and " paris " match. */
export function normalizeAnswerText(input: string, caseSensitive = false): string {
  let s = input.normalize('NFKC').trim();
  if (!caseSensitive) s = s.toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Keep the sign of negative numbers before punctuation is stripped: "-5" is not "5".
  s = s.replace(/(^|\s)[-\u2212](?=\d)/g, '$1minus ');
  s = s.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  // Leading articles rarely matter in short answers.
  return s.replace(/^(the|a|an) /, '');
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** How many typos a short answer tolerates, by length of the expected answer. */
export function typoAllowance(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  return 2;
}

export function shortAnswerMatches(q: Extract<Question, { type: 'short' }>, text: string): boolean {
  const given = normalizeAnswerText(text, q.caseSensitive);
  if (!given) return false;
  const fuzzy = q.fuzzy ?? true;
  return q.accepted.some((acc) => {
    const want = normalizeAnswerText(acc, q.caseSensitive);
    if (want === given) return true;
    if (!fuzzy) return false;
    // Numbers must match exactly even in fuzzy mode: "1912" is not "1921".
    if (/\d/.test(want)) return false;
    return editDistance(want, given) <= typoAllowance(want.length);
  });
}

const EPSILON = 1e-9;

export function gradeAnswer(q: Question, a: Answer): GradeResult {
  const wrong: GradeResult = { correct: false, partial: 0 };
  if (q.type !== a.type) return wrong;
  switch (q.type) {
    case 'mcq': {
      const ok = a.type === 'mcq' && a.choiceId === q.correct;
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    case 'multi': {
      if (a.type !== 'multi') return wrong;
      const picked = new Set(a.choiceIds);
      const want = new Set(q.correct);
      let right = 0;
      let extra = 0;
      for (const id of picked) {
        if (want.has(id)) right++;
        else extra++;
      }
      const exact = right === want.size && extra === 0;
      return { correct: exact, partial: exact ? 1 : Math.max(0, (right - extra) / want.size) };
    }
    case 'truefalse': {
      const ok = a.type === 'truefalse' && a.value === q.correct;
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    case 'short': {
      const ok = a.type === 'short' && shortAnswerMatches(q, a.text);
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    case 'numeric': {
      if (a.type !== 'numeric') return wrong;
      const ok = Math.abs(a.value - q.answer) <= (q.tolerance ?? 0) + EPSILON;
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    case 'order': {
      if (a.type !== 'order') return wrong;
      const want = q.items.map((i) => i.id);
      if (a.itemIds.length !== want.length || new Set(a.itemIds).size !== want.length) return wrong;
      const inPlace = want.filter((id, i) => a.itemIds[i] === id).length;
      return { correct: inPlace === want.length, partial: inPlace / want.length };
    }
    case 'match': {
      if (a.type !== 'match') return wrong;
      const right = q.pairs.filter((p) => a.pairs[p.id] === p.id).length;
      return { correct: right === q.pairs.length, partial: right / q.pairs.length };
    }
    case 'flashcard': {
      const ok = a.type === 'flashcard' && a.knew;
      return { correct: ok, partial: ok ? 1 : 0 };
    }
  }
}

export function revealAnswer(q: Question): AnswerReveal {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', correct: q.correct };
    case 'multi':
      return { type: 'multi', correct: [...q.correct] };
    case 'truefalse':
      return { type: 'truefalse', correct: q.correct };
    case 'short':
      return { type: 'short', accepted: [...q.accepted] };
    case 'numeric':
      return { type: 'numeric', answer: q.answer, tolerance: q.tolerance ?? 0, ...(q.unit ? { unit: q.unit } : {}) };
    case 'order':
      return { type: 'order', itemIds: q.items.map((i) => i.id) };
    case 'match':
      return { type: 'match', pairs: Object.fromEntries(q.pairs.map((p) => [p.id, p.id])) };
    case 'flashcard':
      return { type: 'flashcard', back: q.back };
  }
}

/** A correct answer for a question. Used by bots and by tests. */
export function correctAnswerFor(q: Question): Answer {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', choiceId: q.correct };
    case 'multi':
      return { type: 'multi', choiceIds: [...q.correct] };
    case 'truefalse':
      return { type: 'truefalse', value: q.correct };
    case 'short':
      return { type: 'short', text: q.accepted[0]! };
    case 'numeric':
      return { type: 'numeric', value: q.answer };
    case 'order':
      return { type: 'order', itemIds: q.items.map((i) => i.id) };
    case 'match':
      return { type: 'match', pairs: Object.fromEntries(q.pairs.map((p) => [p.id, p.id])) };
    case 'flashcard':
      return { type: 'flashcard', knew: true };
  }
}

/** A wrong answer for a question, chosen with `random`. Used by bots. */
export function wrongAnswerFor(q: Question, random: () => number): Answer {
  switch (q.type) {
    case 'mcq': {
      const others = q.choices.filter((c) => c.id !== q.correct);
      return { type: 'mcq', choiceId: others[Math.floor(random() * others.length)]!.id };
    }
    case 'multi': {
      const others = q.choices.filter((c) => !q.correct.includes(c.id)).map((c) => c.id);
      return { type: 'multi', choiceIds: others.length ? [others[0]!] : q.correct.slice(1) };
    }
    case 'truefalse':
      return { type: 'truefalse', value: !q.correct };
    case 'short':
      return { type: 'short', text: 'not sure' };
    case 'numeric':
      return { type: 'numeric', value: q.answer + (q.tolerance ?? 0) + 1 + Math.floor(random() * 9) };
    case 'order': {
      const ids = q.items.map((i) => i.id);
      return { type: 'order', itemIds: [...ids.slice(1), ids[0]!] };
    }
    case 'match': {
      const ids = q.pairs.map((p) => p.id);
      return { type: 'match', pairs: Object.fromEntries(ids.map((id, i) => [id, ids[(i + 1) % ids.length]!])) };
    }
    case 'flashcard':
      return { type: 'flashcard', knew: false };
  }
}
