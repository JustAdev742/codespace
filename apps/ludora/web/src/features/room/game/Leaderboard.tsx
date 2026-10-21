import type { RoomPlayerView, TeamView } from '@ludora/shared';
import { Glim } from '../../../art/glim/Glim.tsx';
import { formatNumber, ordinal } from '../../../lib/format.ts';

export interface LeaderRow {
  playerId: string;
  name: string;
  score: number;
  gain?: number;
  rank: number;
  teamId: string | null;
}

/** Ranked rows with the points just gained. `youId` row is highlighted (and appended if below the cut). */
export function Leaderboard({ rows, you, players, teams, big = false, label }: { rows: LeaderRow[]; you?: LeaderRow | null; players: RoomPlayerView[]; teams?: TeamView[]; big?: boolean; label?: (r: LeaderRow) => string }) {
  const avatar = (id: string) => players.find((p) => p.id === id)?.avatar;
  const team = (id: string | null) => teams?.find((t) => t.id === id);
  const all = you && !rows.some((r) => r.playerId === you.playerId) ? [...rows, you] : rows;
  return (
    <ol className="flex flex-col gap-2" aria-label="Leaderboard">
      {all.map((r) => {
        const a = avatar(r.playerId);
        const t = team(r.teamId);
        const isYou = you?.playerId === r.playerId;
        return (
          <li
            key={r.playerId}
            className={`flex items-center gap-3 rounded-[14px] border px-3 ${big ? 'py-2.5' : 'py-2'} ${isYou ? 'border-lantern bg-dusk/20' : 'border-line bg-raised'}`}
            style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}
          >
            <span className={`w-9 text-center font-display font-extrabold tabular ${big ? 'text-2xl' : 'text-lg'} ${r.rank <= 3 ? 'text-lantern' : 'text-text-3'}`}>{ordinal(r.rank)}</span>
            {a ? <Glim art={a.art} accessories={a.accessories} size={big ? 44 : 36} /> : null}
            <span className={`min-w-0 flex-1 truncate font-semibold ${big ? 'text-xl' : ''}`}>
              {r.name}
              {isYou ? <span className="ml-1.5 text-sm text-text-3">(you)</span> : null}
            </span>
            {t ? <span className="hidden size-3 rounded-full sm:block" style={{ background: `hsl(${t.hue} 80% 60%)` }} title={t.name} /> : null}
            {r.gain ? <span className="font-semibold text-glim tabular">+{formatNumber(r.gain)}</span> : null}
            <span className={`font-display font-bold tabular ${big ? 'text-2xl' : 'text-lg'}`}>{label ? label(r) : formatNumber(r.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function TeamScores({ teams }: { teams: { teamId: string; name: string; hue: number; score: number; members?: number }[] }) {
  const max = Math.max(1, ...teams.map((t) => t.score));
  return (
    <div className="flex flex-col gap-2">
      {[...teams]
        .sort((a, b) => b.score - a.score)
        .map((t) => (
          <div key={t.teamId} className="flex items-center gap-3">
            <span className="w-28 truncate font-semibold">{t.name}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-[10px] bg-surface-3">
              <div className="flex h-full items-center justify-end rounded-[10px] px-2 font-display font-bold text-on-accent tabular transition-[width] duration-700" style={{ width: `${Math.max(8, (t.score / max) * 100)}%`, background: `hsl(${t.hue} 80% 62%)` }}>
                {formatNumber(t.score)}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
