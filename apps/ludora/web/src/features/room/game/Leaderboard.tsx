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

/** Podium colours, shared by rank badges and the podium itself: gold, silver and bronze. Ink text passes AA on each. */
export const PLACE_BG = ['var(--lantern)', 'var(--r-common)', 'var(--tile-a)'];

/**
 * The order each kind of board (projector or phone) was last shown in, so the
 * next showing can start from it. Ties in score are common early in a game,
 * and only the order the room actually saw makes the slide honest.
 */
const lastShown = new Map<string, string[]>();

/**
 * Slides rows to their new places. On first showing, rows start in the order
 * the board was last shown in (falling back to last round's scores, score
 * minus this round's gain), hold for a beat so the room can see it, then
 * slide; while the board stays up, any reorder slides from where rows were.
 * Nothing moves when motion is reduced.
 */
function useRankSlide(listRef: RefObject<HTMLOListElement | null>, rows: LeaderRow[], orderKey: string, memory: string) {
  const last = useRef<Map<string, number> | null>(null);
  // The order last measured. Running again for the same order (React's
  // development double effects, or a resize) must not cancel a slide in flight.
  const lastKey = useRef<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || lastKey.current === orderKey) return;
    lastKey.current = orderKey;
    const nodes = Array.from(list.children).filter((n): n is HTMLElement => n instanceof HTMLElement && Boolean(n.dataset.row));
    for (const n of nodes) for (const a of n.getAnimations()) a.cancel();
    const top0 = list.getBoundingClientRect().top;
    const tops = new Map(nodes.map((n) => [n.dataset.row!, n.getBoundingClientRect().top - top0]));
    const ranked = rowsRef.current;
    const ids = ranked.map((r) => r.playerId);
    const remembered = lastShown.get(memory);
    lastShown.set(memory, ids);
    const previous = last.current;
    last.current = tops;
    if (!motionOK()) return;
    let from = previous;
    let delay = 0;
    let duration = 420;
    if (!from) {
      const seen = (remembered ?? []).filter((id) => ids.includes(id));
      const prevScore = (id: string) => {
        const r = ranked.find((x) => x.playerId === id)!;
        return r.score - (r.gain ?? 0);
      };
      const rest = ids.filter((id) => !seen.includes(id)).sort((a, b) => prevScore(b) - prevScore(a));
      const before = [...seen, ...rest];
      if (before.every((id, i) => id === ids[i])) return;
      const slots = nodes.map((n) => tops.get(n.dataset.row!) ?? 0);
      from = new Map(before.map((id, i) => [id, slots[Math.min(i, slots.length - 1)] ?? 0]));
      // The rank change is the moment of the board: a beat to see the old order, then a quick, readable slide.
      delay = 450;
      duration = 650;
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
  }, [orderKey, listRef, memory]);
}

/** A rank as a disc: gold, silver and bronze for the podium places, smoked for the rest. The ordinal is always written, so colour is never the only cue. */
export function RankBadge({ rank, big = false }: { rank: number; big?: boolean }) {
  const medal = rank >= 1 && rank <= 3;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold tabular ${big ? 'size-[var(--lb-rank)] text-[length:calc(var(--lb-rank)*0.4)]' : 'size-11 text-lg'} ${medal ? 'text-on-accent' : 'bg-white/[0.1] text-text'}`}
      style={medal ? { background: PLACE_BG[rank - 1] } : undefined}
    >
      {ordinal(rank)}
    </span>
  );
}

/** Ranked rows with each player's Glim and the points just gained. The `you` row is highlighted (and appended if below the cut). */
export function Leaderboard({
  rows,
  you,
  players,
  teams,
  big = false,
  dense = false,
  label,
}: {
  rows: LeaderRow[];
  you?: LeaderRow | null;
  players: RoomPlayerView[];
  teams?: TeamView[];
  big?: boolean;
  /** Projector type in compact rows, for a board in a side panel. */
  dense?: boolean;
  label?: (r: LeaderRow) => string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const team = (id: string | null) => teams?.find((t) => t.id === id);
  const all = you && !rows.some((r) => r.playerId === you.playerId) ? [...rows, you] : rows;
  useRankSlide(listRef, rows, all.map((r) => r.playerId).join('|'), big ? 'projector' : 'phone');
  const roomy = all.length <= 5 && !dense;
  // Projector sizes scale with the screen, and shrink when the board is long so ten rows still fit.
  const vars = (
    big
      ? roomy
        ? { '--lb-row': 'clamp(3.5rem, min(12vh, 16vw), 8.5rem)', '--lb-glim': 'clamp(2.5rem, min(10vh, 12vw), 7.25rem)', '--lb-rank': 'clamp(2.25rem, min(7.5vh, 9vw), 5rem)', '--lb-name': 'clamp(1.15rem, 2.7vw, 3.25rem)', '--lb-score': 'clamp(1.25rem, 3vw, 3.75rem)' }
        : { '--lb-row': 'clamp(3rem, 6.2vh, 4.75rem)', '--lb-glim': 'clamp(2.5rem, 5.4vh, 4rem)', '--lb-rank': 'clamp(2.25rem, 5vh, 3.5rem)', '--lb-name': 'clamp(1.1rem, 1.8vw, 2.1rem)', '--lb-score': 'clamp(1.25rem, 2vw, 2.4rem)' }
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
            className={`relative flex min-h-[var(--lb-row)] items-center rounded-[var(--radius-m)] ${big ? 'gap-[clamp(0.75rem,1.4vw,1.5rem)] px-[clamp(0.75rem,1.2vw,1.25rem)] py-1' : 'gap-3 px-2.5 py-1.5'} ${isYou ? 'bg-lantern/[0.14] ring-2 ring-lantern ring-inset' : 'bg-white/[0.07]'}`}
          >
            <RankBadge rank={r.rank} big={big} />
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={64} pose={r.rank === 1 ? 'cheer' : 'idle'} className="size-[var(--lb-glim)] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[length:var(--lb-name)] leading-tight font-bold">
              <span data-player-name={r.playerId}>{r.name}</span>
              {isYou ? <span className={big ? 'ml-2 text-[0.75em] font-semibold text-text-2' : 'sr-only'}> (you)</span> : null}
            </span>
            {t ? <span className="size-4 shrink-0 rounded-full ring-2 ring-white/50" style={{ background: `hsl(${t.hue} 80% 60%)` }} title={t.name} aria-hidden /> : null}
            {t ? <span className="sr-only">{t.name}</span> : null}
            {r.gain ? (
              // The points just gained, on a slanted plate: the moment of this row.
              <span className={`plate shrink-0 text-on-accent tabular ${r.gain > 0 ? 'bg-glim' : 'bg-ember'} ${big ? 'text-[length:calc(var(--lb-score)*0.66)] max-sm:hidden' : 'px-2 text-base'}`}>
                <span>
                  <span aria-hidden>{r.gain > 0 ? '+' : '−'}</span>
                  <span className="sr-only">{r.gain > 0 ? 'up ' : 'down '}</span>
                  {formatNumber(Math.abs(r.gain))}
                  <span className="sr-only"> this round,</span>
                </span>
              </span>
            ) : null}
            <span className="shrink-0 text-right font-display text-[length:var(--lb-score)] leading-none font-extrabold tabular">
              {label ? label(r) : formatNumber(r.score)}
              {label ? null : <span className="sr-only"> points</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Team totals as bars in each team's colour, longest first. */
export function TeamScores({
  teams,
  format = formatNumber,
  big = false,
}: {
  /** `bonus`, when a team earned one, is already in `score` and is called out under it. */
  teams: { teamId: string; name: string; hue: number; score: number; members?: number; bonus?: number }[];
  /** How a score reads, e.g. as a percentage. */
  format?: (score: number) => string;
  big?: boolean;
}) {
  const max = Math.max(1, ...teams.map((t) => t.score));
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Team scores">
      {[...teams]
        .sort((a, b) => b.score - a.score)
        .map((t) => (
          <li key={t.teamId} className={`grid items-center gap-3 ${big ? 'grid-cols-[minmax(6rem,12rem)_1fr_auto] text-[clamp(1.1rem,1.7vw,1.9rem)]' : 'grid-cols-[minmax(4.5rem,7.5rem)_1fr_auto]'}`}>
            <span className="flex min-w-0 items-center gap-2 font-bold">
              <span className="size-3.5 shrink-0 rounded-full ring-2 ring-white/50" style={{ background: `hsl(${t.hue} 80% 62%)` }} aria-hidden />
              <span className="truncate">{t.name}</span>
            </span>
            <span className={`relative overflow-hidden rounded-[var(--radius-s)] bg-white/[0.1] ${big ? 'h-10' : 'h-7'}`} aria-hidden>
              <span className="absolute inset-0 origin-left rounded-[var(--radius-s)] transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `scaleX(${Math.max(0.04, t.score / max)})`, background: `hsl(${t.hue} 80% 62%)` }} />
            </span>
            <span className="min-w-[3ch] text-right font-display leading-tight font-extrabold tabular">
              {format(t.score)}
              {t.bonus ? <span className="block text-[0.62em] font-bold text-text-2">+{formatNumber(t.bonus)} bonus</span> : null}
            </span>
          </li>
        ))}
    </ul>
  );
}
