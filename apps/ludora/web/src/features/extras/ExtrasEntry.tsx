import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { playSfx } from '../../lib/sound/react.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { EmoteGlyph } from '../../art/cosmetics.tsx';
import { Dialog, Input } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * The public end of the secret: a lantern on the About panel that listens
 * for a knock, and the lantern that appears when the ritual is done. None of
 * this knows the rhythm, the riddle or the ritual; the server sends each
 * stage only to whoever reached it. The cheat menu was removed, so an
 * unlocked player has no control for casting here.
 */

/** The lantern on the About panel. Tapping it in the right rhythm starts the sequence. */
export function SecretLantern() {
  const taps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bob, setBob] = useState(0);
  const [riddle, setRiddle] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [ritual, setRitual] = useState<string[] | null>(null);
  const [beats, setBeats] = useState<number[] | null>(null);
  const [flicker, setFlicker] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ beats: number[] }>('/api/lantern/flicker')
      .then((r) => alive && setBeats(r.beats))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Now and then the lantern flickers its rhythm, for anyone who is watching closely. Never for reduced motion.
  useEffect(() => {
    if (!beats || prefersReducedMotion()) return;
    let cancelled = false;
    const run = async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      while (!cancelled) {
        await wait(22_000);
        for (const b of [0, ...beats]) {
          if (cancelled) return;
          await wait(b * 260);
          setFlicker(true);
          await wait(110);
          setFlicker(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [beats]);

  const send = async () => {
    const times = taps.current;
    taps.current = [];
    if (times.length < 2) return;
    const gaps = times.slice(1).map((t, i) => Math.round(t - times[i]!));
    try {
      const r = await api.post<{ heard: boolean; riddle?: string }>('/api/lantern/knock', { gaps });
      if (r.heard && r.riddle) {
        playSfx('lanternRise');
        setRiddle(r.riddle);
        setNote(null);
      }
    } catch {
      // Signed out, or knocking too often: the lantern just stays quiet.
    }
  };

  const tap = () => {
    taps.current.push(performance.now());
    if (taps.current.length > 12) taps.current.shift();
    setBob((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    // A pause of over a second and a half ends the knock.
    timer.current = setTimeout(() => void send(), 1600);
  };

  const submit = async () => {
    try {
      const r = await api.post<{ ok: boolean; ritual?: string[]; message?: string; reset?: boolean }>('/api/lantern/riddle', { answer });
      if (r.ok && r.ritual) {
        playSfx('lanternReveal');
        setRiddle(null);
        setRitual(r.ritual);
      } else {
        setNote(r.message ?? 'Nothing happens.');
        if (r.reset) setRiddle(null);
      }
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Nothing happens.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={tap}
        aria-label="Ludora lantern"
        className="group relative grid size-12 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-lantern"
      >
        <svg key={bob} viewBox="0 0 32 40" className="h-10 w-8" style={{ animation: bob ? 'stage-pop 240ms var(--ease-out)' : undefined }} aria-hidden>
          <path d="M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="7" y="6" width="18" height="5" rx="2" fill="currentColor" opacity=".7" />
          <path d="M8 11h16l-2 22H10z" fill="var(--lantern)" opacity={flicker ? 1 : 0.75} />
          <ellipse cx="16" cy="22" rx="4" ry="6" fill="#fff6c9" opacity={flicker ? 1 : 0.55} />
          <rect x="9" y="33" width="14" height="4" rx="2" fill="currentColor" opacity=".7" />
        </svg>
      </button>
      <Dialog open={riddle !== null} onOpenChange={(o) => !o && setRiddle(null)} title="The lantern whispers" description={riddle ?? ''} size="sm"
        footer={<Button onClick={() => void submit()} disabled={!answer.trim()}>Whisper back</Button>}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input aria-label="Your answer" value={answer} maxLength={60} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" />
        </form>
        {note ? <p className="mt-2 text-sm text-text-2">{note}</p> : null}
      </Dialog>
      <Dialog open={ritual !== null} onOpenChange={(o) => !o && setRitual(null)} title="The lantern glows" size="sm"
        description="In a game that is running, as a player, send these reactions in this order. Nothing else in between."
        footer={<Button onClick={() => setRitual(null)}>I will remember</Button>}
      >
        <div className="flex justify-center gap-3 py-2">
          {(ritual ?? []).map((r, i) => (
            <span key={i} className="flex flex-col items-center gap-1">
              <EmoteGlyph glyph={r} size={52} />
              <span className="text-sm text-text-2">{i + 1}</span>
            </span>
          ))}
        </div>
      </Dialog>
    </>
  );
}

/** The lantern that appears in a game once the ritual is done. Hold it to light it. */
export function LanternGlow({ handle }: { handle: RoomHandle }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!handle.glow) return null;
  const light = async () => {
    try {
      const r = await api.post<{ ok: boolean; message?: string }>('/api/lantern/light');
      if (r.ok) {
        playSfx('jackpot');
        toast.success('The lantern is lit.');
      } else toast(r.message ?? 'Nothing happens.');
    } catch {
      toast('Nothing happens.');
    }
    handle.clearGlow();
  };
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => void light(), 3000);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      type="button"
      aria-label="A glowing lantern. Press and hold to light it."
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !holding && start()}
      onKeyUp={stop}
      className="fixed right-4 bottom-24 z-50 grid size-20 place-items-center rounded-full bg-[radial-gradient(circle,rgb(255_210_90/.9),rgb(255_160_40/.25)_60%,transparent_70%)] outline-none focus-visible:ring-4 focus-visible:ring-lantern"
      style={{ transition: 'transform 3s linear', transform: holding ? 'scale(1.35)' : 'scale(1)' }}
    >
      <svg viewBox="0 0 32 40" className="h-12 w-10" aria-hidden>
        <path d="M8 11h16l-2 22H10z" fill="#ffd25a" />
        <ellipse cx="16" cy="22" rx="4" ry="6" fill="#fff" />
      </svg>
    </button>
  );
}
