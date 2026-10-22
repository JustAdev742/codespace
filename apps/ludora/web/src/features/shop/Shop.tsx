import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, HelpCircle, Info } from 'lucide-react';
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
import { StickerTabPanel, StickerTabs, formatPercent } from '../home/kit.tsx';
import { RarityPanel, frameProps } from '../collection/rarity.tsx';
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
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className={`size-3 rounded-full border border-ink ${o.rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''}`} style={o.rarity === 'mythic' ? undefined : { background: `var(--r-${o.rarity})` }} aria-hidden />
                      {RARITY_INFO[o.rarity].label}
                    </span>
                  </td>
                  <td className="py-2 font-bold tabular">{formatPercent(o.percent)}</td>
                  <td className="py-2 tabular">{o.items}</td>
                  <td className="py-2 text-text-2 tabular">{o.perItemPercent < 0.1 ? o.perItemPercent.toFixed(3) : o.perItemPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.pity ? (
            <p className="flex gap-2 rounded-[14px] bg-surface-2 px-3 py-2.5 text-sm text-text-2">
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
                <li key={i.id} className={`flex flex-col items-center gap-0.5 p-1.5 pb-2 text-center ${f.className}`} style={{ ...f.style, boxShadow: undefined }}>
                  <Glim art={i.art as GlimArt} size={64} rarity={owned ? i.rarity : null} silhouette={!owned} />
                  <span className="w-full truncate text-xs font-bold">{owned ? i.name : 'Not found yet'}</span>
                  <span className="text-[11px] text-text-2">{RARITY_INFO[i.rarity].label}</span>
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
    return <span className={`rounded-full border-2 border-ink bg-glim px-3 py-1 text-center text-sm font-bold text-on-accent ${wide ? 'block w-full' : ''}`}>{l.blocked}</span>;
  }
  return (
    // The name is built from the content, with the item and currency in hidden text, so the
    // visible "Buy 150" is part of it (WCAG 2.5.3) and screen readers hear the whole thing.
    <Button variant="primary" onClick={() => onBuy(l)} className={`gap-2.5 pl-3.5 ${wide ? 'w-full' : ''}`}>
      <span>
        Buy<span className="sr-only"> {l.title} for</span>
      </span>
      <Amount currency={l.price.currency} value={l.price.amount} size="sm" className="rounded-full bg-white/55 px-2 py-0.5" />
      <span className="sr-only">{currencyName(l.price.currency)}</span>
    </Button>
  );
}

/** A Lantern at its stall: hanging, lit, with its odds written on the card. */
function LanternCard({ l, onBuy, onOdds }: { l: Listing; onBuy: (l: Listing) => void; onOdds: (packId: string) => void }) {
  const pack = l.pack!;
  const detail = usePackDetail(pack.id);
  return (
    <article className="group flex flex-col overflow-hidden rounded-[22px] border-[2.5px] border-ink bg-raised shadow-[0_5px_0_var(--ink)]">
      <div className="relative flex h-52 justify-center overflow-hidden border-b-[2.5px] border-ink" style={{ background: `hsl(${pack.art.hue} 46% 25%)` }}>
        <span className="absolute top-5 left-6 size-1.5 rounded-full bg-white/70" aria-hidden />
        <span className="absolute top-12 right-8 size-1 rounded-full bg-white/60" aria-hidden />
        <span className="absolute right-14 bottom-8 size-1.5 rounded-full bg-white/40" aria-hidden />
        <div className="origin-top group-hover:animate-[fx-sway_2.4s_ease-in-out_infinite]">
          <div className="mx-auto h-4 w-[3px] bg-[#120b3d]" aria-hidden />
          <Lantern art={pack.art} size={144} lit />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-display text-xl leading-tight font-extrabold">{l.title}</h3>
        <p className="text-sm text-text-2">{l.description}</p>
        <div className="mt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-bold">Chances</span>
            <button type="button" onClick={() => onOdds(pack.id)} className="inline-flex items-center gap-1 rounded-[8px] text-sm font-bold text-link">
              <HelpCircle className="size-4" aria-hidden /> What's inside
            </button>
          </div>
          {detail.data ? <OddsBar odds={detail.data.odds} compact /> : detail.isError ? <p className="text-sm text-text-2">The odds did not load. Open What's inside to try again.</p> : <Skeleton className="h-14" />}
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
    <article className={`flex flex-col ${f.className}`} style={f.style}>
      <RarityPanel rarity={item.rarity} className="m-1.5 h-40">
        <ItemArtView art={item.art} rarity={item.rarity} size={item.type === 'banner' ? 150 : 112} />
      </RarityPanel>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pt-1 pb-3.5">
        <h3 className="font-display text-lg leading-tight font-extrabold">{l.title}</h3>
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
    <article className="flex flex-col overflow-hidden rounded-[22px] border-[2.5px] border-ink bg-raised shadow-[0_5px_0_var(--ink)]">
      <div className="relative flex h-44 items-center justify-center border-b-[2.5px] border-ink bg-surface-3">
        {items.slice(0, 3).map((b, i) => {
          const f = frameProps(b.rarity);
          return (
            <div key={b.id} className={`-mx-2.5 grid size-[4.75rem] shrink-0 place-items-center overflow-hidden ${f.className}`} style={{ ...f.style, transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -8 : 0}px)`, zIndex: i === 1 ? 2 : 1 }}>
              <ItemArtView art={b.art} rarity={b.rarity} size={58} />
            </div>
          );
        })}
        {save ? <span className="absolute top-3 left-3 rotate-[-4deg] rounded-[10px] border-2 border-ink bg-glim px-2 py-0.5 font-display text-sm font-extrabold text-on-accent shadow-[0_2px_0_var(--ink)]">Save {save}%</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-xl leading-tight font-extrabold">{l.title}</h3>
        <p className="text-sm text-text-2">{l.description}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="In this bundle">
          {items.map((b) => (
            <li key={b.id} className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-semibold text-text-2">
              {b.name}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex justify-end pt-3">
          <PriceButton l={l} onBuy={onBuy} />
        </div>
      </div>
    </article>
  );
}

function ListingCard({ l, onBuy, onOdds }: { l: Listing; onBuy: (l: Listing) => void; onOdds: (packId: string) => void }) {
  if (l.kind === 'pack' && l.pack) return <LanternCard l={l} onBuy={onBuy} onOdds={onOdds} />;
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
        <PageHeader title="Shop" art={<Lantern art={{ hue: 38, accentHue: 18, pattern: 'stars' }} size={84} lit />} />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Shop" art={<Lantern art={{ hue: 38, accentHue: 18, pattern: 'stars' }} size={84} lit />} />
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
  const walletPill = 'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-full border-2 border-ink bg-raised px-4 py-2 shadow-[0_3px_0_var(--ink)]';

  return (
    <>
      <PageHeader
        title="Shop"
        description="Spend what you earn by playing. Nothing here costs real money."
        art={
          <div className="flex items-end gap-1 pr-1">
            <Lantern art={{ hue: 340, accentHue: 50, pattern: 'leaves' }} size={52} lit className="mb-3 -rotate-6" />
            <Lantern art={{ hue: 38, accentHue: 18, pattern: 'stars' }} size={84} lit />
          </div>
        }
        actions={
          <>
            {balances ? (
              <div className={walletPill} role="group" aria-label="Your wallet">
                {wallet.map((c) => (
                  <span key={c} className="inline-flex items-center" title={currencyName(c)}>
                    <Amount currency={c} value={balances[c] ?? 0} />
                    <span className="sr-only"> {currencyName(c)}</span>
                  </span>
                ))}
              </div>
            ) : loading || overview.isLoading ? (
              <div className={walletPill}>
                <span className="sr-only">Loading your wallet</span>
                {wallet.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1" aria-hidden>
                    <CurrencyIcon code={c} size={18} />
                    <Skeleton className="h-4 w-7" />
                  </span>
                ))}
              </div>
            ) : null}
            <Button size="md" variant="ghost" icon={<HelpCircle className="size-4" aria-hidden />} onClick={() => setCurrenciesOpen(true)}>
              How to earn
            </Button>
          </>
        }
      />
      {shop.isError ? <ErrorNotice message="The shop could not be loaded." onRetry={() => shop.refetch()} /> : null}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          <span role="status" className="sr-only">
            Loading the shop
          </span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-[22px]" />
          ))}
        </div>
      ) : shop.data && !activeTab ? (
        <EmptyState title="Nothing on sale right now">New picks arrive every day.</EmptyState>
      ) : activeTab ? (
        <StickerTabs value={activeTab.value} onValueChange={setTab} label="Shop sections" items={tabs.map((t) => ({ value: t.value, label: t.label }))}>
          <StickerTabPanel value={activeTab.value} className="focus-visible:outline-offset-8">
            {activeTab.sections.map((s) => {
              const list = bySection.get(s) ?? [];
              if (!list.length) return null;
              const reset = s === 'daily' ? shop.data?.resets.daily : s === 'weekly' ? shop.data?.resets.weekly : null;
              const ends = s === 'event' ? list.find((l) => l.endsAt)?.endsAt : null;
              return (
                <section key={s} className="mb-10" aria-labelledby={`shop-${s}`}>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 id={`shop-${s}`} className="font-display text-2xl font-extrabold">
                        {SHOP_SECTION_INFO[s].label}
                      </h2>
                      <p className="text-text-2">{SHOP_SECTION_INFO[s].description}</p>
                    </div>
                    {reset || ends ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-sm font-semibold text-text-2">
                        <Clock className="size-4" aria-hidden /> {reset ? `New picks in ${untilText(reset)}` : `Ends in ${untilText(ends!)}`}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {list.map((l) => (
                      <ListingCard key={l.id} l={l} onBuy={(x) => setConfirm({ listing: x, key: newRequestKey('buy') })} onOdds={setOddsFor} />
                    ))}
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
        <ul className="flex flex-col gap-4">
          {(overview.data?.currencies ?? []).map((c) => (
            <li key={c.code} className="flex gap-3 rounded-[16px] bg-surface-2 p-3">
              <Amount currency={c.code} value={balances?.[c.code] ?? 0} size="lg" className="w-24 shrink-0" />
              <div className="text-sm">
                <div className="font-display text-base font-bold">{c.name}</div>
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
  return (
    <div className="flex flex-col gap-4 text-sm">
      {listing.pack ? (
        <div className="flex items-center gap-4 rounded-[16px] p-3" style={{ background: `hsl(${listing.pack.art.hue} 46% 25%)` }}>
          <Lantern art={listing.pack.art} size={64} lit className="shrink-0" />
          <p className="text-[15px] text-white">{listing.pack.description}</p>
        </div>
      ) : null}
      {listing.pack ? (
        <div>
          <p className="mb-1.5 font-semibold text-text">Chance of each rarity</p>
          {detail.data ? <OddsBar odds={detail.data.odds} compact /> : <Skeleton className="h-10" />}
          <button type="button" className="mt-2 text-sm font-bold text-link" onClick={() => onOdds(listing.pack!.id)}>
            What's inside
          </button>
        </div>
      ) : null}
      <dl className="flex flex-col gap-2 rounded-[16px] bg-surface-2 px-3.5 py-3">
        <div className="flex justify-between">
          <dt className="text-text-2">Price</dt>
          <dd>
            <Amount currency={listing.price.currency} value={listing.price.amount} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-2">You have</dt>
          <dd>
            <Amount currency={listing.price.currency} value={balance} />
          </dd>
        </div>
        {canAfford ? (
          <div className="flex justify-between border-t border-line pt-2">
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
        <p className="rounded-[14px] bg-ember/12 px-3 py-2.5 font-semibold text-text">
          You need {formatNumber(shortBy)} more {currencyName(listing.price.currency)}. Play a game or two to earn them.
        </p>
      )}
    </div>
  );
}
