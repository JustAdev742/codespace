import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { DoorOpen, Flag, Hourglass, WifiOff } from 'lucide-react';
import { useFlag, useMe } from '../../lib/session.ts';
import { useRoom } from '../../lib/useRoom.ts';
import { LogoMark, SchoolCrest } from '../../art/icons.tsx';
import { Button, IconButton, buttonClass } from '../../ui/Button.tsx';
import { Dialog, Spinner } from '../../ui/primitives.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { HostLobby, PlayerLobby } from './Lobby.tsx';
import { Results } from './Results.tsx';
import { ReactionBar, ReactionLayer } from './game/Reactions.tsx';
import { ChaosMenuButton, LanternGlow } from '../extras/ExtrasEntry.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';
import { DebugOverlay } from './DebugOverlay.tsx';
import './stage.css';
import { Announcer, useAnnounce } from './game/announce.tsx';
import { FeedToasts, GameStage, HUD_BAR, HUD_FOOT, HostControls, LiveTag, STAGE, WIDE, hostListsFeed } from './GameStage.tsx';
import { MuteButton } from './game/MuteButton.tsx';
import { SoundRoleContext, type SoundRole } from '../../lib/sound/react.tsx';
import { useRoomMusic } from './music.ts';
import { Online } from './game/online.tsx';
import { AnswerMemory } from './game/answerMemory.tsx';
import { FullscreenButton, HostTools } from './host/HostTools.tsx';
import { BrainBreak, StartCountdown } from './host/overlays.tsx';
import { RemoteControls } from './host/RemoteControls.tsx';
import { sound } from '../../lib/sound/engine.ts';
import { BigScreenReads, ConnectionBanner, RotateHint, SoundCues, useWakeLock } from './game/comfort.tsx';
import { ComfortButton } from './game/ComfortDialog.tsx';
import { useAccess } from '../../lib/usePrefs.ts';
import { useModes } from '../../lib/queries.ts';
import { SectionBoundary } from '../../ui/SectionBoundary.tsx';
import { LessonScreen } from '../lessons/room.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { GREETERS } from './game/stage.tsx';
import { Backdrop, useBackdrop } from './game/Backdrop.tsx';
import { PhaseFade } from './game/PhaseFade.tsx';

const nameKey = (code: string) => `ludora.name.${code}`;
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Says when the connection drops and when it is back (not on the first connect). */
function ConnectionNews({ online }: { online: boolean }) {
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (!online) setDropped(true);
  }, [online]);
  useAnnounce(!online ? 'The connection dropped. Reconnecting.' : dropped ? 'Back online.' : null, online);
  return null;
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
  // ?remote=1: the host's phone, as a controls-only remote beside the big screen.
  const [params] = useSearchParams();
  const remote = params.get('remote') === '1';
  const handle = useRoom(code, { name, enabled: !me.isLoading, ...(remote ? { as: 'remote' as const } : {}) });
  const room = handle.view;
  const [reporting, setReporting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const debug = useFlag('debug.overlay');
  // Music plays on the host's screen and in solo games, never on players' phones (see music.ts).
  const role: SoundRole = !room ? 'page' : room.me.role === 'host' ? 'host' : room.room.solo ? 'solo' : 'player';
  useRoomMusic(room, role, handle.gameNow);
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

  // A quiet room: the host silenced every device. This device's own mute setting is left as it was.
  const quiet = Boolean(room?.room.options.quiet);
  useEffect(() => {
    sound.setSilenced(quiet);
    return () => sound.setSilenced(false);
  }, [quiet]);

  // Game screens: little hands (the player's own setting, or the host's for the whole room) makes everything bigger.
  const roomLittle = Boolean(room?.room.options.littleHands) && room?.me.role !== 'host';
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.game = '1';
    const had = root.dataset.little;
    if (roomLittle) root.dataset.little = 'on';
    return () => {
      delete root.dataset.game;
      if (roomLittle && had !== 'on') delete root.dataset.little;
    };
  }, [roomLittle]);
  const live0 = room?.room.status === 'running' || room?.room.status === 'paused';
  useWakeLock(Boolean(live0));
  const { calm } = useAccess();
  const modes = useModes();
  const threeD = modes.data?.modes.find((m) => m.meta.id === room?.room.modeId)?.meta.stage === '3d';
  const [backdrop] = useBackdrop();

  // A new stage of the room (the game starting, the results, Play again) opens at its top: a player scrolled down
  // to a tall game board would otherwise land in the middle of the results, under the title and the podium.
  const stage = room ? (room.room.status === 'paused' ? 'running' : room.room.status) : null;
  useEffect(() => {
    if (stage) window.scrollTo({ top: 0 });
  }, [stage]);

  if (handle.phase === 'error' || handle.phase === 'closed') {
    const msg = handle.phase === 'closed' ? handle.closedMessage : handle.error?.message;
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4 py-10`}>
        <div className="paper stage-card flex w-full max-w-md flex-col items-center gap-4 px-6 py-7 text-center">
          {/* A Glim says it, not an error icon: these are moments in a game, each with a way on. */}
          <Glim art={handle.closedReason === 'removed' || handle.phase === 'error' ? GREETERS[1]! : GREETERS[0]!} size={112} />
          <h1 className="font-display text-[2.25rem] font-bold">{handle.phase !== 'closed' ? 'Could not join' : handle.closedReason === 'removed' ? 'Removed from the game' : handle.closedReason === 'declined' ? 'Not let in' : 'This room has closed'}</h1>
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
  if (handle.phase === 'waiting') {
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4 py-10`}>
        <div className="paper stage-card flex w-full max-w-md flex-col items-center gap-3 px-6 py-7 text-center" role="status">
          <span className="relative">
            <Glim art={GREETERS[2]!} size={112} pose="wave" />
            <Hourglass className="absolute -right-1 bottom-1 size-9 rounded-full bg-lantern p-1.5 text-on-accent" aria-hidden />
          </span>
          <h1 className="font-display text-[2.25rem] leading-tight font-bold">Waiting to be let in</h1>
          <p className="text-text-2">The host lets each player in. Keep this page open; you will join as soon as they do.</p>
          <Link to="/" className={buttonClass('ghost', 'lg')}>
            Cancel
          </Link>
        </div>
      </Stage>
    );
  }
  if (!room) {
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4`}>
        <div className="flex flex-col items-center text-center">
          <Spinner label="Joining the game" />
          <h1 className="font-display text-[2.25rem] font-bold">
            Joining game <span className="tabular">{spaced(code)}</span>
          </h1>
        </div>
      </Stage>
    );
  }

  const isHost = room.me.role === 'host';
  if (isHost && remote) return <RemoteControls room={room} handle={handle} />;
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
  // The big screen's backdrop shows in the lobby and between questions; while a question is up the picture belongs to the game.
  const syncPhase = (room.game as { sync?: { phase?: string } } | null)?.sync?.phase;
  const between = status === 'lobby' || (live && (syncPhase === 'intro' || syncPhase === 'leaderboard'));

  return (
    <Stage className={STAGE}>
      {isHost && !room.room.solo ? <Backdrop id={backdrop} on={between} /> : null}
      <SoundRoleContext.Provider value={soundScene}>
      <Announcer>
      <HostToolsIf on={isHost && !room.room.solo} room={room} handle={handle}>
      <a href="#game" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-s)] focus:bg-lantern focus:px-3 focus:py-2 focus:font-semibold focus:text-on-accent">
        Skip to the game
      </a>
      {/* The game's HUD bar: what is on and where to join, then the controls. */}
      <header className={HUD_BAR}>
        <div className="safe-x flex h-14 [--safe-pad:0.75rem] sm:[--safe-pad:1.25rem] min-[1600px]:[--safe-pad:2rem] items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 min-[1600px]:h-20 min-[1600px]:px-8">
          {/* On a phone, a host mid-game needs the header's width for the game controls. */}
          <LogoMark size={30} className={`shrink-0 min-[1600px]:size-11 ${isHost && live ? 'max-sm:hidden' : ''}`} />
          <SchoolCrest size={30} className={`min-[1600px]:h-11 min-[1600px]:w-auto ${isHost && live ? 'max-sm:hidden' : ''}`} />
          <div className={`min-w-0 ${isHost && live ? 'max-sm:sr-only' : ''}`}>
            <Title className="truncate font-display text-lg leading-tight font-bold text-text sm:text-xl min-[1600px]:text-[1.75rem]">{room.lesson?.screen ? room.lesson.title : room.room.title}</Title>
            <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-text-2 sm:text-sm min-[1600px]:text-base">
              {status === 'running' ? <LiveTag /> : null}
              <span className="truncate">
                {room.room.solo ? (
                  'Solo game'
                ) : (
                  <>
                    {/* On a phone the code alone is enough, so it is never cut short beside a school crest and the LIVE tag. */}
                    {isHost ? 'Hosting game ' : <span className="max-sm:sr-only">Game </span>}
                    <span className="font-display text-[1.15em] font-bold text-text tabular">{spaced(room.room.code)}</span>
                  </>
                )}
              </span>
            </p>
          </div>
          {isHost && live && !room.room.solo && room.room.options.lateJoin && !room.room.locked ? (
            <p className="ml-2 hidden items-center gap-3 rounded-full bg-white/[0.08] py-1 pr-1.5 pl-4 text-base font-semibold text-text-2 xl:flex">
              Join at {window.location.host}/play
              <span className="plate plate-gold text-xl tabular">
                <span>{spaced(room.room.code)}</span>
              </span>
            </p>
          ) : null}
          <ConnectionNews online={handle.online} />
          {!isHost ? <ComfortButton className="max-sm:size-11 min-[1600px]:size-12" /> : null}
          {!handle.online ? (
            // Icon only on a phone, so the room's name keeps its room.
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-ember px-2 py-1 text-xs font-bold text-on-accent sm:px-2.5" title="Reconnecting">
              <WifiOff className="size-3.5" aria-hidden />
              <span className="max-sm:sr-only">Reconnecting…</span>
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!isHost && live ? <ChaosMenuButton room={room} handle={handle} /> : null}
            {isHost && live ? <HostControls room={room} handle={handle} /> : null}
            {!isHost && room.room.solo && live ? (
              <Button size="sm" variant="ghost" onClick={() => void handle.host({ cmd: 'end' })}>
                Finish now
              </Button>
            ) : null}
            {isHost && !room.room.solo ? <FullscreenButton className={`max-sm:size-11 min-[1600px]:size-12 ${live ? 'max-sm:hidden' : ''}`} /> : null}
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
                // On a phone a player's header also holds the comfort settings, sound and report buttons: the
                // door alone stands for leaving there (its name is read out), so the game's title is not cut to a letter.
                <span className="max-sm:sr-only">Leave game</span>
              )}
            </Button>
          </div>
        </div>
      </header>
      <ConnectionBanner online={handle.online} />
      <SoundCues />
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
      <main id="game" className="safe-x flex flex-1 flex-col px-3 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] [--safe-pad:0.75rem] sm:px-6 sm:[--safe-pad:1.5rem] lg:px-10 lg:pt-6 lg:[--safe-pad:2.5rem]">
        <SectionBoundary name="the game screen" resetKey={status}>
        <PhaseFade phase={stage ?? 'none'}>
        {/* Lessons: a step that is not a game (an info slide, a discussion, the end) shows instead of the lobby. */}
        {status === 'lobby' && room.lesson?.screen ? <LessonScreen room={room} handle={handle} isHost={isHost} /> : null}
        {status === 'lobby' && !room.lesson?.screen ? isHost ? <HostLobby room={room} handle={handle} /> : <PlayerLobby room={room} handle={handle} /> : null}
        {live && !isHost ? <RotateHint on={threeD} /> : null}
        {live ? (
          <Online.Provider value={handle.online}>
            <BigScreenReads.Provider value={isHost && Boolean(room.room.options.readAloud)}>
              <AnswerMemory>
                <GameStage room={room} handle={handle} isHost={isHost} />
              </AnswerMemory>
            </BigScreenReads.Provider>
          </Online.Provider>
        ) : null}
        {status === 'ended' && room.results ? <Results room={room} handle={handle} isHost={isHost} guest={!me.data?.user || me.data.user.isGuest} /> : null}
        </PhaseFade>
        </SectionBoundary>
      </main>
      {!isHost && !room.room.solo && live && room.room.options.reactions && !calm ? (
        <footer className={`${HUD_FOOT} px-3 py-2`}>
          <ReactionBar onReact={(e) => void handle.react(e)} />
        </footer>
      ) : null}
      {/* In the host's lobby each arrival already slides in as a card, and toasts in the corner would sit over the crowd. */}
      <FeedToasts feed={room.feed} quiet={isHost && (status === 'lobby' || (live && hostListsFeed(room.room.modeId)))} overHeader={isHost ? null : room.room.solo ? 'solo' : 'player'} />
      {calm ? null : <ReactionLayer reactions={handle.reactions} big={isHost} />}
      <LanternGlow handle={handle} />
      {debug ? <DebugOverlay handle={handle} /> : null}
      {status === 'lobby' && !room.room.solo ? <StartCountdown handle={handle} isHost={isHost} /> : null}
      {live ? <BrainBreak handle={handle} isHost={isHost} /> : null}
      </HostToolsIf>
      </Announcer>
      </SoundRoleContext.Provider>
    </Stage>
  );
}

/** The host's panels, menu and shortcuts around the page; players and solo games go without. */
function HostToolsIf({ on, room, handle, children }: { on: boolean; room: Parameters<typeof HostTools>[0]['room']; handle: Parameters<typeof HostTools>[0]['handle']; children: ReactNode }) {
  return on ? (
    <HostTools room={room} handle={handle} enabled>
      {children}
    </HostTools>
  ) : (
    <>{children}</>
  );
}
