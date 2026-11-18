import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Feather, Play, RotateCcw, Users, X } from 'lucide-react';
import type { ModeControl, ModeMeta, RoomView, VariantMeta } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { useModes } from '../../lib/queries.ts';
import { useTutorialsSeen } from '../../lib/tutorials.ts';
import { Button } from '../../ui/Button.tsx';
import { ModeArt } from '../../art/ModeArt.tsx';
import { motionOK } from './game/stage.tsx';
import { keyCodes, walkthroughSteps, type WalkStep } from './walkthrough.ts';

/*
 * How to play, before the game (docs/DECISIONS.md, D57). When the host presses Start and someone in
 * the room has not played this mode before, the server opens the walkthrough on every screen and
 * the game waits. Each player steps through it on their own device at their own pace (a few short
 * steps, the controls with a moment to try them, and "Ready?"), or skips it. The big screen shows
 * the same steps large, for the teacher to talk through, with how many are ready and a button that
 * starts the game at once. The game starts when everyone is ready, or when the host says so.
 *
 * A finished walkthrough is remembered (lib/tutorials.ts), so a player who knows the mode is ready
 * from the start and sees a short note instead, with a way to see the steps again.
 */

/** Keeps Tab inside the walkthrough while it covers the page (it is a modal dialog). */
function useFocusTrap() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return ref;
}

/** The mode's metadata from the catalogue, or a plain stand-in (a made game) built from the room. */
function useModeMeta(room: RoomView): { meta: Pick<ModeMeta, 'title' | 'rules' | 'tutorial' | 'calmPlay'> & Partial<ModeMeta>; variant: VariantMeta | null } {
  const modes = useModes();
  const entry = modes.data?.modes.find((m) => m.meta.id === room.room.modeId);
  const variant = (room.room.variantId ? entry?.variants.find((v) => v.meta.id === room.room.variantId)?.meta : undefined) ?? null;
  return { meta: entry?.meta ?? { title: room.room.title, rules: [] }, variant };
}

/** The walkthrough over the lobby while the server has it open. */
export function Walkthrough({ room, handle, isHost }: { room: RoomView; handle: RoomHandle; isHost: boolean }) {
  const intro = room.room.status === 'lobby' ? room.room.intro : null;
  if (!intro) return null;
  return isHost && !room.room.solo ? <HostWalkthrough room={room} handle={handle} intro={intro} /> : <PlayerWalkthrough room={room} handle={handle} />;
}

/**
 * In the lobby: a player whose device or account says they know this mode tells the server, so a
 * class that knows the game goes straight to it. Rendered for players only.
 */
export function useKnownTutorial(room: RoomView | null, handle: RoomHandle) {
  const { seen, ready } = useTutorialsSeen();
  const key = room ? (room.room.tutorialKey ?? room.room.modeId) : '';
  const told = useRef<string | null>(null);
  const lobby = room?.room.status === 'lobby';
  const isPlayer = room?.me.role === 'player';
  const wanted = Boolean(room?.room.options.tutorial);
  useEffect(() => {
    // Told once each time the room is in the lobby with this mode (a lesson can bring another mode, or come back).
    if (!lobby) {
      told.current = null;
      return;
    }
    if (!isPlayer || !ready || !wanted || told.current === key || !seen(key)) return;
    told.current = key;
    void handle.player({ op: 'tutorial', done: true });
  }, [lobby, isPlayer, ready, wanted, seen, key, handle]);
}

function Steps({ steps, at, big }: { steps: WalkStep[]; at: number; big: boolean }) {
  return (
    <ol className="flex items-center justify-center gap-1.5" aria-hidden>
      {steps.map((s, i) => (
        <li key={`${s.kind}${i}`} className={`rounded-full transition-colors ${i === at ? 'bg-lantern' : i < at ? 'bg-lantern/50' : 'bg-white/20'} ${big ? 'h-3 w-8' : 'h-2 w-5'}`} />
      ))}
    </ol>
  );
}

/** One step: a heading that takes focus as it appears (so a screen reader reads it), and its few words or its picture. */
function StepBody({ step, index, count, meta, big, practise }: { step: WalkStep; index: number; count: number; meta: Partial<ModeMeta>; big: boolean; practise: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index]);
  const ruleNo = step.kind === 'rule' ? index + 1 : null;
  const text = big ? 'text-[clamp(1.4rem,2.4vw,2.4rem)] leading-snug' : 'text-xl leading-snug';
  return (
    <div key={index} className="flex flex-col items-center gap-4 text-center" style={motionOK() ? { animation: 'rise-fade 240ms var(--ease-out)' } : undefined}>
      {index === 0 && meta.id && meta.thumbnail ? (
        <ModeArt thumb={meta.thumbnail} mode={{ id: meta.id, thumbnail: meta.thumbnail }} className={`aspect-[16/9] overflow-hidden rounded-[var(--radius-l)] ${big ? 'w-[min(34rem,60vw)]' : 'w-full max-w-sm'}`} />
      ) : null}
      <p className={`font-semibold text-text-2 ${big ? 'text-xl' : 'text-sm'}`}>
        Step {index + 1} of {count}
      </p>
      <h2 ref={heading} tabIndex={-1} className={`flex items-center gap-3 font-display font-bold text-text outline-none ${big ? 'text-[clamp(2.4rem,4.4vw,4.4rem)]' : 'text-[2rem] leading-tight'}`}>
        {ruleNo !== null ? (
          <span className={`grid shrink-0 place-items-center rounded-full bg-lantern font-extrabold text-on-accent tabular ${big ? 'size-[clamp(3rem,5vw,4.5rem)]' : 'size-10 text-2xl'}`} aria-hidden>
            {ruleNo}
          </span>
        ) : step.kind === 'calm' ? (
          <Feather className={`shrink-0 text-glim ${big ? 'size-14' : 'size-8'}`} aria-hidden />
        ) : null}
        {step.title}
      </h2>
      {step.kind === 'controls' ? <Controls controls={step.controls} big={big} practise={practise} /> : <p className={`max-w-[36ch] text-text ${text}`}>{step.text}</p>}
    </div>
  );
}

/**
 * The mode's controls, drawn as the buttons the game shows. On a player's device they can be
 * pressed (or their keys used) to see what each does: a practice moment that sends nothing to the
 * game and counts for nothing. The big screen shows them as a picture.
 */
function Controls({ controls, big, practise }: { controls: readonly ModeControl[]; big: boolean; practise: boolean }) {
  const [tried, setTried] = useState<Set<string>>(() => new Set());
  const [last, setLast] = useState<ModeControl | null>(null);
  const press = (c: ModeControl) => {
    setTried((t) => new Set(t).add(c.label));
    setLast(c);
  };
  const ref = useRef({ controls, press });
  ref.current = { controls, press };
  useEffect(() => {
    if (!practise) return;
    const down = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      // Space and Enter on a focused button press that button, as usual.
      if (t?.closest('button, a, input, textarea, select') && (e.code === 'Space' || e.code === 'Enter')) return;
      const c = ref.current.controls.find((x) => keyCodes(x.key).includes(e.code));
      if (!c) return;
      e.preventDefault();
      ref.current.press(c);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [practise]);
  const all = tried.size >= controls.length;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {practise ? <p className={`text-text-2 ${big ? 'text-xl' : ''}`}>Press each one to see what it does. Nothing here counts.</p> : null}
      <ul className={`grid w-full gap-2 ${controls.length > 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'} ${big ? 'max-w-4xl gap-4' : 'max-w-md'}`}>
        {controls.map((c) => {
          const done = tried.has(c.label);
          return (
            <li key={c.label} className="flex flex-col items-stretch gap-1">
              {practise ? (
                <Button size="xl" variant={done ? 'success' : 'secondary'} className="w-full px-3" onClick={() => press(c)} aria-describedby={undefined}>
                  {done ? <Check className="size-5" aria-hidden /> : null}
                  {c.label}
                  {done ? <span className="sr-only"> (tried)</span> : null}
                </Button>
              ) : (
                <span className={`grid place-items-center rounded-[var(--radius-l)] bg-raised font-display font-bold text-text ${big ? 'h-20 text-[clamp(1.4rem,2vw,2rem)]' : 'h-14 text-[1.35rem]'}`}>{c.label}</span>
              )}
              <span className={`text-text-2 ${big ? 'text-lg' : 'text-sm'}`}>
                {c.does}
                {c.key ? <span className="block font-semibold text-text-3">Key: {c.key}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {practise ? (
        <p className={`min-h-[1.5em] font-bold ${all ? 'text-glim' : 'text-text'}`} role="status" aria-live="polite">
          {all ? 'You have tried them all. Nice!' : last ? `${last.label}: ${last.does}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function useWalk(room: RoomView) {
  const { meta, variant } = useModeMeta(room);
  const steps = useMemo(() => walkthroughSteps({ meta, variant, calm: room.room.options.calmPlay, solo: room.room.solo }), [meta, variant, room.room.options.calmPlay, room.room.solo]);
  return { meta, steps };
}

/** The steps, one at a time, with Back and Next, the last one's button, and (when given) a way to skip. */
function WalkStepper({ steps, meta, finishLabel, onFinish, onSkip, onClose }: { steps: WalkStep[]; meta: Partial<ModeMeta>; finishLabel: string; onFinish: () => void; onSkip?: (() => void) | undefined; onClose?: (() => void) | undefined }) {
  const [at, setAt] = useState(0);
  const last = at >= steps.length - 1;
  const step = steps[Math.min(at, steps.length - 1)]!;
  return (
    <>
      <Steps steps={steps} at={at} big={false} />
      <div className="flex flex-1 flex-col justify-center">
        <StepBody step={step} index={at} count={steps.length} meta={meta} big={false} practise />
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button size="xl" onClick={() => setAt((n) => Math.max(0, n - 1))} disabled={at === 0} className="px-4">
            <ArrowLeft className="size-6" aria-hidden />
            <span className="sr-only">Back</span>
          </Button>
          {last ? (
            <Button size="xl" variant="success" icon={<Check className="size-6" aria-hidden />} onClick={onFinish}>
              {finishLabel}
            </Button>
          ) : (
            <Button size="xl" variant="primary" onClick={() => setAt((n) => Math.min(steps.length - 1, n + 1))}>
              Next <ArrowRight className="size-6" aria-hidden />
            </Button>
          )}
        </div>
        {onSkip && !last ? (
          <Button size="lg" variant="ghost" onClick={onSkip}>
            Skip: I know how to play
          </Button>
        ) : null}
        {onClose ? (
          <Button size="lg" variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** The page behind the steps on a phone: the stage, the mode's name and (in a calm room) the calm play tag. */
function WalkPage({ room, title, kind, children }: { room: RoomView; title: string; kind: string; children: ReactNode }) {
  const ref = useFocusTrap();
  return (
    <div ref={ref} className="stage fixed inset-0 z-40 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`How to play ${title}`} data-walkthrough={kind}>
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3">
          <p className="font-display text-xl font-bold text-text">How to play {title}</p>
          {room.room.options.calmPlay ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-glim px-3 py-1 text-sm font-bold text-on-accent">
              <Feather className="size-4" aria-hidden /> Calm play
            </span>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

/** A player's device: their own pace, Skip whenever they like, and a note once they are ready. */
function PlayerWalkthrough({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const { meta, steps } = useWalk(room);
  const { markSeen } = useTutorialsSeen();
  const key = room.room.tutorialKey ?? room.room.modeId;
  const [again, setAgain] = useState(false);
  const done = Boolean(room.me.tutorialDone);
  const finish = () => {
    markSeen(key);
    setAgain(false);
    if (!done) void handle.player({ op: 'tutorial', done: true });
  };
  const intro = room.room.intro!;
  const others = Math.max(0, intro.players - intro.done);
  return (
    <WalkPage room={room} title={meta.title} kind="player">
      {done && !again ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-glim text-on-accent">
            <Check className="size-10" aria-hidden />
          </span>
          <h2 className="font-display text-[2rem] leading-tight font-bold">You are ready</h2>
          <p className="max-w-[30ch] text-xl text-text" role="status">
            {others ? `Waiting for ${others === 1 ? '1 more player' : `${others} more players`}.` : 'The game is about to start.'}
          </p>
          <Button size="lg" icon={<RotateCcw className="size-5" aria-hidden />} onClick={() => setAgain(true)}>
            Show me how to play
          </Button>
        </div>
      ) : (
        <WalkStepper steps={steps} meta={meta} finishLabel="I’m ready" onFinish={finish} onSkip={done ? undefined : finish} onClose={done ? () => setAgain(false) : undefined} />
      )}
    </WalkPage>
  );
}

/** "Show me step by step" from How to play in the lobby: the walkthrough again, on this device only. */
export function ReplayWalkthrough({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const { meta, steps } = useWalk(room);
  const { markSeen } = useTutorialsSeen();
  const key = room.room.tutorialKey ?? room.room.modeId;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <WalkPage room={room} title={meta.title} kind="replay">
      <WalkStepper
        steps={steps}
        meta={meta}
        finishLabel="Got it"
        onFinish={() => {
          if (room.me.role === 'player') markSeen(key);
          onClose();
        }}
        onClose={onClose}
      />
    </WalkPage>
  );
}

/** The big screen: the same steps, large, for the teacher to talk through; who is ready; start now; back to the lobby. */
function HostWalkthrough({ room, handle, intro }: { room: RoomView; handle: RoomHandle; intro: NonNullable<RoomView['room']['intro']> }) {
  const { meta, steps } = useWalk(room);
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)]!;
  const last = at >= steps.length - 1;
  const ref = useFocusTrap();
  return (
    <div ref={ref} className="stage fixed inset-0 z-40 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`How to play ${meta.title}`} data-walkthrough="host">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-[clamp(1rem,3vh,2rem)] px-6 py-[clamp(1rem,4vh,3rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-display text-[clamp(1.6rem,2.6vw,2.6rem)] font-bold text-text">How to play {meta.title}</p>
          <div className="flex flex-wrap items-center gap-3">
            {room.room.options.calmPlay ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-glim px-4 py-1.5 text-lg font-bold text-on-accent">
                <Feather className="size-5" aria-hidden /> Calm play
              </span>
            ) : null}
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.09] px-4 py-1.5 text-lg font-bold text-text tabular" role="status">
              <Users className="size-5" aria-hidden /> {intro.done} of {intro.players} ready
            </span>
          </div>
        </header>
        <Steps steps={steps} at={at} big />
        <div className="flex flex-1 flex-col justify-center">
          <StepBody step={step} index={at} count={steps.length} meta={meta} big practise={false} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button size="lg" variant="ghost" icon={<X className="size-5" aria-hidden />} onClick={() => void handle.host({ cmd: 'cancelStart' })}>
            Back to the lobby
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button size="xl" onClick={() => setAt((n) => Math.max(0, n - 1))} disabled={at === 0}>
              <ArrowLeft className="size-6" aria-hidden /> Back
            </Button>
            {last ? null : (
              <Button size="xl" onClick={() => setAt((n) => Math.min(steps.length - 1, n + 1))}>
                Next <ArrowRight className="size-6" aria-hidden />
              </Button>
            )}
            <Button size="xl" variant="primary" icon={<Play className="size-6" aria-hidden />} onClick={() => void handle.host({ cmd: 'start' })}>
              {intro.done >= intro.players ? 'Start the game' : 'Start now'}
            </Button>
          </div>
        </div>
        <p className="text-center text-lg text-text-2">Players go through these steps on their own screens. The game starts when they are all ready, or when you press Start now.</p>
      </div>
    </div>
  );
}
