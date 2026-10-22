import type { ReactNode } from 'react';
import type { RoomPlayerView, RoomView } from '@ludora/shared';
import { useNow } from '../../../lib/useNow.ts';
import { Pill, PlayerGlim, SIGN, StagePanel } from './stage.tsx';
import { useAnnounce } from './announce.tsx';
import { useLastAnswerWords } from './answerMemory.tsx';

/*
 * Pieces shared by the round-based screens: the intro, the round header, the
 * "answer locked in" wait and the explanation. `big` is the projector size.
 */

/** Seconds until a moment on the game clock, as one big number in a lantern disc. */
export function BigCountdown({ until, gameNow, big = false, label = 'Starting in' }: { until: number | null; gameNow: () => number; big?: boolean; label?: string }) {
  useNow(250, until !== null);
  if (until === null) return null;
  const secs = Math.max(0, Math.ceil((until - gameNow()) / 1000));
  return (
    <span
      className={`grid place-items-center rounded-full border-ink bg-lantern font-display leading-none font-extrabold text-on-accent tabular ${big ? 'size-[clamp(6rem,15vh,10rem)] border-4 text-[clamp(3rem,8vh,5.5rem)] shadow-[0_6px_0_var(--ink)]' : 'size-24 border-[3px] text-5xl shadow-[0_4px_0_var(--ink)]'}`}
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
      {players.length > shown.length ? <span className="mb-2 font-display text-xl font-extrabold">+{players.length - shown.length}</span> : null}
    </div>
  );
}

/**
 * The "get ready" screen before the first question. `kicker` sits above the
 * title (Classic keeps its "Get ready" line there) and `art` above it. The
 * projector version lines every player's Glim up underneath.
 */
export function IntroScreen({ kicker, title, children, until, gameNow, big = false, art, room, lineUp = big }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode; until: number | null; gameNow: () => number; big?: boolean; art?: ReactNode; room: RoomView; lineUp?: boolean }) {
  useAnnounce(`The game is starting: ${typeof title === 'string' ? title : room.room.title}. The first question is coming up.`, 'intro');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(1rem,3vh,2rem)] text-center" style={{ animation: 'pop-in 300ms var(--ease-spring)' }}>
      {art}
      <div className="flex flex-col items-center gap-2">
        {kicker ? <p className={`font-display font-bold text-text-2 ${big ? 'text-[clamp(1.5rem,2.6vw,3rem)]' : 'text-2xl'}`}>{kicker}</p> : null}
        <h2 className={`font-display leading-none font-extrabold ${SIGN} ${big ? 'text-[clamp(3.5rem,7.5vw,9rem)]' : 'text-5xl'}`}>{title}</h2>
      </div>
      {children ? <div className={`max-w-[46ch] font-semibold text-text-2 ${big ? 'text-[clamp(1.2rem,1.9vw,2.2rem)]' : 'text-lg'}`}>{children}</div> : null}
      <BigCountdown until={until} gameNow={gameNow} big={big} label="First question in" />
      {lineUp ? <LineUp players={room.players} big={big} /> : null}
    </div>
  );
}

/** "Question 2 of 10" on the left, anything else (score, answered count) on the right. */
export function RoundHeader({ round, total, children, big = false, label = 'Question' }: { round: number; total: number; children?: ReactNode; big?: boolean; label?: string }) {
  useAnnounce(`${label} ${round + 1} of ${total}.`, `${label}${round}`);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* `!`: Pill's own px-3 would otherwise win over a smaller padding passed in. */}
      <Pill className={big ? 'px-5 py-1.5 text-[clamp(1.1rem,1.8vw,2rem)]' : 'px-2.5! text-sm min-[400px]:px-3! min-[400px]:text-base'}>
        {label} {round + 1} of {total}
      </Pill>
      {children ? <div className={`flex flex-wrap items-center justify-end gap-1.5 ${big ? 'gap-2 text-[clamp(1.1rem,1.8vw,2rem)]' : 'text-sm min-[400px]:text-base [&>*]:px-2.5'}`}>{children}</div> : null}
    </div>
  );
}

/** The wait after answering: the player's Glim and how many are still thinking. */
export function LockedIn({ answered, eligible, avatar, seed, title = 'Answer locked in' }: { answered: number; eligible: number; avatar: RoomPlayerView['avatar'] | undefined; seed: string; title?: string }) {
  // Said once; the count is there to read, but re-reading it on every answer would drown a big class.
  const mine = useLastAnswerWords();
  useAnnounce(`${title}.${mine ? ` Your answer: ${mine}.` : ''}`, title);
  return (
    <StagePanel className="flex items-center gap-4 px-4 py-4" as="div">
      <PlayerGlim avatar={avatar} seed={seed} size={84} bob className="shrink-0" />
      <div className="min-w-0">
        <p className="font-display text-2xl font-extrabold">{title}</p>
        {mine ? <p className="font-bold break-words text-text">Your answer: {mine}</p> : null}
        <p className="font-semibold text-text-2">
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
