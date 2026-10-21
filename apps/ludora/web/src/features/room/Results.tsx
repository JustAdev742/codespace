import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Download, Home, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import type { RewardSummary, RoomView, StandingView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Amount, Badge } from '../../ui/primitives.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { duration, formatNumber, ordinal } from '../../lib/format.ts';
import { PLACE_BG, RankBadge, TeamScores } from './game/Leaderboard.tsx';
import { NameTag, PlayerGlim, avatarOf, motionOK } from './game/stage.tsx';
import { Burst } from '../../art/bursts.tsx';

/** Block heights as a share of the tallest, and when each block starts to rise (ms): third, then second, then first. */
const HEIGHT = [1, 0.72, 0.5];
const RISE_AT = [1300, 700, 150];
const ORDER = ['order-2', 'order-1', 'order-3'];

/**
 * The podium reveal. Each block rises out of the floor, then its Glim, name
 * and score land on top, third place first; the winner hops and their victory
 * effect bursts. With reduced motion everything is simply there.
 */
function Podium({ room, big }: { room: RoomView; big: boolean }) {
  const top = room.results!.standings.slice(0, 3);
  const moving = motionOK();
  const vars = { '--podium': big ? 'clamp(8.5rem, 27vh, 19rem)' : '8.5rem' } as CSSProperties;
  return (
    <ol className="flex w-full items-end justify-center gap-[clamp(0.5rem,1.6vw,1.75rem)]" aria-label="Podium" style={vars}>
      {top.map((s, place) => {
        const a = avatarOf(room.players, s.playerId);
        const first = place === 0;
        const rise = RISE_AT[place]!;
        const land = rise + 450;
        return (
          <li key={s.playerId} className={`flex min-w-0 flex-col items-center ${ORDER[place]} ${big ? 'w-[clamp(7rem,13vw,16rem)]' : 'w-[6.75rem]'}`}>
            <div className="relative flex w-full flex-col items-center" style={moving ? { animation: `stage-land 480ms var(--ease-out) ${land}ms both` } : undefined}>
              <div className="relative" style={first && moving ? { animation: `stage-hop 950ms var(--ease-out) ${land + 450}ms both` } : undefined}>
                <PlayerGlim avatar={a} seed={s.playerId} size={first ? 120 : 92} aura={first ? 'legendary' : null} className={first ? (big ? 'size-[clamp(6rem,17vh,11.5rem)]' : 'size-[6rem]') : big ? 'size-[clamp(4.75rem,12.5vh,8.5rem)]' : 'size-[4.5rem]'} />
              </div>
              {first ? <Burst style={a?.victory?.style ?? 'festival'} hue={a?.victory?.hue ?? 42} size={big ? 380 : 250} rise delay={land + 380} count={20} /> : null}
              <NameTag className={`mt-1 ${big ? 'text-[clamp(1rem,1.6vw,1.75rem)]' : 'text-sm'}`}>{s.name}</NameTag>
              <span className={`mt-1 font-display font-extrabold tabular ${big ? 'text-[clamp(1rem,1.7vw,1.9rem)]' : 'text-base'}`}>{s.label}</span>
            </div>
            <div className="mt-2 w-full overflow-hidden" style={{ height: `calc(var(--podium) * ${HEIGHT[place]})` }}>
              <div
                className="flex h-full w-full items-start justify-center rounded-t-[22px] border-[3px] border-b-0 border-ink pt-[clamp(0.25rem,1vh,0.75rem)] font-display leading-none font-extrabold text-on-accent shadow-[inset_0_-12px_0_rgb(0_0_0/0.1)]"
                style={{ background: PLACE_BG[place], animation: moving ? `stage-rise 620ms var(--ease-out) ${rise}ms both` : undefined }}
              >
                <span className="text-[length:calc(var(--podium)*0.3)]">
                  <span className="sr-only">{ordinal(s.rank)} place</span>
                  <span aria-hidden>{s.rank}</span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Co-op endings: the whole room together, cheering a win or shrugging off a loss. */
function TeamPhoto({ room, won, big }: { room: RoomView; won: boolean; big: boolean }) {
  const people = room.players.slice(0, 12);
  return (
    <div className="relative flex flex-wrap items-end justify-center gap-[clamp(0.25rem,1vw,1rem)] py-2" aria-hidden>
      {people.map((p, i) => (
        <span key={p.id} style={motionOK() ? { animation: `stage-arrive 520ms var(--ease-spring) ${i * 60}ms both` } : undefined}>
          <PlayerGlim avatar={p.avatar} seed={p.id} size={88} className={big ? 'size-[clamp(4rem,9vh,7rem)]' : 'size-16'} />
        </span>
      ))}
      {won ? <Burst size={big ? 420 : 260} rise delay={500} count={20} /> : null}
    </div>
  );
}

function Standings({ room, big }: { room: RoomView; big: boolean }) {
  const team = (id: string | null) => room.room.teams.find((t) => t.id === id)?.name ?? null;
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Final standings">
      {room.results!.standings.map((s: StandingView) => {
        const mine = s.playerId === room.me.playerId;
        const t = team(s.teamId);
        return (
          <li key={s.playerId} className={`flex items-center gap-3 rounded-[18px] border bg-sunken px-2.5 py-1.5 ${big ? 'text-[clamp(1rem,1.25vw,1.4rem)]' : ''} ${mine ? 'border-lantern ring-2 ring-lantern' : 'border-white/12'}`}>
            <RankBadge rank={s.rank} />
            <PlayerGlim avatar={avatarOf(room.players, s.playerId)} seed={s.playerId} size={44} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">
                {s.name}
                {mine ? <span className="ml-1.5 text-[0.85em] font-semibold text-text-2">(you)</span> : null}
              </span>
              <span className="block truncate text-sm text-text-2">
                {s.correct} of {s.answered} right{t ? `, ${t}` : ''}
              </span>
            </span>
            <span className="shrink-0 font-display text-[1.15em] font-extrabold tabular">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Rewards({ rewards, guest }: { rewards: RewardSummary | null; guest: boolean }) {
  if (!rewards) return null;
  if (rewards.status === 'pending') {
    return (
      <div className="paper stage-card px-5 py-4" role="status">
        <p className="font-semibold">Adding up your rewards…</p>
      </div>
    );
  }
  return (
    <div className="paper stage-card flex flex-col gap-3 px-5 py-4" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
      <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold">
        <Sparkles className="size-6 text-lantern" aria-hidden /> Your rewards
      </h2>
      {rewards.status === 'granted' ? (
        <div className="flex flex-wrap items-center gap-4">
          <Amount currency="sparks" value={rewards.sparks} size="lg" />
          <span className="font-display text-2xl font-extrabold text-link tabular">+{formatNumber(rewards.xp)} XP</span>
          {rewards.levelUp ? <Badge tone="violet">Level {rewards.levelUp.to}!</Badge> : null}
        </div>
      ) : null}
      {rewards.quests.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {rewards.quests.map((q) => (
            <li key={q.title} className="flex justify-between gap-2">
              <span>{q.title}</span>
              <span className={q.completed ? 'font-semibold text-glim' : 'text-text-2 tabular'}>{q.completed ? 'Complete: claim it on the quests page' : `${q.progress}/${q.target}`}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {rewards.achievements.map((a) => (
        <p key={a.title} className="flex items-center gap-2 font-semibold text-lantern">
          <Trophy className="size-4" aria-hidden /> Achievement unlocked: {a.title}
        </p>
      ))}
      {rewards.notes.map((n) => (
        <p key={n} className="text-text-2">
          {n}
        </p>
      ))}
      {guest && rewards.status === 'none' ? (
        <Link to="/signup" className={buttonClass('primary', 'lg', 'self-start')}>
          Create a free account
        </Link>
      ) : null}
    </div>
  );
}

function downloadCsv(room: RoomView) {
  const r = room.results!;
  const team = (id: string | null) => room.room.teams.find((t) => t.id === id)?.name ?? '';
  const rows = [['Rank', 'Name', 'Team', 'Result', 'Correct', 'Answered', 'Accuracy'], ...r.standings.map((s) => [s.rank, s.name, team(s.teamId), s.label, s.correct, s.answered, s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : ''])];
  // Quote every cell and neutralise spreadsheet formulas in player names.
  const cell = (v: unknown) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob([rows.map((row) => row.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ludora-${room.room.code}-results.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Results({ room, handle, isHost, guest }: { room: RoomView; handle: RoomHandle; isHost: boolean; guest: boolean }) {
  const [busy, setBusy] = useState(false);
  const r = room.results!;
  const mine = r.standings.find((s) => s.playerId === room.me.playerId);
  const competitive = r.outcome === 'competitive';
  const podium = competitive && r.standings.length > 1;
  const restart = async () => {
    setBusy(true);
    const ack = await handle.host({ cmd: 'restart' });
    setBusy(false);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const big = isHost;
  return (
    <div className={`mx-auto flex w-full flex-1 flex-col ${big ? 'max-w-[112rem] gap-[clamp(1rem,3vh,2rem)]' : 'max-w-3xl gap-6'}`}>
      <div className="text-center">
        <h1 className={`font-display leading-none font-extrabold ${big ? 'text-[clamp(3rem,5.5vw,6.5rem)]' : 'text-5xl'}`}>{r.outcome === 'coop-win' ? 'Victory!' : r.outcome === 'coop-loss' ? 'So close' : 'Game over'}</h1>
        <p className={`mt-2 font-semibold text-text-2 ${big ? 'text-[clamp(1.1rem,1.6vw,1.8rem)]' : 'text-lg'}`}>{r.summary}</p>
        {mine && r.standings.length > 1 && competitive ? <p className="mt-2 font-display text-3xl font-extrabold text-lantern">You came {ordinal(mine.rank)}</p> : null}
      </div>
      <div className={`grid grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] ${big ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end' : ''}`}>
        <div className="flex flex-col justify-end">{podium ? <Podium room={room} big={big} /> : !competitive ? <TeamPhoto room={room} won={r.outcome === 'coop-win'} big={big} /> : null}</div>
        <div className="flex flex-col gap-4">
          {!isHost ? <Rewards rewards={room.rewards} guest={guest} /> : null}
          {r.teamStandings.length ? (
            <section className="rounded-[22px] border border-white/12 bg-sunken p-4" aria-label="Teams">
              <h2 className="mb-3 font-display text-xl font-extrabold">Teams</h2>
              <TeamScores teams={r.teamStandings.map((t) => ({ teamId: t.teamId, name: t.name, score: t.score, hue: room.room.teams.find((x) => x.id === t.teamId)?.hue ?? 42 }))} />
            </section>
          ) : null}
          <Standings room={room} big={big} />
          <p className="text-sm font-semibold text-text-2">Played for {duration(r.durationMs)}.</p>
          {isHost ? (
            <div className="paper stage-card flex flex-col gap-2 p-4">
              <h2 className="font-display text-xl font-extrabold">What next?</h2>
              <Button variant="primary" size="xl" icon={<RotateCcw className="size-5" aria-hidden />} loading={busy} onClick={restart}>
                Play again with the same players
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button size="lg" icon={<Download className="size-5" aria-hidden />} onClick={() => downloadCsv(room)}>
                  Download results (CSV)
                </Button>
                <Link to="/host" className={buttonClass('ghost', 'lg')}>
                  Host something else
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link to="/" className={buttonClass('secondary', 'lg')}>
                <Home className="size-5" aria-hidden /> Back to home
              </Link>
              <p className="text-center text-sm font-semibold text-text-2">If the host starts another round, you will join it from here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
