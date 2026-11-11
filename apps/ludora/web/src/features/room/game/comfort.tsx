import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Bell, Check, Hourglass, Smartphone, Volume2, Square, Wifi, WifiOff, X } from 'lucide-react';
import type { PublicQuestion } from '@ludora/shared';
import { sound } from '../../../lib/sound/engine.ts';
import type { SfxName } from '../../../lib/sound/sfx.ts';
import { useAccess } from '../../../lib/usePrefs.ts';
import { speak, speechSupported, spokenQuestion, stopSpeaking } from '../../../lib/speech.ts';

/*
 * Comfort and access on game screens: captions and buzzes for sounds that carry meaning, keeping
 * the screen awake, read aloud, a clear connection banner and a hint to turn the phone for 3D.
 */

/* ------------------------------- sounds you can see ------------------------------- */

export type CueKind = 'lockIn' | 'correct' | 'wrong' | 'warning' | 'timeUp';

const CUE_OF: Partial<Record<SfxName, CueKind>> = { lockIn: 'lockIn', correct: 'correct', wrong: 'wrong', tick: 'warning', tickFinal: 'warning', timeUp: 'timeUp' };
const CAPTION: Record<CueKind, string> = {
  lockIn: 'Sound: answer locked in',
  correct: 'Sound: right answer',
  wrong: 'Sound: wrong answer',
  warning: 'Sound: time is nearly up',
  timeUp: "Sound: time's up",
};
/** Buzz patterns (ms): one short buzz as an answer goes in, a double for right, one long for wrong. */
export const BUZZ: Partial<Record<CueKind, number | number[]>> = { lockIn: 35, correct: [60, 50, 60], wrong: 220 };

const cueListeners = new Set<(kind: CueKind) => void>();
/** A meaningful moment with no sound of its own on this screen (the timer warning on a phone). */
export function showCue(kind: CueKind) {
  for (const l of cueListeners) l(kind);
}

/**
 * Captions for sounds that carry meaning, and a buzz on phones, each when the player turned it on.
 * The captions are for eyes only: the game's announcer already says the same to screen readers.
 */
export function SoundCues() {
  const { captions, vibrate } = useAccess();
  const [cue, setCue] = useState<{ kind: CueKind; n: number } | null>(null);
  const n = useRef(0);
  useEffect(() => {
    if (!captions && !vibrate) return;
    const on = (kind: CueKind) => {
      if (vibrate && BUZZ[kind] !== undefined) {
        try {
          navigator.vibrate?.(BUZZ[kind]!);
        } catch {
          /* not every browser lets a page buzz */
        }
      }
      if (captions) setCue((c) => (c?.kind === kind && kind === 'warning' ? c : { kind, n: ++n.current }));
    };
    const offSound = sound.onCue((name) => {
      const kind = CUE_OF[name];
      if (kind) on(kind);
    });
    cueListeners.add(on);
    return () => {
      offSound();
      cueListeners.delete(on);
    };
  }, [captions, vibrate]);
  useEffect(() => {
    if (!cue) return;
    const t = window.setTimeout(() => setCue(null), 2600);
    return () => window.clearTimeout(t);
  }, [cue]);
  if (!captions || !cue) return null;
  const Icon = cue.kind === 'correct' ? Check : cue.kind === 'wrong' ? X : cue.kind === 'lockIn' ? Bell : Hourglass;
  const tone = cue.kind === 'correct' ? 'bg-glim' : cue.kind === 'wrong' || cue.kind === 'warning' || cue.kind === 'timeUp' ? 'bg-ember' : 'bg-lantern';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-40 flex justify-center px-4 sm:top-20" aria-hidden data-testid="sound-caption">
      <p key={cue.n} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold text-on-accent shadow-[0_10px_24px_-10px_rgb(2_5_20/0.8)] ${tone}`}>
        <Icon className="size-5" strokeWidth={2.75} aria-hidden />
        {CAPTION[cue.kind]}
      </p>
    </div>
  );
}

/* ------------------------------------ wake lock ------------------------------------ */

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keeps the screen on while `active`, when the player asked for it and the browser can. Taken again when the tab comes back. */
export function useWakeLock(active: boolean) {
  const { wakeLock } = useAccess();
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!active || !wakeLock || !api) return;
    let lock: WakeLockSentinelLike | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      api
        .request('screen')
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => {
          /* refused (battery saver, or no permission): the screen behaves as usual */
        });
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => {});
    };
  }, [active, wakeLock]);
}

/* ------------------------------------ read aloud ------------------------------------ */

/** The host turned on "Read questions aloud on the big screen" (only ever true on the host's screen). */
export const BigScreenReads = createContext(false);
export const useBigScreenReads = () => useContext(BigScreenReads);

/**
 * Reads the question aloud: a speaker button when the player turned read aloud on, and each new
 * question by itself when they chose that too (or `auto`, the host's big-screen setting).
 */
export function ReadAloud({ q, index, total, auto = false, big = false }: { q: PublicQuestion; index?: number | undefined; total?: number | undefined; auto?: boolean; big?: boolean }) {
  const { readAloud, readAuto, readRate } = useAccess();
  const [speaking, setSpeaking] = useState(false);
  const text = spokenQuestion(q, index, total);
  const supported = speechSupported();
  const autoRead = supported && (auto || (readAloud && readAuto));
  useEffect(() => {
    if (!autoRead) return;
    // A moment's wait, so the screen reader's own announcement and the question sound are not talked over.
    const t = window.setTimeout(() => setSpeaking(speak(text, { rate: readRate, onEnd: () => setSpeaking(false) })), 700);
    return () => window.clearTimeout(t);
  }, [text, autoRead, readRate]);
  useEffect(
    () => () => {
      stopSpeaking();
    },
    [text],
  );
  if (!supported || !(readAloud || auto)) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else setSpeaking(speak(text, { rate: readRate, onEnd: () => setSpeaking(false) }))
      }}
      aria-pressed={speaking}
      className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-line-strong bg-surface-2 font-semibold text-text hover:bg-surface-3 ${big ? 'min-h-12 px-4 text-lg' : 'min-h-11 px-3.5 text-base'}`}
    >
      {speaking ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
      {speaking ? 'Stop reading' : 'Read aloud'}
    </button>
  );
}

/* --------------------------------- connection banner --------------------------------- */

/** A clear banner while the game connection is down, and "Back online" for a moment when it returns. */
export function ConnectionBanner({ online }: { online: boolean }) {
  const [back, setBack] = useState(false);
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) {
      setBack(true);
      const t = window.setTimeout(() => setBack(false), 3000);
      was.current = online;
      return () => window.clearTimeout(t);
    }
    was.current = online;
    if (!online) setBack(false);
  }, [online]);
  if (online && !back) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3 pt-2 min-[1600px]:top-20" data-testid="connection-banner">
      <p className={`pointer-events-auto flex max-w-xl items-center gap-2.5 rounded-[var(--radius-m)] px-4 py-2.5 font-bold text-on-accent shadow-[0_10px_24px_-10px_rgb(2_5_20/0.8)] ${online ? 'bg-glim' : 'bg-ember'}`}>
        {online ? <Wifi className="size-5 shrink-0" aria-hidden /> : <WifiOff className="size-5 shrink-0" aria-hidden />}
        {online ? 'Back online. You are still in the game.' : 'Connection lost. Reconnecting… Keep this page open: your place is kept.'}
      </p>
    </div>
  );
}

/* --------------------------------- turn the phone --------------------------------- */

/** On a phone held upright during a 3D game, a hint that the picture is bigger sideways. Dismissable. */
export function RotateHint({ on }: { on: boolean }) {
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(orientation: portrait) and (max-width: 600px) and (pointer: coarse)');
    if (!mq) return;
    const update = () => setPortraitPhone(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  if (!on || !portraitPhone || dismissed) return null;
  return (
    <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-m)] border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-text" data-testid="rotate-hint">
      <Smartphone className="size-5 shrink-0 rotate-90 text-lantern" aria-hidden />
      <span className="flex-1">Turn your phone sideways for a bigger view of the game.</span>
      <button type="button" onClick={() => setDismissed(true)} className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-s)] hover:bg-white/[0.08]" aria-label="Hide this tip">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
