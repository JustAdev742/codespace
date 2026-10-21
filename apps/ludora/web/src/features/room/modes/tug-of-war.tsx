import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Flame, Users } from 'lucide-react';
import type { Answer, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Explanation } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
import { formatNumber, plural } from '../../../lib/format.ts';

/* Tug of War: two sides pull one rope. Each correct answer pulls the knot towards your end. */

type Side = 'left' | 'right';

interface SideView {
  label: string;
  teams: { id: string; name: string; hue: number }[];
  hue: number;
  players: number;
  connected: number;
  /** Spaces one correct answer pulls: (players on the smaller side) ÷ (players on this side). */
  strength: number;
  pulls: number;
  distance: number;
  top: { playerId: string; name: string; pulls: number; isYou: boolean }[];
}

export interface TugOfWarView {
  endsAt: number | null;
  ropeLength: number;
  pos: number;
  slack: boolean;
  winner: Side | 'draw' | null;
  sides: { left: SideView; right: SideView };
  you: {
    side: Side;
    pulls: number;
    slips: number;
    distance: number;
    strength: number;
    streak: number;
    question: QuestionView | null;
    last: FeedbackView | null;
  } | null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const spaces = (n: number) => `${fmt(n)} ${Math.abs(n - 1) < 1e-6 ? 'space' : 'spaces'}`;
const colour = (hue: number) => `hsl(${hue} 80% 60%)`;
/** Each side has its own pattern as well as its colour: stripes on the left, spots on the right. */
const PATTERN: Record<Side, string> = {
  left: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.38) 0 6px, transparent 6px 12px)',
  right: 'radial-gradient(rgb(255 255 255 / 0.5) 2.5px, transparent 3px) 0 0 / 11px 11px',
};
const zoneStyle = (side: Side, hue: number): CSSProperties => ({ background: `${PATTERN[side]}, ${colour(hue)}` });

function knotText(view: TugOfWarView) {
  const d = Math.abs(view.pos);
  if (d < 1e-6) return 'The knot is dead level.';
  return `The knot is ${spaces(d)} towards the ${view.pos < 0 ? view.sides.left.label : view.sides.right.label}.`;
}

/**
 * Shows each answer's result for a moment before the next question. Keyed by
 * question id, so frequent view updates from other players neither restart
 * nor cancel the timer, and the reveal is matched to the question answered.
 */
function useAnswerFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined) {
  const asked = useRef(new Map<string, QuestionView>());
  const lastRef = useRef(last);
  const seen = useRef<string | null>(last?.iid ?? null);
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const lastIid = last?.iid ?? null;
  useEffect(() => {
    lastRef.current = last;
  });
  useEffect(() => {
    if (!question) return;
    asked.current.set(question.iid, question);
    if (asked.current.size > 6) asked.current.delete(asked.current.keys().next().value!);
  }, [question]);
  useEffect(() => {
    if (!lastIid || lastIid === seen.current) return;
    seen.current = lastIid;
    setFeedback(lastRef.current ?? null);
  }, [lastIid]);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1100 : 2400);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/** The knot's place along the track, 0 (left end) to 100 (right end). */
function knotPercent(view: TugOfWarView) {
  const L = Math.max(1, view.ropeLength);
  return 50 + (Math.max(-L, Math.min(L, view.pos)) / L) * 50;
}

function MiniRope({ view, mySide }: { view: TugOfWarView; mySide: Side | null }) {
  const { left, right } = view.sides;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3 font-bold">
        <span className={mySide === 'left' ? 'text-text' : 'text-text-2'}>
          {left.label}
          {mySide === 'left' ? ' (you)' : ''}
        </span>
        <span className={`text-right ${mySide === 'right' ? 'text-text' : 'text-text-2'}`}>
          {right.label}
          {mySide === 'right' ? ' (you)' : ''}
        </span>
      </div>
      <div className="relative h-9" role="img" aria-label={knotText(view)}>
        <div className="absolute inset-y-0 left-0 w-[12%] rounded-l-full border-[3px] border-ink" style={zoneStyle('left', left.hue)} />
        <div className="absolute inset-y-0 right-0 w-[12%] rounded-r-full border-[3px] border-ink" style={zoneStyle('right', right.hue)} />
        <div className="absolute inset-x-[12%] top-1/2 h-3 -translate-y-1/2 border-y-2 border-ink/50 bg-[#c99556]" />
        <div className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 bg-white/50" />
        <div className="absolute inset-y-0 right-[12%] left-[12%]">
          <div className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-out)]" style={{ transform: `translateX(${knotPercent(view)}%)` }}>
            <span className="absolute top-1/2 left-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-ember" />
          </div>
        </div>
      </div>
      <p className="font-semibold text-text-2">{knotText(view)}</p>
    </div>
  );
}

export function TugOfWarPlayer({ view, act, gameNow, paused }: ModeScreenProps<TugOfWarView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  if (!you) return <p className="font-semibold text-text-2">Watching the tug of war.</p>;
  const mine = view.sides[you.side];
  const theirs = view.sides[you.side === 'left' ? 'right' : 'left'];
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <span className="size-6 shrink-0 rounded-full border-[3px] border-ink" style={zoneStyle(you.side, mine.hue)} aria-hidden />
          You pull for the {mine.label}
        </p>
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

      <StagePanel as="section" className="flex flex-col gap-3 p-4" label="The rope">
        <MiniRope view={view} mySide={you.side} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/15 pt-3">
          <span className="font-display text-xl font-extrabold">Your pulls: {formatNumber(you.pulls)}</span>
          <span className="font-semibold text-text-2">Each right answer pulls {spaces(you.strength)}.</span>
        </div>
        {you.strength < 1 ? <p className="text-text-2">Your side has more players than the {theirs.label}, so each of your pulls is a little smaller. Together you pull just as hard.</p> : null}
        {view.slack ? <p className="text-text-2">Slippery rope: a wrong answer lets the rope slip back half a pull.</p> : null}
      </StagePanel>

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct ? <Explanation text={flow.feedback.explanation} /> : null}
          <button type="button" onClick={flow.dismiss} className="self-center rounded-[12px] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Next question
          </button>
        </div>
      ) : you.question ? (
        <div className="flex flex-col gap-4">
          <QuestionCard q={you.question.q} />
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused || view.winner !== null} compact />
        </div>
      ) : null}
    </div>
  );
}

/** A side's two top pullers standing on its end zone, holding the line. */
function EndCrew({ side, view, players }: { side: Side; view: TugOfWarView; players: RoomPlayerView[] }) {
  const crew = view.sides[side].top.slice(0, 2);
  if (!crew.length) return null;
  return (
    <div className={`absolute bottom-[calc(100%*0.86)] flex w-[11.6%] items-end justify-center ${side === 'left' ? 'left-[0.4%]' : 'right-[0.4%]'}`} aria-hidden>
      {crew.map((c, i) => (
        <span key={c.playerId} className={i ? '-ml-3' : ''}>
          <PlayerGlim avatar={avatarOf(players, c.playerId)} seed={c.playerId} size={72} className="size-[clamp(2.75rem,5vw,5.25rem)]" />
        </span>
      ))}
    </div>
  );
}

/** The big rope: end zones in team colours and patterns, quarter marks, and a knot that slides smoothly. */
function RopeStage({ view, players }: { view: TugOfWarView; players: RoomPlayerView[] }) {
  const uid = useId().replace(/:/g, '');
  const { left, right } = view.sides;
  const x = 120 + (knotPercent(view) / 100) * 760;
  return (
    <div className="relative pt-[clamp(2.5rem,4.4vw,4.75rem)]">
      <svg viewBox="0 0 1000 240" className="block h-auto w-full" role="img" aria-label={`${knotText(view)} Each side needs to pull it ${spaces(view.ropeLength)} from the middle to win.`}>
        <defs>
          <pattern id={`stripes-${uid}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="18" fill="rgb(255 255 255 / 0.38)" />
          </pattern>
          <pattern id={`spots-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="4" fill="rgb(255 255 255 / 0.5)" />
          </pattern>
        </defs>
        <rect x="4" y="22" width="116" height="196" rx="20" fill={colour(left.hue)} />
        <rect x="4" y="22" width="116" height="196" rx="20" fill={`url(#stripes-${uid})`} stroke="var(--ink)" strokeWidth="5" />
        <rect x="880" y="22" width="116" height="196" rx="20" fill={colour(right.hue)} />
        <rect x="880" y="22" width="116" height="196" rx="20" fill={`url(#spots-${uid})`} stroke="var(--ink)" strokeWidth="5" />
        {[-3, -2, -1, 1, 2, 3].map((q) => (
          <line key={q} x1={500 + q * 95} x2={500 + q * 95} y1="80" y2="160" stroke="rgb(255 255 255 / 0.4)" strokeWidth="4" strokeLinecap="round" />
        ))}
        <line x1="500" x2="500" y1="34" y2="206" stroke="rgb(255 255 255 / 0.7)" strokeWidth="5" strokeDasharray="12 10" />
        <line x1="24" y1="120" x2="976" y2="120" stroke="var(--ink)" strokeWidth="26" strokeLinecap="round" />
        <line x1="24" y1="120" x2="976" y2="120" stroke="#c99556" strokeWidth="18" strokeLinecap="round" />
        <line x1="24" y1="120" x2="976" y2="120" stroke="#6f4a1f" strokeWidth="18" strokeDasharray="5 11" opacity="0.5" />
        <g style={{ transform: `translateX(${x - 500}px)`, transition: 'transform 700ms var(--ease-out)' }}>
          <path d="M500 124L480 194L500 181L520 194Z" fill="var(--ember)" stroke="var(--ink)" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="500" cy="120" r="27" fill="var(--ember)" stroke="var(--ink)" strokeWidth="6" />
          <circle cx="491" cy="111" r="8" fill="rgb(255 255 255 / 0.5)" />
        </g>
      </svg>
      {/* Over the drawing, so the crew stands on the top edge of each end zone. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 aspect-[1000/240]">
        <EndCrew side="left" view={view} players={players} />
        <EndCrew side="right" view={view} players={players} />
      </div>
    </div>
  );
}

function SideCard({ side, view, players }: { side: Side; view: TugOfWarView; players: RoomPlayerView[] }) {
  const s = view.sides[side];
  const right = side === 'right';
  return (
    <StagePanel className={`flex flex-col gap-2 px-[clamp(1rem,1.6vw,1.5rem)] py-[clamp(0.6rem,1.4vh,1.1rem)] text-[clamp(1rem,1.4vw,1.5rem)] ${right ? 'items-end text-right' : ''}`}>
      <div className={`flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="size-[clamp(2.25rem,3.6vw,3.5rem)] shrink-0 rounded-[14px] border-[3px] border-ink" style={zoneStyle(side, s.hue)} aria-hidden />
        <div className="min-w-0">
          <div className="font-display text-[clamp(1.6rem,2.8vw,3rem)] leading-none font-extrabold">{s.label}</div>
          <div className={`mt-1 flex items-center gap-1.5 font-semibold text-text-2 ${right ? 'flex-row-reverse' : ''}`}>
            <Users className="size-[1em] shrink-0" aria-hidden />
            <span>
              {plural(s.players, 'player')}. Each pull moves the knot <span className="font-display font-extrabold text-text">{spaces(s.strength)}</span>.
            </span>
          </div>
        </div>
      </div>
      {s.top.length ? (
        <ol className={`flex flex-wrap gap-1.5 ${right ? 'justify-end' : ''}`} aria-label={`Top pullers for the ${s.label}`}>
          {s.top.map((t) => (
            <li key={t.playerId} className={`flex items-center gap-1.5 rounded-full border border-white/15 py-0.5 pr-3 pl-0.5 ${NIGHT}`}>
              <PlayerGlim avatar={avatarOf(players, t.playerId)} seed={t.playerId} size={36} className="size-[clamp(1.75rem,2.8vw,2.5rem)] shrink-0" />
              <span className="max-w-[11rem] truncate font-bold">{t.name}</span>
              <span className="font-display font-extrabold text-text-2 tabular">{plural(t.pulls, 'pull')}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </StagePanel>
  );
}

export function TugOfWarHost({ view, gameNow, room }: ModeScreenProps<TugOfWarView>) {
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-[clamp(2.25rem,4vw,4.75rem)] leading-none font-extrabold ${SIGN}`}>Tug of War</h2>
        {view.endsAt ? (
          <Pill className="px-5 py-1.5 text-[clamp(1.1rem,1.8vw,2rem)]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-[clamp(0.75rem,1.6vw,1.5rem)] sm:grid-cols-2">
        <SideCard side="left" view={view} players={room.players} />
        <SideCard side="right" view={view} players={room.players} />
      </div>
      <StagePanel className="px-[clamp(0.75rem,1.6vw,1.5rem)] pb-[clamp(0.5rem,1.4vh,1rem)]">
        {/* Never taller than the screen allows, so the knot and the line under it stay in view on a 768-pixel projector. */}
        <div className="mx-auto w-full max-w-[calc((100dvh-27rem)*3.6)] min-w-[min(100%,36rem)]">
          <RopeStage view={view} players={room.players} />
        </div>
      </StagePanel>
      <div className="text-center">
        <p className={`font-display text-[clamp(1.6rem,2.8vw,3.25rem)] leading-tight font-extrabold ${SIGN}`}>{knotText(view)}</p>
        <p className="text-[clamp(1rem,1.4vw,1.5rem)] font-semibold text-text-2">
          Drag the knot {spaces(view.ropeLength)} from the middle into your end zone to win.
          {view.slack ? ' Slippery rope: wrong answers let it slip back.' : ''}
        </p>
      </div>
    </div>
  );
}
