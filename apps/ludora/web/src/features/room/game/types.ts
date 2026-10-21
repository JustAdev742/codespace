import type { Answer, AnswerReveal, PublicQuestion } from '@ludora/shared';

/** The question shape every mode's view uses (see the engine's QuestionView). */
export interface QuestionView {
  iid: string;
  q: PublicQuestion;
  shownAt: number;
  deadline: number | null;
  index?: number;
  total?: number;
}

export interface FeedbackView {
  iid: string;
  correct: boolean;
  partial: number;
  reveal: AnswerReveal;
  explanation?: string;
  points?: number;
  text?: string;
}

export type SubmitAnswer = (answer: Answer) => Promise<boolean>;
