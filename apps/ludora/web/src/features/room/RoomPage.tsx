import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { DoorOpen, FastForward, Flag, Pause, Play, Square, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useFlag, useMe } from '../../lib/session.ts';
import { useRoom, type RoomHandle } from '../../lib/useRoom.ts';
import { useNow } from '../../lib/useNow.ts';
import { LogoMark } from '../../art/icons.tsx';
import { Button, IconButton, buttonClass } from '../../ui/Button.tsx';
import { Dialog, Spinner } from '../../ui/primitives.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { HostLobby, PlayerLobby } from './Lobby.tsx';
import { Results } from './Results.tsx';
import { MODE_SCREENS } from './modes/registry.ts';
import { ReactionBar, ReactionLayer } from './game/Reactions.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';
import { DebugOverlay } from './DebugOverlay.tsx';
import type { RoomView } from '@ludora/shared';
import './stage.css';
import { Announcer, useAnnounce } from './game/announce.tsx';
import { MuteButton } from './game/MuteButton.tsx';
import { SoundRoleContext, useMusic, type SoundRole } from '../../lib/sound/react.tsx';
import { AnswerMemory } from './game/answerMemory.tsx';
import { Online } from './game/online.tsx';

const nameKey = (code: string) => `ludora.name.${code}`;
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/*
 * The room sits on the stage in both themes. The stage clips sideways overflow
 * (bursts and drifting lanterns) without becoming a scroll container, so the
 * header can stay pinned while long screens scroll.
 */
const STAGE = 'flex min-h-dvh flex-col overflow-x-clip! overflow-y-visible!';

/** Recent game events (finishes, eliminations) as short-lived paper tags. */
function FeedToasts({ feed }: { feed: RoomView['feed'] }) {
  const seen = useRef(new Map<number, number>());
  const now = useNow(1000, feed.length > 0);
  for (const f of feed) if (!seen.current.has(f.id)) seen.current.set(f.id, Date.now());
  const visible = feed.filter((f) => now - (seen.current.get(f.id) ?? 0) < 5000).slice(-3);
  if (!visible.length) return null;
  return (
    // On a phone the news drops in under the header, clear of the answers in the thumb zone; on the projector it sits bottom right.
    <div className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-30 flex flex-col items-center gap-1.5 sm:top-[4.75rem] lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-6 lg:max-w-[24rem] lg:items-end" aria-live="polite">
      {visible.map((f) => (
        <div
          key={f.id}
          className={`max-w-[22rem] rounded-[16px] border-2 border-ink px-3.5 py-1.5 text-sm leading-snug font-bold shadow-[0_3px_0_var(--ink)] lg:max-w-none lg:text-lg ${f.tone === 'big' ? 'bg-lantern text-on-accent' : f.tone === 'good' ? 'bg-glim text-on-accent' : f.tone === 'bad' ? 'bg-ember text-on-accent' : 'paper'}`}
          style={{ animation: 'rise-fade 240ms var(--ease-out)' }}
        >
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** Header controls read from the back of the room on a big projector: taller, with larger text, from 1600 pixels wide. */
const WIDE = 'min-[1600px]:h-12 min-[1600px]:px-4 min-[1600px]:text-lg';

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
    <div className="flex items-center gap-1.5 sm:gap-2">
      {game?.sync ? (
        // The one button that moves a host-paced game on: big and lantern-lit when the room is waiting for it.
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

/** Says when the connection drops and when it is back (not on the first connect). */
function ConnectionNews({ online }: { online: boolean }) {
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (!online) setDropped(true);
  }, [online]);
  useAnnounce(!online ? 'The connection dropped. Reconnecting.' : dropped ? 'Back online.' : null, online);
  return null;
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
      <PauseNews paused={paused} hostConnected={room.room.hostConnected} />
      <AnswerMemory>
        <Suspense fallback={<Spinner />}>
          <Screen view={room.game} room={room} act={handle.act} gameNow={handle.gameNow} paused={paused} />
        </Suspense>
      </AnswerMemory>
      {paused && isHost ? (
        // The host screen is on the projector: tell the room, but leave the question readable.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
          <span className="paper stage-card flex items-center gap-2 px-5 py-2 font-display text-[clamp(1.25rem,2vw,2rem)] font-extrabold">
            <Pause className="size-[1.1em]" aria-hidden /> Paused
          </span>
        </div>
      ) : null}
      {paused && !isHost ? (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-[24px] bg-[rgb(12_8_40/0.62)] backdrop-blur-sm">
          <div className="paper stage-card mx-4 flex max-w-xs flex-col items-center gap-1 px-6 py-5 text-center">
            <Pause className="mb-1 size-10" aria-hidden />
            <p className="font-display text-3xl font-extrabold">Paused</p>
            <p className="text-text-2">{room.room.hostConnected ? 'The host will be back in a moment.' : 'Waiting for the host to reconnect.'}</p>
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
  const [reporting, setReporting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const debug = useFlag('debug.overlay');
  // Music plays on the host's screen and in solo games, never on players' phones: lobby music while
  // people arrive, then the game loop. It rests while the game is paused and stops for the results.
  const role: SoundRole = !room ? 'page' : room.me.role === 'host' ? 'host' : room.room.solo ? 'solo' : 'player';
  const roomStatus = room?.room.status;
  useMusic(role === 'host' && roomStatus === 'lobby' ? 'lobby' : (role === 'host' || role === 'solo') && roomStatus === 'running' ? 'game' : null);
  const pacing = room?.room.pacing ?? null;
  const soundScene = useMemo(() => ({ role, pacing }), [role, pacing]);

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
      <Stage as="main" className={`${STAGE} items-center justify-center px-4 py-10`}>
        <div className="paper stage-card flex w-full max-w-md flex-col items-center gap-4 px-6 py-7 text-center">
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
        </div>
      </Stage>
    );
  }
  if (!room) {
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4`}>
        <div className="flex flex-col items-center text-center">
          <Spinner label="Joining the game" />
          <h1 className="font-display text-3xl font-extrabold">Joining game {spaced(code)}</h1>
        </div>
      </Stage>
    );
  }

  const isHost = room.me.role === 'host';
  const status = room.room.status;
  const live = status === 'running' || status === 'paused';
  const leave = async () => {
    if (!isHost) await handle.leave();
    navigate('/');
  };
  // Leaving mid-game is easy to do by accident and costs something, so it asks first:
  // a player starts again from zero, and players wait on a host who has gone.
  const othersHere = room.players.some((p) => !p.isBot && p.id !== room.me.playerId);
  const askFirst = isHost ? (live || othersHere) && !room.room.solo : live && !room.room.solo;
  // The lobby and results screens carry their own main heading; during play the room's title is the page's one heading.
  const Title = live ? 'h1' : 'p';

  return (
    <Stage className={STAGE} lanterns="game">
      <SoundRoleContext.Provider value={soundScene}>
      <Announcer>
      <header className="sticky top-0 z-30 border-b border-white/12 bg-[rgb(16_10_58/0.55)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 min-[1600px]:h-20 min-[1600px]:px-8">
          {/* On a phone, a host mid-game needs the header's width for the game controls. */}
          <LogoMark size={30} className={`shrink-0 min-[1600px]:size-11 ${isHost && live ? 'max-sm:hidden' : ''}`} />
          <div className={`min-w-0 ${isHost && live ? 'max-sm:sr-only' : ''}`}>
            <Title className="truncate font-display text-base leading-tight font-extrabold text-text sm:text-lg min-[1600px]:text-2xl">{room.room.title}</Title>
            <p className="truncate text-xs font-semibold text-text-2 sm:text-sm min-[1600px]:text-base">
              {isHost ? `Hosting game ${spaced(room.room.code)}` : room.room.solo ? 'Solo game' : `Game ${spaced(room.room.code)}`}
            </p>
          </div>
          {isHost && live && !room.room.solo && room.room.options.lateJoin && !room.room.locked ? (
            <p className="ml-2 hidden items-center gap-2 rounded-full border border-white/15 bg-[rgb(17_10_62/0.62)] py-1 pr-1.5 pl-4 text-base font-semibold text-text-2 xl:flex">
              Join at {window.location.host}/play
              <span className="rounded-full bg-white px-3 py-0.5 font-display text-xl font-extrabold text-[#1d1846] tabular">{spaced(room.room.code)}</span>
            </p>
          ) : null}
          <ConnectionNews online={handle.online} />
          {!handle.online ? (
            // Icon only on a phone, so the room's name keeps its room.
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-ember px-2 py-1 text-xs font-bold text-on-accent sm:px-2.5" title="Reconnecting">
              <WifiOff className="size-3.5" aria-hidden />
              <span className="max-sm:sr-only">Reconnecting…</span>
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isHost && live ? <HostControls room={room} handle={handle} /> : null}
            {!isHost && room.room.solo && live ? (
              <Button size="sm" variant="ghost" onClick={() => void handle.host({ cmd: 'end' })}>
                Finish now
              </Button>
            ) : null}
            <MuteButton className="max-sm:size-11 min-[1600px]:size-12" />
            {!room.room.solo ? (
              // A host running a live game from a phone needs the header for the game controls; Report is there in the lobby and on bigger screens.
              <IconButton label="Report a problem in this room" size="sm" className={`max-sm:size-11 min-[1600px]:size-12 ${isHost && live ? 'max-sm:hidden' : ''}`} onClick={() => setReporting(true)}>
                <Flag className="size-4" aria-hidden />
              </IconButton>
            ) : null}
            <Button size="sm" variant="ghost" className={`max-sm:ml-1 max-sm:h-11 ${WIDE}`} icon={<DoorOpen className="size-4" aria-hidden />} onClick={() => (askFirst ? setConfirmLeave(true) : void leave())}>
              {/* A host running a game from a phone needs the room for the game controls, and a solo game's title needs it
                  beside Finish now: the label goes to screen readers only. */}
              {isHost && live ? (
                <span className="max-sm:sr-only">Leave</span>
              ) : isHost ? (
                'Leave'
              ) : room.room.solo && live ? (
                <span className="max-sm:sr-only">Leave game</span>
              ) : (
                // On the narrowest phones "game" is left to screen readers, so the room code keeps its room.
                <>
                  Leave<span className="max-[399px]:sr-only"> game</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>
      <Dialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        size="sm"
        title={isHost ? (live ? 'Leave the game for now?' : 'Leave the lobby?') : 'Leave this game?'}
        description={
          isHost
            ? live
              ? `${room.room.pacing === 'host' ? 'Players see the game paused until you come back.' : 'Players keep playing while you are away.'} You can return to it from the Host page. If you are away for 10 minutes, the game ends.`
              : 'The room stays open, and you can come back to it from the Host page.'
            : 'You leave for good: if you join again, you start from zero points.'
        }
        footer={
          <>
            <Button onClick={() => setConfirmLeave(false)}>{isHost ? 'Stay' : 'Keep playing'}</Button>
            <Button variant="danger" icon={<DoorOpen className="size-4" aria-hidden />} onClick={() => void leave()}>
              {isHost ? (live ? 'Leave for now' : 'Leave') : 'Leave game'}
            </Button>
          </>
        }
      />
      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        target={{ type: 'room', id: room.room.code, label: 'a problem in this room' }}
        people={[...new Set([...(isHost ? [] : [room.room.hostName]), ...room.players.filter((p) => !p.isBot && p.id !== room.me.playerId).map((p) => p.name)])]}
      />
      <main className="flex flex-1 flex-col px-3 pt-4 pb-6 sm:px-6 lg:px-10 lg:pt-6">
        {status === 'lobby' ? isHost ? <HostLobby room={room} handle={handle} /> : <PlayerLobby room={room} handle={handle} /> : null}
        {live ? (
          <Online.Provider value={handle.online}>
            <GameStage room={room} handle={handle} isHost={isHost} />
          </Online.Provider>
        ) : null}
        {status === 'ended' && room.results ? <Results room={room} handle={handle} isHost={isHost} guest={!me.data?.user || me.data.user.isGuest} /> : null}
      </main>
      {!isHost && !room.room.solo && live ? (
        <footer className="border-t border-white/12 bg-[rgb(16_10_58/0.45)] px-3 py-2">
          <ReactionBar onReact={(e) => void handle.react(e)} />
        </footer>
      ) : null}
      <FeedToasts feed={room.feed} />
      <ReactionLayer reactions={handle.reactions} big={isHost} />
      {debug ? <DebugOverlay handle={handle} /> : null}
      </Announcer>
      </SoundRoleContext.Provider>
    </Stage>
  );
}
