import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import type { Answer, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { ordinal } from '../../../lib/format.ts';

interface Lane {
  playerId: string;
  name: string;
  teamId: string | null;
  pos: number;
  place: number | null;
  isYou: boolean;
}

export interface CometView {
  distance: number;
  endsAt: number | null;
  finished: number;
  finishersNeeded: number;
  lanes: Lane[];
  you: { pos: number; place: number | null; streak: number; question: QuestionView | null; last: FeedbackView | null; lastMove: { gain: number; notes: string[] } | null } | null;
}

function Track({ lanes, distance, players, big = false }: { lanes: Lane[]; distance: number; players: RoomPlayerView[]; big?: boolean }) {
  const avatar = (id: string) => players.find((p) => p.id === id)?.avatar;
  const size = big ? 44 : 32;
  return (
    <div className="relative flex flex-col gap-1.5 rounded-[18px] border border-line bg-sunken p-3" role="list" aria-label="Race positions">
      <div className="pointer-events-none absolute top-2 right-3 bottom-2 w-1 rounded-full bg-[repeating-linear-gradient(0deg,var(--text)_0_6px,transparent_6px_12px)] opacity-60" aria-hidden />
      {lanes.map((l) => {
        const pct = Math.min(100, (l.pos / distance) * 100);
        const a = avatar(l.playerId);
        return (
          <div key={l.playerId} role="listitem" className={`relative flex items-center rounded-[12px] ${l.isYou ? 'bg-dusk/20' : 'bg-surface-2/60'}`} style={{ height: size + 8 }} aria-label={`${l.name}: ${l.place ? `finished ${ordinal(l.place)}` : `${l.pos} of ${distance} spaces`}`}>
            <span className={`absolute left-3 z-0 max-w-[40%] truncate text-xs font-semibold ${l.isYou ? 'text-text' : 'text-text-3'}`}>{l.name}</span>
            <div className="absolute inset-y-0 left-0 right-[calc(4px+var(--s))]" style={{ ['--s' as string]: `${size}px` }}>
              <div className="absolute top-1/2 h-1 rounded-full bg-gradient-to-r from-transparent to-lantern/60" style={{ left: 0, width: `${pct}%`, transform: 'translateY(-50%)' }} />
              <div className="absolute top-1/2 transition-[left] duration-700 ease-[var(--ease-out)]" style={{ left: `${pct}%`, transform: 'translateY(-50%)' }}>
                {a ? <Glim art={a.art} accessories={a.accessories} size={size} /> : <span className="block size-6 rounded-full bg-lantern" />}
              </div>
            </div>
            {l.place ? <span className="absolute right-3 rounded-full bg-lantern px-2 text-xs font-bold text-on-accent">{ordinal(l.place)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export function CometDashPlayer({ view, act, gameNow, room }: ModeScreenProps<CometView>) {
  const you = view.you;
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const [shownQuestion, setShownQuestion] = useState<QuestionView | null>(null);
  const lastSeen = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every question shown, by instance id. The view that carries an answer's
  // result already holds the next question, so the reveal looks up the one answered.
  const asked = useRef(new Map<string, QuestionView>());
  const latest = useRef(you?.last ?? null);
  latest.current = you?.last ?? null;
  const lastIid = you?.last?.iid ?? null;

  // Show each answer's result for a moment before the next question appears.
  // Keyed by the answer, so the stream of view updates in a busy room does not restart the timer.
  useEffect(() => {
    const last = latest.current;
    if (!last || last.iid === lastSeen.current) return;
    lastSeen.current = last.iid;
    setFeedback(last);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), last.correct ? 1100 : 2200);
  }, [lastIid]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (you?.question) asked.current.set(you.question.iid, you.question);
    if (!feedback) setShownQuestion(you?.question ?? null);
  }, [you?.question, feedback]);

  if (!you) return <p className="text-text-2">Watching the race.</p>;
  const submit = async (answer: Answer) => {
    if (!shownQuestion) return false;
    return (await act({ type: 'answer', iid: shownQuestion.iid, answer })).ok;
  };
  const answeredQ = feedback ? (asked.current.get(feedback.iid) ?? null) : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display text-xl font-bold">
          {you.place ? `You finished ${ordinal(you.place)}!` : `${you.pos} / ${view.distance} spaces`}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-text-2">
          {you.streak > 1 ? <span className="text-lantern">Streak {you.streak}</span> : null}
          {view.endsAt ? <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" /> : null}
        </div>
      </div>
      <Track lanes={view.lanes} distance={view.distance} players={room.players} />
      {you.place ? (
        <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-6 text-center">
          <Flag className="mx-auto mb-2 size-8 text-lantern" />
          <p className="font-display text-2xl font-bold">Across the line</p>
          <p className="text-text-2">
            {view.finished} of {view.finishersNeeded} podium places taken. Watch the rest of the race.
          </p>
        </div>
      ) : feedback ? (
        <div className="flex flex-col gap-3" onClick={() => setFeedback(null)}>
          <ResultBanner correct={feedback.correct} partial={feedback.partial} text={feedback.text} />
          {!feedback.correct && answeredQ ? <RevealAnswer q={answeredQ.q} reveal={feedback.reveal} compact /> : null}
          {!feedback.correct && feedback.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{feedback.explanation}</p> : null}
          <p className="text-center text-xs text-text-3">Tap to continue</p>
        </div>
      ) : shownQuestion ? (
        <div className="flex flex-col gap-4">
          <QuestionCard q={shownQuestion.q} />
          <AnswerInput key={shownQuestion.iid} q={shownQuestion.q} onSubmit={submit} compact />
        </div>
      ) : null}
    </div>
  );
}

export function CometDashHost({ view, gameNow, room }: ModeScreenProps<CometView>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Comet trail</h2>
        <div className="flex items-center gap-4 font-semibold text-text-2">
          <span>
            Podium {view.finished} / {view.finishersNeeded}
          </span>
          {view.endsAt ? (
            <span className="rounded-full bg-surface-3 px-3 py-1 text-lg">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </span>
          ) : null}
        </div>
      </div>
      <Track lanes={view.lanes} distance={view.distance} players={room.players} big />
    </div>
  );
}
