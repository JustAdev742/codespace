import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import {
  ACCESSORY_SHAPES,
  BANNER_PATTERNS,
  EFFECT_STYLES,
  EMOTE_GLYPHS,
  FRAME_STYLES,
  GLIM_BODIES,
  GLIM_EYES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_TOPPERS,
  GLIM_BROWS,
  GLIM_EARS,
  GLIM_TAILS,
  GLIM_BACKS,
  GLIM_FACES,
  ITEM_TYPES,
  ITEM_TYPE_INFO,
  LANTERN_PATTERNS,
  RARITIES,
  RARITY_INFO,
  RELEASE_STATES,
  SHOP_SECTION_INFO,
  VICTORY_STYLES,
  dropTableSchema,
  itemArtSchema,
  type DropTable,
  type ItemArt,
  type ItemType,
  type LanternArt,
  type Rarity,
  type ShopSection,
} from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { Amount, Badge, EmptyState, ErrorNotice, Field, Input, RarityBadge, Select, Skeleton, Switch, TabPanel, Tabs, Textarea } from '../../ui/primitives.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, JsonField, Pager, StaffPage, StatusPill, dateTime, useDebounced, useStaffMutation, type Column } from './ui.tsx';
import {
  ArtThumb,
  CurrencySelect,
  DateTimeField,
  ItemPicker,
  NoChangesNote,
  RELEASE_INFO,
  isoToLocalInput,
  localInputToIso,
  parseWhole,
  percentText,
  useCurrencyChoices,
  useQueryParams,
  wholeError,
  type AdminItem,
  type ItemList,
  type PickedItem,
} from './Economy.tsx';

/*
 * The catalogue: every item, collection and Lantern. Art is procedural, so
 * staff edit the art spec as JSON and see it drawn as they type. Lantern
 * drop tables are checked by the server as you edit them, so the odds
 * players will see are on screen before anything is saved.
 */

export interface AdminCollection {
  id: string;
  name: string;
  description: string;
  hue: number;
  reward: { currency: string; amount: number; itemId?: string } | null;
  releaseState: string;
  sort: number;
  liveItems: number;
}

export interface OddsRow {
  rarity: Rarity;
  percent: number;
  items: number;
  perItemPercent: number;
}

export interface AdminPack {
  id: string;
  name: string;
  description: string;
  art: LanternArt;
  priceCurrency: string;
  priceAmount: number;
  dropTable: unknown;
  releaseState: string;
  availableFrom: string | null;
  availableUntil: string | null;
  sort: number;
  odds: OddsRow[] | null;
  poolSize: number;
  valid: boolean;
  listings: { id: string; section: string; price: { currency: string; amount: number }; active: boolean }[];
}

/** JSON with sorted keys, for "did this change" comparisons. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function useCollections() {
  return useQuery({ queryKey: ['admin', 'collections'], queryFn: () => api.get<{ collections: AdminCollection[] }>('/api/admin/collections'), staleTime: 30_000 });
}

export function usePacks(enabled = true) {
  return useQuery({ queryKey: ['admin', 'packs'], queryFn: () => api.get<{ packs: AdminPack[] }>('/api/admin/packs'), enabled });
}

function windowText(from: string | null, until: string | null): string {
  if (!from && !until) return 'Always on sale';
  if (from && until) return `${dateTime(from)} to ${dateTime(until)}`;
  return from ? `From ${dateTime(from)}` : `Until ${dateTime(until)}`;
}

const TABS = ['items', 'collections', 'lanterns'] as const;
type Tab = (typeof TABS)[number];

export default function Catalog() {
  const [params, patch] = useQueryParams();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'items';
  return (
    <StaffPage title="Catalogue" description="Every item, collection and Lantern. Live items are sold in the shop and drop from Lanterns, so changes to them reach players straight away.">
      <Tabs
        label="Catalogue sections"
        value={tab}
        onValueChange={(v) => patch({ tab: v === 'items' ? null : v }, { push: true })}
        items={[
          { value: 'items', label: 'Items' },
          { value: 'collections', label: 'Collections' },
          { value: 'lanterns', label: 'Lanterns' },
        ]}
      >
        <TabPanel value="items">
          <ItemsTab />
        </TabPanel>
        <TabPanel value="collections">
          <CollectionsTab />
        </TabPanel>
        <TabPanel value="lanterns">
          <LanternsTab />
        </TabPanel>
      </Tabs>
    </StaffPage>
  );
}

/* =================================== items =================================== */

const ART_TEMPLATES: Record<ItemType, ItemArt> = {
  glim: { kind: 'glim', body: 'blob', hue: 200, accentHue: 40, saturation: 70, eyes: 'happy', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true },
  accessory: { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 10 },
  frame: { kind: 'frame', style: 'ring', hue: 45 },
  banner: { kind: 'banner', pattern: 'waves', hue: 210, accentHue: 260 },
  title: { kind: 'title', text: 'New title' },
  emote: { kind: 'emote', glyph: 'wave', hue: 45 },
  victory: { kind: 'victory', style: 'confetti', hue: 45 },
  theme: { kind: 'theme', hue: 260, accentHue: 45 },
  effect: { kind: 'effect', style: 'sparkle', hue: 45 },
};

/** The values each art kind accepts, so nobody has to read the schema. */
const ART_FIELDS: Record<ItemType, [string, string][]> = {
  glim: [
    ['body', GLIM_BODIES.join(', ')],
    ['eyes', GLIM_EYES.join(', ')],
    ['mouth', GLIM_MOUTHS.join(', ')],
    ['pattern', GLIM_PATTERNS.join(', ')],
    ['topper', GLIM_TOPPERS.join(', ')],
    ['brows (optional)', GLIM_BROWS.join(', ')],
    ['ears (optional)', GLIM_EARS.join(', ')],
    ['tail (optional)', GLIM_TAILS.join(', ')],
    ['back (optional)', GLIM_BACKS.join(', ')],
    ['face (optional)', GLIM_FACES.join(', ')],
    ['hue, accentHue', '0 to 359'],
    ['saturation', '0 to 100'],
    ['cheeks', 'true or false'],
  ],
  accessory: [
    ['slot', 'hat, eyes, neck'],
    ['shape (hat)', ACCESSORY_SHAPES.hat.join(', ')],
    ['shape (eyes)', ACCESSORY_SHAPES.eyes.join(', ')],
    ['shape (neck)', ACCESSORY_SHAPES.neck.join(', ')],
    ['hue, accentHue (optional)', '0 to 359'],
  ],
  frame: [
    ['style', FRAME_STYLES.join(', ')],
    ['hue, accentHue (optional)', '0 to 359'],
  ],
  banner: [
    ['pattern', BANNER_PATTERNS.join(', ')],
    ['hue, accentHue', '0 to 359'],
  ],
  title: [['text', '1 to 32 characters']],
  emote: [
    ['glyph', EMOTE_GLYPHS.join(', ')],
    ['hue', '0 to 359'],
  ],
  victory: [
    ['style', VICTORY_STYLES.join(', ')],
    ['hue', '0 to 359'],
  ],
  theme: [['hue, accentHue', '0 to 359']],
  effect: [
    ['style', EFFECT_STYLES.join(', ')],
    ['hue', '0 to 359'],
  ],
};

function ItemsTab() {
  const [params, patch] = useQueryParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const rarity = params.get('rarity') ?? '';
  const state = params.get('state') ?? '';
  const collection = params.get('collection') ?? '';
  const offset = Number(params.get('offset') ?? 0) || 0;
  const [text, setText] = useState(q);
  const dq = useDebounced(text.trim(), 300);
  // Push the typed search into the URL once typing pauses; ignore URL changes made elsewhere.
  const lastDq = useRef(dq);
  useEffect(() => {
    if (lastDq.current === dq) return;
    lastDq.current = dq;
    if (dq !== q) patch({ q: dq, offset: null });
  }, [dq, q, patch]);
  const collections = useCollections();
  const list = useQuery({
    queryKey: ['admin', 'items', { q, type, rarity, state, collection, offset }],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (type) qs.set('type', type);
      if (rarity) qs.set('rarity', rarity);
      if (state) qs.set('state', state);
      if (collection) qs.set('collection', collection);
      if (offset) qs.set('offset', String(offset));
      return api.get<ItemList>(`/api/admin/items?${qs}`, signal);
    },
    placeholderData: (prev) => prev,
  });
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [creating, setCreating] = useState(false);
  const colName = (id: string | null) => (id ? (collections.data?.collections.find((c) => c.id === id)?.name ?? id) : null);
  const cols: Column<AdminItem>[] = [
    { key: 'art', header: 'Art', cell: (i) => <ArtThumb art={i.art} rarity={i.rarity} size={48} /> },
    {
      key: 'name',
      header: 'Item',
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-semibold">{i.name}</div>
          <div className="font-mono text-xs break-all text-text-3">{i.id}</div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (i) => ITEM_TYPE_INFO[i.type]?.label ?? i.type },
    { key: 'rarity', header: 'Rarity', cell: (i) => <RarityBadge rarity={i.rarity} /> },
    { key: 'collection', header: 'Collection', cell: (i) => colName(i.collectionId) ?? <span className="text-text-3">-</span> },
    {
      key: 'state',
      header: 'State',
      cell: (i) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill status={i.releaseState} />
          {i.isTestOnly ? <Badge tone="sky">Test only</Badge> : null}
        </span>
      ),
    },
    { key: 'owners', header: 'Owners', align: 'right', cell: (i) => formatNumber(i.owners) },
    {
      key: 'edit',
      header: 'Actions',
      align: 'right',
      cell: (i) => (
        <Button
          size="sm"
          aria-label={`Edit ${i.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(i);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];
  const anyFilter = Boolean(q || type || rarity || state || collection);
  const select = (label: string, value: string, key: string, options: [string, string][]) => (
    <Field label={label}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => patch({ [key]: e.target.value, offset: null })}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <Field label="Search">
            {(p) => (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                <Input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or id" className="pl-9" autoComplete="off" />
              </div>
            )}
          </Field>
          {select('Type', type, 'type', [['', 'Every type'], ...ITEM_TYPES.map((t): [string, string] => [t, ITEM_TYPE_INFO[t].plural])])}
          {select('Rarity', rarity, 'rarity', [['', 'Every rarity'], ...RARITIES.map((r): [string, string] => [r, RARITY_INFO[r].label])])}
          {select('Release state', state, 'state', [['', 'Every state'], ...RELEASE_STATES.map((s): [string, string] => [s, RELEASE_INFO[s]?.label ?? s])])}
          {select('Collection', collection, 'collection', [['', 'Every collection'], ...(collections.data?.collections ?? []).map((c): [string, string] => [c.id, c.name])])}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-2" aria-live="polite">
            {list.data ? `${plural(list.data.total, 'item')}${anyFilter ? ' match' : ' in the catalogue'}.` : ' '}
          </span>
          <div className="flex flex-wrap gap-2">
            {anyFilter ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText('');
                  patch({ q: null, type: null, rarity: null, state: null, collection: null, offset: null });
                }}
              >
                Clear filters
              </Button>
            ) : null}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Create item
            </Button>
          </div>
        </div>
      </Card>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        rowKey={(i) => i.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(i) => setEditing(i)}
        empty={anyFilter ? 'No items match these filters.' : 'The catalogue is empty.'}
        minWidth={780}
        caption="Catalogue items"
      />
      {list.data ? <Pager offset={list.data.offset} pageSize={list.data.pageSize} total={list.data.total} onChange={(o) => patch({ offset: o ? String(o) : null })} /> : null}
      <ItemDialog open={creating} onOpenChange={setCreating} collections={collections.data?.collections ?? []} />
      <ItemDialog key={editing?.id ?? 'none'} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} item={editing ?? undefined} collections={collections.data?.collections ?? []} />
    </div>
  );
}

interface ItemForm {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  collectionId: string;
  releaseState: string;
  isTestOnly: boolean;
  sort: string;
  art: string;
}

function itemForm(item?: AdminItem): ItemForm {
  return {
    id: item?.id ?? '',
    type: item?.type ?? 'glim',
    name: item?.name ?? '',
    description: item?.description ?? '',
    rarity: item?.rarity ?? 'common',
    collectionId: item?.collectionId ?? '',
    releaseState: item?.releaseState ?? 'draft',
    isTestOnly: item?.isTestOnly ?? false,
    sort: String(item?.sort ?? 0),
    art: JSON.stringify(item?.art ?? ART_TEMPLATES.glim, null, 2),
  };
}

/** Parse and check art JSON against the shared schema and the item's type. */
function checkArt(text: string, type: ItemType): { art: ItemArt | null; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { art: null, problems: [] };
  }
  const r = itemArtSchema.safeParse(raw);
  if (!r.success) return { art: null, problems: r.error.issues.slice(0, 6).map((i) => `${i.path.length ? i.path.join('.') : 'art'}: ${i.message}`) };
  if (r.data.kind !== type) return { art: null, problems: [`kind: must be "${type}" for a ${ITEM_TYPE_INFO[type].label.toLowerCase()}.`] };
  return { art: r.data, problems: [] };
}

function ItemDialog({ open, onOpenChange, item, collections }: { open: boolean; onOpenChange: (v: boolean) => void; item?: AdminItem; collections: AdminCollection[] }) {
  const [f, setF] = useState<ItemForm>(() => itemForm(item));
  useEffect(() => {
    if (open) setF(itemForm(item));
  }, [open, item]);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const create = useStaffMutation((body: Record<string, unknown>) => api.post('/api/admin/items', body), { silentError: true, success: (_r, b) => `Created ${String(b.name)}.`, invalidate: [['admin', 'items'], ['admin', 'collections'], ['admin', 'packs']] });
  const update = useStaffMutation((body: Record<string, unknown>) => api.patch(`/api/admin/items/${item?.id}`, body), { silentError: true, success: `Saved ${item?.name ?? 'the item'}.`, invalidate: [['admin', 'items'], ['admin', 'collections'], ['admin', 'packs']] });

  const { art, problems } = checkArt(f.art, f.type);
  const errors: Partial<Record<keyof ItemForm, string>> = {};
  if (!item && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(f.id)) errors.id = 'Use 3 to 64 lowercase letters, digits and dashes.';
  if (!f.name.trim() || f.name.trim().length > 48) errors.name = 'Use 1 to 48 characters.';
  if (!f.description.trim() || f.description.trim().length > 240) errors.description = 'Use 1 to 240 characters.';
  const sort = parseWhole(f.sort, -100_000, 100_000);
  if (sort === null) errors.sort = wholeError(-100_000, 100_000);
  const valid = Object.keys(errors).length === 0 && art !== null;

  const patch: Record<string, unknown> = {};
  if (item && valid) {
    if (f.name.trim() !== item.name) patch.name = f.name.trim();
    if (f.description.trim() !== item.description) patch.description = f.description.trim();
    if (f.rarity !== item.rarity) patch.rarity = f.rarity;
    const originalArt = itemArtSchema.safeParse(item.art);
    if (!originalArt.success || stable(art) !== stable(originalArt.data)) patch.art = art;
    if ((f.collectionId || null) !== item.collectionId) patch.collectionId = f.collectionId || null;
    if (f.releaseState !== item.releaseState) patch.releaseState = f.releaseState;
    if (f.isTestOnly !== item.isTestOnly) patch.isTestOnly = f.isTestOnly;
    if (sort !== item.sort) patch.sort = sort;
  }
  const nothing = Boolean(item) && Object.keys(patch).length === 0;
  const leavingLive = Boolean(item && item.releaseState === 'live' && f.releaseState !== 'live');
  const shown = (k: keyof ItemForm) => (errors[k] && (item ? true : f[k] !== '') ? errors[k] : undefined);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.name}` : 'Create an item'}
      description={item ? <span className="font-mono">{item.id}</span> : 'New items start as drafts, which players never see. Make an item live when it is ready.'}
      confirmLabel={item ? 'Save item' : 'Create item'}
      disabled={!valid || nothing}
      onSubmit={async ({ reason }) => {
        if (item) {
          await update.mutateAsync({ ...patch, reason });
        } else {
          await create.mutateAsync({ id: f.id, type: f.type, name: f.name.trim(), description: f.description.trim(), rarity: f.rarity, art, collectionId: f.collectionId || null, releaseState: f.releaseState, isTestOnly: f.isTestOnly, sort, reason });
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-4 rounded-[var(--radius-l)] border border-line bg-sunken p-3">
        <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-m)] bg-surface-2" aria-label="Preview" role="img">
          {art ? (
            <span className="grid w-full place-items-center px-1" style={{ height: f.type === 'banner' ? 60 : undefined }}>
              <ItemArtView art={art} rarity={f.rarity} size={104} />
            </span>
          ) : (
            <span className="px-2 text-center text-xs text-text-3">Fix the art to see it</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-xl leading-tight font-bold text-text">{f.name.trim() || 'Unnamed item'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RarityBadge rarity={f.rarity} />
            <span className="text-xs text-text-3">{ITEM_TYPE_INFO[f.type].label}</span>
            <StatusPill status={f.releaseState} />
            {f.isTestOnly ? <Badge tone="sky">Test only</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-text-2">{f.description.trim() || 'No description yet.'}</p>
        </div>
      </div>

      {!item ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Id" error={shown('id')} hint="Permanent. For example glim-snowdrop.">
            {(p) => <Input {...p} value={f.id} onChange={(e) => set('id', e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} maxLength={64} />}
          </Field>
          <Field label="Type" hint="Changing it swaps in starter art for that type.">
            {(p) => (
              <Select
                {...p}
                value={f.type}
                onChange={(e) => {
                  const t = e.target.value as ItemType;
                  setF((prev) => ({ ...prev, type: t, art: checkArt(prev.art, t).art ? prev.art : JSON.stringify(ART_TEMPLATES[t], null, 2) }));
                }}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ITEM_TYPE_INFO[t].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ) : null}
      <Field label="Name" error={shown('name')}>
        {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={48} />}
      </Field>
      <Field label="Description" error={shown('description')} hint="Shown to players in the shop and their collection.">
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={240} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Rarity" hint={`Recycles for ${RARITY_INFO[f.rarity].dustValue} Glow Dust, crafts for ${formatNumber(RARITY_INFO[f.rarity].craftCost)}.`}>
          {(p) => (
            <Select {...p} value={f.rarity} onChange={(e) => set('rarity', e.target.value as Rarity)}>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {RARITY_INFO[r].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Release state" hint={RELEASE_INFO[f.releaseState]?.description}>
          {(p) => (
            <Select {...p} value={f.releaseState} onChange={(e) => set('releaseState', e.target.value)}>
              {RELEASE_STATES.map((s) => (
                <option key={s} value={s}>
                  {RELEASE_INFO[s]?.label ?? s}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Collection" hint={f.type === 'glim' ? 'Glims in a collection drop from its Lantern once live.' : 'Usually only Glims belong to a collection.'}>
          {(p) => (
            <Select {...p} value={f.collectionId} onChange={(e) => set('collectionId', e.target.value)}>
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Order" error={errors.sort} hint="Lower numbers are listed first.">
          {(p) => <Input {...p} inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value)} />}
        </Field>
      </div>
      {leavingLive ? <p className="rounded-[var(--radius-m)] border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-text-2">It stops being sold and stops dropping from Lanterns. Players who own it keep it.</p> : null}
      <Switch checked={f.isTestOnly} onCheckedChange={(v) => set('isTestOnly', v)} label="Test only" description="Never drops, cannot be sold, and can only be given to test accounts." />
      <div className="flex flex-col gap-2">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_104px]">
          <div className="min-w-0">
            <JsonField label="Art" value={f.art} onChange={(v) => set('art', v)} rows={9} hint={`The ${ITEM_TYPE_INFO[f.type].label.toLowerCase()} art spec. The preview redraws as you type.`} />
          </div>
          <div className="order-first flex items-center gap-3 sm:order-none sm:flex-col sm:items-stretch sm:pt-7">
            <div className="grid size-[104px] shrink-0 place-items-center overflow-hidden rounded-[var(--radius-m)] border border-line bg-sunken" role="img" aria-label={art ? 'Art preview' : 'No preview: the art has a problem'}>
              {art ? (
                <span className="grid w-full place-items-center px-1" style={{ height: f.type === 'banner' ? 56 : undefined }}>
                  <ItemArtView art={art} rarity={f.rarity} size={92} />
                </span>
              ) : (
                <span className="px-2 text-center text-xs text-text-3">No preview</span>
              )}
            </div>
            <span className="text-xs text-text-3 sm:text-center">Live preview</span>
          </div>
        </div>
        {problems.length ? (
          <ul className="flex flex-col gap-0.5 text-xs font-semibold text-ember" aria-live="polite">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <details className="rounded-[var(--radius-m)] border border-line px-3 py-2 text-xs text-text-2">
          <summary className="cursor-pointer font-semibold text-text">Allowed values for a {ITEM_TYPE_INFO[f.type].label.toLowerCase()}</summary>
          <dl className="mt-2 flex flex-col gap-1.5">
            <div>
              <dt className="inline font-mono text-text">kind</dt> <dd className="inline">"{f.type}"</dd>
            </div>
            {ART_FIELDS[f.type].map(([k, v]) => (
              <div key={k}>
                <dt className="inline font-mono text-text">{k}</dt> <dd className="inline">{v}</dd>
              </div>
            ))}
          </dl>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => set('art', JSON.stringify(ART_TEMPLATES[f.type], null, 2))}>
            Use starter art
          </Button>
        </details>
      </div>
      <NoChangesNote show={nothing} />
    </ActionDialog>
  );
}

/* ================================ collections ================================ */

function CollectionsTab() {
  const q = useCollections();
  const [, patch] = useQueryParams();
  const [editing, setEditing] = useState<AdminCollection | null>(null);
  const cols: Column<AdminCollection>[] = [
    {
      key: 'name',
      header: 'Collection',
      cell: (c) => (
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]" style={{ background: `hsl(${c.hue} 70% 58%)` }} aria-hidden />
          <div className="min-w-0">
            <div className="font-semibold">{c.name}</div>
            <div className="font-mono text-xs text-text-3">{c.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'description', header: 'Description', className: 'min-w-[180px] max-w-[260px]', cell: (c) => <span className="text-text-2">{c.description}</span> },
    { key: 'live', header: 'Live Glims', align: 'right', cell: (c) => formatNumber(c.liveItems) },
    { key: 'reward', header: 'Completion reward', cell: (c) => (c.reward ? <Amount currency={c.reward.currency} value={c.reward.amount} size="sm" /> : <span className="text-text-3">None</span>) },
    { key: 'state', header: 'State', cell: (c) => <StatusPill status={c.releaseState} /> },
    { key: 'sort', header: 'Order', align: 'right', cell: (c) => c.sort },
    {
      key: 'edit',
      header: 'Actions',
      align: 'right',
      cell: (c) => (
        <span className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" aria-label={`View items in ${c.name}`} onClick={() => patch({ tab: null, collection: c.id, q: null, type: null, rarity: null, state: null, offset: null }, { push: true })}>
            View items
          </Button>
          <Button size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
            Edit
          </Button>
        </span>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] text-sm text-text-2">Collecting every live Glim in a live collection pays its completion reward once. View items lists a collection's Glims in the Items tab.</p>
      <DataTable columns={cols} rows={q.data?.collections} rowKey={(c) => c.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty="No collections yet." minWidth={780} caption="Collections" />
      <CollectionDialog key={editing?.id ?? 'none'} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} collection={editing} />
    </div>
  );
}

function collectionForm(collection: AdminCollection | null) {
  return {
    name: collection?.name ?? '',
    description: collection?.description ?? '',
    hue: String(collection?.hue ?? 0),
    hasReward: Boolean(collection?.reward),
    rewardCurrency: collection?.reward?.currency ?? 'moonstones',
    rewardAmount: String(collection?.reward?.amount ?? 25),
    releaseState: collection?.releaseState ?? 'live',
    sort: String(collection?.sort ?? 0),
  };
}

function CollectionDialog({ open, onOpenChange, collection }: { open: boolean; onOpenChange: (v: boolean) => void; collection: AdminCollection | null }) {
  const { choices } = useCurrencyChoices();
  const [f, setF] = useState(() => collectionForm(collection));
  useEffect(() => {
    if (open) setF(collectionForm(collection));
  }, [open, collection]);
  const save = useStaffMutation((body: Record<string, unknown>) => api.patch(`/api/admin/collections/${collection?.id}`, body), { silentError: true, success: `Saved ${collection?.name ?? 'the collection'}.`, invalidate: [['admin', 'collections'], ['admin', 'packs']] });
  if (!collection) return null;
  const hue = parseWhole(f.hue, 0, 359);
  const sort = parseWhole(f.sort, -1000, 1000);
  const amount = parseWhole(f.rewardAmount, 1, 100_000);
  const errors: Record<string, string> = {};
  if (!f.name.trim() || f.name.trim().length > 48) errors.name = 'Use 1 to 48 characters.';
  if (!f.description.trim() || f.description.trim().length > 240) errors.description = 'Use 1 to 240 characters.';
  if (hue === null) errors.hue = wholeError(0, 359);
  if (sort === null) errors.sort = wholeError(-1000, 1000);
  if (f.hasReward && amount === null) errors.amount = wholeError(1, 100_000);
  const valid = !Object.keys(errors).length;
  const reward = f.hasReward && amount !== null ? { currency: f.rewardCurrency, amount } : null;
  const patch: Record<string, unknown> = {};
  if (valid) {
    if (f.name.trim() !== collection.name) patch.name = f.name.trim();
    if (f.description.trim() !== collection.description) patch.description = f.description.trim();
    if (hue !== collection.hue) patch.hue = hue;
    if (stable(reward) !== stable(collection.reward ? { currency: collection.reward.currency, amount: collection.reward.amount } : null)) patch.reward = reward;
    if (f.releaseState !== collection.releaseState) patch.releaseState = f.releaseState;
    if (sort !== collection.sort) patch.sort = sort;
  }
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${collection.name}`}
      description={<span className="font-mono">{collection.id}</span>}
      confirmLabel="Save collection"
      disabled={!valid || !Object.keys(patch).length}
      onSubmit={async ({ reason }) => {
        await save.mutateAsync({ ...patch, reason });
      }}
    >
      <Field label="Name" error={errors.name}>
        {(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={48} />}
      </Field>
      <Field label="Description" error={errors.description}>
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={240} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Hue" error={errors.hue} hint="0 to 359 on the colour wheel.">
          {(p) => (
            <div className="flex items-center gap-2">
              <Input {...p} inputMode="numeric" value={f.hue} onChange={(e) => setF({ ...f, hue: e.target.value })} className="min-w-0 flex-1" />
              <span className="size-9 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]" style={{ background: `hsl(${hue ?? 0} 70% 58%)` }} aria-hidden />
            </div>
          )}
        </Field>
        <Field label="Order" error={errors.sort} hint="Lower numbers are listed first.">
          {(p) => <Input {...p} inputMode="numeric" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />}
        </Field>
      </div>
      <Field label="Release state" hint={collection.releaseState === 'live' && f.releaseState !== 'live' ? 'Players stop seeing this collection in their collection book.' : 'Live collections show in every player\'s collection book.'}>
        {(p) => (
          <Select {...p} value={f.releaseState} onChange={(e) => setF({ ...f, releaseState: e.target.value })}>
            {RELEASE_STATES.map((s) => (
              <option key={s} value={s}>
                {RELEASE_INFO[s]?.label ?? s}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Switch checked={f.hasReward} onCheckedChange={(v) => setF({ ...f, hasReward: v })} label="Completion reward" description="Paid once to each player who owns every live Glim in it." />
      {f.hasReward ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrencySelect value={f.rewardCurrency} onChange={(v) => setF({ ...f, rewardCurrency: v })} choices={choices} label="Reward currency" />
          <Field label="Reward amount" error={errors.amount}>
            {(p) => <Input {...p} inputMode="numeric" value={f.rewardAmount} onChange={(e) => setF({ ...f, rewardAmount: e.target.value })} />}
          </Field>
        </div>
      ) : null}
      <NoChangesNote show={valid && !Object.keys(patch).length} />
    </ActionDialog>
  );
}

/* ================================== Lanterns ================================= */

export function OddsTable({ odds, before, caption }: { odds: OddsRow[]; before?: OddsRow[] | null; caption: string }) {
  const rarities = RARITIES.filter((r) => odds.some((o) => o.rarity === r) || before?.some((o) => o.rarity === r));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-text-3">
          <tr>
            <th scope="col" className="py-1 font-semibold">
              Rarity
            </th>
            {before ? (
              <th scope="col" className="py-1 text-right font-semibold">
                Now
              </th>
            ) : null}
            <th scope="col" className="py-1 text-right font-semibold">
              {before ? 'After saving' : 'Chance'}
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Glims
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Each Glim
            </th>
          </tr>
        </thead>
        <tbody>
          {rarities.map((r) => {
            const o = odds.find((x) => x.rarity === r);
            const b = before?.find((x) => x.rarity === r);
            const changed = before && Math.abs((o?.percent ?? 0) - (b?.percent ?? 0)) > 0.005;
            return (
              <tr key={r} className="border-t border-line">
                <td className="py-1.5">
                  <RarityBadge rarity={r} />
                </td>
                {before ? <td className="py-1.5 text-right text-text-3 tabular">{percentText(b?.percent ?? 0)}</td> : null}
                <td className={`py-1.5 text-right tabular ${changed ? 'font-bold text-lantern' : 'font-semibold'}`}>{percentText(o?.percent ?? 0)}</td>
                <td className="py-1.5 text-right tabular">{o?.items ?? 0}</td>
                <td className="py-1.5 text-right text-text-2 tabular">{percentText(o?.perItemPercent ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function pityOf(table: unknown): number {
  const r = dropTableSchema.safeParse(table);
  return r.success ? r.data.pityEvery : 0;
}

function LanternsTab() {
  const q = usePacks();
  const [editing, setEditing] = useState<AdminPack | null>(null);
  const [creating, setCreating] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-text-2">Players see exactly these odds on every Lantern. Rarities with no live Glims are skipped and the rest rescaled to 100%.</p>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Create Lantern
        </Button>
      </div>
      {last ? (
        <div role="status" className="flex items-start justify-between gap-3 rounded-[var(--radius-m)] border border-glim/50 bg-glim/10 px-4 py-3 text-sm text-text">
          <span>{last}</span>
          <IconButton label="Dismiss" size="sm" onClick={() => setLast(null)}>
            <X className="size-4" />
          </IconButton>
        </div>
      ) : null}
      {q.isError ? (
        <ErrorNotice message="The Lanterns did not load." onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : !q.data.packs.length ? (
        <EmptyState title="No Lanterns yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Create Lantern</Button>}>
          Lanterns hold one random Glim each. Create one and give it a drop table.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {q.data.packs.map((p) => (
            <LanternCard key={p.id} pack={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      <LanternDialog open={creating} onOpenChange={setCreating} onSaved={setLast} />
      <LanternDialog key={editing?.id ?? 'none'} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} pack={editing ?? undefined} onSaved={setLast} />
    </div>
  );
}

function LanternCard({ pack, onEdit }: { pack: AdminPack; onEdit: () => void }) {
  const pity = pityOf(pack.dropTable);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-20 shrink-0 place-items-center rounded-[var(--radius-m)] bg-sunken">
          <Lantern art={pack.art} size={60} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl leading-tight font-bold text-text">{pack.name}</h3>
            <StatusPill status={pack.releaseState} />
          </div>
          <div className="font-mono text-xs break-all text-text-3">{pack.id}</div>
          <p className="mt-1 text-sm text-text-2">{pack.description}</p>
        </div>
        <Button size="sm" onClick={onEdit} aria-label={`Edit ${pack.name}`}>
          Edit
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-3">Price</dt>
          <dd>
            <Amount currency={pack.priceCurrency} value={pack.priceAmount} size="sm" />
          </dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-3">On sale</dt>
          <dd className="text-right sm:text-left">{windowText(pack.availableFrom, pack.availableUntil)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-3">Pool</dt>
          <dd>{plural(pack.poolSize, 'Glim')} can drop</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-3">Guarantee</dt>
          <dd className="text-right sm:text-left">{pity ? `Epic or better within ${pity}` : 'None'}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:col-span-2 sm:block">
          <dt className="text-text-3">Shop listings</dt>
          <dd className="text-right sm:text-left">
            {pack.listings.length
              ? pack.listings.map((l) => (
                  <span key={l.id} className="mr-2 inline-flex items-center gap-1">
                    {SHOP_SECTION_INFO[l.section as ShopSection]?.label ?? l.section}
                    {l.price.amount !== pack.priceAmount || l.price.currency !== pack.priceCurrency ? (
                      <span className="text-text-3">
                        (<Amount currency={l.price.currency} value={l.price.amount} size="sm" />)
                      </span>
                    ) : null}
                    {!l.active ? <Badge>off</Badge> : null}
                  </span>
                ))
              : 'Not listed'}
          </dd>
        </div>
      </dl>
      {!pack.valid ? (
        <ErrorNotice title="Drop table not valid" message="Nobody can open this Lantern until its drop table is fixed. Edit it to see what is wrong." />
      ) : pack.odds && pack.odds.length ? (
        <OddsTable odds={pack.odds} caption={`Odds for ${pack.name}`} />
      ) : (
        <ErrorNotice title="Nothing can drop" message="No live Glims match this drop table, so it cannot be opened." />
      )}
    </Card>
  );
}

interface LanternForm {
  id: string;
  name: string;
  description: string;
  hue: string;
  accentHue: string;
  pattern: string;
  priceCurrency: string;
  priceAmount: string;
  releaseState: string;
  availableFrom: string;
  availableUntil: string;
  sort: string;
  addListing: boolean;
  weights: Record<Rarity, string>;
  collectionIds: string[];
  itemIds: string[];
  minRarity: string;
  pityEvery: string;
}

const DEFAULT_WEIGHTS: Partial<Record<Rarity, number>> = { common: 5000, uncommon: 2800, rare: 1400, epic: 600, legendary: 170, mythic: 30 };

function lanternForm(pack?: AdminPack): LanternForm {
  const parsed = pack ? dropTableSchema.safeParse(pack.dropTable) : null;
  const t: Partial<DropTable> = parsed?.success ? parsed.data : ((pack?.dropTable as Partial<DropTable> | undefined) ?? {});
  const weights = (pack ? (t.weights ?? {}) : DEFAULT_WEIGHTS) as Partial<Record<Rarity, number>>;
  return {
    id: pack?.id ?? '',
    name: pack?.name ?? '',
    description: pack?.description ?? '',
    hue: String(pack?.art.hue ?? 40),
    accentHue: String(pack?.art.accentHue ?? 80),
    pattern: pack?.art.pattern ?? 'plain',
    priceCurrency: pack?.priceCurrency ?? 'sparks',
    priceAmount: String(pack?.priceAmount ?? 150),
    releaseState: pack?.releaseState ?? 'draft',
    availableFrom: isoToLocalInput(pack?.availableFrom),
    availableUntil: isoToLocalInput(pack?.availableUntil),
    sort: String(pack?.sort ?? 0),
    addListing: true,
    weights: Object.fromEntries(RARITIES.map((r) => [r, weights[r] === undefined ? '' : String(weights[r])])) as Record<Rarity, string>,
    collectionIds: [...(t.collectionIds ?? [])],
    itemIds: [...(t.itemIds ?? [])],
    minRarity: t.minRarity ?? '',
    pityEvery: String(t.pityEvery ?? (pack ? 0 : 15)),
  };
}

function buildTable(f: LanternForm): { table: DropTable | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const weights: Partial<Record<Rarity, number>> = {};
  for (const r of RARITIES) {
    const text = f.weights[r].trim();
    if (!text) continue;
    const n = parseWhole(text, 0, 1_000_000);
    if (n === null) errors[`w.${r}`] = wholeError(0, 1_000_000);
    else weights[r] = n;
  }
  const pity = parseWhole(f.pityEvery, 0, 200);
  if (pity === null) errors.pity = wholeError(0, 200);
  const candidate = { weights, itemIds: f.itemIds, collectionIds: f.collectionIds, ...(f.minRarity ? { minRarity: f.minRarity } : {}), pityEvery: pity ?? 0 };
  const r = dropTableSchema.safeParse(candidate);
  if (!r.success) errors.table = r.error.issues[0]?.message ?? 'This drop table is not valid.';
  return { table: Object.keys(errors).length || !r.success ? null : r.data, errors };
}

interface Preview {
  odds: OddsRow[];
  pool: { id: string; name: string; rarity: Rarity }[];
}

function LanternDialog({ open, onOpenChange, pack, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; pack?: AdminPack; onSaved: (msg: string) => void }) {
  const { choices } = useCurrencyChoices();
  const collections = useCollections();
  const canShop = useCan('shop.manage');
  const [f, setF] = useState<LanternForm>(() => lanternForm(pack));
  const [adding, setAdding] = useState<PickedItem | null>(null);
  useEffect(() => {
    if (open) {
      setF(lanternForm(pack));
      setAdding(null);
    }
  }, [open, pack]);
  const set = <K extends keyof LanternForm>(k: K, v: LanternForm[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const { table, errors: tableErrors } = buildTable(f);
  const tableKey = table ? stable(table) : '';
  const debouncedKey = useDebounced(tableKey, 400);
  const preview = useQuery({
    queryKey: ['admin', 'packs', 'preview', debouncedKey],
    queryFn: () => api.post<Preview>('/api/admin/packs/preview', { dropTable: JSON.parse(debouncedKey) as unknown }),
    enabled: open && Boolean(debouncedKey),
    retry: false,
    staleTime: 30_000,
  });
  const settling = tableKey !== debouncedKey;

  const hue = parseWhole(f.hue, 0, 359);
  const accentHue = parseWhole(f.accentHue, 0, 359);
  const price = parseWhole(f.priceAmount, 0, 1_000_000);
  const sort = parseWhole(f.sort, -1000, 1000);
  const errors: Record<string, string> = { ...tableErrors };
  if (!pack && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(f.id)) errors.id = 'Use 3 to 64 lowercase letters, digits and dashes.';
  if (!f.name.trim() || f.name.trim().length > 48) errors.name = 'Use 1 to 48 characters.';
  if (!f.description.trim() || f.description.trim().length > 240) errors.description = 'Use 1 to 240 characters.';
  if (hue === null) errors.hue = wholeError(0, 359);
  if (accentHue === null) errors.accentHue = wholeError(0, 359);
  if (price === null) errors.price = wholeError(0, 1_000_000);
  if (sort === null) errors.sort = wholeError(-1000, 1000);
  const fromIso = localInputToIso(f.availableFrom);
  const untilIso = localInputToIso(f.availableUntil);
  if (fromIso && untilIso && new Date(fromIso) >= new Date(untilIso)) errors.until = 'The end has to come after the start.';
  const art: LanternArt | null = hue !== null && accentHue !== null ? { hue, accentHue, pattern: f.pattern as LanternArt['pattern'] } : null;
  const previewOk = Boolean(preview.data) && !preview.isError && !settling;
  const valid = Object.keys(errors).length === 0 && art !== null;

  const patch: Record<string, unknown> = {};
  if (pack && valid && table) {
    if (f.name.trim() !== pack.name) patch.name = f.name.trim();
    if (f.description.trim() !== pack.description) patch.description = f.description.trim();
    if (stable(art) !== stable(pack.art)) patch.art = art;
    if (f.priceCurrency !== pack.priceCurrency) patch.priceCurrency = f.priceCurrency;
    if (price !== pack.priceAmount) patch.priceAmount = price;
    const original = dropTableSchema.safeParse(pack.dropTable);
    if (!original.success || stable(table) !== stable(original.data)) patch.dropTable = table;
    if (f.releaseState !== pack.releaseState) patch.releaseState = f.releaseState;
    if (f.availableFrom !== isoToLocalInput(pack.availableFrom)) patch.availableFrom = fromIso;
    if (f.availableUntil !== isoToLocalInput(pack.availableUntil)) patch.availableUntil = untilIso;
    if (sort !== pack.sort) patch.sort = sort;
  }
  const nothing = Boolean(pack) && Object.keys(patch).length === 0;
  const priceChanging = Boolean(pack) && ('priceAmount' in patch || 'priceCurrency' in patch);
  const needsPreview = !pack || 'dropTable' in patch;
  const curName = (code: string) => choices.find((c) => c.code === code)?.name ?? code;

  const create = useStaffMutation((body: Record<string, unknown>) => api.post<{ ok: true; pack: { name: string } }>('/api/admin/packs', body), {
    silentError: true,
    invalidate: [['admin', 'packs'], ['admin', 'shop'], ['admin', 'economy']],
    success: (res, body) => `Created ${res.pack.name}.${body.addListing ? ' It is listed in the Lanterns section of the shop.' : ''}`,
    onSuccess: (res, body) => onSaved(`Created ${res.pack.name}.${body.addListing ? ' A listing was added to the Lanterns section of the shop at the same price.' : ' It has no shop listing yet.'}`),
  });
  const update = useStaffMutation((body: Record<string, unknown>) => api.patch<{ ok: true; pack: { name: string; priceAmount: number; priceCurrency: string }; listingsRepriced: number }>(`/api/admin/packs/${pack?.id}`, body), {
    silentError: true,
    invalidate: [['admin', 'packs'], ['admin', 'shop'], ['admin', 'economy']],
    success: (res, body) => ('priceAmount' in body || 'priceCurrency' in body ? `Saved ${res.pack.name}. ${res.listingsRepriced === 1 ? '1 shop listing was' : `${res.listingsRepriced} shop listings were`} repriced.` : `Saved ${res.pack.name}.`),
    onSuccess: (res, body) => {
      const priced = 'priceAmount' in body || 'priceCurrency' in body;
      onSaved(
        priced
          ? `Saved ${res.pack.name}. ${res.listingsRepriced === 1 ? '1 shop listing now costs' : `${res.listingsRepriced} shop listings now cost`} ${formatNumber(res.pack.priceAmount)} ${curName(res.pack.priceCurrency)}${res.listingsRepriced === 0 ? ' (none were at the old price)' : ''}. Listings at a deliberate discount were left alone.`
          : `Saved ${res.pack.name}. The price did not change, so no shop listings were repriced.`,
      );
    },
  });

  const allCollections = f.collectionIds.includes('*');
  const toggleCollection = (id: string, on: boolean) => set('collectionIds', on ? [...f.collectionIds.filter((c) => c !== '*'), id] : f.collectionIds.filter((c) => c !== id));

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={pack ? `Edit ${pack.name}` : 'Create a Lantern'}
      description={pack ? <span className="font-mono">{pack.id}</span> : 'A Lantern holds one random Glim. New Lanterns start as drafts.'}
      confirmLabel={pack ? (priceChanging ? 'Save Lantern and reprice listings' : 'Save Lantern') : 'Create Lantern'}
      disabled={!valid || nothing || (needsPreview && !previewOk)}
      onSubmit={async ({ reason }) => {
        if (pack) {
          await update.mutateAsync({ ...patch, reason });
        } else {
          await create.mutateAsync({
            id: f.id,
            name: f.name.trim(),
            description: f.description.trim(),
            art,
            priceCurrency: f.priceCurrency,
            priceAmount: price,
            dropTable: table,
            releaseState: f.releaseState,
            availableFrom: fromIso,
            availableUntil: untilIso,
            sort,
            addListing: f.addListing,
            reason,
          });
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-4 rounded-[var(--radius-l)] border border-line bg-sunken p-3">
        <div className="grid size-24 shrink-0 place-items-center" role="img" aria-label="Lantern preview">
          {art ? <Lantern art={art} size={76} lit /> : <span className="text-center text-xs text-text-3">Fix the colours to see it</span>}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-xl leading-tight font-bold text-text">{f.name.trim() || 'Unnamed Lantern'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {price !== null ? <Amount currency={f.priceCurrency} value={price} size="sm" /> : null}
            <StatusPill status={f.releaseState} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-text-2">{f.description.trim() || 'No description yet.'}</p>
        </div>
      </div>

      {!pack ? (
        <Field label="Id" error={f.id ? errors.id : undefined} hint="Permanent. For example lantern-spring.">
          {(p) => <Input {...p} value={f.id} onChange={(e) => set('id', e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} maxLength={64} />}
        </Field>
      ) : null}
      <Field label="Name" error={pack || f.name ? errors.name : undefined}>
        {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={48} />}
      </Field>
      <Field label="Description" error={pack || f.description ? errors.description : undefined}>
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={240} />}
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Paper hue" error={errors.hue}>
          {(p) => <Input {...p} inputMode="numeric" value={f.hue} onChange={(e) => set('hue', e.target.value)} />}
        </Field>
        <Field label="Pattern hue" error={errors.accentHue}>
          {(p) => <Input {...p} inputMode="numeric" value={f.accentHue} onChange={(e) => set('accentHue', e.target.value)} />}
        </Field>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <Field label="Pattern">
            {(p) => (
              <Select {...p} value={f.pattern} onChange={(e) => set('pattern', e.target.value)}>
                {LANTERN_PATTERNS.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-3">Hues run from 0 to 359 around the colour wheel.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CurrencySelect label="Price currency" value={f.priceCurrency} onChange={(v) => set('priceCurrency', v)} choices={choices} />
        <Field label="Price" error={errors.price}>
          {(p) => <Input {...p} inputMode="numeric" value={f.priceAmount} onChange={(e) => set('priceAmount', e.target.value)} />}
        </Field>
      </div>
      {priceChanging ? <p className="rounded-[var(--radius-m)] border border-lantern/50 bg-lantern/10 px-3 py-2 text-sm text-text-2">Shop listings that sell this Lantern at its current price will move to the new price. Listings at a deliberate discount stay as they are.</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Release state" hint={RELEASE_INFO[f.releaseState]?.description}>
          {(p) => (
            <Select {...p} value={f.releaseState} onChange={(e) => set('releaseState', e.target.value)}>
              {RELEASE_STATES.map((s) => (
                <option key={s} value={s}>
                  {RELEASE_INFO[s]?.label ?? s}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Order" error={errors.sort} hint="Lower numbers are listed first.">
          {(p) => <Input {...p} inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value)} />}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateTimeField label="On sale from" value={f.availableFrom} onChange={(v) => set('availableFrom', v)} clearable hint="Empty means straight away." />
        <DateTimeField label="On sale until" value={f.availableUntil} onChange={(v) => set('availableUntil', v)} clearable error={errors.until} hint="Empty means no end." />
      </div>
      {!pack ? <Switch checked={f.addListing} onCheckedChange={(v) => set('addListing', v)} label="List it in the shop" description="Adds a listing to the Lanterns section at the same price." /> : null}

      <fieldset className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-l)] border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-text">Drop table</legend>
        <div>
          <p className="mb-2 text-xs text-text-3">Relative weights per rarity. Leave a rarity empty or at 0 to leave it out. Only rarities that have live Glims in the pool count.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {RARITIES.map((r) => (
              <Field key={r} label={RARITY_INFO[r].label} error={errors[`w.${r}`]}>
                {(p) => <Input {...p} inputMode="numeric" value={f.weights[r]} placeholder="0" onChange={(e) => set('weights', { ...f.weights, [r]: e.target.value })} />}
              </Field>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-text">Collections it draws from</span>
          <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--lantern)]" checked={allCollections} onChange={(e) => set('collectionIds', e.target.checked ? ['*'] : [])} />
            Every collection, including future ones
          </label>
          {collections.isError ? (
            <ErrorNotice message="The collections did not load." onRetry={() => void collections.refetch()} />
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {(collections.data?.collections ?? []).map((c) => (
                <label key={c.id} className={`flex cursor-pointer items-center gap-2 text-sm ${allCollections ? 'opacity-50' : ''}`}>
                  <input type="checkbox" className="size-4 accent-[var(--lantern)]" disabled={allCollections} checked={allCollections || f.collectionIds.includes(c.id)} onChange={(e) => toggleCollection(c.id, e.target.checked)} />
                  <span className="size-3 shrink-0 rounded-full" style={{ background: `hsl(${c.hue} 70% 58%)` }} aria-hidden />
                  {c.name}
                  {c.releaseState !== 'live' ? <StatusPill status={c.releaseState} /> : null}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lowest rarity from collections" hint="Glims listed by id below always count.">
            {(p) => (
              <Select {...p} value={f.minRarity} onChange={(e) => set('minRarity', e.target.value)}>
                <option value="">Any rarity</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_INFO[r].label} or better
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Guarantee every" error={errors.pity} hint="Opening this many without an epic or better guarantees one. 0 switches it off.">
            {(p) => <Input {...p} inputMode="numeric" value={f.pityEvery} onChange={(e) => set('pityEvery', e.target.value)} />}
          </Field>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-semibold text-text">Extra Glims by id</span>
          {f.itemIds.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {f.itemIds.map((id) => (
                <li key={id} className="flex items-center gap-1 rounded-full border border-line-strong py-0.5 pr-1 pl-2.5 font-mono text-xs">
                  {id}
                  <IconButton label={`Remove ${id}`} size="sm" className="size-6" onClick={() => set('itemIds', f.itemIds.filter((x) => x !== id))}>
                    <X className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-3">None. Add specific Glims here, for example a featured one outside these collections.</p>
          )}
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <ItemPicker label="Add a Glim" type="glim" value={adding} onChange={setAdding} exclude={f.itemIds} />
            </div>
            <Button
              className="sm:mt-7"
              disabled={!adding || f.itemIds.includes(adding.id)}
              onClick={() => {
                if (!adding) return;
                set('itemIds', [...f.itemIds, adding.id]);
                setAdding(null);
              }}
            >
              Add Glim
            </Button>
          </div>
        </div>
        {errors.table ? <p className="text-sm font-semibold text-ember">{errors.table}</p> : null}
      </fieldset>

      <section aria-live="polite" aria-labelledby="lantern-preview-h" className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-l)] border border-line-strong bg-sunken p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="lantern-preview-h" className="font-sans text-sm font-semibold text-text">
            Odds players will see
          </h3>
          {settling || preview.isFetching ? <span className="text-xs text-text-3">Working out the odds</span> : null}
        </div>
        {!table ? (
          <p className="text-sm text-text-3">Fix the drop table to see the odds.</p>
        ) : preview.isError ? (
          <ErrorNotice title="This drop table cannot be saved" message={preview.error instanceof ApiError ? preview.error.message : 'The odds could not be worked out.'} />
        ) : preview.data ? (
          <>
            <OddsTable odds={preview.data.odds} before={pack && 'dropTable' in patch ? pack.odds : undefined} caption="Odds with this drop table" />
            <details className="text-xs text-text-2">
              <summary className="cursor-pointer font-semibold text-text">{plural(preview.data.pool.length, 'Glim')} can drop</summary>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {preview.data.pool
                  .slice()
                  .sort((a, b) => RARITY_INFO[a.rarity].rank - RARITY_INFO[b.rarity].rank || a.name.localeCompare(b.name))
                  .map((g) => (
                    <li key={g.id} className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: `var(--r-${g.rarity})` }} aria-hidden />
                      {g.name}
                    </li>
                  ))}
              </ul>
            </details>
          </>
        ) : (
          <Skeleton className="h-32" />
        )}
      </section>
      {canShop && pack?.listings.length ? <ListingNote pack={pack} /> : null}
      <NoChangesNote show={nothing} />
    </ActionDialog>
  );
}

function ListingNote({ pack }: { pack: AdminPack }): ReactNode {
  return (
    <p className="text-xs text-text-3">
      Sold in {plural(pack.listings.length, 'shop listing')}: {pack.listings.map((l) => l.id).join(', ')}.
    </p>
  );
}
