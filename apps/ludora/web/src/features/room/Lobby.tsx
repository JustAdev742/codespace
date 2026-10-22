import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bot, Copy, Lock, LockOpen, Shuffle, UserMinus, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomPlayerView, RoomView, TeamView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Glim, type GlimPose } from '../../art/glim/Glim.tsx';
import { Button } from '../../ui/Button.tsx';
import { ReactionBar } from './game/Reactions.tsx';
import { GREETERS, NameTag, Pill, PlayerGlim, SIGN, StagePanel, motionOK } from './game/stage.tsx';
import { useAnnounce } from './game/announce.tsx';

/** One column per team on a wide screen, up to what fits. */
const TEAM_COLS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4', 5: 'md:grid-cols-3', 6: 'md:grid-cols-3' };

/**
 * Glims get smaller as the crowd grows, so a whole class still fits on one projector screen.
 * The height counts as well as the width: a 1366 by 768 projector is short for its width.
 */
function seatSize(n: number, inTeam: boolean): string {
  if (inTeam) return n <= 6 ? 'clamp(3.5rem, min(5.6vw, 9vh), 6.5rem)' : n <= 12 ? 'clamp(3rem, min(4.6vw, 7vh), 5.5rem)' : 'clamp(2.75rem, min(3.6vw, 5.5vh), 4.25rem)';
  if (n <= 6) return 'clamp(5.5rem, min(9.5vw, 17vh), 11rem)';
  if (n <= 12) return 'clamp(4.25rem, min(7vw, 12vh), 8.5rem)';
  if (n <= 24) return 'clamp(3.5rem, min(5.4vw, 8.5vh), 6.5rem)';
  return 'clamp(3rem, min(4vw, 6.5vh), 5rem)';
}

/** How long a newcomer waves hello before settling into the crowd. */
const WAVE_MS = 4000;

/**
 * One player in the lobby crowd: their Glim, a paper name tag, and a remove button for the host. Newcomers wave as they arrive.
 * A seat grows to fit its name, up to about twice the Glim's width, before the name is shortened. Bots and players who
 * dropped out wear a small badge on their Glim rather than an extra line, so a full class keeps to one screen.
 */
function Seat({ p, onKick, delay, fresh }: { p: RoomPlayerView; onKick?: (() => void) | undefined; delay: number; fresh: boolean }) {
  const [waving, setWaving] = useState(fresh);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setWaving(false), WAVE_MS);
    return () => clearTimeout(t);
  }, [fresh]);
  return (
    <li className="group relative flex max-w-[max(calc(var(--seat)*2.1),9.5rem)] min-w-[max(calc(var(--seat)*1.3),6.5rem)] flex-col items-center gap-1.5" style={motionOK() ? { animation: `stage-arrive 560ms var(--ease-spring) ${delay}ms both` } : undefined}>
      <span className="relative">
        <PlayerGlim avatar={p.avatar} seed={p.id} size={128} pose={waving ? 'wave' : 'idle'} className={`size-[var(--seat)] ${p.connected ? '' : 'opacity-45 grayscale'}`} />
        {p.isBot || !p.connected ? (
          <span
            className={`absolute -right-1 bottom-0 grid size-[max(1.6rem,calc(var(--seat)*0.3))] place-items-center rounded-full border-2 border-ink shadow-[0_2px_0_var(--ink)] ${p.connected ? 'bg-dusk text-on-accent' : 'paper'}`}
            title={p.connected ? 'Practice bot' : 'Away'}
          >
            {p.connected ? <Bot className="size-[60%]" aria-hidden /> : <WifiOff className="size-[55%]" aria-hidden />}
            <span className="sr-only">{p.connected ? 'Bot' : 'Away'}</span>
          </span>
        ) : null}
      </span>
      <NameTag className="text-[length:clamp(0.9rem,calc(var(--seat)*0.15),1.4rem)]">{p.name}</NameTag>
      {onKick ? (
        <button
          type="button"
          onClick={onKick}
          aria-label={`Remove ${p.name}`}
          title={`Remove ${p.name}`}
          className="paper absolute top-0 right-0 grid size-9 place-items-center rounded-full border-2 border-ink opacity-0 shadow-[0_2px_0_var(--ink)] transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <UserMinus className="size-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

/** Players' Glims standing together. Glims already here when the screen opens arrive one after another; newcomers hop in as they join. */
function Crowd({ players, onKick, inTeam = false }: { players: RoomPlayerView[]; onKick?: (p: RoomPlayerView) => void; inTeam?: boolean }) {
  const firstSeen = useRef<Set<string> | null>(null);
  firstSeen.current ??= new Set(players.map((p) => p.id));
  const initial = firstSeen.current;
  return (
    <ul className="flex flex-wrap items-start justify-center gap-x-[calc(var(--seat)*0.18)] gap-y-[calc(var(--seat)*0.16)]" style={{ '--seat': seatSize(players.length, inTeam) } as CSSProperties}>
      {players.map((p, i) => (
        <Seat key={p.id} p={p} onKick={onKick ? () => onKick(p) : undefined} delay={initial.has(p.id) ? Math.min(i, 16) * 55 : 0} fresh={!initial.has(p.id)} />
      ))}
    </ul>
  );
}

function EmptySeats() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-[28px] border-2 border-dashed border-white/25 px-6 py-[clamp(1.5rem,5vh,3.5rem)] text-center">
      <div className="flex items-end gap-[clamp(1rem,3vw,3rem)]" aria-hidden>
        {[0, 1, 2, 1, 0].map((g, i) => (
          <Glim key={i} art={GREETERS[g]!} silhouette size={96} className="size-[clamp(3.5rem,7vw,7rem)]" />
        ))}
      </div>
      <p className="max-w-[40ch] text-[clamp(1.1rem,1.7vw,1.9rem)] font-semibold text-text-2">Waiting for players to join. Their Glims will line up here.</p>
    </div>
  );
}

function TeamCrowd({ team, players, onKick }: { team: TeamView; players: RoomPlayerView[]; onKick: (p: RoomPlayerView) => void }) {
  return (
    <StagePanel as="section" className="overflow-hidden" label={team.name}>
      <div className="flex items-center gap-3 border-b-[3px] border-ink px-4 py-2.5 text-on-accent" style={{ background: `hsl(${team.hue} 80% 64%)` }}>
        <h3 className="min-w-0 flex-1 truncate font-display text-[clamp(1.25rem,1.8vw,2rem)] font-extrabold">{team.name}</h3>
        <span className="font-display text-[clamp(1.1rem,1.5vw,1.6rem)] font-extrabold tabular">{players.length}</span>
      </div>
      <div className="p-4">{players.length ? <Crowd players={players} onKick={onKick} inTeam /> : <p className="py-4 text-center font-semibold text-text-2">Nobody yet</p>}</div>
    </StagePanel>
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
  const kick = (p: RoomPlayerView) => void run('kick', { cmd: 'kick', playerId: p.id });
  const humans = room.players.filter((p) => !p.isBot).length;
  const bots = room.players.length - humans;
  const teams = room.room.teams;
  const code = room.room.code;
  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-1 flex-col gap-[clamp(1rem,3vh,2.25rem)]">
      <section className="grid grid-cols-1 gap-[clamp(1rem,2vw,2.25rem)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="paper stage-card flex flex-col justify-center gap-[clamp(0.25rem,1vh,0.75rem)] px-[clamp(1.25rem,3vw,3.5rem)] py-[clamp(1rem,3vh,2.5rem)]">
          <p className="text-[clamp(1.1rem,1.7vw,2rem)] font-semibold text-text-2">
            Go to <span className="font-display font-extrabold text-text">{location.host}/play</span> and enter
          </p>
          <p className="font-display text-[clamp(4.25rem,10vw,12.5rem)] leading-[0.95] font-extrabold tracking-[0.02em] text-text tabular">
            <span className="sr-only">Game code {code.split('').join(' ')}</span>
            <span aria-hidden>
              {code.slice(0, 3)}
              <span className="inline-block w-[0.28em]" />
              {code.slice(3)}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              icon={<Copy className="size-4" aria-hidden />}
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
            <Button icon={room.room.locked ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />} onClick={() => run('lock', { cmd: 'lock', locked: !room.room.locked })} loading={busy === 'lock'}>
              {room.room.locked ? 'Room locked' : 'Lock room'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-2">
            <h1 className={`font-display text-[clamp(2.5rem,4.2vw,5rem)] leading-none font-extrabold ${SIGN}`}>{room.room.title}</h1>
            <p className="text-[clamp(1.15rem,1.6vw,1.8rem)] font-semibold text-text-2">{room.room.setTitle}</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-[clamp(0.95rem,1.15vw,1.3rem)]" aria-label="Game settings">
              <li>
                <Pill>{room.room.questionCount} questions</Pill>
              </li>
              <li>
                <Pill>{room.room.common.questionTimeSec} s per question</Pill>
              </li>
              {room.room.common.timeLimitSec ? (
                <li>
                  <Pill>{Math.round(room.room.common.timeLimitSec / 60)} min game</Pill>
                </li>
              ) : null}
              {teams.length ? (
                <li>
                  <Pill>{teams.length} teams</Pill>
                </li>
              ) : null}
              {room.room.options.generatedNames ? (
                <li>
                  <Pill>Generated names</Pill>
                </li>
              ) : null}
            </ul>
          </div>
          <Button variant="primary" size="2xl" className="h-[clamp(4.5rem,11vh,7rem)]! w-full text-[clamp(1.75rem,2.7vw,3.25rem)]!" disabled={room.players.length === 0} loading={busy === 'start'} onClick={() => run('start', { cmd: 'start' })}>
            Start game
          </Button>
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]" aria-labelledby="lobby-crowd">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h2 id="lobby-crowd" className={`font-display text-[clamp(1.5rem,2.3vw,2.75rem)] font-extrabold ${SIGN}`}>
            {room.players.length === 0 ? 'Nobody here yet' : `${humans} ${humans === 1 ? 'player' : 'players'}${bots ? ` and ${bots} practice ${bots === 1 ? 'bot' : 'bots'}` : ''}`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {teams.length ? (
              <Button icon={<Shuffle className="size-4" aria-hidden />} onClick={() => run('shuffle', { cmd: 'shuffleTeams' })}>
                Shuffle teams
              </Button>
            ) : null}
            <Button icon={<Bot className="size-4" aria-hidden />} onClick={() => run('bots', { cmd: 'addBots', count: 3 })} loading={busy === 'bots'}>
              Add 3 practice bots
            </Button>
            {bots ? (
              <Button onClick={() => run('nobots', { cmd: 'removeBots' })}>
                Remove bots
              </Button>
            ) : null}
          </div>
        </div>
        {room.players.length === 0 ? (
          <EmptySeats />
        ) : teams.length ? (
          <div className={`grid grid-cols-1 gap-4 ${TEAM_COLS[Math.min(teams.length, 6)] ?? 'md:grid-cols-3'}`}>
            {teams.map((t) => (
              <TeamCrowd key={t.id} team={t} players={room.players.filter((p) => p.teamId === t.id)} onKick={kick} />
            ))}
          </div>
        ) : (
          <Crowd players={room.players} onKick={kick} />
        )}
      </section>
    </div>
  );
}

/** The player's own Glim waves hello on arrival, then jumps for joy for a moment whenever they send a reaction. */
function useOwnPose(): [GlimPose, () => void] {
  const [settled, setSettled] = useState(false);
  const [cheerAt, setCheerAt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), WAVE_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!cheerAt) return;
    const t = setTimeout(() => setCheerAt(0), 1200);
    return () => clearTimeout(t);
  }, [cheerAt]);
  return [cheerAt ? 'cheer' : settled ? 'idle' : 'wave', () => setCheerAt(Date.now())];
}

export function PlayerLobby({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const me = room.players.find((p) => p.id === room.me.playerId);
  const team = room.room.teams.find((t) => t.id === room.me.teamId);
  const others = room.players.filter((p) => p.id !== room.me.playerId);
  const shown = others.slice(0, 7);
  const [pose, cheer] = useOwnPose();
  useAnnounce(`You are in! Waiting for ${room.room.hostName} to start.`, 'joined');
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="relative grid place-items-center">
        <span className="absolute size-60 rounded-full bg-[radial-gradient(circle,rgb(255_206_110/0.5)_0%,rgb(255_176_32/0.18)_45%,rgb(255_176_32/0)_70%)]" aria-hidden />
        <PlayerGlim avatar={me?.avatar} seed={room.me.playerId ?? room.me.name ?? 'you'} size={180} bob pose={pose} className="relative" />
      </div>
      <div>
        <h1 className={`font-display text-5xl font-extrabold ${SIGN}`}>You are in!</h1>
        <p className="mt-2 text-xl text-text-2">
          Playing as <span className="font-bold text-text">{room.me.name}</span>
          {team ? (
            <>
              {' '}
              on{' '}
              <span className="rounded-full border-2 border-ink px-2.5 py-0.5 font-bold text-on-accent" style={{ background: `hsl(${team.hue} 80% 65%)` }}>
                {team.name}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="paper stage-card w-full px-5 pt-4 pb-5">
        <p className="font-display text-2xl font-extrabold">{room.room.title}</p>
        <p className="text-text-2">{room.room.setTitle}</p>
        {shown.length ? (
          <div className="mt-3 flex items-end justify-center" aria-hidden>
            {shown.map((p, i) => (
              <span key={p.id} className={i ? '-ml-2.5' : ''} style={motionOK() ? { animation: 'stage-arrive 520ms var(--ease-spring) both' } : undefined}>
                <PlayerGlim avatar={p.avatar} seed={p.id} size={46} />
              </span>
            ))}
            {others.length > shown.length ? <span className="mb-2 ml-1.5 font-display text-lg font-extrabold">+{others.length - shown.length}</span> : null}
          </div>
        ) : null}
        <p className="mt-3 font-semibold text-text-2">
          Waiting for {room.room.hostName} to start. {room.players.length} in the room.
        </p>
      </div>
      <ReactionBar
        onReact={(e) => {
          void handle.react(e);
          cheer();
        }}
      />
    </div>
  );
}
