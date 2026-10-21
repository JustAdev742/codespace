/*
 * TEMPLATE: player and host screens for the template mode
 * (packages/engine/src/modes/_template). Copy, rename and register in
 * registry.ts. Views arrive from the server; actions go out through `act`.
 */
import type { Answer } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';

interface TemplateView {
  target: number;
  endsAt: number | null;
  scores: { playerId: string; name: string; score: number }[];
  you: { score: number; question: QuestionView | null; last: FeedbackView | null } | null;
}

export function TemplatePlayer({ view, act, gameNow }: ModeScreenProps<TemplateView>) {
  const q = view.you?.question;
  const submit = async (answer: Answer) => (q ? (await act({ type: 'answer', iid: q.iid, answer })).ok : false);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex justify-between font-semibold text-text-2">
        <span>
          {view.you?.score ?? 0} / {view.target} correct
        </span>
        {view.endsAt ? <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" /> : null}
      </div>
      {view.you?.last ? <ResultBanner correct={view.you.last.correct} partial={view.you.last.partial} /> : null}
      {q ? (
        <>
          <QuestionCard q={q.q} />
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} compact />
        </>
      ) : null}
    </div>
  );
}

export function TemplateHost({ view }: ModeScreenProps<TemplateView>) {
  return (
    <ol className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      {view.scores.map((s) => (
        <li key={s.playerId} className="flex justify-between rounded-[14px] border border-line bg-raised px-4 py-3 text-xl font-semibold">
          <span>{s.name}</span>
          <span className="font-display tabular">{s.score}</span>
        </li>
      ))}
    </ol>
  );
}
