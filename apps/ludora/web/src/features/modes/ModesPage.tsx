import { useState } from 'react';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, type ModeCategory } from '@ludora/shared';
import { useModes } from '../../lib/queries.ts';
import { ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { ToggleChips } from '../home/kit.tsx';
import { ModeCard } from './ModeCard.tsx';

/** The game catalogue: every mode as a tile, filtered by kind. */
export default function ModesPage() {
  const modes = useModes();
  const [cat, setCat] = useState<ModeCategory | 'all'>('all');
  const all = modes.data?.modes ?? [];
  const list = all.filter((m) => cat === 'all' || m.meta.category === cat);
  const playable = all.filter((m) => m.meta.status === 'playable');
  const variantCount = playable.reduce((n, m) => n + m.variants.filter((v) => v.meta.status === 'playable').length, 0);
  const count = (c: ModeCategory) => all.filter((m) => m.meta.category === c).length;
  return (
    <>
      <PageHeader title="Game modes" description={modes.data ? `${playable.length} modes and ${variantCount} variants you can play today. Every one works with any question set.` : 'Every mode works with any question set.'} />
      <ToggleChips<ModeCategory | 'all'>
        className="mb-6"
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
      {modes.isError ? <ErrorNotice message="The mode list could not be loaded." onRetry={() => modes.refetch()} /> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {modes.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-[var(--radius-l)]" />) : list.map((m) => <ModeCard key={m.meta.id} mode={m} heading="h2" facts />)}
      </div>
    </>
  );
}
