import { useQuery } from '@tanstack/react-query';
import { Medal } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ordinal, plural } from '../../lib/format.ts';
import type { PersonalBest } from '../profile/StudyPanels.tsx';

/** Your best game in this mode, on the mode's page. Any mode gets it, from the games you saved in it. */
export function ModeBests({ modeId, title }: { modeId: string; title: string }) {
  const me = useMe();
  const bests = useQuery({ queryKey: ['bests'], queryFn: () => api.get<{ bests: PersonalBest[] }>('/api/me/bests'), enabled: Boolean(me.data?.user) });
  const b = bests.data?.bests.find((x) => x.modeId === modeId);
  if (!b) return null;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-3.5 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-s)] bg-lantern text-on-accent" aria-hidden>
        <Medal className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-text-2">Your best in {title}</p>
        <p className="font-display text-xl leading-tight font-bold">
          {b.bestLabel}
          <span className="ml-2 font-sans text-sm font-normal text-text-2">
            {plural(b.games, 'game')}
            {b.bestAccuracy !== null ? `, best accuracy ${Math.round(b.bestAccuracy * 100)}%` : ''}
            {b.bestRank ? `, best place ${ordinal(b.bestRank)}` : ''}
          </span>
        </p>
      </div>
    </div>
  );
}
