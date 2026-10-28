import { Link } from 'react-router';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Minus, Plus, Search } from 'lucide-react';
import { RARITIES, RARITY_INFO, type GlimArt, type LanternArt, type Rarity } from '@ludora/shared';
import { api, ApiError, newRequestKey } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { formatNumber } from '../../lib/format.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { CurrencyIcon } from '../../art/icons.tsx';
import { AccountError, Amount, Dialog, EmptyState, ErrorNotice, Input, PageHeader, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Meter, RarityTag, ToggleChips } from '../../ui/game.tsx';
import { RarityLabel, RarityPanel, frameProps } from './rarity.tsx';

interface CollectionGlim {
  id: string;
  name: string | null;
  rarity: Rarity;
  description: string | null;
  art: GlimArt | null;
  /** Shape only for Glims you have not found: body, plus topper, ears, tail and back when it has them. */
  silhouette: GlimShape | null;
  owned: number;
  dustValue: number;
  craftCost: number;
}

interface CollectionData {
  buddy: string | null;
  collections: { id: string; name: string; description: string; hue: number; reward: { currency: string; amount: number } | null; rewarded: boolean; total: number; owned: number; glims: CollectionGlim[]; monthly?: { month: string; until: string | null; onSale: boolean } | null }[];
}

type Filter = 'all' | 'owned' | 'missing' | 'spares';

type GlimShape = Pick<GlimArt, 'body'> & Partial<Pick<GlimArt, 'topper' | 'ears' | 'tail' | 'back'>>;

/** A Glim you have not found, drawn from its shape alone: recognisable, with nothing given away. */
const shadowArt = (shape: GlimShape): GlimArt => ({ kind: 'glim', hue: 0, accentHue: 0, saturation: 0, eyes: 'dot', mouth: 'none', pattern: 'none', topper: 'none', cheeks: false, ...shape });

/** Each collection's Lantern pattern, for the Lantern beside its name: the one you open to fill it. */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** `2026-10` as "October 2026". */
const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
};

const PATTERN: Record<string, LanternArt['pattern']> = { meadow: 'leaves', tidepool: 'waves', ember: 'flames', frost: 'frost', starfall: 'stars', library: 'books', circuit: 'circuit', nightmarket: 'moons' };

const CURRENCY_NAME: Record<string, string> = { sparks: 'Sparks', moonstones: 'Moonstones', dust: 'Glow Dust' };

const stepper = 'press-soft grid size-11 place-items-center rounded-[var(--radius-m)] bg-raised text-text disabled:opacity-50';

function GlimDetail({ glim, collection, dust, isBuddy, onClose }: { glim: CollectionGlim; collection: string; dust: number | null; isBuddy: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['collection'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['locker'] })]);
  };
  const recycle = useMutation({
    mutationFn: () => api.post<{ dust: number }>('/api/collection/recycle', { itemId: glim.id, quantity: qty, requestKey: newRequestKey('rec') }),
    onSuccess: async (r) => {
      toast.success(`Recycled into ${r.dust} Glow Dust`);
      setQty(1);
      await refresh();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not recycle.'),
  });
  const craft = useMutation({
    mutationFn: () => api.post<{ name: string; collectionsCompleted: string[] }>('/api/collection/craft', { itemId: glim.id, requestKey: newRequestKey('craft') }),
    onSuccess: async (r) => {
      toast.success(r.collectionsCompleted.length ? `Crafted ${r.name}. Collection complete.` : `Crafted ${r.name}`);
      await refresh();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not craft.'),
  });
  const buddy = useMutation({
    mutationFn: () => api.post('/api/locker/equip', { itemId: glim.id }),
    onSuccess: async () => {
      toast.success(`${glim.name} is your buddy now`);
      await refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change your buddy.'),
  });
  const owned = glim.owned > 0;
  const spares = Math.max(0, glim.owned - 1);
  const f = frameProps(glim.rarity, { missing: !owned });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={glim.name ?? 'Not found yet'} description={`${RARITY_INFO[glim.rarity].label} Glim from ${collection}`}>
      <div className="flex flex-col items-center gap-3">
        <div className={`relative w-full max-w-[17rem] overflow-hidden p-1.5 ${f.className}`} style={f.style}>
          <RarityPanel rarity={glim.rarity} missing={!owned} className="aspect-square w-full">
            {glim.art ? <Glim art={glim.art} size={190} aura={glim.rarity} rarity={glim.rarity} pose="wave" className="h-auto w-[84%]" /> : <Glim art={shadowArt(glim.silhouette!)} size={190} silhouette className="h-auto w-[78%]" />}
          </RarityPanel>
          {!owned ? (
            <p className="py-2 text-center">
              <RarityTag rarity={glim.rarity} size="md" />
            </p>
          ) : null}
        </div>
        <p className="text-center text-text-2">{glim.description ?? 'Find it in a Lantern, pick it from the daily shop, or craft it with Glow Dust.'}</p>
        {owned ? (
          <p className="font-display text-xl font-bold">
            You have <span className="tabular">{glim.owned}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
        {owned ? (
          <Button size="lg" variant={isBuddy ? 'secondary' : 'primary'} onClick={() => buddy.mutate()} disabled={isBuddy} loading={buddy.isPending}>
            {isBuddy ? 'This is your buddy' : 'Make my buddy'}
          </Button>
        ) : null}
        {spares > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Recycle</span>
              <button type="button" className={stepper} onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer">
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-7 text-center font-display text-xl font-bold tabular" aria-live="polite">
                {qty}
              </span>
              <button type="button" className={stepper} onClick={() => setQty((q) => Math.min(spares, q + 1))} disabled={qty >= spares} aria-label="One more">
                <Plus className="size-4" aria-hidden />
              </button>
              <span className="text-sm text-text-2">of {spares} spare</span>
            </div>
            <Button size="sm" loading={recycle.isPending} onClick={() => recycle.mutate()}>
              Get <Amount currency="dust" value={qty * glim.dustValue} size="sm" />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-sm text-text-2">
            {owned ? 'Craft another' : 'Craft it'} with Glow Dust{dust !== null ? <span className="whitespace-nowrap"> (you have {formatNumber(dust)})</span> : null}
          </span>
          {/* With the balance unknown the server decides, rather than a guess of zero. */}
          <Button size="sm" variant={owned ? 'secondary' : 'primary'} disabled={dust !== null && dust < glim.craftCost} loading={craft.isPending} onClick={() => craft.mutate()}>
            Craft for <Amount currency="dust" value={glim.craftCost} size="sm" />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function GlimCard({ g, isBuddy, onOpen }: { g: CollectionGlim; isBuddy: boolean; onOpen: () => void }) {
  const owned = g.owned > 0;
  const f = frameProps(g.rarity, { missing: !owned });
  // The card's own text names the button (WCAG 2.5.3), with hidden words where the visible ones are terse.
  return (
    <li>
      <button type="button" onClick={onOpen} className={`flex h-full w-full flex-col items-center overflow-hidden p-1 pb-2 text-center ${owned ? 'tcard-press' : 'hover:border-text-3'} ${f.className}`} style={f.style}>
        <RarityPanel rarity={g.rarity} missing={!owned} tag={false} className="aspect-square w-full">
          {g.art ? <Glim art={g.art} size={120} rarity={g.rarity} className="h-auto w-[86%]" /> : <Glim art={shadowArt(g.silhouette!)} size={120} silhouette className="h-auto w-[78%] opacity-80" />}
        </RarityPanel>
        {owned ? <span className="mt-1.5 w-full truncate px-1 font-display text-[1.05rem] leading-tight font-bold">{g.name}</span> : <span className="sr-only">Not found yet,</span>}
        <RarityLabel rarity={g.rarity} className={`text-text-2 ${owned ? 'mt-0.5 text-[11px]' : 'mt-1.5 text-xs'}`} />
        {g.owned > 1 ? (
          <>
            <span className="absolute top-2 right-2 z-[2] rounded-full bg-[rgb(6_10_28/0.78)] px-1.5 font-display text-sm leading-5 font-bold text-white tabular" aria-hidden>
              ×{g.owned}
            </span>
            <span className="sr-only">, you have {g.owned}</span>
          </>
        ) : null}
        {isBuddy ? <span className="absolute top-2 left-2 z-[2] rounded-full bg-lantern px-1.5 text-[11px] leading-5 font-bold text-on-accent">Buddy</span> : null}
      </button>
    </li>
  );
}

export default function Collection() {
  const me = useMe();
  const overview = useOverview();
  const data = useQuery({ queryKey: ['collection'], queryFn: () => api.get<CollectionData>('/api/collection'), enabled: Boolean(me.data?.user) });
  const [filter, setFilter] = useState<Filter>('all');
  const [rarity, setRarity] = useState<'' | Rarity>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ glim: CollectionGlim; collection: string } | null>(null);
  const totals = useMemo(() => {
    const cols = data.data?.collections ?? [];
    return { owned: cols.reduce((n, c) => n + c.owned, 0), total: cols.reduce((n, c) => n + c.total, 0) };
  }, [data.data]);
  /** Found and total for each rarity, for the summary. */
  const byRarity = useMemo(() => {
    const glims = (data.data?.collections ?? []).flatMap((c) => c.glims);
    return RARITIES.map((r) => ({ rarity: r, total: glims.filter((g) => g.rarity === r).length, owned: glims.filter((g) => g.rarity === r && g.owned > 0).length })).filter((x) => x.total > 0);
  }, [data.data]);

  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Collection" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Collection" />
        <EmptyState title="Sign in to collect Glims" action={<ButtonLink to="/signin?next=/collection" variant="primary">Sign in</ButtonLink>}>
          Glims live in Lanterns. Play games to earn Sparks, then open Lanterns to fill your collection.
        </EmptyState>
      </>
    );
  }

  const keep = (g: CollectionGlim) => {
    if (filter === 'owned' && g.owned === 0) return false;
    if (filter === 'missing' && g.owned > 0) return false;
    if (filter === 'spares' && g.owned < 2) return false;
    if (rarity && g.rarity !== rarity) return false;
    if (q && !(g.name ?? '').toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  };
  const visible = (data.data?.collections ?? []).map((c) => ({ c, list: c.glims.filter(keep) })).filter((x) => x.list.length > 0);
  const filtered = filter !== 'all' || rarity !== '' || q.trim() !== '';
  // Unknown until the account's balances load; never shown as a zero.
  const dust = overview.data ? (overview.data.balances.dust ?? 0) : null;
  const loading = me.isLoading || data.isLoading;
  const dustPill = 'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-1.5';

  return (
    <>
      <PageHeader
        title="Collection"
        description={data.data ? `You have found ${totals.owned} of ${totals.total} Glims. Fill a collection to earn its reward.` : 'Every Glim you find lives here.'}
        actions={
          <>
            {dust !== null ? (
              <span className={dustPill}>
                <span className="inline-flex items-center gap-1.5 font-display text-xl leading-none font-bold tabular">
                  <CurrencyIcon code="dust" size={20} />
                  {formatNumber(dust)}
                </span>
                <span className="text-sm text-text-2">Glow Dust</span>
              </span>
            ) : me.isLoading || overview.isLoading ? (
              <span className={dustPill}>
                <CurrencyIcon code="dust" size={20} />
                <Skeleton className="h-4 w-8" />
                <span className="text-sm text-text-2">Glow Dust</span>
              </span>
            ) : null}
            <ButtonLink to="/shop?tab=lanterns" variant="primary" className="h-11">
              Open a Lantern
            </ButtonLink>
          </>
        }
      />

      {data.data ? (
        <section className="panel mb-6 rounded-[var(--radius-l)] p-4 sm:p-5" aria-label="Your progress">
          <div className="flex items-center gap-4">
            <span className="font-display text-[2.6rem] leading-none font-extrabold tabular sm:text-5xl">
              {totals.owned}
              <span className="text-[1.6rem] text-text-2 sm:text-3xl">/{totals.total}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-sm font-semibold text-text-2">Glims found across {data.data.collections.length} collections</p>
              <Meter value={totals.owned} max={totals.total} tone="mint" size="lg" label="Glims found" />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {byRarity.map((r) => (
              <div key={r.rarity} className="rounded-[var(--radius-m)] border border-line bg-surface-2 px-2.5 py-2" style={{ boxShadow: `inset 0 3px 0 var(--r-${r.rarity})` }}>
                <dt>
                  <RarityLabel rarity={r.rarity} className="text-xs text-text-2" />
                </dt>
                <dd className="mt-0.5 font-display text-2xl leading-none font-bold tabular">
                  {r.owned}
                  <span className="text-base text-text-2">/{r.total}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mb-7 flex flex-wrap items-center gap-3">
        <ToggleChips<Filter>
          value={filter}
          onChange={setFilter}
          label="Show"
          options={[
            { value: 'all', label: 'All' },
            { value: 'owned', label: 'Found' },
            { value: 'missing', label: 'Not found yet' },
            { value: 'spares', label: 'Spares' },
          ]}
        />
        <div className="flex w-full gap-2 md:ml-auto md:w-auto">
          <label className="relative min-w-0 flex-1 md:w-56">
            <span className="sr-only">Search by name</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names" className="h-11 pl-9" />
          </label>
          <label className="shrink-0">
            <span className="sr-only">Rarity</span>
            <Select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | '')} className="h-11 w-36">
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
      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-[var(--radius-l)]" />
          ))}
        </div>
      ) : null}

      {data.data && visible.length === 0 ? (
        <EmptyState
          icon={<Glim art={shadowArt({ body: 'blob' })} size={88} silhouette />}
          title={filter === 'spares' && !rarity && !q ? 'No spares yet' : 'No Glims match'}
          action={
            <Button
              onClick={() => {
                setFilter('all');
                setRarity('');
                setQ('');
              }}
            >
              Show every Glim
            </Button>
          }
        >
          {filter === 'spares' && !rarity && !q ? 'When a Lantern gives you a Glim you already have, the extra one shows up here. Recycle spares into Glow Dust.' : 'Try a different name or rarity.'}
        </EmptyState>
      ) : null}

      <div className="flex flex-col gap-10">
        {visible.map(({ c, list }) => {
          const complete = c.owned >= c.total && c.total > 0;
          return (
            <section key={c.id} aria-labelledby={`col-${c.id}`}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Lantern art={{ hue: c.hue, accentHue: (c.hue + 40) % 360, pattern: PATTERN[c.id] ?? 'plain' }} size={40} lit={complete} className="shrink-0" />
                  <div className="min-w-0">
                    <h2 id={`col-${c.id}`} className="font-display text-[1.75rem] leading-tight font-bold">
                      {c.name}
                    </h2>
                    <p className="text-sm text-text-2">{c.description}</p>
                    {c.monthly ? (
                      <p className="mt-1 text-sm">
                        {c.monthly.onSale ? (
                          <Link to="/shop?tab=monthly" className="font-semibold">
                            {monthName(c.monthly.month)} only: its Lantern is in the shop now
                          </Link>
                        ) : (
                          <span className="text-text-3">{monthName(c.monthly.month)} only. Its Lantern has left the shop; the Glims you found are yours to keep.</span>
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex w-full items-center gap-3 sm:w-80">
                  <Meter value={c.owned} max={c.total} tone="mint" label={`${c.name}: ${c.owned} of ${c.total} found`} fill={`hsl(${c.hue} 72% 54%)`} />
                  <span className="shrink-0 font-display text-lg leading-none font-bold tabular">
                    {c.owned}/{c.total}
                  </span>
                  {c.reward ? (
                    c.rewarded ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-glim/15 px-2 py-0.5 text-xs font-bold text-glim">
                        <Check className="size-3.5" aria-hidden /> Reward claimed
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5" title={`Fill it to get ${c.reward.amount} ${CURRENCY_NAME[c.reward.currency] ?? c.reward.currency}`}>
                        <Amount currency={c.reward.currency} value={c.reward.amount} size="sm" />
                        <span className="sr-only">reward for filling it</span>
                      </span>
                    )
                  ) : null}
                </div>
              </div>
              <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                {list.map((g) => (
                  <GlimCard key={g.id} g={g} isBuddy={data.data?.buddy === g.id} onOpen={() => setSelected({ glim: g, collection: c.name })} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {selected ? <GlimDetail glim={selected.glim} collection={selected.collection} dust={dust} isBuddy={data.data?.buddy === selected.glim.id} onClose={() => setSelected(null)} /> : null}
      <p className="sr-only" role="status">
        {filtered && data.data ? `${visible.reduce((n, x) => n + x.list.length, 0)} Glims shown` : ''}
      </p>
    </>
  );
}
