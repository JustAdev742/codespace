import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DoorOpen, Presentation } from 'lucide-react';
import { LogoMark } from '../art/icons.tsx';
import { Button, buttonClass } from '../ui/Button.tsx';
import { Spinner } from '../ui/primitives.tsx';
import { Stage } from '../ui/Stage.tsx';
import { Results } from '../features/room/Results.tsx';
import { ReactionBar, ReactionLayer } from '../features/room/game/Reactions.tsx';
import { Announcer } from '../features/room/game/announce.tsx';
import { MuteButton } from '../features/room/game/MuteButton.tsx';
import { AnswerMemory } from '../features/room/game/answerMemory.tsx';
import { FeedToasts, GameStage, HUD_BAR, HUD_FOOT, HostControls, LiveTag, STAGE, WIDE } from '../features/room/GameStage.tsx';
import { SoundRoleContext, type SoundRole } from '../lib/sound/react.tsx';
import { useRoomMusic } from '../features/room/music.ts';
import '../features/room/stage.css';
import { useLocalRoom, type DemoSetup } from './localRoom.ts';
import { choiceFromParams, readName, resolveChoice, toSetup } from './setup.ts';

/*
 * A demo game: the real game screens over a room inside the page. You play on
 * your screen; Big screen shows the same game as a class would see it on the
 * projector, with the host's controls.
 */

export default function DemoGame() {
  const [params] = useSearchParams();
  const key = params.toString();
  // A new address is a new game.
  const setup = useMemo(() => toSetup(resolveChoice(choiceFromParams(new URLSearchParams(key))).choice, readName()), [key]);
  return <DemoRoom key={key} setup={setup} />;
}

function DemoRoom({ setup }: { setup: DemoSetup }) {
  const navigate = useNavigate();
  const local = useLocalRoom(setup);
  const [big, setBig] = useState(false);
  const handle = big ? local.host : local.player;
  const room = handle?.view ?? null;
  const status = room?.room.status;
  const live = status === 'running' || status === 'paused';
  // Your screen is a solo player's, with the clock and the music; the big screen is the host's.
  const role: SoundRole = big ? 'host' : 'solo';
  useRoomMusic(room, role, handle?.gameNow);
  const pacing = room?.room.pacing ?? null;
  const soundScene = useMemo(() => ({ role, pacing }), [role, pacing]);
  const title = room?.room.title;

  useEffect(() => {
    document.title = title ? `${title} | Ludora demo` : 'Starting the game | Ludora demo';
  }, [title]);

  if (local.error) {
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4 py-10`}>
        <div className="paper stage-card flex w-full max-w-md flex-col items-center gap-4 px-6 py-7 text-center">
          <LogoMark size={56} />
          <h1 className="font-display text-[2.25rem] font-bold">This game could not start</h1>
          <p className="text-text-2">{local.error}</p>
          <Link to="/" className={buttonClass('primary', 'lg')}>
            Choose another game
          </Link>
        </div>
      </Stage>
    );
  }
  if (!room || !handle) {
    return (
      <Stage as="main" className={`${STAGE} items-center justify-center px-4`}>
        <Spinner label="Starting the game" />
      </Stage>
    );
  }

  const withBots = room.players.length > 1;
  // During play the game's title is the page's one heading; the results screen has its own.
  const Title = live ? 'h1' : 'p';
  return (
    <Stage className={STAGE}>
      <SoundRoleContext.Provider value={soundScene}>
        <Announcer>
          {/* The game's HUD bar: what is on, then the controls. */}
          <header className={HUD_BAR}>
            <div className="flex h-14 items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 min-[1600px]:h-20 min-[1600px]:px-8">
              <LogoMark size={30} className="shrink-0 min-[1600px]:size-11" />
              {/* On a phone the game's controls need the header's width; the title stays for screen readers. */}
              <div className={`min-w-0 ${live ? 'max-sm:sr-only' : ''}`}>
                <Title className="truncate font-display text-lg leading-tight font-bold text-text sm:text-xl min-[1600px]:text-[1.75rem]">{room.room.title}</Title>
                <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-text-2 sm:text-sm min-[1600px]:text-base">
                  {status === 'running' ? <LiveTag /> : null}
                  <span className="truncate">Demo, {withBots ? `with ${room.players.length - 1} practice ${room.players.length === 2 ? 'bot' : 'bots'}` : 'on your own'}</span>
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                {big && live ? <HostControls room={room} handle={handle} /> : null}
                {!big && live ? (
                  <Button size="sm" variant="ghost" className="max-sm:h-11" onClick={() => void handle.host({ cmd: 'end' })}>
                    Finish now
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={big ? 'primary' : 'ghost'}
                  className={`max-sm:h-11 max-sm:px-2.5 ${WIDE}`}
                  icon={<Presentation className="size-4" aria-hidden />}
                  aria-pressed={big}
                  title="See the game as a class would on the projector"
                  onClick={() => setBig((b) => !b)}
                >
                  <span className="max-sm:sr-only">Big screen</span>
                </Button>
                <MuteButton className="max-sm:size-11 min-[1600px]:size-12" />
                <Button size="sm" variant="ghost" className={`max-sm:h-11 max-sm:px-2.5 ${WIDE}`} icon={<DoorOpen className="size-4" aria-hidden />} onClick={() => navigate('/')}>
                  <span className="max-sm:sr-only">Leave</span>
                </Button>
              </div>
            </div>
          </header>
          <main className="flex flex-1 flex-col px-3 pt-4 pb-6 sm:px-6 lg:px-10 lg:pt-6">
            {big ? (
              <p className="mx-auto mb-4 max-w-2xl rounded-full bg-white/[0.07] px-4 py-1.5 text-center text-sm font-semibold text-text-2">
                This is the big screen, as a class would see it on the projector. Turn off Big screen to answer.
              </p>
            ) : null}
            {/* Your screen remembers your answers while you look at the big screen, which never knows them. */}
            <AnswerMemory>
              {live && big ? (
                <AnswerMemory key="big-screen">
                  <GameStage room={room} handle={handle} isHost />
                </AnswerMemory>
              ) : null}
              {live && !big ? <GameStage room={room} handle={handle} isHost={false} /> : null}
            </AnswerMemory>
            {status === 'ended' && room.results ? <Results room={room} handle={handle} isHost={big} guest={false} /> : null}
          </main>
          {!big && live && withBots ? (
            <footer className={`${HUD_FOOT} px-3 py-2`}>
              <ReactionBar onReact={(e) => void handle.react(e)} />
            </footer>
          ) : null}
          <FeedToasts feed={room.feed} />
          <ReactionLayer reactions={handle.reactions} big={big} />
        </Announcer>
      </SoundRoleContext.Provider>
    </Stage>
  );
}
