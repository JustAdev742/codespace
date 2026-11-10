import { useEffect, useState } from 'react';
import { BellRing, Coffee, Play, X } from 'lucide-react';
import type { RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { useNow } from '../../../lib/useNow.ts';
import { Button } from '../../../ui/Button.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { motionOK } from '../game/stage.tsx';
import { serverClock } from './tools.ts';

/*
 * Moments every screen in the room shares: the start countdown, a brain break, double points on
 * the final question, and (on one player's device) the host's nudge.
 */

/** Seconds left until a server time, ticking. */
function useSecondsLeft(until: number | null | undefined, view: RoomView, receivedAt: number): number | null {
  useNow(250, Boolean(until));
  if (!until) return null;
  return Math.max(0, Math.ceil((until - serverClock(view, receivedAt)()) / 1000));
}

/** "Starting in 5" over the lobby on every screen, with Cancel and Start now for the host. */
export function StartCountdown({ handle, isHost }: { handle: RoomHandle; isHost: boolean }) {
  const view = handle.view!;
  const secs = useSecondsLeft(view.room.startsAt, view, handle.receivedAt);
  useAnnounce(secs !== null ? 'The game is about to start.' : null, view.room.startsAt ?? 'none');
  if (secs === null) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[color-mix(in_srgb,var(--stage-4)_80%,transparent)] px-4 backdrop-blur-sm" role="alertdialog" aria-modal="false" aria-label="The game is starting">
      <div className="flex flex-col items-center gap-[clamp(1rem,3vh,2rem)] text-center">
        <p className={`plate plate-gold ${isHost ? 'text-[clamp(1.75rem,3vw,3.25rem)]' : 'text-[2rem]'}`}>
          <span>Starting in</span>
        </p>
        <span
          className={`lift grid place-items-center rounded-full bg-lantern font-display leading-none font-extrabold text-on-accent italic tabular ${isHost ? 'size-[clamp(9rem,26vh,16rem)] text-[clamp(5.5rem,16vh,10rem)]' : 'size-36 text-[5.5rem]'}`}
          role="timer"
          aria-label={`Starting in ${secs} seconds`}
        >
          <span key={secs} className="inline-block" style={motionOK() ? { animation: 'count-pop 200ms var(--ease-out)' } : undefined}>
            {secs}
          </span>
        </span>
        {isHost ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" icon={<X className="size-5" aria-hidden />} onClick={() => void handle.host({ cmd: 'cancelStart' })}>
              Cancel
            </Button>
            <Button size="lg" variant="primary" icon={<Play className="size-5" aria-hidden />} onClick={() => void handle.host({ cmd: 'start', now: true })}>
              Start now
            </Button>
          </div>
        ) : (
          <p className="text-lg font-semibold text-text-2">Get ready. The first question is on its way.</p>
        )}
      </div>
    </div>
  );
}

const STRETCHES = ['Stand up and reach for the ceiling.', 'Roll your shoulders back, slowly.', 'Look out of the window, far away.', 'Breathe in for four, out for four.', 'Shake out your hands and arms.', 'Turn your head gently, side to side.'];

/** A brain break: a calm screen with a stretch timer on every device. The host can end it early. */
export function BrainBreak({ handle, isHost }: { handle: RoomHandle; isHost: boolean }) {
  const view = handle.view!;
  const until = view.room.breakEndsAt;
  const secs = useSecondsLeft(until, view, handle.receivedAt);
  // A new stretch every 10 seconds.
  const stretch = secs === null ? null : STRETCHES[Math.floor((60 - secs) / 10) % STRETCHES.length]!;
  useAnnounce(secs !== null ? `Brain break. ${STRETCHES[0]}` : null, until ?? 'none');
  if (secs === null || !until) return null;
  const total = secs > 30 ? 60 : 30;
  const left = secs / total;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[color-mix(in_srgb,var(--stage-4)_88%,transparent)] px-4 backdrop-blur-md" role="dialog" aria-modal="false" aria-labelledby="break-title">
      <div className="flex max-w-xl flex-col items-center gap-[clamp(1rem,3vh,2rem)] text-center">
        <Coffee className={`text-glim ${isHost ? 'size-[clamp(3rem,7vh,5rem)]' : 'size-12'}`} aria-hidden />
        <h2 id="break-title" className={`font-display leading-none font-extrabold ${isHost ? 'text-[clamp(3.25rem,6vw,6.5rem)]' : 'text-[3rem]'}`}>
          Brain break
        </h2>
        {/* A ring that empties as the break runs out; no motion beyond the tick. */}
        <div className={`relative ${isHost ? 'size-[clamp(10rem,26vh,15rem)]' : 'size-40'}`}>
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="8" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--glim)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${276.5 * left} 276.5`} />
          </svg>
          <span className={`absolute inset-0 grid place-items-center font-display font-extrabold tabular ${isHost ? 'text-[clamp(3rem,8vh,5rem)]' : 'text-5xl'}`} role="timer" aria-label={`${secs} seconds left`}>
            {secs}
          </span>
        </div>
        <p className={`font-semibold ${isHost ? 'text-[clamp(1.4rem,2.4vw,2.6rem)]' : 'text-xl'}`} aria-live="polite">
          {stretch}
        </p>
        {isHost ? (
          <Button size="lg" onClick={() => void handle.host({ cmd: 'endBreak' })}>
            End the break
          </Button>
        ) : (
          <p className="text-text-2">The game carries on when the timer runs out.</p>
        )}
      </div>
    </div>
  );
}

/** "Double points" on a gold plate while the final question is next or open, on every screen. */
export function DoubleBanner({ room, big }: { room: RoomView; big: boolean }) {
  useAnnounce(room.room.doubleNow ? 'The final question is worth double points.' : null, room.room.doubleNow ? 'double' : 'none');
  if (!room.room.doubleNow) return null;
  return (
    <div className="pointer-events-none flex justify-center pb-2">
      <p className={`plate plate-gold ${big ? 'text-[clamp(1.25rem,2vw,2.25rem)]' : 'text-lg'}`}>
        <span>Final question: double points</span>
      </p>
    </div>
  );
}

/** On a player's device: the host is waiting for their answer. Gentle, and gone after a few seconds. */
export function NudgeBanner({ nudgedAt }: { nudgedAt: number | null }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!nudgedAt) return;
    setShown(nudgedAt);
    const t = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(t);
  }, [nudgedAt]);
  useAnnounce(shown ? 'Your teacher is waiting for your answer.' : null, shown ?? 'none');
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-40 flex justify-center sm:top-[4.75rem]">
      <p className="paper stage-card flex items-center gap-2.5 px-4 py-2.5 font-bold" style={motionOK() ? { animation: 'rise-fade 200ms var(--ease-out)' } : undefined}>
        <BellRing className="size-5 shrink-0 text-lantern" aria-hidden />
        Your teacher is waiting for your answer.
      </p>
    </div>
  );
}
