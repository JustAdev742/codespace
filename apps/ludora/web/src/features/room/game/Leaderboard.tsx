import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { RoomPlayerView, TeamView } from '@ludora/shared';
import { formatNumber, ordinal } from '../../../lib/format.ts';
import { PlayerGlim, avatarOf, motionOK } from './stage.tsx';

export interface LeaderRow {
  playerId: string;
  name: string;
  score: number;
  gain?: number;
  rank: number;
  teamId: string | null;
}

/** Strong ease-in-out: rows travel across the screen rather than enter it. */
const MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)';

/** Podium colours, shared by rank badges and the podium itself. */
export const PLACE_BG = ['var(--lantern)', 'var(--tile-b)', 'var(--tile-d)'];

/**
 * Slides rows to their new places. On first showing, rows start in last
 * round's order (score minus this round's gain), hold for a beat so the room
 * can see it, then slide; after that, any reorder slides from where rows were.
 * Nothing moves when motion is reduced.
 */
function useRankSlide(listRef: RefObject<HTMLOListElement | null>, rows: LeaderRow[], orderKey: string) {
  const last = useRef<Map<string, number> | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nodes = Array.from(list.children).filter((n): n is HTMLElement => n instanceof HTMLElement && Boolean(n.dataset.row));
    for (const n of nodes) for (const a of n.getAnimations()) a.cancel();
    const top0 = list.getBoundingClientRect().top;
    const tops = new Map(nodes.map((n) => [n.dataset.row!, n.getBoundingClientRect().top - top0]));
    const previous = last.current;
    last.current = tops;
    if (!motionOK()) return;
    let from = previous;
    let delay = 0;
    let duration = 520;
    if (!from) {
      const ranked = rowsRef.current;
      if (!ranked.some((r) => r.gain)) return;
      const slots = nodes.map((n) => tops.get(n.dataset.row!) ?? 0);
      const before = [...ranked].sort((a, b) => b.score - (b.gain ?? 0) - (a.score - (a.gain ?? 0)));
      from = new Map(before.map((r, i) => [r.playerId, slots[i] ?? 0]));
      delay = 600;
      duration = 900;
    }
    for (const n of nodes) {
      const a = from.get(n.dataset.row!);
      const b = tops.get(n.dataset.row!);
      if (a === undefined || b === undefined || Math.abs(a - b) < 1) continue;
      n.style.zIndex = a > b ? '2' : '1';
      const anim = n.animate([{ transform: `translateY(${a - b}px)` }, { transform: 'translateY(0)' }], { duration, delay, easing: MOVE, fill: 'backwards' });
      const reset = () => {
        n.style.zIndex = '';
      };
      anim.onfinish = reset;
      anim.oncancel = reset;
    }
  }, [orderKey, listRef]);
}

export function RankBadge({ rank, big = false }: { rank: number; big?: boolean }) {
  const medal = rank >= 1 && rank <= 3;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold tabular ${big ? 'size-[var(--lb-rank)] text-[length:calc(var(--lb-rank)*0.36)]' : 'size-11 text-base'} ${medal ? 'border-[3px] border-ink text-on-accent shadow-[0_2px_0_var(--ink)]' : 'border-2 border-white/25 text-text'}`}
      style={medal ? { background: PLACE_BG[rank - 1] } : undefined}
    >
      {ordinal(rank)}
    </span>
  );
}

/** Ranked rows with each player's Glim and the points just gained. The `you` row is highlighted (and appended if below the cut). */
export function Leaderboard({ rows, you, players, teams, big = false, label }: { rows: LeaderRow[]; you?: LeaderRow | null; players: RoomPlayerView[]; teams?: TeamView[]; big?: boolean; label?: (r: LeaderRow) => string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const team = (id: string | null) => teams?.find((t) => t.id === id);
  const all = you && !rows.some((r) => r.playerId === you.playerId) ? [...rows, you] : rows;
  useRankSlide(listRef, rows, all.map((r) => r.playerId).join('|'));
  const roomy = all.length <= 5;
  // Projector sizes scale with the screen, and shrink when the board is long so ten rows still fit.
  const vars = (
    big
      ? roomy
        ? { '--lb-row': 'clamp(4.25rem, 10.5vh, 7.5rem)', '--lb-glim': 'clamp(3.5rem, 8.5vh, 6.25rem)', '--lb-rank': 'clamp(3rem, 7vh, 4.75rem)', '--lb-name': 'clamp(1.4rem, 2.5vw, 3rem)', '--lb-score': 'clamp(1.6rem, 2.9vw, 3.5rem)' }
        : { '--lb-row': 'clamp(3rem, 6.2vh, 4.75rem)', '--lb-glim': 'clamp(2.5rem, 5.4vh, 4rem)', '--lb-rank': 'clamp(2.4rem, 5vh, 3.5rem)', '--lb-name': 'clamp(1.1rem, 1.8vw, 2.1rem)', '--lb-score': 'clamp(1.25rem, 2vw, 2.4rem)' }
      : { '--lb-row': '3.75rem', '--lb-glim': '2.75rem', '--lb-rank': '2.75rem', '--lb-name': '1.125rem', '--lb-score': '1.25rem' }
  ) as CSSProperties;
  return (
    <ol ref={listRef} className={`flex flex-col ${big && !roomy ? 'gap-1.5' : 'gap-2'}`} aria-label="Leaderboard" style={vars}>
      {all.map((r) => {
        const t = team(r.teamId);
        const isYou = you?.playerId === r.playerId;
        return (
          <li
            key={r.playerId}
            data-row={r.playerId}
            className={`relative flex min-h-[var(--lb-row)] items-center rounded-[20px] border bg-sunken ${big ? 'gap-[clamp(0.75rem,1.4vw,1.5rem)] px-[clamp(0.75rem,1.2vw,1.25rem)] py-1' : 'gap-3 px-2.5 py-1.5'} ${isYou ? 'border-lantern ring-2 ring-lantern' : 'border-white/12'}`}
          >
            <RankBadge rank={r.rank} big={big} />
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={64} className="size-[var(--lb-glim)] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[length:var(--lb-name)] leading-tight font-bold">
              {r.name}
              {isYou ? <span className="ml-2 text-[0.75em] font-semibold text-text-2">(you)</span> : null}
            </span>
            {t ? <span className="size-4 shrink-0 rounded-full border-2 border-ink" style={{ background: `hsl(${t.hue} 80% 60%)` }} title={t.name} aria-hidden /> : null}
            {t ? <span className="sr-only">{t.name}</span> : null}
            {r.gain ? (
              <span className={`shrink-0 rounded-full border-2 border-ink px-2.5 py-0.5 font-display font-extrabold text-on-accent tabular ${r.gain > 0 ? 'bg-glim' : 'bg-ember'} ${big ? 'text-[length:calc(var(--lb-score)*0.62)]' : 'text-sm'}`}>
                {r.gain > 0 ? '+' : '−'}
                {formatNumber(Math.abs(r.gain))}
              </span>
            ) : null}
            <span className="shrink-0 text-right font-display text-[length:var(--lb-score)] leading-none font-extrabold tabular">{label ? label(r) : formatNumber(r.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Team totals as bars in each team's colour, longest first. */
export function TeamScores({ teams, format = formatNumber, big = false }: { teams: { teamId: string; name: string; hue: number; score: number; members?: number }[]; /** How a score reads, e.g. as a percentage. */ format?: (score: number) => string; big?: boolean }) {
  const max = Math.max(1, ...teams.map((t) => t.score));
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Team scores">
      {[...teams]
        .sort((a, b) => b.score - a.score)
        .map((t) => (
          <li key={t.teamId} className={`grid items-center gap-3 ${big ? 'grid-cols-[minmax(6rem,12rem)_1fr_auto] text-[clamp(1.1rem,1.7vw,1.9rem)]' : 'grid-cols-[minmax(4.5rem,7.5rem)_1fr_auto]'}`}>
            <span className="flex min-w-0 items-center gap-2 font-bold">
              <span className="size-3.5 shrink-0 rounded-full border-2 border-ink" style={{ background: `hsl(${t.hue} 80% 62%)` }} aria-hidden />
              <span className="truncate">{t.name}</span>
            </span>
            <span className={`relative overflow-hidden rounded-[12px] border-2 border-ink bg-sunken ${big ? 'h-10' : 'h-7'}`} aria-hidden>
              <span className="absolute inset-0 origin-left rounded-[10px] transition-transform duration-700 ease-[var(--ease-out)]" style={{ transform: `scaleX(${Math.max(0.04, t.score / max)})`, background: `hsl(${t.hue} 80% 62%)` }} />
            </span>
            <span className="min-w-[3ch] text-right font-display font-extrabold tabular">{format(t.score)}</span>
          </li>
        ))}
    </ul>
  );
}
