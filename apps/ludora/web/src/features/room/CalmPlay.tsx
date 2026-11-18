import { Feather, Hand, MessageCircleQuestion } from 'lucide-react';
import { useNow } from '../../lib/useNow.ts';
import { useModes } from '../../lib/queries.ts';
import { CALM_GENERAL } from './walkthrough.ts';
import { useAnnounce } from './game/announce.tsx';
import { StagePanel } from './game/stage.tsx';

/*
 * What players see of calm play (docs/DECISIONS.md, D57): that it is on and who chose it, and in the
 * modes that take turns, whose turn it is. The rules themselves are the server's.
 */

/** A small tag beside the room's name while calm play is on. */
export function CalmPlayTag({ solo, isHost }: { solo: boolean; isHost: boolean }) {
  const who = solo || isHost ? 'Calm play is on.' : 'Calm play is on: your teacher chose it.';
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-glim px-1.5 py-0.5 text-xs sm:px-2 font-bold text-on-accent sm:text-sm" title={who} data-calm-tag>
      <Feather className="size-3.5" aria-hidden />
      {/* On a phone the leaf alone, so the game's code beside it is never cut short. */}
      <span aria-hidden className="max-sm:hidden">Calm</span>
      <span className="sr-only">{who}</span>
    </span>
  );
}

/** In the lobby: calm play is on, what it means, and (for players) that the teacher chose it. */
export function CalmPlayNote({ modeId, solo, isHost, big = false, className = '' }: { modeId: string; solo: boolean; isHost: boolean; big?: boolean; className?: string }) {
  const calmPlay = useModes().data?.modes.find((m) => m.meta.id === modeId)?.meta.calmPlay;
  const who = isHost ? 'You chose calm play for this game.' : solo ? 'Calm play is on.' : 'Your teacher chose calm play.';
  return (
    <StagePanel className={`flex items-start gap-3 border-glim/50 px-4 py-3 text-left ${className}`}>
      <Feather className={`shrink-0 text-glim ${big ? 'size-8' : 'size-6'}`} aria-hidden />
      <p className={big ? 'text-lg leading-snug' : 'text-sm leading-snug'}>
        <span className="font-bold text-text">{who} </span>
        <span className="text-text-2">{calmPlay ?? CALM_GENERAL}</span>
      </p>
    </StagePanel>
  );
}

export interface CalmTurnView {
  phase: 'question' | 'go';
  goUntil: number | null;
}

/**
 * In a mode that takes turns: whose turn it is now. "Answer" while a question is open (the action
 * waits, so its buttons are put away), "Your go" while it is time to act (no question is open).
 * Each change is read out once.
 */
export function CalmTurn({ turn, gameNow, waiting, going, timed = true }: { turn: CalmTurnView; gameNow: () => number; waiting: string; going: string; timed?: boolean }) {
  // Only the go is timed on screen (when the next question comes); answering has no clock beyond the question's own.
  const until = timed && turn.phase === 'go' ? turn.goUntil : null;
  useNow(500, until !== null);
  const left = until !== null ? Math.max(0, Math.ceil((until - gameNow()) / 1000)) : null;
  useAnnounce(turn.phase === 'question' ? `Answer time. ${waiting}` : `Your go. ${going}`, `${turn.phase}|${turn.goUntil ?? ''}`);
  const question = turn.phase === 'question';
  return (
    <StagePanel className={`flex items-center gap-3 px-4 py-3 ${question ? 'border-sky/60' : 'border-glim/60'}`} label="Calm play: whose turn it is">
      {question ? <MessageCircleQuestion className="size-7 shrink-0 text-sky" aria-hidden /> : <Hand className="size-7 shrink-0 text-glim" aria-hidden />}
      <p className="min-w-0 flex-1 leading-snug" data-calm-turn={turn.phase}>
        <span className="font-display text-lg font-bold text-text">{question ? 'Answer time. ' : 'Your go! '}</span>
        <span className="text-text-2">{question ? waiting : going}</span>
      </p>
      {left !== null ? (
        <span className="shrink-0 rounded-full bg-white/[0.09] px-3 py-1 text-sm font-bold text-text tabular" aria-hidden>
          {left} s
        </span>
      ) : null}
    </StagePanel>
  );
}
