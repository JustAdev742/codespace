import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Lock, Repeat } from 'lucide-react';
import type { LevelInfo } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { Amount, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Meter } from '../../ui/game.tsx';

export { ACHIEVEMENT_CATEGORIES, achievementCategory, nearlyThere, type AchievementCategory } from './groups.ts';

interface Track {
  level: LevelInfo;
  max: number;
  levels: { level: number; sparks: number; moonstones: number; reached: boolean }[];
  nextMoonstones: number | null;
}

/**
 * The level track: what each level gives, the last two you reached and the next five. The rewards
 * come from the same rules that pay them, the moment you reach the level.
 */
export function LevelTrack() {
  const track = useQuery({ queryKey: ['level-track'], queryFn: () => api.get<Track>('/api/levels/track') });
  const t = track.data;
  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="levels-title" id="levels">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="levels-title" className="font-display text-[1.75rem] leading-tight font-bold">
          Level track
        </h2>
        {t ? (
          <p className="text-sm text-text-2 tabular">
            {t.level.needed ? `${formatNumber(t.level.needed - t.level.into)} XP to level ${t.level.level + 1}` : 'Top level reached'}
          </p>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-text-2">Every level pays out as soon as you reach it, once. Here are the next five.</p>
      {track.isError ? (
        <ErrorNotice message="The level track did not load." onRetry={() => void track.refetch()} />
      ) : !t ? (
        <Skeleton className="h-32" />
      ) : (
        <>
          <Meter value={t.level.needed ? t.level.into : 1} max={t.level.needed || 1} tone="amber" size="lg" label={`Level ${t.level.level} progress`} className="mb-4" />
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {t.levels.map((l) => {
              const next = l.level === t.level.level + 1;
              return (
                <li key={l.level} className={`flex flex-col gap-1.5 rounded-[var(--radius-m)] border p-3 ${l.reached ? 'border-line bg-surface-2' : next ? 'border-lantern bg-lantern/10' : 'border-line bg-raised'}`}>
                  <p className="flex items-center justify-between gap-2">
                    <span className="font-display text-xl leading-none font-extrabold tabular">Level {l.level}</span>
                    {l.reached ? <Check className="size-4 text-glim" aria-hidden /> : <Lock className="size-4 text-text-3" aria-hidden />}
                  </p>
                  <span className="flex flex-wrap gap-x-2.5">
                    <Amount currency="sparks" value={l.sparks} size="sm" />
                    {l.moonstones ? <Amount currency="moonstones" value={l.moonstones} size="sm" /> : null}
                  </span>
                  <span className="text-xs font-semibold text-text-2">{l.reached ? 'Received' : next ? 'Next up' : 'To come'}</span>
                </li>
              );
            })}
          </ol>
          {t.nextMoonstones ? <p className="mt-3 text-sm text-text-2">Moonstones come every few levels. Your next ones are at level {t.nextMoonstones}.</p> : null}
        </>
      )}
    </Panel>
  );
}

interface PastQuest {
  id: string;
  kind: 'daily' | 'weekly' | 'event';
  title: string;
  period: string;
  start: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  swappedIn: boolean;
}

const when = (q: PastQuest) => {
  const d = new Date(`${q.start}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: q.kind === 'daily' ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC' });
  return q.kind === 'daily' ? d : `Week of ${d}`;
};

/** Earlier quests: what you finished, claimed or missed. Folded away until opened. */
export function QuestHistory() {
  const [open, setOpen] = useState(false);
  const history = useQuery({ queryKey: ['quests', 'history'], queryFn: () => api.get<{ quests: PastQuest[] }>('/api/quests/history'), enabled: open });
  const list = history.data?.quests ?? [];
  return (
    <section aria-labelledby="history-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-title" className="font-display text-[1.75rem] leading-tight font-bold">
          Quest history
        </h2>
        <Button size="sm" variant="ghost" aria-expanded={open} aria-controls="history-list" onClick={() => setOpen((o) => !o)} icon={<ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />}>
          {open ? 'Hide' : 'Show earlier quests'}
        </Button>
      </div>
      <div id="history-list" hidden={!open}>
        {history.isError ? (
          <ErrorNotice message="Your quest history did not load." onRetry={() => void history.refetch()} />
        ) : open && !history.data ? (
          <Skeleton className="mt-3 h-32" />
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-text-2">Quests from earlier days and weeks show up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-l)] border border-line bg-raised">
            {list.map((q) => (
              <li key={`${q.id}:${q.period}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm text-text-2">{when(q)}</span>
                <span className="min-w-0 flex-1 font-semibold">
                  {q.title}
                  {q.swappedIn ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-text-2">
                      <Repeat className="size-3.5" aria-hidden /> swapped in
                    </span>
                  ) : null}
                </span>
                <span className={`shrink-0 text-sm font-semibold ${q.completed ? 'text-glim' : 'text-text-2'}`}>{q.claimed ? 'Done, claimed' : q.completed ? 'Done, not claimed' : `Missed, ${formatNumber(q.progress)} of ${formatNumber(q.target)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
