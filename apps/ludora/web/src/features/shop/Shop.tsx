import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, HelpCircle, Info } from 'lucide-react';
import { ITEM_TYPE_INFO, RARITY_INFO, SHOP_SECTION_INFO, type ItemArt, type ItemType, type LanternArt, type Rarity, type ShopSection } from '@ludora/shared';
import { api, ApiError, newRequestKey } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { formatNumber, untilText } from '../../lib/format.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Amount, Badge, Dialog, EmptyState, ErrorNotice, PageHeader, RarityBadge, Skeleton, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { PackOpening, type OpenedGlim } from './PackOpening.tsx';

interface ShopItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  art: ItemArt;
  owned: number;
}

interface Listing {
  id: string;
  section: ShopSection;
  kind: 'item' | 'bundle' | 'pack';
  title: string;
  description: string;
  price: { currency: string; amount: number };
  worth: number | null;
  endsAt: string | null;
  limit: number | null;
  boughtThisPeriod: number;
  blocked: string | null;
  item?: ShopItem;
  bundle?: ShopItem[];
  pack?: { id: string; name: string; description: string; art: LanternArt };
}

interface ShopData {
  listings: Listing[];
  resets: { daily: string; weekly: string };
  balances: Record<string, number>;
}

interface PackDetail {
  pack: { id: string; name: string; description: string; art: LanternArt; price: { currency: string; amount: number } };
  odds: { rarity: Rarity; percent: number; items: number; perItemPercent: number }[];
  pity: { every: number; untilGuaranteed: number } | null;
  items: { id: string; name: string; rarity: Rarity; art: unknown; owned: number }[];
}

function OddsDialog({ packId, onClose }: { packId: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['pack', packId], queryFn: () => api.get<PackDetail>(`/api/packs/${packId}`), enabled: Boolean(packId) });
  return (
    <Dialog open={Boolean(packId)} onOpenChange={(o) => !o && onClose()} title={q.data ? `${q.data.pack.name}: what's inside` : 'Odds'} description="These are the exact odds the server uses. Every Lantern holds one Glim." size="lg">
      {q.isLoading ? <Skeleton className="h-40" /> : null}
      {q.data ? (
        <div className="flex flex-col gap-5">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Chance of each rarity</caption>
            <thead className="text-text-3">
              <tr>
                <th className="py-1.5 font-semibold">Rarity</th>
                <th className="py-1.5 font-semibold">Chance</th>
                <th className="py-1.5 font-semibold">Glims</th>
                <th className="py-1.5 font-semibold">Each Glim</th>
              </tr>
            </thead>
            <tbody>
              {q.data.odds.map((o) => (
                <tr key={o.rarity} className="border-t border-line">
                  <td className="py-2">
                    <RarityBadge rarity={o.rarity} />
                  </td>
                  <td className="py-2 font-semibold tabular">{o.percent < 1 ? o.percent.toFixed(2) : o.percent.toFixed(1)}%</td>
                  <td className="py-2 tabular">{o.items}</td>
                  <td className="py-2 text-text-2 tabular">{o.perItemPercent < 0.1 ? o.perItemPercent.toFixed(3) : o.perItemPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.pity ? (
            <p className="flex gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5 text-sm text-text-2">
              <Info className="mt-0.5 size-4 shrink-0" />
              If you open {q.data.pity.every} of these in a row without an epic or better, the next one is guaranteed to be epic or better. Yours is due within {q.data.pity.untilGuaranteed}.
            </p>
          ) : null}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {q.data.items.map((i) => (
              <div key={i.id} className="flex flex-col items-center gap-1 rounded-[12px] bg-surface-2 p-1.5 text-center" title={`${i.name} (${RARITY_INFO[i.rarity].label})`}>
                <Glim art={i.art as never} size={52} silhouette={i.owned === 0} />
                <span className="w-full truncate text-[11px] font-semibold">{i.owned ? i.name : '?'}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-3">Silhouettes are Glims you have not found yet. Lanterns are only bought with Sparks or Moonstones earned by playing, never with money.</p>
        </div>
      ) : null}
    </Dialog>
  );
}

function ListingCard({ l, onBuy, onOdds }: { l: Listing; onBuy: (l: Listing) => void; onOdds: (packId: string) => void }) {
  const rarity = l.item?.rarity;
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-m)] border border-line bg-raised">
      <div className="relative grid h-36 place-items-center bg-surface-2 p-3" style={rarity ? { boxShadow: `inset 0 -3px 0 var(--r-${rarity})` } : undefined}>
        {l.kind === 'pack' && l.pack ? <Lantern art={l.pack.art} size={96} /> : null}
        {l.kind === 'item' && l.item ? <ItemArtView art={l.item.art} rarity={l.item.rarity} size={l.item.type === 'banner' ? 120 : 104} /> : null}
        {l.kind === 'bundle' && l.bundle ? (
          <div className="flex items-center gap-1">
            {l.bundle.slice(0, 3).map((b) => (
              <ItemArtView key={b.id} art={b.art} rarity={b.rarity} size={60} />
            ))}
          </div>
        ) : null}
        {l.worth && l.worth > l.price.amount ? <Badge tone="mint" className="absolute top-2 left-2">Save {Math.round((1 - l.price.amount / l.worth) * 100)}%</Badge> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg leading-tight font-bold">{l.title}</h3>
          {rarity ? <RarityBadge rarity={rarity} /> : null}
        </div>
        <p className="line-clamp-2 text-sm text-text-2">{l.item ? `${ITEM_TYPE_INFO[l.item.type].label}. ${l.description}` : l.description}</p>
        {l.bundle ? <p className="text-xs text-text-3">{l.bundle.map((b) => b.name).join(', ')}</p> : null}
        {l.item?.owned && ITEM_TYPE_INFO[l.item.type].stackable ? <p className="text-xs text-text-3">You have {l.item.owned}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {l.kind === 'pack' && l.pack ? (
            <button type="button" onClick={() => onOdds(l.pack!.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-link">
              <HelpCircle className="size-4" /> Odds
            </button>
          ) : (
            <span />
          )}
          {l.blocked ? (
            <Badge tone="mint">{l.blocked}</Badge>
          ) : (
            <Button variant="primary" size="sm" onClick={() => onBuy(l)} aria-label={`Buy ${l.title} for ${l.price.amount} ${l.price.currency}`}>
              <Amount currency={l.price.currency} value={l.price.amount} size="sm" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

const TAB_ORDER: { value: string; label: string; sections: ShopSection[] }[] = [
  { value: 'featured', label: 'Featured', sections: ['featured', 'bundles'] },
  { value: 'picks', label: 'Daily and weekly', sections: ['daily', 'weekly'] },
  { value: 'lanterns', label: 'Lanterns', sections: ['lanterns'] },
  { value: 'accessories', label: 'Accessories', sections: ['accessories'] },
  { value: 'profile', label: 'Profile', sections: ['profile'] },
  { value: 'effects', label: 'Effects', sections: ['effects'] },
  { value: 'event', label: 'Frost Festival', sections: ['event'] },
];

export default function Shop() {
  const me = useMe();
  const qc = useQueryClient();
  const overview = useOverview();
  const [tab, setTab] = useState('featured');
  const [confirm, setConfirm] = useState<{ listing: Listing; key: string } | null>(null);
  const [oddsFor, setOddsFor] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ result: OpenedGlim; listing: Listing } | null>(null);
  const [currenciesOpen, setCurrenciesOpen] = useState(false);
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api.get<ShopData>('/api/shop'), enabled: Boolean(me.data?.user) });

  const buy = useMutation({
    mutationFn: (args: { listing: Listing; key: string }) => api.post<{ kind: string; pack: OpenedGlim | null; granted: { name: string }[]; balances: Record<string, number>; unlimited: boolean }>('/api/shop/purchase', { listingId: args.listing.id, requestKey: args.key }),
    onSuccess: async (res, args) => {
      setConfirm(null);
      if (res.pack) setOpening({ result: res.pack, listing: args.listing });
      else toast.success(res.granted.length ? `Bought ${res.granted.map((g) => g.name).join(', ')}` : 'Bought');
      if (res.unlimited) toast.message('Test account: nothing was charged.');
      qc.setQueryData(['shop'], (d: ShopData | undefined) => (d ? { ...d, balances: res.balances } : d));
      await Promise.all([qc.invalidateQueries({ queryKey: ['shop'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['collection'] })]);
    },
    // A network failure keeps the same request key, so trying again can never charge twice.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The purchase did not go through. Nothing was charged.'),
  });

  const makeBuddy = useMutation({
    mutationFn: (itemId: string) => api.post('/api/locker/equip', { itemId }),
    onSuccess: async () => {
      toast.success('New buddy chosen');
      await qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const bySection = useMemo(() => {
    const m = new Map<ShopSection, Listing[]>();
    for (const l of shop.data?.listings ?? []) m.set(l.section, [...(m.get(l.section) ?? []), l]);
    return m;
  }, [shop.data]);
  const tabs = TAB_ORDER.filter((t) => t.sections.some((s) => (bySection.get(s)?.length ?? 0) > 0));

  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Shop" />
        <EmptyState title="Sign in to shop" action={<ButtonLink to="/signin?next=/shop" variant="primary">Sign in</ButtonLink>}>
          Everything in the shop is bought with Sparks and Moonstones you earn by playing.
        </EmptyState>
      </>
    );
  }

  const balances = shop.data?.balances ?? {};
  const afford = (l: Listing) => (balances[l.price.currency] ?? 0) >= l.price.amount;
  const activeTab = tabs.find((t) => t.value === tab) ?? tabs[0];

  return (
    <>
      <PageHeader
        title="Shop"
        description="Spend what you earn by playing. Nothing here costs real money."
        actions={
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-full border border-line bg-raised px-4 py-2">
              {['sparks', 'moonstones', 'dust', ...(balances.frost_tickets ? ['frost_tickets'] : [])].map((c) => (
                <Amount key={c} currency={c} value={balances[c] ?? 0} />
              ))}
            </div>
            <Button size="sm" variant="ghost" icon={<HelpCircle className="size-4" />} onClick={() => setCurrenciesOpen(true)}>
              How to earn
            </Button>
          </>
        }
      />
      {shop.isError ? <ErrorNotice message="The shop could not be loaded." onRetry={() => shop.refetch()} /> : null}
      {shop.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : activeTab ? (
        <Tabs value={activeTab.value} onValueChange={setTab} label="Shop sections" items={tabs.map((t) => ({ value: t.value, label: t.label }))}>
          {activeTab.sections.map((s) => {
            const list = bySection.get(s) ?? [];
            if (!list.length) return null;
            const reset = s === 'daily' ? shop.data?.resets.daily : s === 'weekly' ? shop.data?.resets.weekly : null;
            return (
              <section key={s} className="mb-8">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl font-bold">{SHOP_SECTION_INFO[s].label}</h2>
                    <p className="text-sm text-text-2">{SHOP_SECTION_INFO[s].description}</p>
                  </div>
                  {reset ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-text-3">
                      <Clock className="size-4" /> New picks in {untilText(reset)}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((l) => (
                    <ListingCard key={l.id} l={l} onBuy={(x) => setConfirm({ listing: x, key: newRequestKey('buy') })} onOdds={setOddsFor} />
                  ))}
                </div>
              </section>
            );
          })}
        </Tabs>
      ) : null}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !buy.isPending && setConfirm(null)}
        title={confirm ? `Buy ${confirm.listing.title}?` : ''}
        size="sm"
        footer={
          confirm ? (
            <>
              <Button onClick={() => setConfirm(null)} disabled={buy.isPending}>
                Cancel
              </Button>
              <Button variant="primary" loading={buy.isPending} disabled={!afford(confirm.listing)} onClick={() => buy.mutate(confirm)}>
                {confirm.listing.kind === 'pack' ? 'Open it' : 'Buy'} for {formatNumber(confirm.listing.price.amount)}
              </Button>
            </>
          ) : null
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-2">Price</span>
              <Amount currency={confirm.listing.price.currency} value={confirm.listing.price.amount} />
            </div>
            <div className="flex justify-between">
              <span className="text-text-2">You have</span>
              <Amount currency={confirm.listing.price.currency} value={balances[confirm.listing.price.currency] ?? 0} />
            </div>
            {afford(confirm.listing) ? (
              <div className="flex justify-between border-t border-line pt-3">
                <span className="text-text-2">Left after</span>
                <Amount currency={confirm.listing.price.currency} value={(balances[confirm.listing.price.currency] ?? 0) - confirm.listing.price.amount} />
              </div>
            ) : (
              <p className="rounded-[12px] bg-ember/12 px-3 py-2 font-semibold text-text">You need {formatNumber(confirm.listing.price.amount - (balances[confirm.listing.price.currency] ?? 0))} more. Play a game or two to earn them.</p>
            )}
            {confirm.listing.kind === 'pack' ? (
              <button type="button" className="self-start text-sm font-semibold text-link" onClick={() => setOddsFor(confirm.listing.pack!.id)}>
                See the odds first
              </button>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <OddsDialog packId={oddsFor} onClose={() => setOddsFor(null)} />

      <PackOpening
        lantern={opening?.listing.pack?.art ?? null}
        result={opening?.result ?? null}
        onClose={() => setOpening(null)}
        againLabel={opening ? (afford(opening.listing) ? `Open another for ${formatNumber(opening.listing.price.amount)}` : `Need ${formatNumber(opening.listing.price.amount - (balances[opening.listing.price.currency] ?? 0))} more to open another`) : undefined}
        againDisabled={!opening || !afford(opening.listing) || buy.isPending}
        onAgain={() => opening && buy.mutate({ listing: opening.listing, key: newRequestKey('buy') })}
        onMakeBuddy={(id) => makeBuddy.mutate(id)}
      />

      <Dialog open={currenciesOpen} onOpenChange={setCurrenciesOpen} title="Currencies" size="lg">
        <ul className="flex flex-col gap-4">
          {(overview.data?.currencies ?? []).map((c) => (
            <li key={c.code} className="flex gap-3">
              <Amount currency={c.code} value={balances[c.code] ?? 0} size="lg" className="w-24 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">{c.name}</div>
                <p className="text-text-2">{c.description}</p>
                <p className="mt-1 text-text-2">
                  <span className="font-semibold text-text">Earn:</span> {c.howToEarn}
                </p>
                <p className="text-text-2">
                  <span className="font-semibold text-text">Spend:</span> {c.howToSpend}
                </p>
                {c.expiresAt ? <p className="text-text-3">Disappears {new Date(c.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
