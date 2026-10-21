import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Minus, Plus, Search } from 'lucide-react';
import { RARITIES, RARITY_INFO, type GlimArt, type Rarity } from '@ludora/shared';
import { api, ApiError, newRequestKey } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Amount, Badge, Dialog, EmptyState, ErrorNotice, Input, PageHeader, ProgressBar, RarityBadge, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';

interface CollectionGlim {
  id: string;
  name: string | null;
  rarity: Rarity;
  description: string | null;
  art: GlimArt | null;
  silhouette: { body: GlimArt['body'] } | null;
  owned: number;
  dustValue: number;
  craftCost: number;
}

interface CollectionData {
  buddy: string | null;
  collections: { id: string; name: string; description: string; hue: number; reward: { currency: string; amount: number } | null; rewarded: boolean; total: number; owned: number; glims: CollectionGlim[] }[];
}

const shadowArt = (body: GlimArt['body']): GlimArt => ({ kind: 'glim', body, hue: 0, accentHue: 0, saturation: 0, eyes: 'dot', mouth: 'none', pattern: 'none', topper: 'none', cheeks: false });

function GlimDetail({ glim, collection, dust, isBuddy, onClose }: { glim: CollectionGlim | null; collection: string; dust: number; isBuddy: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['collection'] }), qc.invalidateQueries({ queryKey: ['overview'] })]);
  };
  const recycle = useMutation({
    mutationFn: () => api.post<{ dust: number }>('/api/collection/recycle', { itemId: glim!.id, quantity: qty, requestKey: newRequestKey('rec') }),
    onSuccess: async (r) => {
      toast.success(`Recycled into ${r.dust} Glow Dust`);
      setQty(1);
      await refresh();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not recycle.'),
  });
  const craft = useMutation({
    mutationFn: () => api.post<{ name: string; collectionsCompleted: string[] }>('/api/collection/craft', { itemId: glim!.id, requestKey: newRequestKey('craft') }),
    onSuccess: async (r) => {
      toast.success(r.collectionsCompleted.length ? `Crafted ${r.name}. Collection complete!` : `Crafted ${r.name}`);
      await refresh();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not craft.'),
  });
  const buddy = useMutation({
    mutationFn: () => api.post('/api/locker/equip', { itemId: glim!.id }),
    onSuccess: async () => {
      toast.success(`${glim!.name} is your buddy now`);
      await refresh();
    },
  });
  if (!glim) return null;
  const spares = Math.max(0, glim.owned - 1);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={glim.name ?? 'Not found yet'} description={collection}>
      <div className="flex flex-col items-center gap-3">
        <div className="grid place-items-center rounded-[20px] bg-surface-2 p-4">
          {glim.art ? <Glim art={glim.art} size={180} aura={glim.rarity} bob /> : <Glim art={shadowArt(glim.silhouette!.body)} size={180} silhouette />}
        </div>
        <RarityBadge rarity={glim.rarity} />
        <p className="text-center text-text-2">{glim.description ?? 'Find it in a Lantern, buy it in the daily picks, or craft it with Glow Dust.'}</p>
        {glim.owned ? <p className="text-sm text-text-3">You have {glim.owned}</p> : null}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
        {glim.owned > 0 ? (
          <Button onClick={() => buddy.mutate()} disabled={isBuddy} loading={buddy.isPending}>
            {isBuddy ? 'This is your buddy' : 'Make my buddy'}
          </Button>
        ) : null}
        {spares > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-surface-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Recycle</span>
              <button type="button" className="grid size-8 place-items-center rounded-[8px] bg-surface-3" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center font-bold tabular">{qty}</span>
              <button type="button" className="grid size-8 place-items-center rounded-[8px] bg-surface-3" onClick={() => setQty((q) => Math.min(spares, q + 1))} aria-label="More">
                <Plus className="size-4" />
              </button>
              <span className="text-sm text-text-3">of {spares} spare</span>
            </div>
            <Button size="sm" loading={recycle.isPending} onClick={() => recycle.mutate()}>
              Get <Amount currency="dust" value={qty * glim.dustValue} size="sm" />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-surface-2 px-3 py-2.5">
          <span className="text-sm text-text-2">
            Craft with Glow Dust <span className="text-text-3">(you have {dust})</span>
          </span>
          <Button size="sm" variant="primary" disabled={dust < glim.craftCost} loading={craft.isPending} onClick={() => craft.mutate()}>
            Craft for <Amount currency="dust" value={glim.craftCost} size="sm" />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default function Collection() {
  const me = useMe();
  const overview = useOverview();
  const data = useQuery({ queryKey: ['collection'], queryFn: () => api.get<CollectionData>('/api/collection'), enabled: Boolean(me.data?.user) });
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing' | 'spares'>('all');
  const [rarity, setRarity] = useState<'' | Rarity>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ glim: CollectionGlim; collection: string } | null>(null);
  const totals = useMemo(() => {
    const cols = data.data?.collections ?? [];
    return { owned: cols.reduce((n, c) => n + c.owned, 0), total: cols.reduce((n, c) => n + c.total, 0) };
  }, [data.data]);

  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Collection" />
        <EmptyState title="Sign in to collect Glims" action={<ButtonLink to="/signin?next=/collection" variant="primary">Sign in</ButtonLink>} />
      </>
    );
  }

  const keep = (g: CollectionGlim) => {
    if (filter === 'owned' && g.owned === 0) return false;
    if (filter === 'missing' && g.owned > 0) return false;
    if (filter === 'spares' && g.owned < 2) return false;
    if (rarity && g.rarity !== rarity) return false;
    if (q && !(g.name ?? '').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };

  return (
    <>
      <PageHeader
        title="Collection"
        description={data.data ? `${totals.owned} of ${totals.total} Glims found. Complete a collection for its reward.` : undefined}
        actions={
          <div className="flex items-center gap-3">
            <Amount currency="dust" value={overview.data?.balances.dust ?? 0} />
            <ButtonLink to="/shop" variant="primary" size="sm">
              Get Lanterns
            </ButtonLink>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(['all', 'owned', 'missing', 'spares'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-9 rounded-full px-4 text-sm font-semibold ${filter === f ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
            {f === 'all' ? 'All' : f === 'owned' ? 'Found' : f === 'missing' ? 'Not found yet' : 'Spares'}
          </button>
        ))}
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-52">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names" className="h-10 pl-9" />
          </label>
          <label>
            <span className="sr-only">Rarity</span>
            <Select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | '')} className="h-10 w-36">
              <option value="">All rarities</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {RARITY_INFO[r].label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      {data.isError ? <ErrorNotice message="Your collection could not be loaded." onRetry={() => data.refetch()} /> : null}
      {data.isLoading ? <Skeleton className="h-96" /> : null}
      <div className="flex flex-col gap-8">
        {(data.data?.collections ?? []).map((c) => {
          const list = c.glims.filter(keep);
          if (!list.length) return null;
          return (
            <section key={c.id} aria-labelledby={`col-${c.id}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id={`col-${c.id}`} className="font-display text-2xl font-bold">
                    {c.name}
                  </h2>
                  <p className="text-sm text-text-2">{c.description}</p>
                </div>
                <div className="flex w-full items-center gap-3 sm:w-72">
                  <ProgressBar value={c.owned} max={c.total} tone="mint" label={`${c.name} progress`} />
                  <span className="shrink-0 text-sm font-semibold tabular">
                    {c.owned}/{c.total}
                  </span>
                  {c.reward ? c.rewarded ? <Badge tone="mint">Rewarded</Badge> : <Amount currency={c.reward.currency} value={c.reward.amount} size="sm" /> : null}
                </div>
              </div>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {list.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ glim: g, collection: c.name })}
                      className={`relative flex w-full flex-col items-center gap-1 rounded-[14px] border p-2 text-center transition-colors hover:border-line-strong ${g.owned ? 'border-line bg-raised' : 'border-dashed border-line bg-sunken'}`}
                      aria-label={g.owned ? `${g.name}, ${RARITY_INFO[g.rarity].label}, you have ${g.owned}` : `Not found yet, ${RARITY_INFO[g.rarity].label}`}
                    >
                      {g.art ? <Glim art={g.art} size={78} aura={g.rarity} /> : <Glim art={shadowArt(g.silhouette!.body)} size={78} silhouette />}
                      <span className="w-full truncate text-xs font-semibold">{g.name ?? '???'}</span>
                      <span className="absolute top-1.5 left-1.5 size-2.5 rounded-full" style={{ background: `var(--r-${g.rarity})` }} aria-hidden />
                      {g.owned > 1 ? <span className="absolute top-1 right-1 rounded-full bg-surface-3 px-1.5 text-[11px] font-bold tabular">x{g.owned}</span> : null}
                      {data.data?.buddy === g.id ? <span className="absolute right-1 bottom-6 rounded-full bg-lantern px-1.5 text-[10px] font-bold text-on-accent">Buddy</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {selected ? <GlimDetail glim={selected.glim} collection={selected.collection} dust={overview.data?.balances.dust ?? 0} isBuddy={data.data?.buddy === selected.glim.id} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
