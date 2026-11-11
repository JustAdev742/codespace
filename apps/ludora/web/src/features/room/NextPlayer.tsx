import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Users } from 'lucide-react';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Button } from '../../ui/Button.tsx';

/*
 * Shared classroom devices (finish): when the host turned it on, a device that joined with only a
 * name goes back to the join page for the next player once the game is over, after a countdown
 * that anyone can stop. It leaves the room first, so the next player cannot pick up the last
 * one's seat or name. Nothing here asks the server for an account: the player has none.
 */

export const NEXT_PLAYER_SECONDS = 20;

export function NextPlayerCountdown({ code, handle }: { code: string; handle: RoomHandle }) {
  const navigate = useNavigate();
  const [left, setLeft] = useState(NEXT_PLAYER_SECONDS);
  const [stopped, setStopped] = useState(false);
  const going = useRef(false);

  const next = async () => {
    if (going.current) return;
    going.current = true;
    await handle.leave();
    try {
      sessionStorage.removeItem(`ludora.name.${code}`);
    } catch {
      /* private mode: nothing was kept */
    }
    navigate(`/join/${code}`, { replace: true });
  };

  useEffect(() => {
    if (stopped) return;
    if (left <= 0) {
      void next();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // next is stable enough: it only reads the code and the handle, guarded by going.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stopped]);

  return (
    <div className="stage-card on-stage mx-auto mt-4 bg-white/[0.08] flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-[var(--radius-l)] px-4 py-3" role="region" aria-label="Next player">
      <Users className="size-5 shrink-0 text-text-2" aria-hidden />
      <p className="min-w-0 flex-1 basis-56 font-semibold" aria-hidden>
        {stopped ? 'This device stays on the results.' : (
          <>
            Shared device: next player in <span className="tabular">{left}</span> seconds.
          </>
        )}
      </p>
      {/* Said at the start, at 10 and at 5 seconds, not every second. */}
      <p className="sr-only" aria-live="polite">
        {stopped ? 'This device stays on the results.' : left > 10 ? `Shared device: the next player can join in ${NEXT_PLAYER_SECONDS} seconds.` : left > 5 ? 'Next player in 10 seconds.' : 'Next player in 5 seconds.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!stopped ? (
          <Button size="sm" onClick={() => setStopped(true)}>
            Stay on this screen
          </Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={() => void next()}>
          Next player now
        </Button>
      </div>
    </div>
  );
}
