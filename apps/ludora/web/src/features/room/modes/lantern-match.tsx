import { useState, type CSSProperties } from 'react';
import { Check, Zap } from 'lucide-react';
import type { GlimArt, LanternArt, Media } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import { Countdown } from '../game/TimerBar.tsx';
import { Leaderboard, RankBadge, type LeaderRow } from '../game/Leaderboard.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { Lantern } from '../../../art/Lantern.tsx';
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

const LANTERN_ART: LanternArt = { hue: 262, accentHue: 42, pattern: 'stars' };
const GLIM_ART: GlimArt = { kind: 'glim', body: 'blob', hue: 160, accentHue: 45, saturation: 70, eyes: 'happy', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true };
const SIDE_LABEL: Record<Side, string> = { question: 'Question', answer: 'Answer' };

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
  const label =
    card.state === 'down'
      ? `${SIDE_LABEL[card.side]} card, face down`
      : `${matched ? 'Matched ' : ''}${SIDE_LABEL[card.side].toLowerCase()}: ${faceText(card)}${missed ? '. Not a pair' : ''}`;
  const text = card.text ?? '';
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={matched || disabled}
      aria-label={`Card ${card.i + 1} of ${total}. ${label}`}
      className="relative aspect-[4/5] w-full rounded-[14px] disabled:cursor-default"
      style={{ perspective: '900px' }}
    >
      <span className="absolute inset-0 block transition-transform duration-300 ease-[var(--ease-out)]" style={{ transformStyle: 'preserve-3d', transform: faceUp ? 'rotateY(180deg)' : 'none' }}>
        {/* Back: the picture tells question cards (lantern) from answer cards (Glim), and so does the word. */}
        <span
          className={`sticker absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[14px] ${card.side === 'question' ? 'bg-dusk text-white' : 'bg-glim text-on-accent'}`}
          style={{ backfaceVisibility: 'hidden' }}
          aria-hidden
        >
          {card.side === 'question' ? <Lantern art={LANTERN_ART} size={38} /> : <Glim art={GLIM_ART} size={46} />}
          <span className="font-display text-xs font-extrabold sm:text-sm">{SIDE_LABEL[card.side]}</span>
        </span>
        {/* Face */}
        <span
          className={`absolute inset-0 flex flex-col gap-1 overflow-hidden rounded-[14px] border-[3px] p-1.5 text-left sm:p-2 ${
            matched ? 'border-ink bg-glim text-on-accent' : missed ? 'paper border-ember ring-4 ring-ember' : 'paper border-ink'
          }`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          aria-hidden
        >
          <span className={`max-w-full self-start truncate rounded-full px-1.5 text-[11px] font-bold sm:text-xs ${card.side === 'question' ? 'bg-dusk text-on-accent' : matched ? 'bg-white/60 text-on-accent' : 'bg-glim text-on-accent'}`}>{SIDE_LABEL[card.side]}</span>
          {matched ? <Check className="absolute right-1 bottom-1 size-5 rounded-full border-2 border-ink bg-white p-0.5 text-on-accent" /> : null}
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
          <div key={c.i} className={`flex gap-3 rounded-[16px] border border-white/12 px-4 py-3 ${NIGHT}`}>
            <span className="mt-0.5 shrink-0" aria-hidden>
              {c.side === 'question' ? <Lantern art={LANTERN_ART} size={22} /> : <Glim art={GLIM_ART} size={26} />}
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
            <span className="relative h-9 flex-1 overflow-hidden rounded-[12px] border-2 border-ink bg-[rgb(17_10_62/0.7)]" aria-hidden>
              <span className="absolute inset-0 origin-left rounded-[10px] transition-transform duration-700 ease-[var(--ease-out)]" style={{ transform: `scaleX(${Math.max(0.03, t.avg / max)})`, background: `hsl(${t.hue} 80% 62%)` }} />
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
  else if (you.last?.result === 'cleared') status = 'Board cleared! Here is a new one.';
  else if (you.last?.result === 'match') status = 'A pair! Those two stay face up.';
  else status = 'Turn over any card.';
  const mine = view.leaders.find((r) => r.isYou);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{plural(you.pairs, 'pair')}</Pill>
          <Pill className="text-text-2">{plural(you.misses, 'miss', 'misses')}</Pill>
          {you.cleared ? <Pill tone="glim">{plural(you.cleared, 'board')} cleared</Pill> : null}
          {mine && view.leaders.length > 1 ? <span className="font-bold text-text-2">Place {mine.rank}</span> : null}
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
        <ProgressBar value={you.boardPairs} max={you.boardTotal} tone="mint" label="Pairs found on this board" />
        <span className="shrink-0 text-sm font-bold text-text-2 tabular">
          Board {you.board}: {you.boardPairs} / {you.boardTotal}
        </span>
      </div>
      <p className="min-h-6 font-bold" role="status" aria-live="polite">
        {status}
      </p>
      <div key={you.board} className={`mx-auto grid w-full max-w-2xl gap-2 sm:gap-3 ${gridFor(you.cards.length)}`} style={{ animation: you.board > 1 ? 'pop-in 260ms var(--ease-spring)' : undefined }}>
        {you.cards.map((c) => (
          <MemoryCard key={c.i} card={c} total={you.cards.length} missed={you.missed && c.state === 'up'} disabled={paused} onFlip={() => void flip(c.i)} />
        ))}
      </div>
      <ReadOut cards={up.length ? up : pair} title={you.missed ? 'These two do not belong together:' : up.length ? null : pair.length ? 'Matched:' : null} />
      {view.leaders.length > 1 ? (
        <div className="flex flex-col gap-2">
          <h3 className={`font-display text-xl font-extrabold ${SIGN}`}>Most pairs</h3>
          <Leaderboard rows={toLeaderRows(view.leaders)} you={mine ? toLeaderRows([mine])[0] : null} players={room.players} teams={room.room.teams} label={(r) => plural(r.score, 'pair')} />
        </div>
      ) : null}
    </div>
  );
}

export function LanternMatchHost({ view, gameNow, room }: ModeScreenProps<LanternMatchView>) {
  const rows = view.leaders;
  const text = 'text-[clamp(1.05rem,1.6vw,1.75rem)]';
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`font-display text-[clamp(2.25rem,4vw,4.75rem)] leading-none font-extrabold ${SIGN}`}>Lantern Match</h2>
          <p className={`mt-1 font-semibold text-text-2 ${text}`}>{view.sprint ? 'Sprint: the first to clear a board wins.' : `Find the pairs. ${view.pairsPerBoard} pairs on every board.`}</p>
        </div>
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <div className={`grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] ${view.teams ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''}`}>
        <ol className={`flex flex-col gap-1.5 ${text}`} aria-label="Pairs found" style={{ '--lb-rank': 'clamp(2.5rem, 5.5vh, 3.75rem)' } as CSSProperties}>
          {rows.map((r) => (
            <li key={r.playerId} className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-[clamp(0.6rem,1.2vw,1.25rem)] rounded-[20px] border border-white/12 px-3 py-1.5 ${NIGHT}`}>
              <RankBadge rank={r.rank} big />
              <PlayerGlim avatar={avatarOf(room.players, r.playerId)} seed={r.playerId} size={56} className="size-[clamp(2.75rem,6vh,4.25rem)]" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-bold">{r.name}</span>
                <span className="flex items-center gap-2">
                  <ProgressBar value={r.boardPairs} max={r.boardTotal} tone="mint" label={`${r.name}: board ${r.cleared + 1}, ${r.boardPairs} of ${r.boardTotal} pairs`} className="max-w-xs" />
                  <span className="text-[0.8em] font-semibold whitespace-nowrap text-text-2 tabular">{r.cleared ? `${plural(r.cleared, 'board')} cleared` : `${r.boardPairs} / ${r.boardTotal}`}</span>
                </span>
              </span>
              <span className="text-right">
                <span className="block font-display text-[1.6em] leading-none font-extrabold tabular">{r.pairs}</span>
                <span className="block text-[0.8em] font-semibold text-text-2 tabular">{plural(r.misses, 'miss', 'misses')}</span>
              </span>
            </li>
          ))}
        </ol>
        {view.teams ? (
          <StagePanel className="flex flex-col gap-3 p-5">
            <h3 className="font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold">Teams: pairs per player</h3>
            <TeamBars teams={view.teams} />
          </StagePanel>
        ) : null}
      </div>
    </div>
  );
}
