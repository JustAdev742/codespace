import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, type ModeCategory } from '@ludora/shared';
import { useModes } from '../../lib/queries.ts';
import { EmptyState, ErrorNotice, Input, PageHeader } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ToggleChips } from '../home/kit.tsx';
import { ModeCard, ModeCardSkeleton } from './ModeCard.tsx';

const isCategory = (v: string | null): v is ModeCategory => MODE_CATEGORIES.includes(v as ModeCategory);

/**
 * The game catalogue: every mode as a tile, filtered by kind and found by name.
 * The kind lives in the address (?kind=party), so a link can open on one kind
 * and the back button comes back to the same filter.
 */
export default function ModesPage() {
  const modes = useModes();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind');
  const cat: ModeCategory | 'all' = isCategory(kind) ? kind : 'all';
  const [query, setQuery] = useState('');
  useEffect(() => {
    document.title = 'Game modes | Ludora';
  }, []);
  const all = modes.data?.modes ?? [];
  const q = query.trim().toLowerCase();
  const list = all.filter((m) => (cat === 'all' || m.meta.category === cat) && (!q || m.meta.title.toLowerCase().includes(q) || m.meta.tagline.toLowerCase().includes(q)));
  const playable = all.filter((m) => m.meta.status === 'playable');
  const variantCount = playable.reduce((n, m) => n + m.variants.filter((v) => v.meta.status === 'playable').length, 0);
  const count = (c: ModeCategory) => all.filter((m) => m.meta.category === c).length;
  const setCat = (c: ModeCategory | 'all') => setParams(c === 'all' ? {} : { kind: c }, { replace: true });
  return (
    <>
      <PageHeader title="Game modes" description={modes.data ? `${playable.length} modes and ${variantCount} variants you can play today. Every one works with any question set.` : 'Every mode works with any question set.'} />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <ToggleChips<ModeCategory | 'all'>
          value={cat}
          onChange={setCat}
          label="Show modes by kind"
          options={[
            { value: 'all', label: 'All' },
            ...MODE_CATEGORIES.filter((c) => !modes.data || count(c) > 0).map((c) => ({
              value: c,
              label: (
                <>
                  {/* A real space, not a margin, so the chip's name reads "Party 4" rather than "Party4". */}
                  {MODE_CATEGORY_INFO[c].label} {modes.data ? <span className="tabular opacity-75">{count(c)}</span> : null}
                </>
              ),
            })),
          ]}
        />
        <label className="relative block w-full shrink-0 md:w-64">
          <span className="sr-only">Search modes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search modes" className="pl-9" />
        </label>
      </div>
      {cat !== 'all' ? <p className="-mt-3 mb-5 text-text-2">{MODE_CATEGORY_INFO[cat].description}</p> : null}
      {modes.isError ? <ErrorNotice message="The mode list could not be loaded. Check your connection and try again." onRetry={() => void modes.refetch()} /> : null}
      {modes.isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <span className="sr-only" role="status">
            Loading game modes
          </span>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ModeCardSkeleton key={i} />
          ))}
        </div>
      ) : modes.data && list.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No modes match"
          action={
            <Button
              onClick={() => {
                setQuery('');
                setCat('all');
              }}
            >
              Show every mode
            </Button>
          }
        >
          Try another word, or look through every kind of game.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <ModeCard key={m.meta.id} mode={m} heading="h2" facts />
          ))}
        </div>
      )}
    </>
  );
}
