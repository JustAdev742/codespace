import { useState } from 'react';
import { Bot, Copy, Lock, LockOpen, Shuffle, UserMinus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomPlayerView, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { Badge } from '../../ui/primitives.tsx';
import { ReactionBar } from './game/Reactions.tsx';

function PlayerChip({ p, onKick, you }: { p: RoomPlayerView; onKick?: () => void; you?: boolean }) {
  return (
    <li className={`group flex items-center gap-2 rounded-[14px] border px-2 py-1.5 ${you ? 'border-lantern bg-dusk/20' : 'border-line bg-raised'} ${p.connected ? '' : 'opacity-50'}`} style={{ animation: 'pop-in 240ms var(--ease-spring)' }}>
      {p.avatar ? <Glim art={p.avatar.art} accessories={p.avatar.accessories} size={36} /> : null}
      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      {p.isBot ? <Badge>Bot</Badge> : null}
      {!p.connected ? <span className="text-xs text-text-3">away</span> : null}
      {onKick ? (
        <IconButton label={`Remove ${p.name}`} size="sm" onClick={onKick} className="opacity-60 group-hover:opacity-100">
          <UserMinus className="size-4" />
        </IconButton>
      ) : null}
    </li>
  );
}

export function HostLobby({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [busy, setBusy] = useState<string | null>(null);
  const joinUrl = `${location.origin}/join/${room.room.code}`;
  const run = async (label: string, cmd: Parameters<RoomHandle['host']>[0]) => {
    setBusy(label);
    const ack = await handle.host(cmd);
    setBusy(null);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const humans = room.players.filter((p) => !p.isBot);
  const teams = room.room.teams;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="grid grid-cols-1 gap-6 rounded-[24px] border border-line bg-raised p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold text-text-2">
            Go to <span className="font-display text-text">{location.host}/play</span> and enter
          </p>
          <div className="font-display text-7xl font-extrabold tracking-[0.08em] text-text tabular sm:text-8xl" aria-label={`Game code ${room.room.code.split('').join(' ')}`}>
            {room.room.code.slice(0, 3)} {room.room.code.slice(3)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Copy className="size-4" />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(joinUrl);
                  toast.success('Invite link copied');
                } catch {
                  toast.error(joinUrl);
                }
              }}
            >
              Copy invite link
            </Button>
            <Button size="sm" icon={room.room.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />} onClick={() => run('lock', { cmd: 'lock', locked: !room.room.locked })} loading={busy === 'lock'}>
              {room.room.locked ? 'Room locked' : 'Lock room'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold">{room.room.title}</h1>
            <p className="text-text-2">{room.room.setTitle}</p>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              <Badge tone="violet">{room.room.questionCount} questions</Badge>
              <Badge>{room.room.common.questionTimeSec} s per question</Badge>
              {room.room.common.timeLimitSec ? <Badge>{Math.round(room.room.common.timeLimitSec / 60)} min game</Badge> : null}
              {teams.length ? <Badge tone="sky">{teams.length} teams</Badge> : null}
              {room.room.options.generatedNames ? <Badge tone="mint">Generated names</Badge> : null}
            </ul>
          </div>
          <Button variant="primary" size="xl" disabled={room.players.length === 0} loading={busy === 'start'} onClick={() => run('start', { cmd: 'start' })}>
            Start game
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Users className="size-6 text-text-3" />
            {humans.length} {humans.length === 1 ? 'player' : 'players'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {teams.length ? (
              <Button size="sm" icon={<Shuffle className="size-4" />} onClick={() => run('shuffle', { cmd: 'shuffleTeams' })}>
                Shuffle teams
              </Button>
            ) : null}
            <Button size="sm" icon={<Bot className="size-4" />} onClick={() => run('bots', { cmd: 'addBots', count: 3 })} loading={busy === 'bots'}>
              Add 3 practice bots
            </Button>
            {room.players.some((p) => p.isBot) ? (
              <Button size="sm" variant="ghost" onClick={() => run('nobots', { cmd: 'removeBots' })}>
                Remove bots
              </Button>
            ) : null}
          </div>
        </div>
        {room.players.length === 0 ? (
          <p className="rounded-[16px] border-2 border-dashed border-line-strong px-6 py-10 text-center text-lg text-text-2">Waiting for players to join.</p>
        ) : teams.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((t) => (
              <div key={t.id} className="rounded-[16px] border border-line p-3" style={{ boxShadow: `inset 0 4px 0 hsl(${t.hue} 80% 60%)` }}>
                <h3 className="mb-2 font-display text-lg font-bold">{t.name}</h3>
                <ul className="flex flex-col gap-2">
                  {room.players
                    .filter((p) => p.teamId === t.id)
                    .map((p) => (
                      <PlayerChip key={p.id} p={p} onKick={() => run('kick', { cmd: 'kick', playerId: p.id })} />
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {room.players.map((p) => (
              <PlayerChip key={p.id} p={p} onKick={() => run('kick', { cmd: 'kick', playerId: p.id })} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PlayerLobby({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const me = room.players.find((p) => p.id === room.me.playerId);
  const team = room.room.teams.find((t) => t.id === room.me.teamId);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 text-center">
      {me?.avatar ? <Glim art={me.avatar.art} accessories={me.avatar.accessories} size={150} bob /> : null}
      <div>
        <h1 className="font-display text-4xl font-extrabold">You are in!</h1>
        <p className="mt-1 text-lg text-text-2">
          Playing as <span className="font-semibold text-text">{room.me.name}</span>
          {team ? (
            <>
              {' '}on <span className="font-semibold" style={{ color: `hsl(${team.hue} 80% 65%)` }}>{team.name}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="rounded-[18px] border border-line bg-raised px-6 py-4">
        <p className="font-display text-xl font-bold">{room.room.title}</p>
        <p className="text-text-2">{room.room.setTitle}</p>
        <p className="mt-2 text-sm text-text-3" role="status">
          Waiting for {room.room.hostName} to start. {room.players.length} in the room.
        </p>
      </div>
      <ReactionBar onReact={(e) => void handle.react(e)} />
    </div>
  );
}
