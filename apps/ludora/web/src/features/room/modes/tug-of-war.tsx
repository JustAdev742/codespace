import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import type { Answer, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
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
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-sm font-bold">
        <span className={mySide === 'left' ? 'text-text' : 'text-text-3'}>
          {left.label}
          {mySide === 'left' ? ' (you)' : ''}
        </span>
        <span className={`text-right ${mySide === 'right' ? 'text-text' : 'text-text-3'}`}>
          {right.label}
          {mySide === 'right' ? ' (you)' : ''}
        </span>
      </div>
      <div className="relative h-8" role="img" aria-label={knotText(view)}>
        <div className="absolute inset-y-0 left-0 w-[12%] rounded-l-full border-2 border-ink" style={zoneStyle('left', left.hue)} />
        <div className="absolute inset-y-0 right-0 w-[12%] rounded-r-full border-2 border-ink" style={zoneStyle('right', right.hue)} />
        <div className="absolute inset-x-[12%] top-1/2 h-2.5 -translate-y-1/2 border-y border-ink/40 bg-[#b9874b]" />
        <div className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 bg-line-strong" />
        <div className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-ember transition-[left] duration-700 ease-[var(--ease-out)]" style={{ left: `${12 + knotPercent(view) * 0.76}%` }} />
      </div>
      <p className="text-sm font-semibold text-text-2">{knotText(view)}</p>
    </div>
  );
}

export function TugOfWarPlayer({ view, act, gameNow, paused }: ModeScreenProps<TugOfWarView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  if (!you) return <p className="text-text-2">Watching the tug of war.</p>;
  const mine = view.sides[you.side];
  const theirs = view.sides[you.side === 'left' ? 'right' : 'left'];
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="size-5 shrink-0 rounded-full border-2 border-ink" style={zoneStyle(you.side, mine.hue)} aria-hidden />
          You pull for the {mine.label}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-text-2">
          {you.streak > 1 ? <span className="text-lantern">Streak {you.streak}</span> : null}
          {view.endsAt ? (
            <span>
              Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </span>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-raised p-4" aria-label="The rope">
        <MiniRope view={view} mySide={you.side} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-3">
          <span className="font-display text-lg font-bold">Your pulls: {formatNumber(you.pulls)}</span>
          <span className="text-sm text-text-2">Each correct answer pulls {spaces(you.strength)}.</span>
        </div>
        {you.strength < 1 ? (
          <p className="text-sm text-text-2">
            Your side has more players than the {theirs.label}, so each of your pulls is a little smaller. Together you pull just as hard.
          </p>
        ) : null}
        {view.slack ? <p className="text-sm text-text-2">Slippery rope: a wrong answer lets the rope slip back half a pull.</p> : null}
      </section>

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct && flow.feedback.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{flow.feedback.explanation}</p> : null}
          <button type="button" onClick={flow.dismiss} className="self-center rounded-[10px] px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-surface-2">
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

/** The big rope: end zones in team colours and patterns, quarter marks, and a knot that slides smoothly. */
function RopeStage({ view }: { view: TugOfWarView }) {
  const uid = useId().replace(/:/g, '');
  const { left, right } = view.sides;
  const x = 120 + (knotPercent(view) / 100) * 760;
  return (
    <svg viewBox="0 0 1000 240" className="w-full" role="img" aria-label={`${knotText(view)} Each side needs to pull it ${spaces(view.ropeLength)} from the middle to win.`}>
      <defs>
        <pattern id={`stripes-${uid}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="18" fill="rgb(255 255 255 / 0.38)" />
        </pattern>
        <pattern id={`spots-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="4" fill="rgb(255 255 255 / 0.5)" />
        </pattern>
      </defs>
      <rect x="4" y="22" width="116" height="196" rx="20" fill={colour(left.hue)} />
      <rect x="4" y="22" width="116" height="196" rx="20" fill={`url(#stripes-${uid})`} stroke="var(--ink)" strokeWidth="4" />
      <rect x="880" y="22" width="116" height="196" rx="20" fill={colour(right.hue)} />
      <rect x="880" y="22" width="116" height="196" rx="20" fill={`url(#spots-${uid})`} stroke="var(--ink)" strokeWidth="4" />
      {[-3, -2, -1, 1, 2, 3].map((q) => (
        <line key={q} x1={500 + q * 95} x2={500 + q * 95} y1="78" y2="162" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
      ))}
      <line x1="500" x2="500" y1="36" y2="204" stroke="var(--text-3)" strokeWidth="4" strokeDasharray="12 10" />
      <line x1="24" y1="120" x2="976" y2="120" stroke="#b9874b" strokeWidth="18" strokeLinecap="round" />
      <line x1="24" y1="120" x2="976" y2="120" stroke="#6f4a1f" strokeWidth="18" strokeDasharray="5 11" opacity="0.5" />
      <g style={{ transform: `translateX(${x - 500}px)`, transition: 'transform 700ms var(--ease-out)' }}>
        <path d="M500 124L482 190L500 178L518 190Z" fill="var(--ember)" stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="500" cy="120" r="24" fill="var(--ember)" stroke="var(--ink)" strokeWidth="5" />
        <circle cx="492" cy="112" r="7" fill="rgb(255 255 255 / 0.45)" />
      </g>
    </svg>
  );
}

function SideCard({ side, view, players }: { side: Side; view: TugOfWarView; players: RoomPlayerView[] }) {
  const s = view.sides[side];
  const right = side === 'right';
  const avatar = (id: string) => players.find((p) => p.id === id)?.avatar;
  return (
    <div className={`flex flex-col gap-3 rounded-[18px] border border-line bg-raised p-4 ${right ? 'items-end text-right' : ''}`}>
      <div className={`flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="size-10 shrink-0 rounded-[12px] border-2 border-ink" style={zoneStyle(side, s.hue)} aria-hidden />
        <div>
          <div className="font-display text-3xl font-extrabold">{s.label}</div>
          <div className="flex items-center gap-1.5 text-lg font-semibold text-text-2">
            <Users className="size-5" aria-hidden /> {plural(s.players, 'player')} · {right ? 'right' : 'left'} end
          </div>
        </div>
      </div>
      <div className="text-lg text-text-2">
        Each pull: <span className="font-display font-bold text-text">{spaces(s.strength)}</span> · <span className="font-display font-bold text-text tabular">{spaces(s.distance)}</span> pulled in all
      </div>
      {s.top.length ? (
        <ol className={`flex flex-col gap-1.5 ${right ? 'items-end' : ''}`} aria-label={`Top pullers for the ${s.label}`}>
          {s.top.map((t) => {
            const a = avatar(t.playerId);
            return (
              <li key={t.playerId} className="flex items-center gap-2 text-lg">
                {a && !right ? <Glim art={a.art} accessories={a.accessories} size={32} /> : null}
                <span className="max-w-[12rem] truncate font-semibold">{t.name}</span>
                <span className="font-display font-bold text-text-2 tabular">{plural(t.pulls, 'pull')}</span>
                {a && right ? <Glim art={a.art} accessories={a.accessories} size={32} /> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

export function TugOfWarHost({ view, gameNow, room }: ModeScreenProps<TugOfWarView>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Tug of War</h2>
        {view.endsAt ? (
          <span className="rounded-full bg-surface-3 px-4 py-1.5 text-xl font-semibold">
            Time left <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SideCard side="left" view={view} players={room.players} />
        <SideCard side="right" view={view} players={room.players} />
      </div>
      <div className="rounded-[22px] border border-line bg-sunken p-3 sm:p-5">
        <RopeStage view={view} />
      </div>
      <p className="text-center font-display text-3xl font-bold">{knotText(view)}</p>
      <p className="text-center text-lg text-text-2">
        Drag the knot {spaces(view.ropeLength)} from the middle into your end zone to win.
        {view.slack ? ' Slippery rope: wrong answers let it slip back.' : ''}
      </p>
    </div>
  );
}
