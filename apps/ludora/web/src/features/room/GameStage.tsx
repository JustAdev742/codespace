import { Suspense, useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, Square, Wind } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { useNow } from '../../lib/useNow.ts';
import { Dialog, Spinner } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { MODE_SCREENS } from './modes/registry.ts';
import { useAnnounce } from './game/announce.tsx';
import { ChaosLayer } from '../chaos/ChaosLayer.tsx';

/*
 * The parts of a game room that do not care where the room runs: the stage,
 * the mode's screen, the host's controls, pause news and the news toasts. The
 * live room page uses them over the network, and the playable demo with a room
 * in the browser.
 */

/*
 * The room sits on the stage in both themes. The stage clips sideways overflow
 * (answer bursts, reactions) without becoming a scroll container, so the
 * header can stay pinned while long screens scroll.
 */
export const STAGE = 'flex min-h-dvh flex-col overflow-x-clip! overflow-y-visible!';

/** Header controls read from the back of the room on a big projector: taller, with larger text, from 1600 pixels wide. */
export const WIDE = 'min-[1600px]:h-12 min-[1600px]:px-4 min-[1600px]:text-lg';

/** The game's header: a slim smoked HUD bar pinned over the stage, like a broadcast's top bar. */
export const HUD_BAR = 'hud sticky top-0 z-30 border-x-0 border-t-0';

/** The bar along the bottom of a player's screen (the reactions), in the same smoked glass. */
export const HUD_FOOT = 'hud border-x-0 border-b-0';

/** "LIVE" on a coral plate, in the header while a game runs. The narrowest phones leave it out, so the game code keeps its room. */
export function LiveTag() {
  return (
    <span className="plate shrink-0 bg-ember px-1.5 py-0 text-[0.85em] leading-[1.35] text-on-accent max-[379px]:hidden">
      <span>LIVE</span>
    </span>
  );
}

export function HostControls({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const status = room.room.status;
  const game = room.game as { sync?: { phaseEndsAt: number | null; phase: string } } | null;
  const waitingForHost = Boolean(game?.sync && game.sync.phaseEndsAt === null && game.sync.phase !== 'done');
  const run = async (cmd: Parameters<RoomHandle['host']>[0]) => {
    const ack = await handle.host(cmd);
    if (!ack.ok) toast.error(ack.error.message);
  };
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {game?.sync ? (
        // The one button that moves a host-paced game on: big and gold when the room is waiting for it.
        <Button variant={waitingForHost ? 'primary' : 'secondary'} size={waitingForHost ? 'lg' : 'sm'} className={waitingForHost ? '' : WIDE} icon={<FastForward className="size-4" aria-hidden />} onClick={() => run({ cmd: 'next' })} disabled={status !== 'running'}>
          {/* On a phone the host's header is full: Skip ahead keeps its label for screen readers, like Pause and End game. */}
          {waitingForHost ? 'Next' : <span className="max-sm:sr-only">Skip ahead</span>}
        </Button>
      ) : null}
      {status === 'paused' ? (
        <Button size="sm" variant="success" className={WIDE} icon={<Play className="size-4" aria-hidden />} onClick={() => run({ cmd: 'resume' })}>
          Resume
        </Button>
      ) : (
        <Button size="sm" className={WIDE} icon={<Pause className="size-4" aria-hidden />} onClick={() => run({ cmd: 'pause' })} disabled={status !== 'running'}>
          <span className="max-md:sr-only">Pause</span>
        </Button>
      )}
      {room.chaos && room.chaos.casts > 0 && !room.chaos.calmed ? (
        // Shown only once someone has used chaos in this game: ends every effect and stops any more.
        <Button size="sm" variant="secondary" className={WIDE} icon={<Wind className="size-4" aria-hidden />} onClick={() => run({ cmd: 'chaosCalm' })}>
          <span className="max-md:sr-only">Calm the room</span>
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" className={WIDE} icon={<Square className="size-4" aria-hidden />} onClick={() => setConfirmEnd(true)}>
        <span className="max-md:sr-only">End game</span>
      </Button>
      <Dialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End the game now?"
        description="Scores so far are kept and rewards are paid for what was played."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmEnd(false)}>Keep playing</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmEnd(false);
                void run({ cmd: 'end' });
              }}
            >
              End game
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Whether this mode's host screen lists the room's news itself, so its big screen needs no news toasts. */
export function hostListsFeed(modeId: string): boolean {
  return Boolean(MODE_SCREENS[modeId]?.hostFeed);
}

/** Recent game events (finishes, eliminations) as short-lived toasts: a solid fill in the colour of their news, like the app's own toasts. */
export function FeedToasts({ feed, quiet = false }: { feed: RoomView['feed']; /** The screen lists the news itself. */ quiet?: boolean }) {
  const seen = useRef(new Map<number, number>());
  const now = useNow(1000, feed.length > 0);
  for (const f of feed) if (!seen.current.has(f.id)) seen.current.set(f.id, Date.now());
  const visible = feed.filter((f) => now - (seen.current.get(f.id) ?? 0) < 5000).slice(-3);
  if (quiet || !visible.length) return null;
  return (
    // On a phone the news drops in under the header, clear of the answers in the thumb zone; on the projector it sits bottom right.
    // A phone shows only the newest line, two lines at most, so busy rooms never bury the game's own status row.
    <div className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-30 flex flex-col items-center gap-1.5 sm:top-[4.75rem] max-lg:[&>*:not(:last-child)]:hidden lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-6 lg:max-w-[24rem] lg:items-end" aria-live="polite">
      {visible.map((f) => (
        <div
          key={f.id}
          className={`max-w-[22rem] rounded-[var(--radius-m)] px-3.5 py-2 text-sm leading-snug font-bold shadow-[0_12px_30px_-10px_rgb(2_5_20/0.7)] max-lg:line-clamp-2 lg:max-w-none lg:px-4 lg:py-2.5 lg:text-lg ${f.tone === 'big' ? 'bg-lantern text-on-accent' : f.tone === 'good' ? 'bg-glim text-on-accent' : f.tone === 'bad' ? 'bg-ember text-on-accent' : 'paper'}`}
          style={{ animation: 'rise-fade 200ms var(--ease-out)' }}
        >
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** Says when the host pauses, and when the game is back on after a pause. */
function PauseNews({ paused, hostConnected }: { paused: boolean; hostConnected: boolean }) {
  const [wasPaused, setWasPaused] = useState(paused);
  useEffect(() => {
    if (paused) setWasPaused(true);
  }, [paused]);
  useAnnounce(paused ? `The game is paused. ${hostConnected ? 'The host will be back in a moment.' : 'Waiting for the host to reconnect.'}` : wasPaused ? 'The game is back on.' : null, paused);
  return null;
}

/** The mode's screen for the host or a player. Put it inside an AnswerMemory for the device it shows on. */
export function GameStage({ room, handle, isHost }: { room: RoomView; handle: RoomHandle; isHost: boolean }) {
  const screens = MODE_SCREENS[room.room.modeId];
  const paused = room.room.status === 'paused';
  if (!screens) return <p className="text-text-2">This mode cannot be shown on this version of Ludora. Reload the page.</p>;
  if (room.game && typeof room.game === 'object' && 'error' in (room.game as object)) {
    return <p className="text-text-2">This screen could not be drawn. The game is still running; it will catch up on the next update.</p>;
  }
  const Screen = isHost ? screens.Host : screens.Player;
  return (
    <div className="relative flex flex-1 flex-col">
      <PauseNews paused={paused} hostConnected={room.room.hostConnected} />
      <ChaosLayer room={room} gameNow={handle.gameNow}>
        <Suspense fallback={<Spinner />}>
          <Screen view={room.game} room={room} act={handle.act} gameNow={handle.gameNow} paused={paused} />
        </Suspense>
      </ChaosLayer>
      {paused && isHost ? (
        // The host screen is on the projector: tell the room, but leave the question readable.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
          <span className="paper stage-card flex items-center gap-2 px-5 py-2 font-display text-[clamp(1.5rem,2.3vw,2.4rem)] font-extrabold">
            <Pause className="size-[1.1em]" aria-hidden /> Paused
          </span>
        </div>
      ) : null}
      {paused && !isHost ? (
        <div className="absolute -inset-2 z-20 grid place-items-center rounded-[var(--radius-l)] bg-[rgb(5_8_24/0.72)] backdrop-blur-sm">
          <div className="paper stage-card mx-4 flex max-w-xs flex-col items-center gap-1 px-6 py-5 text-center">
            <Pause className="mb-1 size-10" aria-hidden />
            <p className="font-display text-[2.25rem] leading-tight font-extrabold">Paused</p>
            <p className="text-text-2">{room.room.hostConnected ? 'The host will be back in a moment.' : 'Waiting for the host to reconnect.'}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

