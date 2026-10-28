import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ChaosRequest, RoomView } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import type { AckResult, RoomHandle } from '../../lib/useRoom.ts';
import { playSfx } from '../../lib/sound/react.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { EmoteGlyph } from '../../art/cosmetics.tsx';
import { Dialog, Input } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * The public end of the secret: a lantern on the About panel that listens
 * for a knock, the lantern that appears when the ritual is done, and the
 * button that fetches the menu for players who have unlocked it. None of
 * this knows the rhythm, the riddle or the ritual; the server sends each
 * stage only to whoever reached it, and the menu's code is fetched from the
 * server only for unlocked accounts.
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
        toast.success('The lantern is lit. Something new is waiting in your games.');
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

/** What the menu (loaded from the server) is given to work with. */
export interface ChaosHost {
  view(): RoomView;
  subscribe(fn: (v: RoomView) => void): () => void;
  send(req: ChaosRequestBody): Promise<AckResult>;
  gameNow(): number;
  play(sfx: 'powerUp' | 'steal' | 'shield' | 'bust' | 'select' | 'tap'): void;
  reducedMotion(): boolean;
  close(): void;
}
type ChaosRequestBody = ChaosRequest extends infer T ? (T extends unknown ? Omit<T, 'actionId'> : never) : never;

interface MenuModule {
  mount(el: HTMLElement, host: ChaosHost): () => void;
}

/** The button that opens the secret menu. Only rendered for players the server says have unlocked chaos. */
export function ChaosMenuButton({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [open, setOpen] = useState(false);
  const latest = useRef(room);
  const listeners = useRef(new Set<(v: RoomView) => void>());
  latest.current = room;
  useEffect(() => {
    for (const fn of listeners.current) fn(room);
  }, [room]);
  useEffect(() => {
    if (!open) return;
    // On the page itself, above the room's header and stage, so nothing in the game can sit over it.
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    let unmount: (() => void) | null = null;
    let cancelled = false;
    const host: ChaosHost = {
      view: () => latest.current,
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      send: (req) => handle.chaos(req),
      gameNow: () => handle.gameNow(),
      play: (s) => playSfx(s),
      reducedMotion: prefersReducedMotion,
      close: () => setOpen(false),
    };
    // The menu's code is served only to accounts that unlocked it, and never as a public file.
    import(/* @vite-ignore */ `${location.origin}/api/lantern/book.js`)
      .then((m: MenuModule) => {
        if (!cancelled) unmount = m.mount(holder, host);
      })
      .catch(() => {
        toast('The lantern flickers out. Try again in a moment.');
        setOpen(false);
      });
    return () => {
      cancelled = true;
      unmount?.();
      holder.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!room.chaos?.me) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Open the lantern"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle,rgb(255_200_80/.45),transparent_70%)] outline-none focus-visible:ring-4 focus-visible:ring-lantern"
      >
        <svg viewBox="0 0 32 40" className="h-7 w-6" aria-hidden>
          <path d="M8 11h16l-2 22H10z" fill="var(--lantern)" />
          <ellipse cx="16" cy="22" rx="4" ry="6" fill="#fff6c9" />
        </svg>
      </button>
    </>
  );
}
