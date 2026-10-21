import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { ITEM_TYPE_INFO, SHOP_SECTIONS, SHOP_SECTION_INFO, type ItemType, type Rarity, type ShopSection } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Lantern } from '../../art/Lantern.tsx';
import { Amount, Badge, Field, Input, RarityBadge, Select, Switch, Textarea } from '../../ui/primitives.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, Pager, StaffPage, StatusPill, dateTime, useDebounced, useStaffMutation, type Column } from './ui.tsx';
import { ArtThumb, CurrencySelect, DateTimeField, ItemPicker, NoChangesNote, Segmented, isoToLocalInput, localInputToIso, parseWhole, useCurrencyChoices, useQueryParams, wholeError, type ItemList, type PickedItem } from './Economy.tsx';
import { usePacks } from './Catalog.tsx';

/*
 * Shop listings. A listing sells one item, one Lantern or a bundle of
 * items, in a section, at a price, optionally on a daily or weekly rotation
 * and inside a date window. Nothing here deletes a listing: switching it
 * off takes it out of the shop and keeps its sales history.
 */

interface AdminListing {
  id: string;
  section: ShopSection;
  itemId: string | null;
  packId: string | null;
  bundle: string[] | null;
  title: string | null;
  description: string | null;
  priceCurrency: string;
  priceAmount: number;
  worth: number | null;
  perUserLimit: number | null;
  rotation: 'daily' | 'weekly' | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  sort: number;
  target:
    | { kind: 'item'; name: string | null; type: string | null; rarity: string | null; releaseState: string | null }
    | { kind: 'pack'; name: string | null }
    | { kind: 'bundle'; name: string | null; items: string[] | null };
  inRotationToday: boolean | null;
  sold: number;
}

const PAGE = 50;
const KIND_LABEL = { item: 'Item', pack: 'Lantern', bundle: 'Bundle' } as const;
const listingsKey = ['admin', 'shop', 'listings'] as const;

function listingName(l: AdminListing): string {
  return l.title ?? l.target.name ?? l.id;
}

function sectionFor(type: ItemType | undefined): ShopSection {
  switch (type) {
    case 'glim':
      return 'glims';
    case 'accessory':
      return 'accessories';
    case 'frame':
    case 'banner':
    case 'title':
      return 'profile';
    default:
      return 'effects';
  }
}

function rotationText(l: Pick<AdminListing, 'rotation' | 'inRotationToday'>): { label: string; picked: string | null } {
  if (l.rotation === 'daily') return { label: 'Daily rotation', picked: l.inRotationToday ? "In today's picks" : "Not in today's picks" };
  if (l.rotation === 'weekly') return { label: 'Weekly rotation', picked: l.inRotationToday ? "In this week's picks" : "Not in this week's picks" };
  return { label: 'Always listed', picked: null };
}

/** A small switch for table rows; flipping it asks for a reason before anything changes. */
function RowSwitch({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="group relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-ink bg-surface-3 transition-colors aria-checked:bg-glim"
    >
      <span className="block size-4 translate-x-0.5 rounded-full border-2 border-ink bg-white transition-transform group-aria-checked:translate-x-[18px]" />
    </button>
  );
}

export default function ShopAdmin() {
  const [params, patch] = useQueryParams();
  const section = params.get('section') ?? '';
  const active = params.get('active') ?? '';
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const dq = useDebounced(text.trim(), 300);
  const lastDq = useRef(dq);
  useEffect(() => {
    if (lastDq.current === dq) return;
    lastDq.current = dq;
    if (dq !== q) patch({ q: dq });
  }, [dq, q, patch]);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [section, active, q]);

  const serverActive = active === '1' || active === '0' ? active : '';
  const list = useQuery({
    queryKey: [...listingsKey, { q, active: serverActive }],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (serverActive) qs.set('active', serverActive);
      return api.get<{ listings: AdminListing[] }>(`/api/admin/shop/listings?${qs}`, signal);
    },
    placeholderData: (prev) => prev,
  });
  const all = list.data?.listings;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of all ?? []) m.set(l.section, (m.get(l.section) ?? 0) + 1);
    return m;
  }, [all]);
  const rows = useMemo(() => (all ?? []).filter((l) => (!section || l.section === section) && (active !== 'picked' || l.inRotationToday === true)), [all, section, active]);
  const page = rows.slice(offset, offset + PAGE);

  const [editing, setEditing] = useState<AdminListing | null>(null);
  const [toggling, setToggling] = useState<AdminListing | null>(null);
  const [creating, setCreating] = useState(false);

  const cols: Column<AdminListing>[] = [
    {
      key: 'listing',
      header: 'Listing',
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-semibold">{listingName(l)}</div>
          <div className="font-mono text-xs break-all text-text-3">{l.id}</div>
          <div className="text-xs text-text-2">{SHOP_SECTION_INFO[l.section]?.label ?? l.section}</div>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Sells',
      cell: (l) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={l.target.kind === 'pack' ? 'amber' : l.target.kind === 'bundle' ? 'violet' : 'neutral'}>{KIND_LABEL[l.target.kind]}</Badge>
          {l.target.kind === 'item' ? (
            <>
              <span className="text-xs text-text-2">
                {[l.title ? (l.target.name ?? l.itemId) : null, l.target.type ? (ITEM_TYPE_INFO[l.target.type as ItemType]?.label ?? l.target.type) : null].filter(Boolean).join(' · ')}
              </span>
              {l.target.rarity ? <RarityBadge rarity={l.target.rarity as Rarity} /> : null}
              {l.target.releaseState && l.target.releaseState !== 'live' ? <span className="text-xs font-semibold text-ember">Item is {l.target.releaseState}: hidden from players</span> : null}
            </>
          ) : l.target.kind === 'bundle' ? (
            <span className="text-xs text-text-2">{plural(l.bundle?.length ?? 0, 'item')}</span>
          ) : l.title ? (
            <span className="text-xs text-text-2">{l.target.name ?? l.packId}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      cell: (l) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <Amount currency={l.priceCurrency} value={l.priceAmount} size="sm" />
          {l.worth ? <span className="text-xs text-text-3">worth {formatNumber(l.worth)}</span> : null}
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      cell: (l) => {
        const r = rotationText(l);
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-sm text-text">{r.label}</span>
            {r.picked ? <span className={l.inRotationToday ? 'font-semibold text-glim' : 'text-text-3'}>{r.picked}</span> : null}
            <span className="text-text-3">{l.startsAt || l.endsAt ? `${l.startsAt ? dateTime(l.startsAt) : 'Now'} to ${l.endsAt ? dateTime(l.endsAt) : 'no end'}` : 'No date window'}</span>
          </div>
        );
      },
    },
    { key: 'limit', header: 'Per player', cell: (l) => (l.perUserLimit ? <span className="whitespace-nowrap">{l.rotation ? `${l.perUserLimit} per rotation` : `${l.perUserLimit} in total`}</span> : <span className="text-text-3">No limit</span>) },
    { key: 'sold', header: 'Sold', align: 'right', cell: (l) => formatNumber(l.sold) },
    {
      key: 'active',
      header: 'On sale',
      cell: (l) => <RowSwitch checked={l.active} label={l.active ? `Stop selling ${listingName(l)}` : `Put ${listingName(l)} on sale`} onClick={() => setToggling(l)} />,
    },
    {
      key: 'edit',
      header: 'Actions',
      align: 'right',
      cell: (l) => (
        <Button
          size="sm"
          aria-label={`Edit ${listingName(l)}`}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(l);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const anyFilter = Boolean(section || active || q);
  const onSale = rows.filter((l) => l.active).length;
  return (
    <StaffPage
      title="Shop"
      description="Every shop listing. A listing sells an item, a Lantern or a bundle at a price, optionally on a rotation or inside a date window. Switching one off takes it out of the shop and keeps its sales history."
      actions={
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Create listing
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Search">
              {(p) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                  <Input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Listing, item or Lantern" className="pl-9" autoComplete="off" />
                </div>
              )}
            </Field>
            <Field label="Section" hint={section ? SHOP_SECTION_INFO[section as ShopSection]?.description : undefined}>
              {(p) => (
                <Select {...p} value={section} onChange={(e) => patch({ section: e.target.value })}>
                  <option value="">Every section ({formatNumber(all?.length ?? 0)})</option>
                  {SHOP_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SHOP_SECTION_INFO[s].label} ({formatNumber(counts.get(s) ?? 0)})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Status" hint={active === 'picked' ? 'Rotating listings the shop shows right now, if rotations are switched on.' : undefined}>
              {(p) => (
                <Select {...p} value={active} onChange={(e) => patch({ active: e.target.value })}>
                  <option value="">On sale and off</option>
                  <option value="1">On sale</option>
                  <option value="0">Switched off</option>
                  <option value="picked">In today's or this week's picks</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-text-2" aria-live="polite">
              {all ? `${plural(rows.length, 'listing')}, ${formatNumber(onSale)} on sale.` : ' '}
            </span>
            {anyFilter ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText('');
                  patch({ section: null, active: null, q: null });
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </Card>
        <DataTable
          columns={cols}
          rows={all ? page : undefined}
          rowKey={(l) => l.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(l) => setEditing(l)}
          empty={anyFilter ? 'No listings match these filters.' : 'The shop has no listings yet.'}
          minWidth={840}
          caption="Shop listings"
        />
        <Pager offset={offset} pageSize={PAGE} total={rows.length} onChange={setOffset} />
      </div>
      <ToggleDialog listing={toggling} onClose={() => setToggling(null)} />
      <ListingDialog key={editing?.id ?? 'none'} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} listing={editing ?? undefined} />
      <ListingDialog open={creating} onOpenChange={setCreating} />
    </StaffPage>
  );
}

function ToggleDialog({ listing, onClose }: { listing: AdminListing | null; onClose: () => void }) {
  const [shown, setShown] = useState<AdminListing | null>(listing);
  useEffect(() => {
    if (listing) setShown(listing);
  }, [listing]);
  const toggle = useStaffMutation((body: { id: string; active: boolean; reason: string }) => api.patch(`/api/admin/shop/listings/${body.id}`, { active: body.active, reason: body.reason }), {
    silentError: true,
    success: (_r, b) => (b.active ? 'Back on sale.' : 'Taken out of the shop.'),
    invalidate: [listingsKey, ['admin', 'packs'], ['admin', 'currencies']],
  });
  if (!shown) return null;
  const name = listingName(shown);
  return (
    <ActionDialog
      open={Boolean(listing)}
      onOpenChange={(v) => !v && onClose()}
      title={shown.active ? `Stop selling ${name}` : `Put ${name} back on sale`}
      description={shown.active ? 'It disappears from the shop straight away. Players keep what they bought, and the sales history stays.' : 'It shows in the shop again, within its date window and rotation.'}
      confirmLabel={shown.active ? 'Stop selling' : 'Put on sale'}
      variant={shown.active ? 'danger' : 'primary'}
      onSubmit={async ({ reason }) => {
        await toggle.mutateAsync({ id: shown.id, active: !shown.active, reason });
      }}
    />
  );
}

/* ------------------------------- listing form ------------------------------- */

interface ListingForm {
  kind: 'item' | 'pack' | 'bundle';
  item: PickedItem | null;
  packId: string;
  bundle: PickedItem[];
  section: ShopSection;
  sectionTouched: boolean;
  title: string;
  description: string;
  priceCurrency: string;
  priceAmount: string;
  worth: string;
  perUserLimit: string;
  rotation: '' | 'daily' | 'weekly';
  startsAt: string;
  endsAt: string;
  active: boolean;
  sort: string;
}

function listingForm(l?: AdminListing): ListingForm {
  return {
    kind: l?.target.kind ?? 'item',
    item: null,
    packId: l?.packId ?? '',
    bundle: [],
    section: l?.section ?? 'glims',
    sectionTouched: Boolean(l),
    title: l?.title ?? '',
    description: l?.description ?? '',
    priceCurrency: l?.priceCurrency ?? 'sparks',
    priceAmount: l ? String(l.priceAmount) : '',
    worth: l?.worth ? String(l.worth) : '',
    perUserLimit: l?.perUserLimit ? String(l.perUserLimit) : l ? '' : '1',
    rotation: l?.rotation ?? '',
    startsAt: isoToLocalInput(l?.startsAt),
    endsAt: isoToLocalInput(l?.endsAt),
    active: l?.active ?? true,
    sort: String(l?.sort ?? 0),
  };
}

/** Art for what a listing sells, when the viewer can read the catalogue. */
function TargetPreview({ listing }: { listing: AdminListing }) {
  const canCatalog = useCan('catalog.manage');
  const ids = listing.itemId ? [listing.itemId] : (listing.bundle ?? []);
  const items = useQuery({
    queryKey: ['admin', 'items', 'byIds', ids],
    queryFn: async () => {
      const lists = await Promise.all(ids.map((id) => api.get<ItemList>(`/api/admin/items?q=${encodeURIComponent(id)}`)));
      return ids.map((id, i) => lists[i]?.items.find((it) => it.id === id) ?? null);
    },
    enabled: canCatalog && ids.length > 0,
    staleTime: 60_000,
  });
  const packs = usePacks(canCatalog && Boolean(listing.packId));
  const pack = packs.data?.packs.find((p) => p.id === listing.packId);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-line bg-sunken p-3">
      <div className="flex shrink-0 gap-1.5">
        {listing.packId ? (
          <span className="grid size-16 place-items-center rounded-[10px] bg-surface-2">{pack ? <Lantern art={pack.art} size={48} /> : null}</span>
        ) : (
          (items.data ?? ids.map(() => null)).slice(0, 4).map((it, i) => <ArtThumb key={ids[i] ?? i} art={it?.art} rarity={it?.rarity} size={56} />)
        )}
        {ids.length > 4 ? <span className="self-center text-xs text-text-3">+{ids.length - 4}</span> : null}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-text">{listingName(listing)}</div>
        <div className="text-xs text-text-3">
          {KIND_LABEL[listing.target.kind]}
          {listing.bundle ? `: ${listing.bundle.join(', ')}` : listing.itemId ? `: ${listing.itemId}` : listing.packId ? `: ${listing.packId}` : ''}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-2">
          <StatusPill status={listing.active ? 'active' : 'retired'} label={listing.active ? 'On sale' : 'Switched off'} />
          {plural(listing.sold, 'sale')}
        </div>
      </div>
    </div>
  );
}

function ListingDialog({ open, onOpenChange, listing }: { open: boolean; onOpenChange: (v: boolean) => void; listing?: AdminListing }) {
  const { choices } = useCurrencyChoices();
  const canCatalog = useCan('catalog.manage');
  const packs = usePacks(canCatalog && open && !listing);
  const [f, setF] = useState<ListingForm>(() => listingForm(listing));
  const [adding, setAdding] = useState<PickedItem | null>(null);
  useEffect(() => {
    if (open) {
      setF(listingForm(listing));
      setAdding(null);
    }
  }, [open, listing]);
  const set = <K extends keyof ListingForm>(k: K, v: ListingForm[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const create = useStaffMutation((body: Record<string, unknown>) => api.post<{ ok: true; listing: { id: string } }>('/api/admin/shop/listings', body), {
    silentError: true,
    success: (res) => `Listing ${res.listing.id} created.`,
    invalidate: [listingsKey, ['admin', 'packs'], ['admin', 'currencies']],
  });
  const update = useStaffMutation((body: Record<string, unknown>) => api.patch(`/api/admin/shop/listings/${listing?.id}`, body), {
    silentError: true,
    success: `Saved ${listing ? listingName(listing) : 'the listing'}.`,
    invalidate: [listingsKey, ['admin', 'packs'], ['admin', 'currencies']],
  });

  const price = parseWhole(f.priceAmount, 0, 1_000_000);
  const worth = f.worth.trim() ? parseWhole(f.worth, 0, 10_000_000) : null;
  const limit = f.perUserLimit.trim() ? parseWhole(f.perUserLimit, 1, 1000) : null;
  const sort = parseWhole(f.sort, -100_000, 100_000);
  const startsIso = localInputToIso(f.startsAt);
  const endsIso = localInputToIso(f.endsAt);
  const errors: Record<string, string> = {};
  if (price === null) errors.price = wholeError(0, 1_000_000);
  if (f.worth.trim() && worth === null) errors.worth = wholeError(0, 10_000_000);
  if (f.perUserLimit.trim() && limit === null) errors.limit = wholeError(1, 1000);
  if (sort === null) errors.sort = wholeError(-100_000, 100_000);
  if (f.title.trim().length > 60) errors.title = 'Use up to 60 characters.';
  if (f.description.trim().length > 240) errors.description = 'Use up to 240 characters.';
  if (startsIso && endsIso && new Date(startsIso) >= new Date(endsIso)) errors.endsAt = 'The end has to come after the start.';
  if (!listing) {
    if (f.kind === 'item' && !f.item) errors.target = 'Choose the item to sell.';
    if (f.kind === 'pack' && !f.packId.trim()) errors.target = 'Choose the Lantern to sell.';
    if (f.kind === 'bundle') {
      if (f.bundle.length < 2 || f.bundle.length > 10) errors.target = 'A bundle has 2 to 10 items.';
      if (!f.title.trim()) errors.title = 'Bundles need a title; players see it in the shop.';
    }
  }
  const testOnly = f.kind === 'item' ? Boolean(f.item?.isTestOnly) : f.kind === 'bundle' ? f.bundle.some((b) => b.isTestOnly) : false;
  if (!listing && testOnly) errors.target = 'Test-only items cannot be sold in the shop.';
  const valid = Object.keys(errors).length === 0;

  const patch: Record<string, unknown> = {};
  if (listing && valid) {
    if (f.section !== listing.section) patch.section = f.section;
    if ((f.title.trim() || null) !== listing.title) patch.title = f.title.trim() || null;
    if ((f.description.trim() || null) !== listing.description) patch.description = f.description.trim() || null;
    if (f.priceCurrency !== listing.priceCurrency) patch.priceCurrency = f.priceCurrency;
    if (price !== listing.priceAmount) patch.priceAmount = price;
    if (worth !== listing.worth) patch.worth = worth;
    if (limit !== listing.perUserLimit) patch.perUserLimit = limit;
    if ((f.rotation || null) !== listing.rotation) patch.rotation = f.rotation || null;
    if (f.startsAt !== isoToLocalInput(listing.startsAt)) patch.startsAt = startsIso;
    if (f.endsAt !== isoToLocalInput(listing.endsAt)) patch.endsAt = endsIso;
    if (f.active !== listing.active) patch.active = f.active;
    if (sort !== listing.sort) patch.sort = sort;
  }
  const nothing = Boolean(listing) && Object.keys(patch).length === 0;
  const pickKind = (kind: ListingForm['kind']) =>
    setF((prev) => ({
      ...prev,
      kind,
      section: prev.sectionTouched ? prev.section : kind === 'pack' ? 'lanterns' : kind === 'bundle' ? 'bundles' : sectionFor(prev.item?.type),
      // Lanterns are usually unlimited; items and bundles usually once each. Keep anything typed by hand.
      perUserLimit: prev.perUserLimit === '' || prev.perUserLimit === '1' ? (kind === 'pack' ? '' : '1') : prev.perUserLimit,
    }));
  const pickPack = (id: string) => {
    const p = packs.data?.packs.find((x) => x.id === id);
    setF((prev) => ({ ...prev, packId: id, ...(p && !prev.priceAmount ? { priceAmount: String(p.priceAmount), priceCurrency: p.priceCurrency } : {}) }));
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={listing ? `Edit ${listingName(listing)}` : 'Create a listing'}
      description={listing ? <span className="font-mono">{listing.id}</span> : 'A listing sells one item, one Lantern or a bundle of 2 to 10 items.'}
      confirmLabel={listing ? 'Save listing' : 'Create listing'}
      disabled={!valid || nothing}
      onSubmit={async ({ reason }) => {
        const common = {
          section: f.section,
          title: f.title.trim() || null,
          description: f.description.trim() || null,
          priceCurrency: f.priceCurrency,
          priceAmount: price,
          worth,
          perUserLimit: limit,
          rotation: f.rotation || null,
          startsAt: startsIso,
          endsAt: endsIso,
          active: f.active,
          sort,
          reason,
        };
        if (listing) {
          await update.mutateAsync({ ...patch, reason });
        } else {
          const target = f.kind === 'item' ? { itemId: f.item!.id } : f.kind === 'pack' ? { packId: f.packId.trim() } : { bundle: f.bundle.map((b) => b.id) };
          await create.mutateAsync({ ...target, ...common });
        }
      }}
    >
      {listing ? (
        <TargetPreview listing={listing} />
      ) : (
        <>
          <Segmented
            label="What it sells"
            value={f.kind}
            onChange={pickKind}
            options={[
              { value: 'item', label: 'An item' },
              { value: 'pack', label: 'A Lantern' },
              { value: 'bundle', label: 'A bundle' },
            ]}
          />
          {f.kind === 'item' ? (
            <ItemPicker
              label="Item"
              value={f.item}
              onChange={(it) => setF((prev) => ({ ...prev, item: it, section: prev.sectionTouched || !it ? prev.section : sectionFor(it.type) }))}
              hint={f.item && f.item.releaseState && f.item.releaseState !== 'live' ? `This item is ${f.item.releaseState}, so players will not see the listing until it is live.` : 'Test-only items cannot be sold.'}
            />
          ) : f.kind === 'pack' ? (
            canCatalog ? (
              <Field label="Lantern" hint="The price starts at the Lantern's own price; change it for a discount.">
                {(p) => (
                  <Select {...p} value={f.packId} onChange={(e) => pickPack(e.target.value)}>
                    <option value="">Choose a Lantern</option>
                    {(packs.data?.packs ?? []).map((pk) => (
                      <option key={pk.id} value={pk.id}>
                        {pk.name}
                        {pk.releaseState !== 'live' ? ` (${pk.releaseState})` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="Lantern id" hint="For example lantern-meadow.">
                {(p) => <Input {...p} value={f.packId} onChange={(e) => set('packId', e.target.value)} autoComplete="off" spellCheck={false} />}
              </Field>
            )
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-semibold text-text">Bundle items ({f.bundle.length} of 2 to 10)</span>
              {f.bundle.length ? (
                <ul className="flex flex-col gap-1.5">
                  {f.bundle.map((b) => (
                    <li key={b.id} className="flex min-w-0 items-center gap-2 rounded-[12px] border border-line p-1.5 pr-2">
                      <ArtThumb art={b.art} rarity={b.rarity} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.name}</span>
                        <span className="block truncate font-mono text-xs text-text-3">{b.id}</span>
                      </span>
                      {b.isTestOnly ? <Badge tone="sky">Test only</Badge> : null}
                      <IconButton label={`Remove ${b.name}`} size="sm" onClick={() => set('bundle', f.bundle.filter((x) => x.id !== b.id))}>
                        <X className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              ) : null}
              {f.bundle.length < 10 ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <ItemPicker label="Add an item" value={adding} onChange={setAdding} exclude={f.bundle.map((b) => b.id)} />
                  </div>
                  <Button
                    className="sm:mt-7"
                    disabled={!adding}
                    onClick={() => {
                      if (!adding) return;
                      set('bundle', [...f.bundle, adding]);
                      setAdding(null);
                    }}
                  >
                    Add to bundle
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          {errors.target && (f.item || f.packId || f.bundle.length) ? <p className="text-sm font-semibold text-ember">{errors.target}</p> : null}
        </>
      )}

      <Field label="Section" hint={SHOP_SECTION_INFO[f.section]?.description}>
        {(p) => (
          <Select {...p} value={f.section} onChange={(e) => setF((prev) => ({ ...prev, section: e.target.value as ShopSection, sectionTouched: true }))}>
            {SHOP_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SHOP_SECTION_INFO[s].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CurrencySelect label="Price currency" value={f.priceCurrency} onChange={(v) => set('priceCurrency', v)} choices={choices} />
        <Field label="Price" error={f.priceAmount || listing ? errors.price : undefined}>
          {(p) => <Input {...p} inputMode="numeric" value={f.priceAmount} onChange={(e) => set('priceAmount', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Worth (optional)" error={errors.worth} hint="What it would cost bought separately. Players see the saving.">
          {(p) => <Input {...p} inputMode="numeric" value={f.worth} onChange={(e) => set('worth', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Limit per player (optional)" error={errors.limit} hint={f.rotation ? 'Counted per rotation. Empty means no limit.' : 'Counted over all time. Empty means no limit.'}>
          {(p) => <Input {...p} inputMode="numeric" value={f.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value)} autoComplete="off" />}
        </Field>
      </div>
      <Field label="Title (optional)" error={errors.title} hint={f.kind === 'bundle' ? 'Required for bundles.' : 'Leave empty to use the item or Lantern name.'}>
        {(p) => <Input {...p} value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={60} />}
      </Field>
      <Field label="Description (optional)" error={errors.description} hint="Leave empty to use the item or Lantern description.">
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={240} />}
      </Field>
      <Field label="Rotation" hint={f.rotation === 'daily' ? 'Shown only on days the daily picks choose it. Picks change at 00:00 UTC.' : f.rotation === 'weekly' ? 'Shown only in weeks the weekly picks choose it. Picks change on Mondays at 00:00 UTC.' : 'Listed every day, within its date window.'}>
        {(p) => (
          <Select {...p} value={f.rotation} onChange={(e) => set('rotation', e.target.value as ListingForm['rotation'])}>
            <option value="">No rotation</option>
            <option value="daily">Daily picks</option>
            <option value="weekly">Weekly picks</option>
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateTimeField label="Starts (optional)" value={f.startsAt} onChange={(v) => set('startsAt', v)} clearable hint="Empty means now." />
        <DateTimeField label="Ends (optional)" value={f.endsAt} onChange={(v) => set('endsAt', v)} clearable error={errors.endsAt} hint="Empty means no end." />
      </div>
      {listing?.section === 'event' ? <p className="text-xs text-text-3">Event listings follow their event: moving the event window on the Events page resets these dates.</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Order" error={errors.sort} hint="Lower numbers are listed first.">
          {(p) => <Input {...p} inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value)} />}
        </Field>
        <div className="min-w-0 self-end">
          <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} label="On sale" description={f.active ? 'Shows in the shop.' : 'Hidden from the shop.'} />
        </div>
      </div>
      {listing && 'priceAmount' in patch ? (
        <p className="rounded-[12px] border border-lantern/50 bg-lantern/10 px-3 py-2 text-sm text-text-2">
          Players will pay {formatNumber(price ?? 0)} instead of {formatNumber(listing.priceAmount)} from now on. Earlier purchases are not affected.
        </p>
      ) : null}
      <NoChangesNote show={nothing} />
    </ActionDialog>
  );
}
