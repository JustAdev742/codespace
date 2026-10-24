import type { ReactNode } from 'react';
import { Flame } from 'lucide-react';
import type { RoomPlayerView, RoomView } from '@ludora/shared';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber } from '../../../lib/format.ts';
import { PlayerGlim, StagePanel } from './stage.tsx';
import { useAnnounce } from './announce.tsx';
import { useLastAnswerWords } from './answerMemory.tsx';

/*
 * Pieces shared by the round-based screens: the intro, the HUD row with the
 * question number on its plate, the score and streak readouts, the "answer
 * locked in" wait and the explanation. `big` is the projector size.
 */

/** Seconds until a moment on the game clock, as one big italic number on a gold disc. */
export function BigCountdown({ until, gameNow, big = false, label = 'Starting in' }: { until: number | null; gameNow: () => number; big?: boolean; label?: string }) {
  useNow(250, until !== null);
  if (until === null) return null;
  const secs = Math.max(0, Math.ceil((until - gameNow()) / 1000));
  return (
    <span
      className={`lift grid place-items-center rounded-full bg-lantern font-display leading-none font-extrabold text-on-accent italic tabular ${big ? 'size-[clamp(6rem,15vh,10rem)] text-[clamp(3.5rem,9vh,6.25rem)]' : 'size-24 text-[3.5rem]'}`}
      role="timer"
      aria-label={`${label} ${secs} seconds`}
    >
      {secs}
    </span>
  );
}

/** The players lined up along the bottom of an intro, so everyone spots their Glim before the first question. */
export function LineUp({ players, big = false }: { players: RoomPlayerView[]; big?: boolean }) {
  // Sixteen Glims and the count of the rest fit one row on a 1366 or 1920 projector; a second row would push the intro off screen.
  const shown = players.slice(0, big ? 16 : 8);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap items-end justify-center gap-[clamp(0.25rem,0.8vw,0.9rem)]" aria-hidden>
      {shown.map((p) => (
        <PlayerGlim key={p.id} avatar={p.avatar} seed={p.id} size={64} className={big ? 'size-[clamp(3.5rem,8vh,6rem)]' : 'size-12'} />
      ))}
      {players.length > shown.length ? <span className="mb-2 font-display text-2xl font-extrabold tabular">+{players.length - shown.length}</span> : null}
    </div>
  );
}

/**
 * The "get ready" screen before the first question. `kicker` sits on a gold
 * plate above the title (Classic keeps its "Get ready" line there) and `art`
 * above it. The projector version lines every player's Glim up underneath.
 */
export function IntroScreen({ kicker, title, children, until, gameNow, big = false, art, room, lineUp = big }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode; until: number | null; gameNow: () => number; big?: boolean; art?: ReactNode; room: RoomView; lineUp?: boolean }) {
  useAnnounce(`The game is starting: ${typeof title === 'string' ? title : room.room.title}. The first question is coming up.`, 'intro');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(1rem,3vh,2rem)] text-center" style={{ animation: 'rise-fade 220ms var(--ease-out)' }}>
      {art}
      <div className="flex flex-col items-center gap-[clamp(0.6rem,1.6vh,1rem)]">
        {kicker ? (
          <p className={`plate plate-gold ${big ? 'text-[clamp(1.5rem,2.6vw,3rem)]' : 'text-2xl'}`}>
            <span>{kicker}</span>
          </p>
        ) : null}
        <h2 className={`font-display leading-[0.95] font-extrabold ${big ? 'text-[clamp(3.75rem,8vw,9.5rem)]' : 'text-[3.25rem]'}`}>{title}</h2>
      </div>
      {children ? <div className={`max-w-[46ch] font-semibold text-text-2 ${big ? 'text-[clamp(1.2rem,1.9vw,2.2rem)]' : 'text-lg'}`}>{children}</div> : null}
      <BigCountdown until={until} gameNow={gameNow} big={big} label="First question in" />
      {lineUp ? <LineUp players={room.players} big={big} /> : null}
    </div>
  );
}

/**
 * A big screen's title: the mode's name on the blue slanted plate, the way a
 * broadcast names its event. An h2: during play the room's title is the page's h1.
 */
export function ModeTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // Sized to take no more height than the plain heading it replaced, so screens fitted to a 768-pixel projector still fit.
    <h2 className={`plate plate-blue px-[0.55em] py-[0.04em] text-[clamp(1.85rem,min(3.4vw,5.9vh),4rem)] ${className}`}>
      <span>{children}</span>
    </h2>
  );
}

/**
 * The HUD row of a round: "Question 2 of 10" on the slanted plate on the left,
 * anything else (the score, the streak, the answered count) on the right.
 */
export function RoundHeader({ round, total, children, big = false, label = 'Question' }: { round: number; total: number; children?: ReactNode; big?: boolean; label?: string }) {
  useAnnounce(`${label} ${round + 1} of ${total}.`, `${label}${round}`);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      {/* Large text at every size, so white on the blue plate passes AA (3:1 for large text). */}
      <p className={`plate plate-blue tabular ${big ? 'text-[clamp(1.4rem,2.1vw,2.4rem)]' : 'text-xl'}`}>
        <span>
          {label} {round + 1} of {total}
        </span>
      </p>
      {children ? <div className={`flex flex-wrap items-center justify-end ${big ? 'gap-3 text-[clamp(1.1rem,1.8vw,2rem)]' : 'gap-2 text-sm min-[400px]:text-base'}`}>{children}</div> : null}
    </div>
  );
}

/**
 * A score in a HUD row: the number big in the display face, its unit small
 * beside it. The number is the hero; `label` is what a screen reader hears first.
 */
export function HudScore({ value, unit = 'pts', big = false, label = 'Score', className = '' }: { value: number; unit?: string; big?: boolean; label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 leading-none whitespace-nowrap ${className}`}>
      <span className="sr-only">{label}: </span>
      <span className={`font-display font-extrabold tabular ${big ? 'text-[clamp(1.75rem,2.8vw,3.25rem)]' : 'text-[1.75rem]'}`}>{formatNumber(value)}</span>
      <span className={`font-bold text-text-2 ${big ? 'text-[0.9em]' : 'text-sm'}`}>{unit}</span>
    </span>
  );
}

/**
 * A count in a HUD row, the number as the hero: "5 of 6 answered", "3 of 8 still standing".
 * Reads as one line of text, so it can be found and announced as one.
 */
export function HudCount({ value, total, label, big = false, className = '' }: { value: number; total?: number | null; label: string; big?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-full bg-white/[0.09] leading-none whitespace-nowrap ${big ? 'px-5 py-2' : 'px-3 py-1.5'} ${className}`}>
      <span className={`font-display font-extrabold tabular ${big ? 'text-[1.6em]' : 'text-[1.35em]'}`}>{value}</span>{' '}
      <span className="font-bold text-text-2">
        {total !== undefined && total !== null ? `of ${total} ` : ''}
        {label}
      </span>
    </span>
  );
}

/** A streak of right answers as a gold chip with a flame: "Streak ×3". Shows from two in a row; `children` replaces the words. */
export function StreakChip({ streak, children, className = '' }: { streak: number; children?: ReactNode; className?: string }) {
  if (streak < 2) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-lantern px-2.5 py-1 leading-tight font-bold whitespace-nowrap text-on-accent tabular ${className}`}>
      <Flame className="size-[1.05em] shrink-0" aria-hidden />
      {children ?? <>Streak ×{streak}</>}
    </span>
  );
}

/** The wait after answering: the player's Glim and how many are still thinking. */
export function LockedIn({ answered, eligible, avatar, seed, title = 'Answer locked in' }: { answered: number; eligible: number; avatar: RoomPlayerView['avatar'] | undefined; seed: string; title?: string }) {
  // Said once; the count is there to read, but re-reading it on every answer would drown a big class.
  const mine = useLastAnswerWords();
  useAnnounce(`${title}.${mine ? ` Your answer: ${mine}.` : ''}`, title);
  return (
    <StagePanel className="flex items-center gap-4 px-4 py-3.5" as="div">
      <PlayerGlim avatar={avatar} seed={seed} size={72} className="shrink-0" />
      <div className="min-w-0">
        <p className="font-display text-[1.75rem] leading-tight font-extrabold">{title}</p>
        {mine ? <p className="font-bold break-words text-text">Your answer: {mine}</p> : null}
        <p className="font-semibold text-text-2 tabular">
          {answered} of {eligible} have answered.
        </p>
      </div>
    </StagePanel>
  );
}

/** Why the answer is right, in a calm panel. */
export function Explanation({ text, big = false }: { text: string | null | undefined; big?: boolean }) {
  if (!text) return null;
  return <StagePanel className={`font-semibold text-text ${big ? 'px-6 py-4 text-[clamp(1.1rem,1.7vw,1.9rem)]' : 'px-4 py-3'}`}>{text}</StagePanel>;
}

/** The player's own Glim, looked up from the room. */
export function myAvatar(room: RoomView) {
  return room.players.find((p) => p.id === room.me.playerId)?.avatar;
}
