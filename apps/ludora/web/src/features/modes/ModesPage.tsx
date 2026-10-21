import { useState } from 'react';
import { Link } from 'react-router';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, type ModeCategory } from '@ludora/shared';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';

export default function ModesPage() {
  const modes = useModes();
  const [cat, setCat] = useState<ModeCategory | 'all'>('all');
  const list = (modes.data?.modes ?? []).filter((m) => cat === 'all' || m.meta.category === cat);
  const playable = (modes.data?.modes ?? []).filter((m) => m.meta.status === 'playable');
  const variantCount = playable.reduce((n, m) => n + m.variants.filter((v) => v.meta.status === 'playable').length, 0);
  return (
    <>
      <PageHeader
        title="Game modes"
        description={modes.data ? `${playable.length} modes and ${variantCount} variants you can play today. Every one works with any question set.` : 'Every mode works with any question set.'}
      />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {(['all', ...MODE_CATEGORIES] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={`h-9 rounded-full px-4 text-sm font-semibold ${cat === c ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
            {c === 'all' ? 'All' : MODE_CATEGORY_INFO[c].label}
          </button>
        ))}
      </div>
      {modes.isError ? <ErrorNotice message="The mode list could not be loaded." onRetry={() => modes.refetch()} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modes.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)
          : list.map((m) => (
              <Link key={m.meta.id} to={`/modes/${m.meta.id}`} className="text-text no-underline flex flex-col overflow-hidden rounded-[var(--radius-m)] border border-line bg-raised transition-colors hover:border-line-strong">
                <ModeArt thumb={thumbFor(m.meta)} className="aspect-[16/9] w-full" />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-bold">{m.meta.title}</h2>
                    {m.meta.status !== 'playable' ? <Badge tone={m.meta.status === 'beta' ? 'amber' : 'neutral'}>{m.meta.status === 'beta' ? 'Beta' : 'Planned'}</Badge> : null}
                  </div>
                  <p className="text-sm text-text-2">{m.meta.tagline}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <Badge>{MODE_CATEGORY_INFO[m.meta.category].label}</Badge>
                    <Badge>{m.meta.pacing === 'host' ? 'Host-paced' : m.meta.pacing === 'self' ? 'Self-paced' : 'Solo'}</Badge>
                    <Badge>
                      {m.meta.duration.min}-{m.meta.duration.max} min
                    </Badge>
                    {m.variants.length ? <Badge tone="violet">{m.variants.length} variants</Badge> : null}
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </>
  );
}
