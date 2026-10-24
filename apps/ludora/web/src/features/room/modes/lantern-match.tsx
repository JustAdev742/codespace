import { useState, type CSSProperties } from 'react';
import { Check, Zap } from 'lucide-react';
import type { Media } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import { Countdown } from '../game/TimerBar.tsx';
import { Leaderboard, RankBadge, type LeaderRow } from '../game/Leaderboard.tsx';
import { ModeTitle } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf } from '../game/stage.tsx';
import { ProgressBar } from '../../../ui/primitives.tsx';
import { plural } from '../../../lib/format.ts';

/* Lantern Match: a memory board of question cards and answer cards. */

type Side = 'question' | 'answer';

interface CardFace {
  i: number;
  side: Side;
  state: 'down' | 'up' | 'matched';
  text?: string;
  media?: Media;
}

interface Row {
  playerId: string;
  name: string;
  teamId: string | null;
  rank: number;
  pairs: number;
  misses: number;
  cleared: number;
  boardPairs: number;
  boardTotal: number;
  isYou: boolean;
}

export interface LanternMatchView {
  endsAt: number;
  sprint: boolean;
  pairsPerBoard: number;
  leaders: Row[];
  teams: { teamId: string; name: string; hue: number; score: number; avg: number; members: number }[] | null;
  you: {
    board: number;
    cards: CardFace[];
    missed: boolean;
    lastPair: number[] | null;
    pairs: number;
    misses: number;
    cleared: number;
    boardPairs: number;
    boardTotal: number;
    last: { result: 'match' | 'miss' | 'cleared'; at: number } | null;
  } | null;
}

const SIDE_LABEL: Record<Side, string> = { question: 'Question', answer: 'Answer' };
/** Question cards and answer cards differ in letter and word as well as colour: a violet Q and a mint A. */
const SIDE_LETTER: Record<Side, string> = { question: 'Q', answer: 'A' };
const SIDE_BACK: Record<Side, string> = { question: 'bg-dusk', answer: 'bg-glim' };

/** The small letter chip that marks a card's side wherever its text is shown. */
function SideChip({ side }: { side: Side }) {
  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-[var(--radius-s)] font-display text-lg font-extrabold text-on-accent ${side === 'question' ? 'bg-dusk' : 'bg-glim'}`} aria-hidden>
      {SIDE_LETTER[side]}
    </span>
  );
}

/** Columns for each board size, so rows stay even. Phones always get four. */
const GRID: Record<number, string> = {
  8: 'grid-cols-4',
  10: 'grid-cols-4 sm:grid-cols-5',
  12: 'grid-cols-4 sm:grid-cols-6',
  14: 'grid-cols-4 sm:grid-cols-7',
  16: 'grid-cols-4',
  18: 'grid-cols-4 sm:grid-cols-6',
  20: 'grid-cols-4 sm:grid-cols-5',
};
const gridFor = (n: number) => GRID[n] ?? (n <= 4 ? 'grid-cols-2 sm:grid-cols-4' : n <= 6 ? 'grid-cols-3' : 'grid-cols-4');

function faceText(c: CardFace) {
  return c.text || c.media?.alt || 'Picture';
}

function textSize(text: string) {
  if (text.length <= 12) return 'text-base sm:text-lg';
  if (text.length <= 24) return 'text-sm sm:text-base';
  return 'text-xs sm:text-sm';
}

function MemoryCard({ card, total, missed, disabled, onFlip }: { card: CardFace; total: number; missed: boolean; disabled: boolean; onFlip: () => void }) {
  const faceUp = card.state !== 'down';
  const matched = card.state === 'matched';
  // The name comes from hidden text rather than aria-label: both faces stay in the page (one is turned
  // away), so an aria-label could not contain every word on the card, and speech users say what they see.
  const label =
    card.state === 'down'
      ? `${SIDE_LABEL[card.side]} card, face down`
      : `${SIDE_LABEL[card.side]}: ${faceText(card)}${matched ? ', matched' : ''}${missed ? '. Not a pair' : ''}`;
  const text = card.text ?? '';
  return (
    <button type="button" onClick={onFlip} disabled={matched || disabled} className="relative aspect-[4/5] w-full rounded-[var(--radius-m)] disabled:cursor-default" style={{ perspective: '900px' }}>
      <span className="sr-only">{`Card ${card.i + 1} of ${total}. ${label}`}</span>
      <span className="absolute inset-0 block transition-transform duration-300 ease-[var(--ease-out)]" style={{ transformStyle: 'preserve-3d', transform: faceUp ? 'rotateY(180deg)' : 'none' }}>
        {/* Back: a big Q or A tells question cards from answer cards, and so does the word. */}
        <span
          className={`piece absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-m)] text-on-accent ${SIDE_BACK[card.side]}`}
          style={{ backfaceVisibility: 'hidden' }}
          aria-hidden
        >
          <span className="font-display text-[2.25rem] leading-none font-extrabold italic sm:text-[2.75rem]">{SIDE_LETTER[card.side]}</span>
          <span className="text-xs font-bold sm:text-sm">{SIDE_LABEL[card.side]}</span>
        </span>
        {/* Face */}
        <span
          className={`absolute inset-0 flex flex-col gap-1 overflow-hidden rounded-[var(--radius-m)] p-1.5 text-left sm:p-2 ${matched ? 'bg-glim text-on-accent' : missed ? 'paper ring-4 ring-ember ring-inset' : 'paper'}`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          aria-hidden
        >
          <span className={`max-w-full self-start truncate rounded-[var(--radius-s)] px-1.5 text-[11px] font-bold sm:text-xs ${card.side === 'question' ? 'bg-dusk text-on-accent' : matched ? 'bg-white/60 text-on-accent' : 'bg-glim text-on-accent'}`}>
            <span className="font-display font-extrabold">{SIDE_LETTER[card.side]}</span> {SIDE_LABEL[card.side]}
          </span>
          {matched ? <Check className="absolute right-1 bottom-1 size-5 rounded-full bg-ink p-0.5 text-white" strokeWidth={3} /> : null}
          {card.media ? <img src={card.media.url} alt="" className="max-h-[45%] w-full rounded-[8px] object-contain" /> : null}
          {text ? <span className={`${matched ? 'line-clamp-3' : 'line-clamp-4'} leading-snug font-bold break-words ${textSize(text)}`}>{text}</span> : null}
        </span>
      </span>
    </button>
  );
}

/** The full text of the cards showing, since a card face only has room for a few words. */
function ReadOut({ cards, title }: { cards: CardFace[]; title: string | null }) {
  if (!cards.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {title ? <p className="font-bold text-text-2">{title}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.i} className={`flex gap-3 rounded-[var(--radius-m)] border border-white/10 px-4 py-3 ${NIGHT}`}>
            <span className="mt-0.5">
              <SideChip side={c.side} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text-2">{SIDE_LABEL[c.side]}</span>
              <span className="block font-bold break-words">{faceText(c)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Team averages with one decimal place (pairs are small numbers, so rounding would hide the race). */
function TeamBars({ teams }: { teams: NonNullable<LanternMatchView['teams']> }) {
  const max = Math.max(1, ...teams.map((t) => t.avg));
  return (
    <ul className="flex flex-col gap-2">
      {[...teams]
        .sort((a, b) => b.avg - a.avg)
        .map((t) => (
          <li key={t.teamId} className="flex items-center gap-3 text-[clamp(1.05rem,1.5vw,1.6rem)]">
            <span className="w-32 truncate font-bold">{t.name}</span>
            <span className="relative h-9 flex-1 overflow-hidden rounded-[var(--radius-s)] bg-white/[0.1]" aria-hidden>
              <span className="absolute inset-0 origin-left rounded-[var(--radius-s)] transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `scaleX(${Math.max(0.03, t.avg / max)})`, background: `hsl(${t.hue} 80% 62%)` }} />
            </span>
            <span className="w-14 text-right font-display font-extrabold tabular">{t.avg.toFixed(1)}</span>
          </li>
        ))}
    </ul>
  );
}

const toLeaderRows = (rows: Row[]): LeaderRow[] => rows.map((r) => ({ playerId: r.playerId, name: r.name, score: r.pairs, rank: r.rank, teamId: r.teamId }));

export function LanternMatchPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<LanternMatchView>) {
  const [busy, setBusy] = useState(false);
  const you = view.you;
  if (!you) return <p className="text-text-2">Watching the game.</p>;

  const flip = async (index: number) => {
    // One flip at a time, so the two cards of an attempt always arrive in order.
    if (busy || paused) return;
    setBusy(true);
    try {
      await act({ type: 'flip', index });
    } finally {
      setBusy(false);
    }
  };

  const up = you.cards.filter((c) => c.state === 'up');
  const pair = (you.lastPair ?? []).map((i) => you.cards[i]).filter((c): c is CardFace => Boolean(c));
  let status: string;
  if (you.missed) status = 'Not a pair. They turn back over when you pick your next card.';
  else if (up.length === 1) status = `Now find the ${up[0]!.side === 'question' ? 'answer' : 'question'} that belongs with it.`;
  else if (you.last?.result === 'cleared') status = 'Board cleared. Here is a new one.';
  else if (you.last?.result === 'match') status = 'A pair. Those two stay face up.';
  else status = 'Turn over any card.';
  const mine = view.leaders.find((r) => r.isYou);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>
            <span className="font-display text-[1.25em] font-extrabold">{you.pairs}</span> {you.pairs === 1 ? 'pair' : 'pairs'}
          </Pill>
          <Pill className="text-text-2">{plural(you.misses, 'miss', 'misses')}</Pill>
          {you.cleared ? <Pill tone="glim">{plural(you.cleared, 'board')} cleared</Pill> : null}
          {mine && view.leaders.length > 1 ? <span className="font-bold text-text-2 tabular">Place {mine.rank}</span> : null}
        </div>
        <Pill>
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      {view.sprint ? (
        <StagePanel className="flex items-center gap-2 px-4 py-2 font-bold">
          <Zap className="size-4 fill-lantern text-lantern" aria-hidden /> Sprint: the first player to clear their board wins.
        </StagePanel>
      ) : null}
      <div className="flex items-center gap-3">
        <ProgressBar value={you.boardPairs} max={you.boardTotal} tone="mint" label="Pairs found on this board" className="border-0! bg-white/[0.12]!" />
        <span className="shrink-0 text-sm font-bold text-text-2 tabular">
          Board {you.board}: {you.boardPairs} / {you.boardTotal}
        </span>
      </div>
      <p className="min-h-6 font-bold" role="status" aria-live="polite">
        {status}
      </p>
      <div key={you.board} className={`mx-auto grid w-full max-w-2xl gap-2 sm:gap-3 ${gridFor(you.cards.length)}`} style={{ animation: you.board > 1 ? 'pop-in 200ms var(--ease-out)' : undefined }}>
        {you.cards.map((c) => (
          <MemoryCard key={c.i} card={c} total={you.cards.length} missed={you.missed && c.state === 'up'} disabled={paused} onFlip={() => void flip(c.i)} />
        ))}
      </div>
      <ReadOut cards={up.length ? up : pair} title={you.missed ? 'These two do not belong together:' : up.length ? null : pair.length ? 'Matched:' : null} />
      {view.leaders.length > 1 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-2xl font-bold">Most pairs</h3>
          <Leaderboard rows={toLeaderRows(view.leaders)} you={mine ? toLeaderRows([mine])[0] : null} players={room.players} teams={room.room.teams} label={(r) => plural(r.score, 'pair')} />
        </div>
      ) : null}
    </div>
  );
}

/** Projector columns for the pairs table: more as the class grows, at most eight rows each (two columns beside team scores). */
const tableColumns = (n: number, teams: boolean) => Math.min(teams ? 2 : 3, n <= 8 ? 1 : n <= 16 ? 2 : 3);
const TABLE_ROWS = 8;

export function LanternMatchHost({ view, gameNow, room }: ModeScreenProps<LanternMatchView>) {
  const all = view.leaders;
  const cols = tableColumns(all.length, Boolean(view.teams));
  const cap = cols * TABLE_ROWS;
  // Showing every row but one would waste the line that counts them.
  const rows = all.length > cap ? all.slice(0, cap - 1) : all;
  const more = room.players.length - rows.length;
  const perCol = Math.ceil(rows.length / cols);
  const text = 'text-[clamp(1rem,min(1.6vw,2.8vh),1.75rem)]';
  // Rows get smaller type once there are several columns, so eight two-line rows fit under the title.
  const rowText = cols === 1 ? text : 'text-[clamp(0.95rem,min(1.3vw,2.3vh),1.6rem)]';
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <ModeTitle>Lantern Match</ModeTitle>
          <p className={`mt-2 font-semibold text-text-2 ${text}`}>{view.sprint ? 'Sprint: the first to clear a board wins.' : `Find the pairs. ${view.pairsPerBoard} pairs on every board.`}</p>
        </div>
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <div className={`grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] ${view.teams ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* Rows share the screen's height, so a whole class fits a projector without scrolling. */}
          <ol
            className={`grid grid-flow-col gap-x-[clamp(0.75rem,1.4vw,1.25rem)] gap-y-1.5 leading-tight ${rowText}`}
            aria-label="Pairs found"
            style={{ '--lb-rank': 'clamp(2rem, 4.2vh, 3.5rem)', '--rows': perCol, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${perCol}, auto)` } as CSSProperties}
          >
            {rows.map((r) => (
              <li key={r.playerId} className={`grid min-w-0 grid-cols-[auto_auto_1fr_auto] items-center gap-[clamp(0.5rem,1vw,1rem)] rounded-[var(--radius-m)] px-3 py-1 ${NIGHT}`}>
                <RankBadge rank={r.rank} big />
                <PlayerGlim avatar={avatarOf(room.players, r.playerId)} seed={r.playerId} size={56} className="size-[clamp(1.75rem,calc((76dvh-8rem)/var(--rows)-1rem),4.25rem)]" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-bold">{r.name}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <ProgressBar value={r.boardPairs} max={r.boardTotal} tone="mint" label={`${r.name}: board ${r.cleared + 1}, ${r.boardPairs} of ${r.boardTotal} pairs`} className="max-w-xs min-w-0 border-0! bg-white/[0.12]!" />
                    <span className="text-[0.8em] font-semibold whitespace-nowrap text-text-2 tabular">{r.cleared ? `${plural(r.cleared, 'board')} cleared` : `${r.boardPairs} / ${r.boardTotal}`}</span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-[1.5em] leading-none font-extrabold tabular">{r.pairs}</span>
                  <span className="block text-[0.8em] font-semibold whitespace-nowrap text-text-2 tabular">{plural(r.misses, 'miss', 'misses')}</span>
                </span>
              </li>
            ))}
          </ol>
          {more > 0 ? <p className={`font-semibold text-text-2 ${text}`}>And {more} more {more === 1 ? 'player' : 'players'}.</p> : null}
        </div>
        {view.teams ? (
          <StagePanel className="flex flex-col gap-3 p-5">
            <h3 className="font-display text-[clamp(1.6rem,2.5vw,2.75rem)] font-bold">Teams: pairs per player</h3>
            <TeamBars teams={view.teams} />
          </StagePanel>
        ) : null}
      </div>
    </div>
  );
}
