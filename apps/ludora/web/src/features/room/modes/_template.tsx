/*
 * TEMPLATE: player and host screens for the template mode
 * (packages/engine/src/modes/_template). Copy, rename and register in
 * registry.ts. Views arrive from the server; actions go out through `act`.
 *
 * The look (docs/DESIGN.md) comes from the shared parts: a HUD row (a plate
 * for the round, HudScore or HudCount for numbers, StreakChip, Pill for
 * chips), StagePanel or NIGHT rows for calm surfaces, ResultBanner for the
 * player's result, and ModeTitle for the big screen's title. No ink outlines,
 * no offset shadows, display type only for numbers and headings.
 */
import type { Answer } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { HudScore, ModeTitle } from '../game/parts.tsx';
import { NIGHT, Pill } from '../game/stage.tsx';

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
      <div className="flex items-center justify-between gap-3">
        <HudScore value={view.you?.score ?? 0} unit={`of ${view.target} correct`} />
        {view.endsAt ? (
          <Pill>
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        ) : null}
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <ModeTitle className="self-start">Template</ModeTitle>
      <ol className="flex flex-col gap-2">
        {view.scores.map((s) => (
          <li key={s.playerId} className={`flex justify-between rounded-[var(--radius-m)] px-4 py-3 text-xl font-bold ${NIGHT}`}>
            <span>{s.name}</span>
            <span className="font-display text-[1.75rem] font-extrabold tabular">{s.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
