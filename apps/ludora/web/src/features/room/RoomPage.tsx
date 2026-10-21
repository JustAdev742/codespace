import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { DoorOpen, FastForward, Pause, Play, Square, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useMe } from '../../lib/session.ts';
import { useRoom, type RoomHandle } from '../../lib/useRoom.ts';
import { useNow } from '../../lib/useNow.ts';
import { LogoMark } from '../../art/icons.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { Dialog, Spinner } from '../../ui/primitives.tsx';
import { HostLobby, PlayerLobby } from './Lobby.tsx';
import { Results } from './Results.tsx';
import { MODE_SCREENS } from './modes/registry.ts';
import { ReactionBar, ReactionLayer } from './game/Reactions.tsx';
import type { RoomView } from '@ludora/shared';

const nameKey = (code: string) => `ludora.name.${code}`;

/** Recent game events (finishes, eliminations) as short-lived toasts. */
function FeedToasts({ feed }: { feed: RoomView['feed'] }) {
  const seen = useRef(new Map<number, number>());
  const now = useNow(1000, feed.length > 0);
  for (const f of feed) if (!seen.current.has(f.id)) seen.current.set(f.id, Date.now());
  const visible = feed.filter((f) => now - (seen.current.get(f.id) ?? 0) < 5000).slice(-3);
  if (!visible.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 bottom-20 z-30 flex max-w-[16rem] flex-col items-end gap-1.5" aria-live="polite">
      {visible.map((f) => (
        <div key={f.id} className={`rounded-full border px-3 py-1 text-sm font-semibold shadow ${f.tone === 'big' ? 'border-lantern bg-lantern text-on-accent' : f.tone === 'bad' ? 'border-ember/50 bg-raised text-text' : 'border-line bg-raised text-text-2'}`} style={{ animation: 'rise-fade 240ms var(--ease-out)' }}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

function HostControls({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const status = room.room.status;
  const game = room.game as { sync?: { phaseEndsAt: number | null; phase: string } } | null;
  const waitingForHost = Boolean(game?.sync && game.sync.phaseEndsAt === null && game.sync.phase !== 'done');
  const run = async (cmd: Parameters<RoomHandle['host']>[0]) => {
    const ack = await handle.host(cmd);
    if (!ack.ok) toast.error(ack.error.message);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {game?.sync ? (
        <Button variant={waitingForHost ? 'primary' : 'secondary'} size="sm" icon={<FastForward className="size-4" />} onClick={() => run({ cmd: 'next' })} disabled={status !== 'running'}>
          {waitingForHost ? 'Next' : 'Skip ahead'}
        </Button>
      ) : null}
      {status === 'paused' ? (
        <Button size="sm" variant="success" icon={<Play className="size-4" />} onClick={() => run({ cmd: 'resume' })}>
          Resume
        </Button>
      ) : (
        <Button size="sm" icon={<Pause className="size-4" />} onClick={() => run({ cmd: 'pause' })} disabled={status !== 'running'}>
          Pause
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<Square className="size-4" />} onClick={() => setConfirmEnd(true)}>
        End game
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

function GameStage({ room, handle, isHost }: { room: RoomView; handle: RoomHandle; isHost: boolean }) {
  const screens = MODE_SCREENS[room.room.modeId];
  const paused = room.room.status === 'paused';
  if (!screens) return <p className="text-text-2">This mode cannot be shown on this version of Ludora. Reload the page.</p>;
  if (room.game && typeof room.game === 'object' && 'error' in (room.game as object)) {
    return <p className="text-text-2">This screen could not be drawn. The game is still running; it will catch up on the next update.</p>;
  }
  const Screen = isHost ? screens.Host : screens.Player;
  return (
    <div className="relative flex flex-1 flex-col">
      <Suspense fallback={<Spinner />}>
        <Screen view={room.game} room={room} act={handle.act} gameNow={handle.gameNow} paused={paused} />
      </Suspense>
      {paused && !isHost ? (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-[20px] bg-[var(--scrim)] backdrop-blur-sm" role="status">
          <div className="text-center">
            <Pause className="mx-auto mb-2 size-12 text-lantern" />
            <p className="font-display text-3xl font-extrabold text-white">Paused</p>
            <p className="text-white/80">{room.room.hostConnected ? 'The host will be back in a moment.' : 'Waiting for the host to reconnect.'}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RoomPage() {
  const { code = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const stateName = (location.state as { name?: string } | null)?.name;
  const name = useMemo(() => {
    if (stateName) {
      try {
        sessionStorage.setItem(nameKey(code), stateName);
      } catch {
        /* ignore */
      }
      return stateName;
    }
    try {
      return sessionStorage.getItem(nameKey(code)) ?? undefined;
    } catch {
      return undefined;
    }
  }, [code, stateName]);
  const handle = useRoom(code, { name, enabled: !me.isLoading });
  const room = handle.view;

  useEffect(() => {
    if (handle.phase === 'error' && handle.error?.code === 'validation_failed') {
      navigate(`/join/${code}`, { replace: true, state: { error: handle.error.message } });
    }
  }, [handle.phase, handle.error, code, navigate]);

  useEffect(() => {
    document.title = room ? `${room.room.title} | Ludora` : 'Joining… | Ludora';
  }, [room]);

  if (handle.phase === 'error' || handle.phase === 'closed') {
    const msg = handle.phase === 'closed' ? handle.closedMessage : handle.error?.message;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <LogoMark size={56} />
        <h1 className="font-display text-3xl font-extrabold">{handle.phase === 'closed' ? 'This room has closed' : 'Could not join'}</h1>
        <p className="text-text-2">{msg}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/play" className={buttonClass('primary', 'lg')}>
            Enter another code
          </Link>
          <Link to="/" className={buttonClass('secondary', 'lg')}>
            Home
          </Link>
        </div>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <Spinner label="Joining the game" />
          <p className="text-text-2">Joining game {code}…</p>
        </div>
      </main>
    );
  }

  const isHost = room.me.role === 'host';
  const status = room.room.status;
  const leave = async () => {
    if (!isHost) await handle.leave();
    navigate('/');
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-sm">
        <LogoMark size={28} />
        <div className="min-w-0">
          <div className="truncate font-display font-bold leading-tight">{room.room.title}</div>
          <div className="truncate text-xs text-text-3">
            {isHost ? `Hosting game ${room.room.code}` : room.room.solo ? 'Solo game' : `Game ${room.room.code}`}
          </div>
        </div>
        {!handle.online ? (
          <span className="flex items-center gap-1.5 rounded-full bg-ember/15 px-2.5 py-1 text-xs font-semibold text-ember" role="status">
            <WifiOff className="size-3.5" /> Reconnecting…
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {isHost && (status === 'running' || status === 'paused') ? <HostControls room={room} handle={handle} /> : null}
          {!isHost && room.room.solo && (status === 'running' || status === 'paused') ? (
            <Button size="sm" variant="ghost" onClick={() => void handle.host({ cmd: 'end' })}>
              Finish now
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<DoorOpen className="size-4" />} onClick={() => void leave()}>
            {isHost ? 'Leave' : 'Leave game'}
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 py-6 sm:px-6">
        {status === 'lobby' ? isHost ? <HostLobby room={room} handle={handle} /> : <PlayerLobby room={room} handle={handle} /> : null}
        {status === 'running' || status === 'paused' ? <GameStage room={room} handle={handle} isHost={isHost} /> : null}
        {status === 'ended' && room.results ? <Results room={room} handle={handle} isHost={isHost} guest={!me.data?.user || me.data.user.isGuest} /> : null}
      </main>
      {!isHost && !room.room.solo && (status === 'running' || status === 'paused') ? (
        <footer className="border-t border-line px-4 py-2">
          <ReactionBar onReact={(e) => void handle.react(e)} />
        </footer>
      ) : null}
      <FeedToasts feed={room.feed} />
      <ReactionLayer reactions={handle.reactions} />
    </div>
  );
}
