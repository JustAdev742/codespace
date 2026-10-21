import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Flag, Flame } from 'lucide-react';
import type { Answer, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Explanation, myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
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

/** The race: one lane per player, a comet tail behind each Glim and a finish strip at the far end. */
function Track({ lanes, distance, players, big = false }: { lanes: Lane[]; distance: number; players: RoomPlayerView[]; big?: boolean }) {
  const size = lanes.length > 8 ? 'clamp(2.25rem, 4.6vh, 3.5rem)' : lanes.length > 5 ? 'clamp(3rem, 7.5vh, 5.5rem)' : 'clamp(3.5rem, 10vh, 7rem)';
  const vars = (
    big
      ? { '--g': size, '--name': 'clamp(8rem, 15vw, 17rem)' }
      : { '--g': '2.25rem', '--name': '5.75rem' }
  ) as CSSProperties;
  return (
    <div className={`relative flex flex-col rounded-[22px] border border-white/12 ${NIGHT} ${big ? 'gap-[clamp(0.25rem,0.8vh,0.6rem)] p-[clamp(0.5rem,1.2vw,1rem)]' : 'gap-1.5 p-2'}`} style={vars} role="list" aria-label="Race positions">
      {lanes.map((l) => {
        const pct = Math.min(100, (l.pos / distance) * 100);
        return (
          <div
            key={l.playerId}
            role="listitem"
            className={`grid grid-cols-[var(--name)_1fr] items-center gap-2 rounded-[14px] ${l.isYou ? 'bg-lantern/18 ring-2 ring-lantern' : 'bg-white/6'}`}
            aria-label={`${l.name}: ${l.place ? `finished ${ordinal(l.place)}` : `${l.pos} of ${distance} spaces`}`}
          >
            <span className={`truncate pl-3 font-bold ${big ? 'text-[clamp(1rem,1.6vw,1.75rem)]' : 'text-sm'}`} aria-hidden>
              {l.name}
            </span>
            <div className="relative h-[calc(var(--g)+0.5rem)]" aria-hidden>
              {/* Finish strip */}
              <span className="absolute inset-y-1 right-1 w-2.5 rounded-full border-2 border-ink bg-[repeating-linear-gradient(180deg,#ffffff_0_6px,var(--ink)_6px_12px)]" />
              <div className="absolute inset-y-0 right-[calc(var(--g)+0.75rem)] left-1">
                <span className="absolute top-1/2 left-0 h-[30%] w-full origin-left rounded-full bg-gradient-to-r from-transparent via-lantern/40 to-lantern transition-transform duration-700 ease-[var(--ease-out)]" style={{ transform: `translateY(-50%) scaleX(${pct / 100})` }} />
                <div className="absolute inset-y-0 left-0 w-full transition-transform duration-700 ease-[var(--ease-out)]" style={{ transform: `translateX(${pct}%)` }}>
                  <span className="absolute top-1/2 left-0 -translate-y-1/2">
                    <PlayerGlim avatar={avatarOf(players, l.playerId)} seed={l.playerId} size={64} className="size-[var(--g)]" />
                  </span>
                </div>
              </div>
              {l.place ? (
                <span className="absolute top-1/2 right-5 -translate-y-1/2">
                  <Pill tone="lantern" className={big ? 'text-[clamp(0.9rem,1.4vw,1.5rem)]' : 'px-2 py-0.5 text-xs'}>
                    {ordinal(l.place)}
                  </Pill>
                </span>
              ) : null}
            </div>
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

  if (!you) return <p className="font-semibold text-text-2">Watching the race.</p>;
  const submit = async (answer: Answer) => {
    if (!shownQuestion) return false;
    return (await act({ type: 'answer', iid: shownQuestion.iid, answer })).ok;
  };
  const answeredQ = feedback ? (asked.current.get(feedback.iid) ?? null) : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-2xl font-extrabold tabular">{you.place ? `You finished ${ordinal(you.place)}!` : `${you.pos} of ${view.distance} spaces`}</p>
        <div className="flex items-center gap-2">
          {you.streak > 1 ? (
            <Pill tone="lantern">
              <Flame className="size-4" aria-hidden /> Streak {you.streak}
            </Pill>
          ) : null}
          {view.endsAt ? (
            <Pill>
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          ) : null}
        </div>
      </div>
      <Track lanes={view.lanes} distance={view.distance} players={room.players} />
      {you.place ? (
        <StagePanel className="flex items-center gap-4 px-4 py-4">
          <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={84} bob pose="cheer" className="shrink-0" />
          <div role="status">
            <p className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Flag className="size-6 text-lantern" aria-hidden /> Across the line
            </p>
            <p className="font-semibold text-text-2">
              {view.finished} of {view.finishersNeeded} podium places taken. Watch the rest of the race.
            </p>
          </div>
        </StagePanel>
      ) : feedback ? (
        <div className="flex flex-col gap-3" onClick={() => setFeedback(null)}>
          <ResultBanner correct={feedback.correct} partial={feedback.partial} text={feedback.text} />
          {!feedback.correct && answeredQ ? <RevealAnswer q={answeredQ.q} reveal={feedback.reveal} compact /> : null}
          {!feedback.correct ? <Explanation text={feedback.explanation} /> : null}
          <button type="button" onClick={() => setFeedback(null)} className="self-center rounded-[12px] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Continue
          </button>
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
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,4vw,4.75rem)] leading-none font-extrabold ${SIGN}`}>Comet trail</h2>
        <div className="flex items-center gap-3 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill className="px-5 py-1.5">
            <Flag className="size-[0.9em]" aria-hidden /> Podium {view.finished} of {view.finishersNeeded}
          </Pill>
          {view.endsAt ? (
            <Pill className="px-5 py-1.5">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          ) : null}
        </div>
      </div>
      <Track lanes={view.lanes} distance={view.distance} players={room.players} big />
      <p className="text-center text-[clamp(1rem,1.5vw,1.6rem)] font-semibold text-text-2">
        Every right answer moves you along. {view.finishersNeeded === 1 ? 'The first Glim across the line wins.' : `The first ${view.finishersNeeded} Glims across the line take the podium.`}
      </p>
    </div>
  );
}
