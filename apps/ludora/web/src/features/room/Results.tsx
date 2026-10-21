import { useState } from 'react';
import { Link } from 'react-router';
import { Download, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import type { RewardSummary, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Amount, Badge } from '../../ui/primitives.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { duration, formatNumber, ordinal } from '../../lib/format.ts';
import { TeamScores } from './game/Leaderboard.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';

function Podium({ room }: { room: RoomView }) {
  const top = room.results!.standings.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = ['h-24', 'h-36', 'h-16'];
  const avatar = (id: string) => room.players.find((p) => p.id === id)?.avatar;
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5" aria-label="Podium">
      {order.map((s) => {
        const pos = s === top[0] ? 1 : s === top[1] ? 0 : 2;
        const a = avatar(s!.playerId);
        return (
          <div key={s!.playerId} className="flex w-28 flex-col items-center gap-2 sm:w-36" style={{ animation: prefersReducedMotion() ? undefined : `rise-fade 500ms ${pos === 1 ? 300 : pos === 0 ? 150 : 0}ms both var(--ease-out)` }}>
            {a ? <Glim art={a.art} accessories={a.accessories} size={s === top[0] ? 96 : 76} aura={s === top[0] ? 'legendary' : null} bob={s === top[0]} /> : null}
            <span className="max-w-full truncate text-center font-semibold">{s!.name}</span>
            <span className="text-sm text-text-2 tabular">{s!.label}</span>
            <div className={`flex w-full items-start justify-center rounded-t-[14px] border-2 border-b-0 border-ink pt-2 font-display text-3xl font-extrabold text-on-accent ${heights[pos]}`} style={{ background: pos === 1 ? 'var(--lantern)' : pos === 0 ? 'var(--tile-b)' : 'var(--tile-d)' }}>
              {s!.rank}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Rewards({ rewards, guest }: { rewards: RewardSummary | null; guest: boolean }) {
  if (!rewards) return null;
  if (rewards.status === 'pending') {
    return (
      <div className="rounded-[18px] border border-line bg-raised p-5" role="status">
        <p className="font-semibold">Adding up your rewards…</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-raised p-5" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <Sparkles className="size-5 text-lantern" /> Your rewards
      </h2>
      {rewards.status === 'granted' ? (
        <div className="flex flex-wrap items-center gap-4">
          <Amount currency="sparks" value={rewards.sparks} size="lg" />
          <span className="font-display text-xl font-bold text-link tabular">+{formatNumber(rewards.xp)} XP</span>
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
          <Trophy className="size-4" /> Achievement unlocked: {a.title}
        </p>
      ))}
      {rewards.notes.map((n) => (
        <p key={n} className="text-sm text-text-2">
          {n}
        </p>
      ))}
      {guest && rewards.status === 'none' ? (
        <Link to="/signup" className={buttonClass('primary', 'sm', 'self-start')}>
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
  const restart = async () => {
    setBusy(true);
    const ack = await handle.host({ cmd: 'restart' });
    setBusy(false);
    if (!ack.ok) toast.error(ack.error.message);
  };
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{r.outcome === 'coop-win' ? 'Victory!' : r.outcome === 'coop-loss' ? 'So close' : 'Game over'}</h1>
        <p className="mt-2 text-lg text-text-2">{r.summary}</p>
        {mine && r.standings.length > 1 && r.outcome === 'competitive' ? <p className="mt-1 font-display text-2xl font-bold text-lantern">You came {ordinal(mine.rank)}</p> : null}
      </div>
      {r.standings.length > 1 && r.outcome === 'competitive' ? <Podium room={room} /> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          {r.teamStandings.length ? (
            <div className="rounded-[18px] border border-line bg-raised p-5">
              <h2 className="mb-3 font-display text-xl font-bold">Teams</h2>
              <TeamScores teams={r.teamStandings.map((t) => ({ teamId: t.teamId, name: t.name, score: t.score, hue: room.room.teams.find((x) => x.id === t.teamId)?.hue ?? 42 }))} />
            </div>
          ) : null}
          <div className="overflow-hidden rounded-[18px] border border-line bg-raised">
            <table className="w-full text-left">
              <caption className="sr-only">Final standings</caption>
              <thead className="bg-surface-2 text-sm text-text-2">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Rank</th>
                  <th className="px-4 py-2.5 font-semibold">Player</th>
                  <th className="px-4 py-2.5 font-semibold">Result</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Correct</th>
                </tr>
              </thead>
              <tbody>
                {r.standings.map((s) => (
                  <tr key={s.playerId} className={`border-t border-line ${s.playerId === room.me.playerId ? 'bg-dusk/20' : ''}`}>
                    <td className="px-4 py-2.5 font-display font-bold tabular">{ordinal(s.rank)}</td>
                    <td className="px-4 py-2.5 font-semibold">{s.name}</td>
                    <td className="px-4 py-2.5 text-text-2 tabular">{s.label}</td>
                    <td className="hidden px-4 py-2.5 text-text-2 tabular sm:table-cell">
                      {s.correct}/{s.answered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-text-3">Played for {duration(r.durationMs)}.</p>
        </div>
        <div className="flex flex-col gap-4">
          {!isHost ? <Rewards rewards={room.rewards} guest={guest} /> : null}
          {isHost ? (
            <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-raised p-5">
              <h2 className="font-display text-xl font-bold">What next?</h2>
              <Button variant="primary" size="lg" icon={<RotateCcw className="size-5" />} loading={busy} onClick={restart}>
                Play again with the same players
              </Button>
              <Button size="lg" icon={<Download className="size-5" />} onClick={() => downloadCsv(room)}>
                Download results (CSV)
              </Button>
              <Link to="/host" className={buttonClass('ghost', 'lg')}>
                Host something else
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link to="/" className={buttonClass('secondary', 'lg')}>
                <Star className="size-5" /> Back to home
              </Link>
              <p className="text-center text-sm text-text-3">If the host starts another round, you will join it from here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
