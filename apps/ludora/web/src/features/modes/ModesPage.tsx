import { useState } from 'react';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, type ModeCategory } from '@ludora/shared';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { ToggleChips } from '../home/kit.tsx';
import { ModeCard } from './ModeCard.tsx';

export default function ModesPage() {
  const modes = useModes();
  const [cat, setCat] = useState<ModeCategory | 'all'>('all');
  const all = modes.data?.modes ?? [];
  const list = all.filter((m) => cat === 'all' || m.meta.category === cat);
  const playable = all.filter((m) => m.meta.status === 'playable');
  const variantCount = playable.reduce((n, m) => n + m.variants.filter((v) => v.meta.status === 'playable').length, 0);
  const fan = all.slice(0, 3);
  const count = (c: ModeCategory) => all.filter((m) => m.meta.category === c).length;
  return (
    <>
      <PageHeader
        title="Game modes"
        description={modes.data ? `${playable.length} modes and ${variantCount} variants you can play today. Every one works with any question set.` : 'Every mode works with any question set.'}
        art={
          fan.length ? (
            <div className="relative h-[86px] w-[176px]">
              {fan.map((m, i) => (
                <div key={m.meta.id} className="absolute top-2 w-[88px] overflow-hidden rounded-[12px] border-[2.5px] border-ink shadow-[0_3px_0_var(--ink)]" style={{ left: i * 42, top: i === 1 ? 0 : 10, transform: `rotate(${(i - 1) * 10}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                  <ModeArt thumb={thumbFor(m.meta)} className="block aspect-[16/11] w-full" />
                </div>
              ))}
            </div>
          ) : undefined
        }
      />
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
                {MODE_CATEGORY_INFO[c].label}
                {modes.data ? <span className="ml-1.5 opacity-70 tabular">{count(c)}</span> : null}
              </>
            ),
          })),
        ]}
      />
      {modes.isError ? <ErrorNotice message="The mode list could not be loaded." onRetry={() => modes.refetch()} /> : null}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modes.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-[22px]" />) : list.map((m) => <ModeCard key={m.meta.id} mode={m} heading="h2" facts />)}
      </div>
    </>
  );
}
