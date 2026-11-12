import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../../lib/api.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { EmptyState, ErrorNotice, Input, Skeleton } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { SetButton } from '../host/pickers.tsx';

/*
 * The same set picker wherever a set is chosen on the making pages: sets used lately (hosted from
 * this account, on any device), starred, made by me, and a search of everything this account may
 * see. Recent and starred come from GET /api/making/sets; the rest from GET /api/sets.
 */

export type PickerTab = 'recent' | 'starred' | 'mine' | 'all';
const TAB_LABEL: Record<PickerTab, string> = { recent: 'Recent', starred: 'Starred', mine: 'Made by me', all: 'All sets' };
const EMPTY: Record<PickerTab, string> = {
  recent: 'Sets you host show here, on any device.',
  starred: 'Star a set on its page to keep it here.',
  mine: 'Sets you make show here.',
  all: 'No sets match.',
};

function useSetList(tab: PickerTab, q: string) {
  return useQuery({
    queryKey: ['set-picker', tab, q],
    queryFn: ({ signal }) => {
      if (tab === 'recent' || tab === 'starred') return api.get<{ sets: SetSummary[] }>(`/api/making/sets?tab=${tab}`, signal);
      const search = new URLSearchParams({ scope: tab === 'mine' ? 'mine' : 'featured', pageSize: '48', ...(q ? { q } : {}) });
      if (tab === 'all' && q) search.set('scope', 'public');
      return api.get<{ sets: SetSummary[] }>(`/api/sets?${search}`, signal);
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function SetPicker({ onPick, label = 'Choose a question set' }: { onPick: (s: SetSummary) => void; label?: string }) {
  const [tab, setTab] = useState<PickerTab>('recent');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const list = useSetList(tab, tab === 'mine' || tab === 'all' ? q : '');
  // Search reads the words across whichever list is shown.
  const words = q.toLowerCase();
  const sets = (list.data?.sets ?? []).filter((s) => !words || tab === 'mine' || tab === 'all' || s.title.toLowerCase().includes(words));
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleChips<PickerTab> value={tab} onChange={setTab} label="Which sets to show" options={(Object.keys(TAB_LABEL) as PickerTab[]).map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search sets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search sets" className="h-10 pl-9" />
        </label>
      </div>
      {list.isError && !list.data ? (
        <ErrorNotice message="Question sets could not be loaded." onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-[68px]" />
      ) : sets.length === 0 ? (
        <EmptyState title={q ? 'No sets match' : `Nothing in ${TAB_LABEL[tab]} yet`} action={tab === 'mine' ? <ButtonLink to="/make/quick">Make a set</ButtonLink> : undefined}>
          {q ? 'Try another word, or look in All sets.' : EMPTY[tab]}
        </EmptyState>
      ) : (
        <ul className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${list.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={list.isPlaceholderData || undefined}>
          {sets.slice(0, 24).map((s) => (
            <li key={s.id}>
              <SetButton set={s} detail={s.favourite && tab !== 'starred' ? ', starred' : s.ownerName && tab === 'all' ? `, by ${s.ownerName}` : ''} onPick={() => onPick(s)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
