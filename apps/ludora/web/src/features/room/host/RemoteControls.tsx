import { useState } from 'react';
import { Link } from 'react-router';
import { Coffee, FastForward, Lock, LockOpen, Pause, Play, RotateCcw, Square, Timer, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { HostCommand, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { Button, buttonClass } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { Stage } from '../../../ui/Stage.tsx';
import { LogoMark } from '../../../art/icons.tsx';
import { STAGE, HUD_BAR } from '../GameStage.tsx';
import { StagePanel } from '../game/stage.tsx';
import { PlayersList, StillAnsweringList } from './panels.tsx';
import { serverClock } from './tools.ts';
import { useNow } from '../../../lib/useNow.ts';

/*
 * The host's phone as a remote: the controls without the game, while the laptop stays the big
 * screen. Opened from "Use your phone as a remote" (a QR code); the server lets in only the
 * host's own account. Real names show here even when the big screen hides them.
 */

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function RemoteControls({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const status = room.room.status;
  const live = status === 'running' || status === 'paused';
  const sync = (room.game as { sync?: { phase: string; phaseEndsAt: number | null } } | null)?.sync;
  const waitingForHost = Boolean(sync && sync.phaseEndsAt === null && sync.phase !== 'done');
  useNow(500, Boolean(room.room.startsAt || room.room.breakEndsAt));
  const now = serverClock(room, handle.receivedAt)();
  const secs = (t: number | null | undefined) => (t ? Math.max(0, Math.ceil((t - now) / 1000)) : null);
  const send = async (cmd: HostCommand) => {
    const ack = await handle.host(cmd);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const pending = room.host?.pending ?? [];
  return (
    <Stage className={STAGE}>
      <header className={HUD_BAR}>
        <div className="flex h-14 items-center gap-2.5 px-3">
          <LogoMark size={28} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg leading-tight font-bold">Remote: {room.room.title}</h1>
            <p className="text-xs font-semibold text-text-2">
              Game <span className="font-display text-[1.15em] font-bold text-text tabular">{spaced(room.room.code)}</span>
              {!handle.online ? ' · Reconnecting…' : ''}
            </p>
          </div>
          <Link to={`/room/${room.room.code}`} className={buttonClass('ghost', 'sm')}>
            Big screen
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-3 pt-4 pb-8">
        <p className="text-center font-semibold text-text-2" role="status">
          {status === 'lobby'
            ? room.room.startsAt
              ? `Starting in ${secs(room.room.startsAt)}`
              : `${room.players.filter((p) => !p.isBot).length} in the lobby`
            : room.room.breakEndsAt
              ? `Brain break: ${secs(room.room.breakEndsAt)} seconds left`
              : status === 'paused'
                ? 'Paused'
                : status === 'running'
                  ? 'The game is on'
                  : 'The game is over'}
        </p>

        {status === 'lobby' ? (
          <div className="grid grid-cols-1 gap-2">
            {room.room.startsAt ? (
              <Button size="xl" onClick={() => void send({ cmd: 'cancelStart' })}>
                Cancel the countdown
              </Button>
            ) : (
              <Button size="2xl" variant="primary" disabled={room.players.length === 0} onClick={() => void send({ cmd: 'start' })}>
                Start game
              </Button>
            )}
            <Button size="lg" icon={room.room.locked ? <Lock className="size-5" aria-hidden /> : <LockOpen className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'lock', locked: !room.room.locked })}>
              {room.room.locked ? 'Unlock the room' : 'Lock the room'}
            </Button>
          </div>
        ) : null}

        {live ? (
          <div className="grid grid-cols-2 gap-2">
            {sync ? (
              <Button size="2xl" variant={waitingForHost ? 'primary' : 'secondary'} className="col-span-2" icon={<FastForward className="size-6" aria-hidden />} disabled={status !== 'running'} onClick={() => void send({ cmd: 'next' })}>
                {waitingForHost ? 'Next' : 'Skip ahead'}
              </Button>
            ) : null}
            {status === 'paused' ? (
              <Button size="xl" variant="success" icon={<Play className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'resume' })}>
                Resume
              </Button>
            ) : (
              <Button size="xl" icon={<Pause className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'pause' })}>
                Pause
              </Button>
            )}
            {room.room.pacing === 'host' ? (
              <Button size="xl" icon={<Timer className="size-5" aria-hidden />} disabled={!room.host?.canAddTime} onClick={() => void send({ cmd: 'addTime', seconds: 10 })}>
                +10 s
              </Button>
            ) : null}
            {room.room.breakEndsAt ? (
              <Button size="lg" className="col-span-2" onClick={() => void send({ cmd: 'endBreak' })}>
                End the brain break
              </Button>
            ) : (
              <>
                <Button size="lg" icon={<Coffee className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'break', seconds: 30 })}>
                  Break 30 s
                </Button>
                <Button size="lg" icon={<Coffee className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'break', seconds: 60 })}>
                  Break 1 min
                </Button>
              </>
            )}
            <Button size="lg" variant="ghost" className="col-span-2" icon={<Square className="size-5" aria-hidden />} onClick={() => setConfirmEnd(true)}>
              End game
            </Button>
          </div>
        ) : null}

        {status === 'ended' ? (
          <Button size="xl" variant="primary" icon={<RotateCcw className="size-5" aria-hidden />} onClick={() => void send({ cmd: 'restart' })}>
            Play again with the same players
          </Button>
        ) : null}

        {pending.length ? (
          <StagePanel as="section" className="p-4" label="Waiting to come in">
            <h2 className="mb-2 font-display text-xl font-bold">Waiting to come in</h2>
            <ul className="flex flex-col gap-1.5">
              {pending.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <Button size="sm" variant="success" icon={<UserCheck className="size-4" aria-hidden />} onClick={() => void send({ cmd: 'admit', playerId: p.id, allow: true })} aria-label={`Let ${p.name} in`}>
                    Let in
                  </Button>
                  <Button size="sm" variant="ghost" icon={<UserX className="size-4" aria-hidden />} onClick={() => void send({ cmd: 'admit', playerId: p.id, allow: false })} aria-label={`Turn ${p.name} away`}>
                    Turn away
                  </Button>
                </li>
              ))}
            </ul>
          </StagePanel>
        ) : null}

        {live ? (
          <StagePanel as="section" className="p-4" label="Still answering">
            <h2 className="mb-2 font-display text-xl font-bold">Still answering</h2>
            <StillAnsweringList room={room} handle={handle} />
          </StagePanel>
        ) : null}

        <StagePanel as="section" className="p-4" label="Players">
          <h2 className="mb-2 font-display text-xl font-bold">Players</h2>
          <PlayersList room={room} handle={handle} />
        </StagePanel>
      </main>
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
                void send({ cmd: 'end' });
              }}
            >
              End game
            </Button>
          </>
        }
      />
    </Stage>
  );
}
