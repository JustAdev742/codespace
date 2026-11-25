import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, Trophy } from 'lucide-react';
import { levelFromXp, type LevelInfo, type RewardSummary } from '@ludora/shared';
import { CurrencyIcon } from '../../art/icons.tsx';
import { Badge } from '../../ui/primitives.tsx';
import { buttonClass } from '../../ui/Button.tsx';
import { formatNumber } from '../../lib/format.ts';
import { useSfx } from '../../lib/sound/react.tsx';
import { useAnnounce } from './game/announce.tsx';
import { useCountUp } from './game/countUp.ts';
import { motionOK } from './game/stage.tsx';
import { Burst } from '../../art/bursts.tsx';

/*
 * What a player earned from the game, on their own results screen: the Sparks and XP counting up, the
 * level bar filling from where it stood to where it stands now (through a level-up when there was
 * one), and each quest's progress as a bar. It reports; it never asks for another game. With less
 * motion the numbers and bars are simply at their final values.
 */

export interface XpJourney {
  before: LevelInfo;
  after: LevelInfo;
  /** The game took the player up at least one level. */
  levelled: boolean;
}

/** Where the level bar stood before a game's XP and where it stands after. `total` is the XP in all, after the game. */
export function xpJourney(total: number, gained: number): XpJourney {
  const after = levelFromXp(Math.max(0, total));
  const before = levelFromXp(Math.max(0, total - Math.max(0, gained)));
  return { before, after, levelled: after.level > before.level };
}

/** How full a level's bar is, 0 to 1. The top level has no more to earn: its bar is full. */
export const levelShare = (l: LevelInfo): number => (l.needed > 0 ? Math.max(0, Math.min(1, l.into / l.needed)) : 1);

/** When the bar starts to move after the card appears, and how long it takes (ms): longer through a level-up. */
const FILL_AFTER = 350;
const FILL_MS = { one: 900, through: 1500 };
/** Slides (never resizes) the fill: full at 0%, empty at -100%. */
const at = (share: number) => ({ transform: `translateX(${(share - 1) * 100}%)` });

/** The level bar, filling from where it was to where it is. Through a level-up it runs to the end, empties, and fills again. */
function LevelBar({ journey }: { journey: XpJourney }) {
  const { before, after, levelled } = journey;
  const fill = useRef<HTMLDivElement>(null);
  // The level on the plate changes as the bar runs over, not before.
  const [level, setLevel] = useState(() => (motionOK() ? before.level : after.level));
  useEffect(() => {
    const el = fill.current;
    if (!el || !motionOK() || typeof el.animate !== 'function') {
      setLevel(after.level);
      return;
    }
    const from = at(levelShare(before));
    const to = at(levelShare(after));
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const anim = levelled
      ? el.animate([{ ...from, easing: ease }, { ...at(1), offset: 0.5 }, { ...at(0), offset: 0.5, easing: ease }, to], { duration: FILL_MS.through, delay: FILL_AFTER, fill: 'backwards' })
      : el.animate([from, to], { duration: FILL_MS.one, delay: FILL_AFTER, easing: ease, fill: 'backwards' });
    const turn = levelled ? setTimeout(() => setLevel(after.level), FILL_AFTER + FILL_MS.through / 2) : null;
    return () => {
      anim.cancel();
      if (turn) clearTimeout(turn);
    };
    // Once, as the card appears: the journey does not change while it is on screen.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const left = after.needed - after.into;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* The pop is on a wrapper: a plate's lean is a transform of its own. */}
        <span key={level} className="relative inline-flex" style={level !== before.level && motionOK() ? { animation: 'pop-in 260ms var(--ease-spring) both' } : undefined}>
          <span className="plate plate-gold text-lg">
            <span className="tabular">Level {level}</span>
          </span>
          {/* A level is earned, never drawn by chance: where the stage's effects are up it turns over in a ring of stars (fx/). */}
          {level !== before.level ? <Burst extra style="stars" hue={44} size={260} count={10} /> : null}
        </span>
        <span className="text-sm font-semibold text-text-2 tabular">{after.needed ? `${formatNumber(left)} XP to level ${after.level + 1}` : 'Top level reached'}</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-sunken shadow-[inset_0_0_0_1px_var(--line)]" role="progressbar" aria-label={`Level ${after.level} progress`} aria-valuemin={0} aria-valuemax={after.needed || 1} aria-valuenow={after.needed ? after.into : 1}>
        {/* A darker edge, so the gold reads against the pale groove of the white card (3:1, as a meaningful graphic needs). */}
        <div ref={fill} className="h-full rounded-full bg-lantern shadow-[inset_0_0_0_1px_rgb(0_0_0/0.35)]" style={at(levelShare(after))} />
      </div>
    </div>
  );
}

/** One figure of the reward: its name, then the number counting up. Screen readers get the final number. */
function Figure({ label, value, icon }: { label: string; value: number; icon?: 'sparks' }) {
  const shown = useCountUp(value, 750, 0, 150);
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
      <span className="text-sm font-semibold text-text-2">{label}</span>
      <span className="flex items-center gap-1.5 font-display text-[2rem] leading-tight font-extrabold tabular">
        {icon ? <CurrencyIcon code={icon} size={24} /> : null}
        <span aria-hidden>+{formatNumber(shown)}</span>
        <span className="sr-only">plus {formatNumber(value)}</span>
      </span>
    </div>
  );
}

function Quest({ quest }: { quest: RewardSummary['quests'][number] }) {
  const share = quest.target > 0 ? Math.max(0, Math.min(1, quest.progress / quest.target)) : 0;
  return (
    <li className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 font-semibold break-words">{quest.title}</span>
        {quest.completed ? (
          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-glim">
            <Check className="size-4" strokeWidth={3} aria-hidden /> Complete
          </span>
        ) : (
          <span className="shrink-0 text-text-2 tabular">
            {formatNumber(quest.progress)} of {formatNumber(quest.target)}
          </span>
        )}
      </span>
      {/* Read as text above; the bar is the same again for the eye. */}
      <span className="block h-2 overflow-hidden rounded-full bg-sunken shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
        <span className="block h-full rounded-full bg-glim shadow-[inset_0_0_0_1px_rgb(0_0_0/0.35)]" style={at(quest.completed ? 1 : share)} />
      </span>
    </li>
  );
}

export function Rewards({ rewards, guest }: { rewards: RewardSummary | null; guest: boolean }) {
  useAnnounce(
    rewards?.status === 'granted' ? `You earned ${formatNumber(rewards.sparks)} Sparks and ${formatNumber(rewards.xp)} XP.${rewards.levelUp ? ` You reached level ${rewards.levelUp.to}.` : ''}` : null,
    rewards?.status,
  );
  useSfx('levelUp', rewards?.levelUp?.to ?? null, Boolean(rewards?.levelUp));
  if (!rewards) return null;
  if (rewards.status === 'pending') {
    return (
      <div className="paper stage-card px-5 py-4" data-rewards>
        <p className="font-semibold">Adding up your rewards…</p>
      </div>
    );
  }
  const journey = rewards.status === 'granted' && rewards.xpTotal !== undefined ? xpJourney(rewards.xpTotal, rewards.xp) : null;
  const done = rewards.quests.some((q) => q.completed);
  return (
    <div className="paper stage-card flex flex-col gap-3.5 px-5 py-4" data-rewards style={motionOK() ? { animation: 'pop-in 200ms var(--ease-out)' } : undefined}>
      <h2 className="font-display text-[1.75rem] leading-tight font-bold">Your rewards</h2>
      {rewards.status === 'granted' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Figure label="Sparks" value={rewards.sparks} icon="sparks" />
            <Figure label="XP" value={rewards.xp} />
          </div>
          {journey ? <LevelBar journey={journey} /> : rewards.levelUp ? <Badge tone="violet">Level {rewards.levelUp.to}</Badge> : null}
        </>
      ) : null}
      {rewards.quests.length ? (
        <section aria-labelledby="reward-quests" className="flex flex-col gap-2">
          <h3 id="reward-quests" className="text-sm font-bold text-text-2">
            Quests
          </h3>
          <ul className="flex flex-col gap-2.5">
            {rewards.quests.map((q) => (
              <Quest key={q.title} quest={q} />
            ))}
          </ul>
          {done ? <p className="text-sm font-semibold text-text-2">Claim a finished quest on the quests page.</p> : null}
        </section>
      ) : null}
      {rewards.achievements.map((a) => (
        <p key={a.title} className="flex items-center gap-2 font-semibold text-lantern">
          <Trophy className="size-4 shrink-0" aria-hidden /> Achievement unlocked: {a.title}
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
