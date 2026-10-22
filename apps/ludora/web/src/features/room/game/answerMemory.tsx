import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Answer, PublicQuestion } from '@ludora/shared';
import { ANSWER_LETTERS } from '../../../art/icons.tsx';

/*
 * The player's own answer to the question on screen, remembered on this
 * device, so the locked-in panel can say what was sent and the reveal can mark
 * the tile they picked: a mis-tap is easy to spot and to learn from. Each new
 * question starts empty, including a question that comes back later.
 */

interface Mine {
  prompt: string;
  answer: Answer | null;
}

const Memory = createContext<{ mine: Mine | null; begin: (prompt: string) => void; remember: (prompt: string, answer: Answer) => void }>({
  mine: null,
  begin: () => {},
  remember: () => {},
});

export function AnswerMemory({ children }: { children: ReactNode }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const begin = useCallback((prompt: string) => setMine({ prompt, answer: null }), []);
  const remember = useCallback((prompt: string, answer: Answer) => setMine({ prompt, answer }), []);
  const value = useMemo(() => ({ mine, begin, remember }), [mine, begin, remember]);
  return <Memory.Provider value={value}>{children}</Memory.Provider>;
}

export const useAnswerMemory = () => useContext(Memory);

/** What this device sent for `q`, or null. */
export function useMyAnswer(q: PublicQuestion | null | undefined): Answer | null {
  const { mine } = useContext(Memory);
  return q && mine?.prompt === q.prompt ? mine.answer : null;
}

/** The most recent answer sent from this device, in words, for the panel shown while others answer. */
export function useLastAnswerWords(): string | null {
  const { mine } = useContext(Memory);
  return mine?.answer ? (summaries.get(mine.answer) ?? null) : null;
}

// Words are worked out when the answer is sent, while the question's choices are at hand.
const summaries = new WeakMap<Answer, string>();

/** The answer in words: "B, Mars", "True", "Paris". */
export function myAnswerWords(q: PublicQuestion, a: Answer): string {
  const choice = (id: string) => {
    if (q.type !== 'mcq' && q.type !== 'multi') return id;
    const i = q.choices.findIndex((c) => c.id === id);
    return i < 0 ? id : `${ANSWER_LETTERS[i]}, ${q.choices[i]!.text || q.choices[i]!.media?.alt || 'a picture'}`;
  };
  switch (a.type) {
    case 'mcq':
      return choice(a.choiceId);
    case 'multi':
      return a.choiceIds.map(choice).join(' and ');
    case 'truefalse':
      return a.value ? 'True' : 'False';
    case 'short':
      return a.text;
    case 'numeric':
      return `${a.value}${q.type === 'numeric' && q.unit ? ` ${q.unit}` : ''}`;
    case 'order':
      return q.type === 'order' ? a.itemIds.map((id) => q.items.find((i) => i.id === id)?.text ?? id).join(', ') : '';
    default:
      return '';
  }
}

/** Wraps an answer input's submit, so what was accepted is remembered with its words. */
export function useRememberingSubmit(q: PublicQuestion, onSubmit: (answer: Answer) => Promise<boolean>) {
  const { remember } = useContext(Memory);
  return useCallback(
    async (answer: Answer) => {
      const ok = await onSubmit(answer);
      if (ok) {
        summaries.set(answer, myAnswerWords(q, answer));
        remember(q.prompt, answer);
      }
      return ok;
    },
    [q, onSubmit, remember],
  );
}
