import { useEffect, useRef, useState } from 'react';
import { Check, RotateCw, Undo2 } from 'lucide-react';
import type { PublicQuestion } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ProgressBar } from '../../../ui/primitives.tsx';
import { myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel } from '../game/stage.tsx';
import { Button } from '../../../ui/Button.tsx';
import { ANSWER_LETTERS } from '../../../art/icons.tsx';

/* Flashcard Study: turn the card, grade yourself, master the set. */

interface StudyCard {
  iid: string;
  q: PublicQuestion;
  shownAt: number;
  box: number;
  flipped: boolean;
  /** Only present once the card is turned over. */
  back?: string;
  explanation?: string;
}

export interface FlashcardStudyView {
  endsAt: number;
  total: number;
  quick: boolean;
  rows: { playerId: string; name: string; mastered: number; accuracy: number; done: boolean }[];
  you: {
    mastered: number;
    box1: number;
    box2: number;
    knew: number;
    notYet: number;
    accuracy: number;
    done: boolean;
    card: StudyCard | null;
    last: { knew: boolean; box: number; mastered: boolean } | null;
  } | null;
}

/** The parts of a question that make its front answerable as a card: choices, items, sides. */
function FrontDetails({ q }: { q: PublicQuestion }) {
  switch (q.type) {
    case 'mcq':
    case 'multi':
      return (
        <div className="flex flex-col gap-2">
          {q.type === 'multi' ? <p className="text-sm font-semibold text-text-2">More than one is right.</p> : null}
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {q.choices.map((c, i) => (
              <li key={c.id} className="rounded-[10px] bg-surface-2 px-3 py-1.5 font-semibold">
                <span className="mr-1.5 text-text-3">{ANSWER_LETTERS[i]}</span>
                {c.text || c.media?.alt || 'Picture'}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'truefalse':
      return <p className="font-semibold text-text-2">True or false?</p>;
    case 'numeric':
      return q.unit ? <p className="font-semibold text-text-2">Answer in {q.unit}.</p> : null;
    case 'order':
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-text-2">What is the right order?</p>
          <ul className="flex flex-wrap gap-1.5">
            {q.items.map((item) => (
              <li key={item.id} className="rounded-[10px] bg-surface-2 px-3 py-1.5 font-semibold">
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'match':
      return (
        <div className="grid grid-cols-2 gap-3">
          <ul className="flex flex-col gap-1.5">
            {q.left.map((l) => (
              <li key={l.id} className="rounded-[10px] bg-surface-2 px-3 py-1.5 font-semibold">
                {l.text}
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1.5">
            {q.right.map((r) => (
              <li key={r.id} className="rounded-[10px] border border-line px-3 py-1.5 text-text-2">
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

function lastLine(last: NonNullable<FlashcardStudyView['you']>['last'], quick: boolean) {
  if (!last) return null;
  if (last.mastered) return 'Mastered! That card is done.';
  if (!last.knew) return 'Back to box 1. It will come round again soon.';
  return quick ? null : `Up to box ${last.box}. Know it once more to master it.`;
}

export function FlashcardStudyPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<FlashcardStudyView>) {
  const [busy, setBusy] = useState(false);
  const you = view.you;
  const card = you?.card ?? null;
  // The buttons change when the card turns; keep keyboard focus on the one that replaces the button just used.
  const turnRef = useRef<HTMLButtonElement>(null);
  const knewRef = useRef<HTMLButtonElement>(null);
  /** The card as it was when a button was pressed; focus moves once the card has changed and the buttons are live. */
  const refocus = useRef<{ iid: string; flipped: boolean } | null>(null);
  useEffect(() => {
    const before = refocus.current;
    if (!before || busy || (card?.iid === before.iid && card?.flipped === before.flipped)) return;
    refocus.current = null;
    (card?.flipped ? knewRef : turnRef).current?.focus();
  }, [card?.iid, card?.flipped, busy]);
  const markFocus = () => {
    if (card) refocus.current = { iid: card.iid, flipped: card.flipped };
  };

  const send = async (action: unknown) => {
    if (busy || paused) return;
    setBusy(true);
    try {
      await act(action);
    } finally {
      setBusy(false);
    }
  };
  const flip = () => card && !card.flipped && void send({ type: 'flip', iid: card.iid });
  const grade = (knew: boolean) => card?.flipped && void send({ type: 'grade', iid: card.iid, knew });

  // Space turns the card; then 1 or N for "Not yet", 2 or K for "Knew it".
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // A focused button handles its own Space and Enter.
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    if (!card?.flipped && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      flip();
    } else if (card?.flipped && (k === '1' || k === 'n')) grade(false);
    else if (card?.flipped && (k === '2' || k === 'k')) grade(true);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!you) return <p className="font-semibold text-text-2">Watching.</p>;
  const line = lastLine(you.last, view.quick);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <span className="font-display text-lg font-extrabold tabular">
            {you.mastered} of {view.total} mastered
          </span>
          <ProgressBar value={you.mastered} max={view.total} tone="mint" label="Cards mastered" className="h-3.5! border-2 border-ink" />
        </div>
        <Pill>
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Pill tone="ember">Box 1: {you.box1}</Pill>
        {view.quick ? null : <Pill tone="lantern">Box 2: {you.box2}</Pill>}
        <Pill tone="glim">Mastered: {you.mastered}</Pill>
      </div>
      <p className="min-h-6 font-bold text-text-2" role="status" aria-live="polite">
        {line}
      </p>
      {you.done || !card ? (
        <StagePanel className="flex flex-col items-center gap-2 px-5 py-7 text-center">
          <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={110} bob pose="cheer" />
          <div role="status">
            <p className="font-display text-3xl font-extrabold">Every card mastered!</p>
            <p className="mt-1 text-lg font-semibold text-text-2">
              You knew it {you.accuracy}% of the time across {you.knew + you.notYet} turns.
            </p>
          </div>
        </StagePanel>
      ) : (
        <>
          <div key={card.iid} style={{ perspective: '1400px', animation: 'rise-fade 260ms var(--ease-out) both' }}>
            <div className="grid transition-transform duration-500 ease-[var(--ease-out)]" style={{ transformStyle: 'preserve-3d', transform: card.flipped ? 'rotateY(180deg)' : 'none' }}>
              <section
                className="paper flex min-h-[16rem] flex-col gap-4 rounded-[24px] border-[3px] border-ink p-5 shadow-[0_6px_0_rgb(12_8_48/0.55)] sm:p-7"
                style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden' }}
                aria-hidden={card.flipped}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border-2 border-ink bg-dusk px-2.5 py-0.5 text-sm font-bold text-on-accent">Box {card.box}</span>
                  <span className="text-sm font-bold text-text-2">Front</span>
                </div>
                <QuestionCard q={card.q} />
                <FrontDetails q={card.q} />
              </section>
              <section
                className="flex min-h-[16rem] flex-col gap-3 rounded-[24px] border-[3px] border-ink bg-glim p-5 text-on-accent shadow-[0_6px_0_rgb(12_8_48/0.55)] sm:p-7"
                style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                aria-hidden={!card.flipped}
              >
                <span className="text-sm font-bold">Back</span>
                <p className="font-bold">{card.q.prompt}</p>
                {card.back !== undefined ? <p className="font-display text-3xl font-extrabold break-words sm:text-4xl">{card.back || 'See the picture on the front.'}</p> : null}
                {card.explanation ? <p className="rounded-[14px] bg-white/60 px-4 py-3 font-semibold">{card.explanation}</p> : null}
              </section>
            </div>
          </div>
          {card.flipped ? (
            <div className="flex flex-col gap-2">
              <p className={`text-center font-display text-xl font-extrabold ${SIGN}`}>Did you know it?</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="danger"
                  size="xl"
                  icon={<Undo2 className="size-5" />}
                  onClick={() => {
                    markFocus();
                    grade(false);
                  }}
                  disabled={busy || paused}
                >
                  Not yet
                </Button>
                <Button
                  ref={knewRef}
                  variant="success"
                  size="xl"
                  icon={<Check className="size-5" />}
                  onClick={() => {
                    markFocus();
                    grade(true);
                  }}
                  disabled={busy || paused}
                >
                  Knew it
                </Button>
              </div>
              <p className="hidden text-center text-sm font-semibold text-text-2 sm:block">Keys: 1 or N for not yet, 2 or K for knew it.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                ref={turnRef}
                variant="primary"
                size="xl"
                icon={<RotateCw className="size-5" />}
                onClick={() => {
                  markFocus();
                  flip();
                }}
                disabled={busy || paused}
              >
                Turn over
              </Button>
              <p className="hidden text-center text-sm font-semibold text-text-2 sm:block">Think of the answer first. Space turns the card.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Solo games have no big screen in practice; this is a read-only summary. */
export function FlashcardStudyHost({ view, gameNow }: ModeScreenProps<FlashcardStudyView>) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`font-display text-4xl font-extrabold ${SIGN}`}>Flashcard Study</h2>
        <Pill className="text-lg">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <ul className="flex flex-col gap-2">
        {view.rows.map((r) => (
          <li key={r.playerId} className={`flex flex-col gap-2 rounded-[18px] border border-white/12 px-4 py-3 ${NIGHT}`}>
            <span className="flex items-center justify-between gap-3 text-lg">
              <span className="min-w-0 truncate font-semibold">{r.name}</span>
              <span className="text-text-2 tabular">
                {r.mastered} of {view.total} mastered{r.done ? ', all done' : ''}, knew {r.accuracy}%
              </span>
            </span>
            <ProgressBar value={r.mastered} max={view.total} tone="mint" label={`${r.name}: cards mastered`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
