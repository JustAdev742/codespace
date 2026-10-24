import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock, HelpCircle, Info, ShieldCheck } from 'lucide-react';
import { ITEM_TYPE_INFO, RARITY_INFO, SHOP_SECTION_INFO, type GlimArt, type ItemArt, type ItemType, type LanternArt, type Rarity, type ShopSection } from '@ludora/shared';
import { api, ApiError, newRequestKey } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { formatNumber, untilText } from '../../lib/format.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { CurrencyIcon } from '../../art/icons.tsx';
import { AccountError, Amount, Dialog, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { StickerTabPanel, StickerTabs, formatPercent } from '../../ui/game.tsx';
import { RarityLabel, RarityPanel, frameProps } from '../collection/rarity.tsx';
import { PackOpening, type OpenedGlim } from './PackOpening.tsx';
import { OddsBar, usePackDetail } from './odds.tsx';
import { playSfx } from '../../lib/sound/react.tsx';

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

const CURRENCY_NAME: Record<string, string> = { sparks: 'Sparks', moonstones: 'Moonstones', dust: 'Glow Dust', frost_tickets: 'Frost Tickets' };
const currencyName = (c: string) => CURRENCY_NAME[c] ?? c.replace(/_/g, ' ');

/** A dark display case in the Lantern's own colour, for Lantern art. */
const caseStyle = (hue: number): CSSProperties => ({
  background: `radial-gradient(90% 70% at 50% 38%, hsl(${hue} 85% 55% / 0.42) 0%, transparent 70%), linear-gradient(180deg, hsl(${hue} 45% 20%) 0%, hsl(${hue} 50% 11%) 100%)`,
});

/* --------------------------------- Odds dialog --------------------------------- */

function OddsDialog({ packId, onClose }: { packId: string | null; onClose: () => void }) {
  const q = usePackDetail(packId);
  return (
    <Dialog open={Boolean(packId)} onOpenChange={(o) => !o && onClose()} title={q.data ? `What's inside a ${q.data.pack.name}` : 'Odds'} description="These are the exact odds the server uses. Every Lantern holds one Glim." size="lg">
      {q.isLoading ? <Skeleton className="h-40" /> : null}
      {q.isError ? <ErrorNotice message="The odds did not load." onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <div className="flex flex-col gap-5">
          <OddsBar odds={q.data.odds} />
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Chance of each rarity</caption>
            <thead className="text-text-2">
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
                    <RarityLabel rarity={o.rarity} />
                  </td>
                  <td className="py-2 font-display text-lg font-bold tabular">{formatPercent(o.percent)}</td>
                  <td className="py-2 tabular">{o.items}</td>
                  <td className="py-2 text-text-2 tabular">{o.perItemPercent < 0.1 ? o.perItemPercent.toFixed(3) : o.perItemPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.pity ? (
            <p className="flex gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2.5 text-sm text-text-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                At least one in every {q.data.pity.every} is epic or better: if {q.data.pity.every - 1} in a row are not, the next one is guaranteed to be. Yours is due within your next {q.data.pity.untilGuaranteed}.
              </span>
            </p>
          ) : null}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Glims in this Lantern">
            {q.data.items.map((i) => {
              const owned = i.owned > 0;
              const f = frameProps(i.rarity, { missing: !owned });
              return (
                <li key={i.id} className={`flex flex-col items-center gap-0.5 overflow-hidden p-1 pb-2 text-center ${f.className}`} style={f.style}>
                  <RarityPanel rarity={i.rarity} missing={!owned} tag={false} className="aspect-square w-full">
                    <Glim art={i.art as GlimArt} size={64} rarity={owned ? i.rarity : null} silhouette={!owned} className="h-auto w-[78%]" />
                  </RarityPanel>
                  <span className="mt-0.5 w-full truncate text-xs font-bold">{owned ? i.name : 'Not found yet'}</span>
                  <RarityLabel rarity={i.rarity} className="text-[11px] text-text-2" />
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-text-2">Silhouettes are Glims you have not found yet. Lanterns are only bought with Sparks or Moonstones you earn by playing, never with money.</p>
        </div>
      ) : null}
    </Dialog>
  );
}

/* ----------------------------------- Cards ----------------------------------- */

function PriceButton({ l, onBuy, wide = false }: { l: Listing; onBuy: (l: Listing) => void; wide?: boolean }) {
  if (l.blocked) {
    return (
      <span className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 text-sm font-bold text-text-2 ${wide ? 'w-full' : ''}`}>
        <Check className="size-4 text-glim" aria-hidden /> {l.blocked}
      </span>
    );
  }
  return (
    // The name is built from the content, with the item and currency in hidden text, so the
    // visible "Buy 150" is part of it (WCAG 2.5.3) and screen readers hear the whole thing.
    <Button variant="primary" onClick={() => onBuy(l)} className={`gap-2 pr-3 pl-4 ${wide ? 'w-full' : ''}`}>
      <span>
        Buy<span className="sr-only"> {l.title} for</span>
      </span>
      <span className="h-5 w-px bg-on-accent/25" aria-hidden />
      <span className="inline-flex items-center gap-1 font-display text-[1.15rem] leading-none font-extrabold tabular">
        <CurrencyIcon code={l.price.currency} size={17} />
        {formatNumber(l.price.amount)}
      </span>
      <span className="sr-only">{currencyName(l.price.currency)}</span>
    </Button>
  );
}

/** The odds on a Lantern's card, always in view, with the full table one tap away. */
function CardOdds({ packId, onOdds }: { packId: string; onOdds: (packId: string) => void }) {
  const detail = usePackDetail(packId);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">Odds</span>
        <button type="button" onClick={() => onOdds(packId)} className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-s)] text-sm font-bold text-link">
          <HelpCircle className="size-4" aria-hidden /> What's inside
        </button>
      </div>
      {detail.data ? <OddsBar odds={detail.data.odds} compact /> : detail.isError ? <p className="text-sm text-text-2">The odds did not load. Open What's inside to try again.</p> : <Skeleton className="h-14" />}
      {detail.data?.pity ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-text-2">
          <ShieldCheck className="size-4 shrink-0 text-glim" aria-hidden />
          {detail.data.pity.untilGuaranteed === 1 ? 'Your next one is epic or better, guaranteed' : `Epic or better guaranteed within ${detail.data.pity.untilGuaranteed}`}
        </p>
      ) : null}
    </div>
  );
}

/** A Lantern for sale: a premium pack in a display case of its own colour, its odds on the card. */
function LanternCard({ l, onBuy, onOdds, featured = false }: { l: Listing; onBuy: (l: Listing) => void; onOdds: (packId: string) => void; featured?: boolean }) {
  const pack = l.pack!;
  return (
    <article className={`panel flex overflow-hidden rounded-[var(--radius-l)] ${featured ? 'flex-col sm:flex-row' : 'flex-col'}`}>
      <div className={`relative grid shrink-0 place-items-center ${featured ? 'h-56 sm:h-auto sm:w-[46%]' : 'h-48'}`} style={caseStyle(pack.art.hue)}>
        {featured ? (
          <span className="plate plate-gold absolute top-3 left-3 text-sm uppercase">
            <span>Featured</span>
          </span>
        ) : null}
        <Lantern art={pack.art} size={featured ? 168 : 128} lit className="drop-shadow-[0_14px_18px_rgb(0_0_0/0.45)]" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className={`font-display leading-tight font-bold ${featured ? 'text-[1.9rem]' : 'text-[1.45rem]'}`}>{l.title}</h3>
        <p className="text-sm text-text-2">{l.description}</p>
        <div className="mt-2">
          <CardOdds packId={pack.id} onOdds={onOdds} />
        </div>
        <div className="mt-auto pt-4">
          <PriceButton l={l} onBuy={onBuy} wide />
        </div>
      </div>
    </article>
  );
}

function ItemCard({ l, onBuy }: { l: Listing; onBuy: (l: Listing) => void }) {
  const item = l.item!;
  const f = frameProps(item.rarity);
  const info = ITEM_TYPE_INFO[item.type];
  return (
    <article className={`flex flex-col overflow-hidden ${f.className}`} style={f.style}>
      <RarityPanel rarity={item.rarity} className="m-1.5 h-40">
        <ItemArtView art={item.art} rarity={item.rarity} size={item.type === 'banner' ? 150 : 124} />
      </RarityPanel>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pt-1 pb-3.5">
        <h3 className="font-display text-[1.3rem] leading-tight font-bold">{l.title}</h3>
        <p className="text-xs font-bold text-text-2">{info.label}</p>
        <p className="line-clamp-2 text-sm text-text-2">{l.description}</p>
        {item.owned && info.stackable ? <p className="text-sm text-text-2">You have {item.owned}</p> : null}
        <div className="mt-auto flex justify-end pt-2">
          <PriceButton l={l} onBuy={onBuy} />
        </div>
      </div>
    </article>
  );
}

function BundleCard({ l, onBuy }: { l: Listing; onBuy: (l: Listing) => void }) {
  const items = l.bundle ?? [];
  const save = l.worth && l.worth > l.price.amount ? Math.round((1 - l.price.amount / l.worth) * 100) : 0;
  return (
    <article className="panel flex flex-col overflow-hidden rounded-[var(--radius-l)]">
      <div className="relative flex h-44 items-center justify-center gap-2 bg-sunken px-3 pt-8">
        {items.slice(0, 3).map((b) => {
          const f = frameProps(b.rarity);
          return (
            <div key={b.id} className={`grid aspect-square w-[30%] max-w-[5.25rem] place-items-center overflow-hidden p-1 ${f.className}`} style={f.style}>
              <RarityPanel rarity={b.rarity} tag={false} className="size-full">
                <ItemArtView art={b.art} rarity={b.rarity} size={58} />
              </RarityPanel>
            </div>
          );
        })}
        {save ? (
          <span className="plate absolute top-3 left-3 bg-glim text-base text-on-accent">
            <span>Save {save}%</span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-[1.45rem] leading-tight font-bold">{l.title}</h3>
        <p className="text-sm text-text-2">{l.description}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="In this bundle">
          {items.map((b) => (
            <li key={b.id} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-semibold text-text">
              {b.name}
              <span className="font-normal text-text-2">· {RARITY_INFO[b.rarity].label}</span>
            </li>
          ))}
        </ul>
        {l.worth && save ? (
          <p className="mt-1 text-sm text-text-2">
            Worth <span className="line-through tabular">{formatNumber(l.worth)}</span> bought one by one
          </p>
        ) : null}
        <div className="mt-auto flex justify-end pt-3">
          <PriceButton l={l} onBuy={onBuy} />
        </div>
      </div>
    </article>
  );
}

function ListingCard({ l, onBuy, onOdds, featured }: { l: Listing; onBuy: (l: Listing) => void; onOdds: (packId: string) => void; featured?: boolean }) {
  if (l.kind === 'pack' && l.pack) return <LanternCard l={l} onBuy={onBuy} onOdds={onOdds} featured={featured} />;
  if (l.kind === 'bundle') return <BundleCard l={l} onBuy={onBuy} />;
  if (l.item) return <ItemCard l={l} onBuy={onBuy} />;
  return null;
}

/* ------------------------------------ Page ------------------------------------ */

const TAB_ORDER: { value: string; label: string; sections: ShopSection[] }[] = [
  { value: 'featured', label: 'Featured', sections: ['featured', 'bundles'] },
  { value: 'picks', label: 'Daily and weekly', sections: ['daily', 'weekly'] },
  { value: 'lanterns', label: 'Lanterns', sections: ['lanterns'] },
  { value: 'glims', label: 'Glims', sections: ['glims'] },
  { value: 'accessories', label: 'Accessories', sections: ['accessories'] },
  { value: 'profile', label: 'Profile', sections: ['profile'] },
  { value: 'effects', label: 'Effects', sections: ['effects'] },
  { value: 'event', label: 'Frost Festival', sections: ['event'] },
];

const walletClass = 'flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-1.5';

export default function Shop() {
  const me = useMe();
  const qc = useQueryClient();
  const overview = useOverview();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'featured';
  // The open tab lives in the address, so links such as /shop?tab=lanterns land on it.
  const setTab = (t: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('tab', t);
        return next;
      },
      { replace: true },
    );
  const [confirm, setConfirm] = useState<{ listing: Listing; key: string } | null>(null);
  const [oddsFor, setOddsFor] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ result: OpenedGlim; listing: Listing; key: string } | null>(null);
  const [currenciesOpen, setCurrenciesOpen] = useState(false);
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api.get<ShopData>('/api/shop'), enabled: Boolean(me.data?.user) });

  const buy = useMutation({
    mutationFn: (args: { listing: Listing; key: string }) => api.post<{ kind: string; pack: OpenedGlim | null; granted: { name: string }[]; balances: Record<string, number>; unlimited: boolean }>('/api/shop/purchase', { listingId: args.listing.id, requestKey: args.key }),
    onSuccess: async (res, args) => {
      setConfirm(null);
      if (res.pack) setOpening({ result: res.pack, listing: args.listing, key: args.key });
      else {
        playSfx('purchase');
        toast.success(res.granted.length ? `Bought ${res.granted.map((g) => g.name).join(', ')}` : 'Bought');
      }
      if (res.unlimited) toast.message('Test account: nothing was charged.');
      qc.setQueryData(['shop'], (d: ShopData | undefined) => (d ? { ...d, balances: res.balances } : d));
      await Promise.all([qc.invalidateQueries({ queryKey: ['shop'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['collection'] }), qc.invalidateQueries({ queryKey: ['locker'] })]);
      // The pity count and which Glims you own have changed; the odds themselves have not.
      if (args.listing.pack) void qc.invalidateQueries({ queryKey: ['pack', args.listing.pack.id], refetchType: 'none' });
    },
    // A network failure keeps the same request key, so trying again can never charge twice.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The purchase did not go through. Nothing was charged.'),
  });

  const makeBuddy = useMutation({
    mutationFn: (itemId: string) => api.post('/api/locker/equip', { itemId }),
    onSuccess: async () => {
      toast.success('New buddy chosen');
      await Promise.all([qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['locker'] }), qc.invalidateQueries({ queryKey: ['collection'] })]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change your buddy.'),
  });

  const bySection = useMemo(() => {
    const m = new Map<ShopSection, Listing[]>();
    for (const l of shop.data?.listings ?? []) m.set(l.section, [...(m.get(l.section) ?? []), l]);
    return m;
  }, [shop.data]);
  const tabs = TAB_ORDER.filter((t) => t.sections.some((s) => (bySection.get(s)?.length ?? 0) > 0));

  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Shop" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
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

  // The shop's own balances, or the account's while the shop loads. Unknown balances are never shown as zeros.
  const balances = shop.data?.balances ?? overview.data?.balances;
  const loading = me.isLoading || shop.isLoading;
  const afford = (l: Listing) => (balances?.[l.price.currency] ?? 0) >= l.price.amount;
  const shortBy = (l: Listing) => l.price.amount - (balances?.[l.price.currency] ?? 0);
  const activeTab = tabs.find((t) => t.value === tab) ?? tabs[0];
  const wallet = ['sparks', 'moonstones', 'dust', ...(balances?.frost_tickets || tabs.some((t) => t.value === 'event') ? ['frost_tickets'] : [])];

  return (
    <>
      <PageHeader
        title="Shop"
        description="Spend what you earn by playing. Nothing here costs real money."
        actions={
          <>
            {balances ? (
              <div className={walletClass} role="group" aria-label="Your wallet">
                {wallet.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 font-display text-xl leading-none font-bold tabular" title={currencyName(c)}>
                    <CurrencyIcon code={c} size={20} />
                    {formatNumber(balances[c] ?? 0)}
                    <span className="sr-only"> {currencyName(c)}</span>
                  </span>
                ))}
              </div>
            ) : loading || overview.isLoading ? (
              <div className={walletClass}>
                <span className="sr-only">Loading your wallet</span>
                {wallet.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5" aria-hidden>
                    <CurrencyIcon code={c} size={20} />
                    <Skeleton className="h-4 w-8" />
                  </span>
                ))}
              </div>
            ) : null}
            <Button size="md" variant="ghost" className="h-11" icon={<HelpCircle className="size-4" aria-hidden />} onClick={() => setCurrenciesOpen(true)}>
              How to earn
            </Button>
          </>
        }
      />
      {shop.isError ? <ErrorNotice message="The shop could not be loaded." onRetry={() => shop.refetch()} /> : null}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          <span role="status" className="sr-only">
            Loading the shop
          </span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-[var(--radius-l)]" />
          ))}
        </div>
      ) : shop.data && !activeTab ? (
        <EmptyState title="Nothing on sale right now">New picks arrive every day.</EmptyState>
      ) : activeTab ? (
        <StickerTabs value={activeTab.value} onValueChange={setTab} label="Shop sections" items={tabs.map((t) => ({ value: t.value, label: t.label }))}>
          <StickerTabPanel value={activeTab.value} className="focus-visible:outline-offset-8">
            {activeTab.sections.map((s) => {
              // On the Featured tab the featured Lantern leads, on its wide card.
              const list = s === 'featured' ? [...(bySection.get(s) ?? [])].sort((a, b) => Number(b.kind === 'pack') - Number(a.kind === 'pack')) : (bySection.get(s) ?? []);
              if (!list.length) return null;
              const reset = s === 'daily' ? shop.data?.resets.daily : s === 'weekly' ? shop.data?.resets.weekly : null;
              const ends = s === 'event' ? list.find((l) => l.endsAt)?.endsAt : null;
              return (
                <section key={s} className="mb-10" aria-labelledby={`shop-${s}`}>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                      <h2 id={`shop-${s}`} className="font-display text-[1.75rem] leading-tight font-bold">
                        {SHOP_SECTION_INFO[s].label}
                      </h2>
                      <p className="text-text-2">{SHOP_SECTION_INFO[s].description}</p>
                    </div>
                    {reset || ends ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-sm font-semibold text-text-2">
                        <Clock className="size-4" aria-hidden /> {reset ? `New picks in ${untilText(reset)}` : `Ends in ${untilText(ends!)}`}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {list.map((l, i) => {
                      const featured = s === 'featured' && i === 0 && l.kind === 'pack';
                      return (
                        <div key={l.id} className={featured ? 'min-[480px]:col-span-2' : 'flex flex-col [&>*]:flex-1'}>
                          <ListingCard l={l} onBuy={(x) => setConfirm({ listing: x, key: newRequestKey('buy') })} onOdds={setOddsFor} featured={featured} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </StickerTabPanel>
        </StickerTabs>
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
                {confirm.listing.kind === 'pack' ? 'Open it' : 'Buy it'} for {formatNumber(confirm.listing.price.amount)}
              </Button>
            </>
          ) : null
        }
      >
        {confirm ? <ConfirmBody listing={confirm.listing} balance={balances?.[confirm.listing.price.currency] ?? 0} canAfford={afford(confirm.listing)} shortBy={shortBy(confirm.listing)} onOdds={setOddsFor} /> : null}
      </Dialog>

      <OddsDialog packId={oddsFor} onClose={() => setOddsFor(null)} />

      <PackOpening
        lantern={opening?.listing.pack?.art ?? null}
        packId={opening?.listing.pack?.id ?? null}
        packName={opening?.listing.pack?.name ?? 'Lantern'}
        result={opening?.result ?? null}
        runKey={opening?.key}
        onClose={() => setOpening(null)}
        again={
          opening
            ? {
                label: `Open another for ${formatNumber(opening.listing.price.amount)}`,
                disabled: !afford(opening.listing) || buy.isPending,
                loading: buy.isPending,
                note: afford(opening.listing) ? undefined : `You need ${formatNumber(shortBy(opening.listing))} more ${currencyName(opening.listing.price.currency)} to open another. Play a game to earn them.`,
                onClick: () => buy.mutate({ listing: opening.listing, key: newRequestKey('buy') }),
              }
            : undefined
        }
        onMakeBuddy={(id) => makeBuddy.mutate(id)}
        isBuddy={Boolean(opening && makeBuddy.isSuccess && makeBuddy.variables === opening.result.item.id)}
      />

      <Dialog open={currenciesOpen} onOpenChange={setCurrenciesOpen} title="How to earn" description="Everything in Ludora is earned by playing. None of it can be bought with money." size="lg">
        <ul className="flex flex-col gap-3">
          {(overview.data?.currencies ?? []).map((c) => (
            <li key={c.code} className="flex gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3">
              <span className="inline-flex w-24 shrink-0 items-center gap-1.5 self-start font-display text-2xl leading-none font-bold tabular">
                <CurrencyIcon code={c.code} size={24} />
                {formatNumber(balances?.[c.code] ?? 0)}
              </span>
              <div className="text-sm">
                <div className="font-display text-lg font-bold">{c.name}</div>
                <p className="text-text-2">{c.description}</p>
                <p className="mt-1 text-text-2">
                  <span className="font-semibold text-text">Earn:</span> {c.howToEarn}
                </p>
                <p className="text-text-2">
                  <span className="font-semibold text-text">Spend:</span> {c.howToSpend}
                </p>
                {c.expiresAt ? <p className="text-text-2">Disappears {new Date(c.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

function ConfirmBody({ listing, balance, canAfford, shortBy, onOdds }: { listing: Listing; balance: number; canAfford: boolean; shortBy: number; onOdds: (packId: string) => void }) {
  const detail = usePackDetail(listing.pack?.id);
  const item = listing.item;
  return (
    <div className="flex flex-col gap-4 text-sm">
      {listing.pack ? (
        <div className="flex items-center gap-4 rounded-[var(--radius-m)] p-3" style={caseStyle(listing.pack.art.hue)}>
          <Lantern art={listing.pack.art} size={64} lit className="shrink-0" />
          <p className="text-[15px] text-white">{listing.pack.description}</p>
        </div>
      ) : item ? (
        <div className="flex items-center gap-3">
          <div className={`shrink-0 overflow-hidden p-1 ${frameProps(item.rarity).className}`} style={frameProps(item.rarity).style}>
            <RarityPanel rarity={item.rarity} tag={false} className="size-20">
              <ItemArtView art={item.art} rarity={item.rarity} size={item.type === 'banner' ? 76 : 64} />
            </RarityPanel>
          </div>
          <div className="min-w-0">
            <RarityLabel rarity={item.rarity} className="text-text-2" />
            <p className="text-text-2">{ITEM_TYPE_INFO[item.type].label}</p>
          </div>
        </div>
      ) : null}
      {listing.pack ? (
        <div>
          <p className="mb-1.5 font-semibold text-text">Chance of each rarity</p>
          {detail.data ? <OddsBar odds={detail.data.odds} compact /> : <Skeleton className="h-10" />}
          <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-link" onClick={() => onOdds(listing.pack!.id)}>
            What's inside
          </button>
        </div>
      ) : null}
      <dl className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3.5 py-3">
        <div className="flex items-center justify-between">
          <dt className="text-text-2">Price</dt>
          <dd>
            <Amount currency={listing.price.currency} value={listing.price.amount} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-2">You have</dt>
          <dd>
            <Amount currency={listing.price.currency} value={balance} />
          </dd>
        </div>
        {canAfford ? (
          <div className="flex items-center justify-between border-t border-line pt-2">
            <dt className="text-text-2">Left after</dt>
            <dd>
              <Amount currency={listing.price.currency} value={balance - listing.price.amount} />
            </dd>
          </div>
        ) : null}
      </dl>
      {canAfford ? (
        <p className="text-text-2">Paid with {currencyName(listing.price.currency)} you earned by playing. No real money, ever.</p>
      ) : (
        <p className="rounded-[var(--radius-m)] border border-ember/40 bg-ember/10 px-3 py-2.5 font-semibold text-text">
          You need {formatNumber(shortBy)} more {currencyName(listing.price.currency)}. Play a game or two to earn them.
        </p>
      )}
    </div>
  );
}

