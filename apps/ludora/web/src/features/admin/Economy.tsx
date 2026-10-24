import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Check, Plus, Search, X } from 'lucide-react';
import {
  CURRENCY_KINDS,
  ITEM_GRANT_MAX,
  ITEM_TYPE_INFO,
  REAL_GRANT_MAX,
  REAL_GRANT_MAX_OTHER,
  TEST_GRANT_MAX,
  realGrantCap,
  type ItemArt,
  type ItemType,
  type Rarity,
} from '@ludora/shared';
import { api, newRequestKey } from '../../lib/api.ts';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { CurrencyIcon } from '../../art/icons.tsx';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Amount, Badge, Dialog, EmptyState, ErrorNotice, Field, Input, RarityBadge, Select, Skeleton, Switch, TabPanel, Tabs, Textarea } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, OlderButton, Stat, StaffPage, StatusPill, dateTime, useDebounced, useStaffMutation, type Column } from './ui.tsx';

/*
 * Economy: what is in circulation, where it comes from and goes, the
 * ledger, the tunable rules, currencies and staff grants.
 *
 * This file also holds the economy controls the other staff pages share
 * (catalogue, shop, events, testing): date helpers, currency choices, the
 * account and item pickers and the grant dialog. Every figure on the
 * overview leaves out test accounts; the server does that filtering.
 */

/* ============================== shared helpers ============================== */

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO timestamp as the value of a datetime-local input, in the viewer's time zone. */
export function isoToLocalInput(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/** A datetime-local value (viewer's time zone) as ISO 8601 with the offset written out, e.g. 2026-12-01T09:00:00+01:00. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  } catch {
    return 'your local time';
  }
}

/** A date and time input that works in the viewer's time zone. Optional fields get a Clear button. */
export function DateTimeField({ label, value, onChange, hint, error, withSeconds = false, clearable = false, disabled = false }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; error?: string; withSeconds?: boolean; clearable?: boolean; disabled?: boolean }) {
  return (
    <Field
      label={label}
      error={error}
      hint={
        <>
          {hint ? <>{hint} </> : null}
          Time zone: {timeZoneName()}.
        </>
      }
    >
      {(p) => (
        <div className="flex min-w-0 gap-2">
          <Input {...p} type="datetime-local" step={withSeconds ? 1 : 60} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="min-w-0 flex-1" />
          {clearable && value && !disabled ? (
            <Button variant="ghost" onClick={() => onChange('')} className="h-11">
              Clear
            </Button>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** A small set of choices shown as buttons; real radio inputs underneath, so arrow keys work. */
export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 text-sm font-semibold text-text">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.value}
            // The chosen option inverts, like the shared filter chips, so it is told by lightness and not by an edge colour alone.
            className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-m)] border border-line-strong px-2 py-1 text-center text-sm font-semibold text-text-2 has-[:checked]:border-transparent has-[:checked]:bg-text has-[:checked]:text-bg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Under an edit form whose save button is disabled because nothing changed yet. */
export function NoChangesNote({ show }: { show: boolean }) {
  return show ? <p className="text-xs text-text-3">No changes yet. Change a field above to save.</p> : null;
}

/** "50.2%", "0.30%", or "-" when there is nothing to show. */
export function percentText(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  if (n === 0) return '0%';
  return n < 1 ? `${n.toFixed(2)}%` : `${n.toFixed(1)}%`;
}

/** A whole number from text, or null when it is not one or falls outside the range. Commas and spaces are ignored. */
export function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim().replace(/[,\s_]/g, '');
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function wholeError(min: number, max: number): string {
  return `Use a whole number from ${formatNumber(min)} to ${formatNumber(max)}.`;
}

/** Date over time, so log tables stay narrow. */
export function TimeCell({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} className="block whitespace-nowrap text-text-2" title={dateTime(iso)}>
      <span className="block">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <span className="block text-xs text-text-3">{d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
    </time>
  );
}

/** Read and change several ?query params at once (one history entry). */
export function useQueryParams(): [URLSearchParams, (patch: Record<string, string | null | undefined>, opts?: { push?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const patch = useCallback(
    (p: Record<string, string | null | undefined>, opts?: { push?: boolean }) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(p)) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: !opts?.push },
      ),
    [setParams],
  );
  return [params, patch];
}

/** Plain-language labels for ledger reasons. */
export const LEDGER_REASONS: Record<string, string> = {
  welcome: 'Welcome gift',
  game_reward: 'Game reward',
  purchase: 'Shop purchase',
  pack_open: 'Lantern opening',
  quest_reward: 'Quest reward',
  achievement_reward: 'Achievement reward',
  level_reward: 'Level-up reward',
  streak_reward: 'Daily streak reward',
  collection_reward: 'Collection reward',
  recycle: 'Recycling',
  craft: 'Crafting',
  admin_grant: 'Staff grant',
  admin_revoke: 'Staff removal',
  test_reset: 'Test reset',
  event_expire: 'Event currency expired',
};

export const reasonLabel = (r: string) => LEDGER_REASONS[r] ?? r.replace(/_/g, ' ');

export const KIND_INFO: Record<string, { label: string; description: string }> = {
  soft: { label: 'Everyday', description: 'Earned by playing and spent on most things.' },
  premium: { label: 'Premium', description: 'Scarce, earned at milestones.' },
  crafting: { label: 'Crafting', description: 'Made by recycling and spent on crafting.' },
  event: { label: 'Event', description: 'Belongs to a limited-time event and expires with it.' },
};

export const RELEASE_INFO: Record<string, { label: string; description: string }> = {
  draft: { label: 'Draft', description: 'Work in progress. Not sold, never drops, and cannot be given to players.' },
  unreleased: { label: 'Unreleased', description: 'Finished but not out yet. Not sold and never drops.' },
  live: { label: 'Live', description: 'Sold in the shop, drops from Lanterns and counts towards collections.' },
  retired: { label: 'Retired', description: 'No longer sold or dropped. Players who own it keep it.' },
};

export const AGE_BAND_LABEL: Record<string, string> = { under13: 'Under 13', '13to17': '13 to 17', adult: 'Adult' };

/* ---------------------------------- types ----------------------------------- */

export interface AdminCurrency {
  code: string;
  name: string;
  description: string;
  kind: string;
  hue: number;
  howToEarn: string;
  howToSpend: string;
  expiresAt: string | null;
  active: boolean;
  sort: number;
  listings: number;
  core: boolean;
}

export interface CurrencyChoice {
  code: string;
  name: string;
  kind: string;
  active: boolean;
}

export interface StaffUser {
  id: string;
  username: string | null;
  displayName: string;
  isGuest: boolean;
  accountType: string;
  ageBand: string | null;
  isTestAccount: boolean;
  status: string;
  level: number;
  roles: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  collectionId: string | null;
  art: ItemArt;
  releaseState: string;
  isTestOnly: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
  owners: number;
}

export interface ItemList {
  items: AdminItem[];
  total: number;
  offset: number;
  pageSize: number;
}

interface Wallet {
  userId: string;
  isTestAccount: boolean;
  confirmWord: string;
  balances: Record<string, number>;
  self: boolean;
}

interface LedgerEntry {
  id: number;
  userId: string;
  user: string;
  isTestAccount: boolean;
  currency: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  unlimited: boolean;
  actor: string | null;
  note: string | null;
  createdAt: string;
}

interface LedgerPage {
  entries: LedgerEntry[];
  nextBefore: number | null;
}

/* ------------------------------ currency choices ----------------------------- */

export function useAdminCurrencies(enabled = true) {
  return useQuery({ queryKey: ['admin', 'currencies'], queryFn: () => api.get<{ currencies: AdminCurrency[] }>('/api/admin/currencies'), enabled, staleTime: 30_000 });
}

/**
 * Currencies to choose from in forms. Staff with economy.view get the full
 * list (including switched-off ones); everyone else gets the active list
 * every signed-in account can read.
 */
export function useCurrencyChoices(): { choices: CurrencyChoice[]; loading: boolean } {
  const canView = useCan('economy.view');
  const admin = useAdminCurrencies(canView);
  const overview = useOverview();
  if (canView) return { choices: (admin.data?.currencies ?? []).map((c) => ({ code: c.code, name: c.name, kind: c.kind, active: c.active })), loading: admin.isLoading };
  return { choices: (overview.data?.currencies ?? []).map((c) => ({ code: c.code, name: c.name, kind: c.kind, active: true })), loading: overview.isLoading };
}

export function currencyName(choices: { code: string; name: string }[], code: string): string {
  return choices.find((c) => c.code === code)?.name ?? code;
}

export function CurrencySelect({ label = 'Currency', value, onChange, choices, hint, disabled }: { label?: string; value: string; onChange: (v: string) => void; choices: CurrencyChoice[]; hint?: ReactNode; disabled?: boolean }) {
  const known = choices.some((c) => c.code === value);
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {!known && value ? <option value={value}>{value}</option> : null}
          {choices.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
              {c.active ? '' : ' (switched off)'}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/* -------------------------------- item picker -------------------------------- */

export interface PickedItem {
  id: string;
  name: string;
  type?: ItemType;
  rarity?: Rarity;
  art?: ItemArt | null;
  releaseState?: string;
  isTestOnly?: boolean;
}

export function pickedFrom(i: AdminItem): PickedItem {
  return { id: i.id, name: i.name, type: i.type, rarity: i.rarity, art: i.art, releaseState: i.releaseState, isTestOnly: i.isTestOnly };
}

/** A fixed-size box for item art, so wide banners and tall Glims line up in lists. */
export function ArtThumb({ art, rarity, size = 44 }: { art: ItemArt | null | undefined; rarity?: Rarity; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-m)] bg-sunken" style={{ width: size, height: size }} aria-hidden>
      {art ? (
        <span className="grid place-items-center" style={{ width: size - 4, height: art.kind === 'banner' ? (size - 4) * 0.55 : size - 4 }}>
          <ItemArtView art={art} rarity={rarity} size={size - 4} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Pick an item from the catalogue by searching its name or id. People
 * without catalogue access type the exact id instead (the server checks it).
 */
export function ItemPicker({ label, value, onChange, type, hint, exclude = [], disabled = false }: { label: string; value: PickedItem | null; onChange: (v: PickedItem | null) => void; type?: ItemType; hint?: ReactNode; exclude?: string[]; disabled?: boolean }) {
  const canBrowse = useCan('catalog.manage');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const search = useQuery({
    queryKey: ['admin', 'items', 'picker', dq, type ?? ''],
    queryFn: ({ signal }) => api.get<ItemList>(`/api/admin/items?${new URLSearchParams({ q: dq, ...(type ? { type } : {}) })}`, signal),
    enabled: canBrowse && !value && dq.length >= 1,
    placeholderData: (prev) => prev,
  });
  if (!canBrowse) {
    return (
      <Field label={label} hint={hint ?? 'Type the exact item id, for example glim-pebblet.'}>
        {(p) => <Input {...p} value={value?.id ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value.trim() ? { id: e.target.value.trim(), name: e.target.value.trim() } : null)} autoComplete="off" spellCheck={false} />}
      </Field>
    );
  }
  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text">{label}</span>
        <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-m)] border border-line-strong bg-sunken p-2">
          <ArtThumb art={value.art} rarity={value.rarity} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-text">{value.name}</div>
            <div className="truncate font-mono text-xs text-text-3">{value.id}</div>
          </div>
          {!disabled ? (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Change
            </Button>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-text-3">{hint}</p> : null}
      </div>
    );
  }
  const results = (search.data?.items ?? []).filter((i) => !exclude.includes(i.id)).slice(0, 8);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Field label={label} hint={hint ?? 'Search by name or id.'}>
        {(p) => (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
            <Input {...p} value={q} onChange={(e) => setQ(e.target.value)} placeholder={type ? `Search ${ITEM_TYPE_INFO[type].plural.toLowerCase()}` : 'Search items'} className="pl-9" autoComplete="off" disabled={disabled} />
          </div>
        )}
      </Field>
      {dq.length >= 1 ? (
        search.isError ? (
          <ErrorNotice message="The item search did not load." onRetry={() => void search.refetch()} />
        ) : search.isLoading ? (
          <Skeleton className="h-24" />
        ) : results.length ? (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-[var(--radius-m)] border border-line p-1" aria-label="Matching items">
            {results.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onChange(pickedFrom(i))} className="flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-m)] p-1.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2">
                  <ArtThumb art={i.art} rarity={i.rarity} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">{i.name}</span>
                    <span className="block truncate font-mono text-xs text-text-3">{i.id}</span>
                  </span>
                  <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                    <RarityBadge rarity={i.rarity} />
                    <span className="text-xs text-text-3">{ITEM_TYPE_INFO[i.type]?.label ?? i.type}</span>
                  </span>
                  {i.releaseState !== 'live' ? <StatusPill status={i.releaseState} /> : null}
                  {i.isTestOnly ? <Badge tone="sky">Test only</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-3">No items match "{dq}".</p>
        )
      ) : null}
    </div>
  );
}

/* ------------------------------- account search ------------------------------ */

export function accountName(u: Pick<StaffUser, 'username' | 'displayName'>): string {
  return u.username ?? u.displayName;
}

/**
 * Find an account by username, display name, friend code or id. Without
 * users.read the person can still paste an account id.
 */
export function AccountSearch({ label = 'Find an account', kind, onPick, selectedId, hint, initialQuery = '' }: { label?: string; kind?: 'registered' | 'test'; onPick: (id: string, user?: StaffUser) => void; selectedId?: string | null; hint?: ReactNode; initialQuery?: string }) {
  const canSearch = useCan('users.read');
  const [q, setQ] = useState(initialQuery);
  const [pasted, setPasted] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const res = useQuery({
    queryKey: ['admin', 'users', 'search', dq, kind ?? ''],
    queryFn: ({ signal }) => api.get<{ users: StaffUser[]; total: number }>(`/api/admin/users?${new URLSearchParams({ q: dq, ...(kind ? { kind } : {}) })}`, signal),
    enabled: canSearch && dq.length >= 2,
    placeholderData: (prev) => prev,
  });
  if (!canSearch) {
    const ok = /^[0-9a-f-]{36}$/i.test(pasted.trim());
    return (
      <div className="flex flex-col gap-2">
        <Field label="Account id" hint="Your role cannot search accounts. Paste the account id from the player's page.">
          {(p) => <Input {...p} value={pasted} onChange={(e) => setPasted(e.target.value)} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" />}
        </Field>
        <div>
          <Button size="sm" disabled={!ok} onClick={() => onPick(pasted.trim())}>
            Use this account
          </Button>
        </div>
      </div>
    );
  }
  const users = res.data?.users ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Field label={label} hint={hint ?? 'Username, display name, friend code or account id. At least 2 characters.'}>
        {(p) => (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
            <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoComplete="off" spellCheck={false} />
          </div>
        )}
      </Field>
      {dq.length >= 2 ? (
        res.isError ? (
          <ErrorNotice message="The account search did not load." onRetry={() => void res.refetch()} />
        ) : res.isLoading ? (
          <Skeleton className="h-20" />
        ) : users.length ? (
          <>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-[var(--radius-m)] border border-line p-1" aria-label="Matching accounts">
              {users.slice(0, 10).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === u.id}
                    onClick={() => onPick(u.id, u)}
                    className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-m)] px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 aria-pressed:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{accountName(u)}</span>
                      <span className="block truncate text-xs text-text-3">
                        {u.displayName} · {u.accountType} · level {u.level}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {u.isTestAccount ? <Badge tone="sky">Test</Badge> : null}
                      {u.isGuest ? <Badge>Guest</Badge> : null}
                      {u.status !== 'active' ? <StatusPill status={u.status} /> : null}
                      {u.roles.map((r) => (
                        <Badge key={r} tone="violet">
                          {r}
                        </Badge>
                      ))}
                      {selectedId === u.id ? <Check className="size-4 text-glim" aria-hidden /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {res.data && res.data.total > 10 ? <p className="text-xs text-text-3">Showing 10 of {formatNumber(res.data.total)}. Type more to narrow it down.</p> : null}
          </>
        ) : (
          <p className="text-sm text-text-3">No accounts match "{dq}".</p>
        )
      ) : null}
    </div>
  );
}

/* -------------------------------- grant dialog ------------------------------- */

export interface MovementTarget {
  id: string;
  name: string;
  isTest: boolean;
  /** The word a real account's name must be typed as. Null for test accounts. */
  confirmWord: string | null;
  balances: Record<string, number>;
}

interface MovementResult {
  ok: true;
  replayed: boolean;
  currency?: string;
  amount?: number;
  balance?: number;
  itemId?: string;
  itemName?: string;
  quantity?: number;
}

/**
 * Give or take currency or an item. 'staff' is the economy grant tool (any
 * account, capped for real players, typed confirmation); 'test' is the
 * testing tool (test accounts only, no confirmation). Each attempt gets a
 * fresh idempotency key, kept while the same attempt is retried.
 */
export function MovementDialog({ open, onOpenChange, direction, target, mode }: { open: boolean; onOpenChange: (v: boolean) => void; direction: 'grant' | 'revoke'; target: MovementTarget; mode: 'staff' | 'test' }) {
  const { choices } = useCurrencyChoices();
  const [what, setWhat] = useState<'currency' | 'item'>('currency');
  const [currency, setCurrency] = useState('sparks');
  const [amount, setAmount] = useState('');
  const [item, setItem] = useState<PickedItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  useEffect(() => {
    if (open) {
      setWhat('currency');
      setCurrency('sparks');
      setAmount('');
      setItem(null);
      setQuantity('1');
      keyRef.current = null;
    }
  }, [open]);

  const real = !target.isTest;
  const cap = real ? realGrantCap(currency) : TEST_GRANT_MAX;
  const name = currencyName(choices, currency);
  const have = target.balances[currency] ?? 0;
  const amountNum = parseWhole(amount, 1, cap);
  const overBalance = direction === 'revoke' && amountNum !== null && amountNum > have;
  const stackable = item?.type ? ITEM_TYPE_INFO[item.type].stackable : true;
  const qty = stackable ? parseWhole(quantity, 1, ITEM_GRANT_MAX) : 1;
  const blockedItem = real && direction === 'grant' && Boolean(item?.isTestOnly || item?.releaseState === 'draft');
  const valid = what === 'currency' ? amountNum !== null && !overBalance && Boolean(currency) : Boolean(item?.id) && qty !== null && !blockedItem;
  const verb = direction === 'grant' ? 'Grant' : 'Remove';
  const label = !valid
    ? `${verb} ${what === 'currency' ? 'currency' : 'item'}`
    : what === 'currency'
      ? `${verb} ${formatNumber(amountNum ?? 0)} ${name}`
      : `${verb} ${qty && qty > 1 ? `${qty} copies of ${item!.name}` : item!.name}`;

  /** Same inputs, same key: a retry after a dropped connection cannot apply twice. */
  const requestKey = () => {
    const sig = JSON.stringify([direction, what, currency, amountNum, item?.id, qty]);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newRequestKey(direction) };
    return keyRef.current.key;
  };

  const path = mode === 'staff' ? `/api/admin/economy/${direction}` : `/api/admin/testing/accounts/${target.id}/${direction}`;
  const move = useStaffMutation((body: Record<string, unknown>) => api.post<MovementResult>(path, body), {
    silentError: true,
    invalidate: [['admin', 'wallet'], ['admin', 'economy'], ['admin', 'testing', 'accounts']],
    success: (res, body) => {
      if (res.replayed) return 'That exact change was already made, so nothing was done twice.';
      const done = direction === 'grant' ? 'Granted' : 'Removed';
      const to = direction === 'grant' ? 'to' : 'from';
      if (res.currency) return `${done} ${formatNumber(res.amount ?? 0)} ${currencyName(choices, res.currency)} ${to} ${target.name}. They now have ${formatNumber(res.balance ?? 0)}.`;
      const copies = Number(body.quantity ?? 1);
      return `${done} ${copies > 1 ? `${copies} copies of ` : ''}${res.itemName ?? 'the item'} ${to} ${target.name}. They now have ${formatNumber(res.quantity ?? 0)}.`;
    },
    onSuccess: () => {
      keyRef.current = null;
    },
  });

  const projected = amountNum === null ? null : direction === 'grant' ? have + amountNum : have - amountNum;
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={direction === 'grant' ? `Grant to ${target.name}` : `Remove from ${target.name}`}
      description={
        real ? (
          <>This is a real player's account. The change is written to the ledger and the audit log, and you will type the account name to confirm.</>
        ) : (
          <>Test account. The change is written to the ledger and the audit log, and is left out of economy figures.</>
        )
      }
      confirmWord={real && mode === 'staff' ? target.confirmWord : null}
      confirmLabel={label}
      variant={direction === 'grant' ? 'primary' : 'danger'}
      disabled={!valid}
      onSubmit={async ({ reason, confirm }) => {
        const body: Record<string, unknown> = {
          ...(mode === 'staff' ? { userId: target.id } : {}),
          ...(what === 'currency' ? { currency, amount: amountNum } : { itemId: item!.id, quantity: qty }),
          reason,
          requestKey: requestKey(),
          ...(confirm !== undefined ? { confirm } : {}),
        };
        await move.mutateAsync(body);
      }}
    >
      <Segmented
        label={`What to ${direction === 'grant' ? 'give' : 'take'}`}
        value={what}
        onChange={setWhat}
        options={[
          { value: 'currency', label: 'Currency' },
          { value: 'item', label: 'An item' },
        ]}
      />
      {what === 'currency' ? (
        <>
          <CurrencySelect value={currency} onChange={setCurrency} choices={choices} hint={`They have ${formatNumber(have)} ${name}.`} />
          <Field
            label="Amount"
            error={amount && amountNum === null ? `Use a whole number from 1 to ${formatNumber(cap)}.` : overBalance ? `They only have ${formatNumber(have)} ${name}.` : undefined}
            hint={real ? `Up to ${formatNumber(cap)} ${name} in one change for a player's account. Split bigger corrections into several changes.` : `Up to ${formatNumber(cap)} in one change for a test account.`}
          >
            {(p) => <Input {...p} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />}
          </Field>
          {projected !== null && !overBalance ? (
            <p className="text-sm text-text-2">
              {target.name} will have <Amount currency={currency} value={projected} size="sm" /> afterwards.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <ItemPicker label="Item" value={item} onChange={setItem} hint={direction === 'revoke' ? 'They must own it. Removing their last copy also takes it off them if equipped.' : undefined} />
          {item && stackable ? (
            <Field label="Copies" error={quantity && qty === null ? `Use a whole number from 1 to ${ITEM_GRANT_MAX}.` : undefined} hint={item.type ? `Glims stack. Up to ${ITEM_GRANT_MAX} copies in one change.` : 'Only Glims stack; any other item is given or taken once.'}>
              {(p) => <Input {...p} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoComplete="off" />}
            </Field>
          ) : item ? (
            <p className="text-sm text-text-3">{ITEM_TYPE_INFO[item.type!]?.plural ?? 'These items'} do not stack, so this is always one copy.</p>
          ) : null}
          {real && item?.isTestOnly && direction === 'grant' ? <ErrorNotice title="Test-only item" message="Test-only items can only go to test accounts." /> : null}
          {real && item?.releaseState === 'draft' && direction === 'grant' ? <ErrorNotice title="Draft item" message="Draft items cannot be given to players." /> : null}
        </>
      )}
    </ActionDialog>
  );
}

/** "At most 10,000 Sparks, 500 Moonstones ..." for real accounts. */
export function RealCapsNote({ choices }: { choices: CurrencyChoice[] }) {
  const listed = Object.entries(REAL_GRANT_MAX).map(([code, n]) => `${formatNumber(n)} ${currencyName(choices, code)}`);
  return (
    <p className="text-xs text-text-3">
      Limits for a player's account, per change: {listed.join(', ')}, and {formatNumber(REAL_GRANT_MAX_OTHER)} of any other currency. Test accounts take up to {formatNumber(TEST_GRANT_MAX)}.
    </p>
  );
}

/* ================================= the page ================================== */

const TABS = ['overview', 'ledger', 'rules', 'currencies', 'grant'] as const;
type Tab = (typeof TABS)[number];

export default function Economy() {
  const [params, patch] = useQueryParams();
  const canGrant = useCan('economy.grant');
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'overview';
  return (
    <StaffPage title="Economy" description="What is in circulation, where it comes from and where it goes, the ledger of every balance change, the earning rules and currencies. Figures leave out test accounts.">
      <Tabs
        label="Economy sections"
        value={tab}
        onValueChange={(v) => patch({ tab: v === 'overview' ? null : v }, { push: true })}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'ledger', label: 'Ledger' },
          { value: 'rules', label: 'Rules' },
          { value: 'currencies', label: 'Currencies' },
          { value: 'grant', label: canGrant ? 'Grant' : 'Wallets' },
        ]}
      >
        <TabPanel value="overview">
          <OverviewTab />
        </TabPanel>
        <TabPanel value="ledger">
          <LedgerTab />
        </TabPanel>
        <TabPanel value="rules">
          <RulesTab />
        </TabPanel>
        <TabPanel value="currencies">
          <CurrenciesTab />
        </TabPanel>
        <TabPanel value="grant">
          <GrantTab />
        </TabPanel>
      </Tabs>
    </StaffPage>
  );
}

/* --------------------------------- overview ---------------------------------- */

interface OverviewData {
  since: string;
  currencies: { code: string; name: string; kind: string; circulating: number; holders: number }[];
  flows: { currency: string; reason: string; total: number; count: number }[];
  lanterns: { id: string; name: string; releaseState: string; opened: number; rarities: { rarity: Rarity; disclosedPercent: number; observedPercent: number | null; count: number }[] }[];
  topPurchases: { listingId: string; count: number; spent: number; currency: string }[];
}

function OverviewTab() {
  const q = useQuery({ queryKey: ['admin', 'economy', 'overview'], queryFn: () => api.get<OverviewData>('/api/admin/economy/overview') });
  const canShop = useCan('shop.manage');
  if (q.isError) return <ErrorNotice message="The economy overview did not load." onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  const d = q.data;
  const byCurrency = d.currencies.map((c) => ({ ...c, flows: d.flows.filter((f) => f.currency === c.code) })).filter((c) => c.flows.length);
  const purchaseCols: Column<OverviewData['topPurchases'][number]>[] = [
    {
      key: 'listing',
      header: 'Listing',
      cell: (r) =>
        canShop ? (
          <Link to={`/staff/shop?q=${encodeURIComponent(r.listingId)}`} className="font-mono text-xs break-all text-link underline-offset-2 hover:underline">
            {r.listingId}
          </Link>
        ) : (
          <span className="font-mono text-xs break-all">{r.listingId}</span>
        ),
    },
    { key: 'n', header: 'Purchases', align: 'right', cell: (r) => formatNumber(r.count) },
    { key: 'spent', header: 'Spent', align: 'right', cell: (r) => <Amount currency={r.currency} value={r.spent} size="sm" /> },
  ];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-2">
        Real accounts only, since {dateTime(d.since)}. Test accounts, unlimited test currency and guaranteed Lantern draws are left out.
      </p>
      <section aria-labelledby="circulation-h">
        <h2 id="circulation-h" className="mb-2 font-display text-xl leading-tight font-bold text-text">
          In circulation now
        </h2>
        {!d.currencies.length ? <p className="text-sm text-text-3">No currencies yet.</p> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.currencies.map((c) => (
            <Stat
              key={c.code}
              label={c.name}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <CurrencyIcon code={c.code} size={22} />
                  {formatNumber(c.circulating)}
                </span>
              }
              hint={`${plural(c.holders, 'holder')} · ${KIND_INFO[c.kind]?.label ?? c.kind}`}
            />
          ))}
        </div>
      </section>

      <Card title="Earned and spent, last 7 days">
        {byCurrency.length ? (
          <div className="flex flex-col gap-5">
            {byCurrency.map((c) => (
              <FlowBlock key={c.code} code={c.code} name={c.name} flows={c.flows} />
            ))}
          </div>
        ) : (
          <EmptyState title="No movement">No currency moved on real accounts in the last 7 days.</EmptyState>
        )}
      </Card>

      <Card title="Lantern odds: disclosed and observed">
        <p className="mb-3 text-sm text-text-2">Disclosed is what players are told. Observed is what real players drew in the last 7 days. Small samples swing a lot, so compare once a Lantern has a few hundred openings.</p>
        {d.lanterns.length ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {d.lanterns.map((l) => (
              <LanternOddsBlock key={l.id} lantern={l} />
            ))}
          </div>
        ) : (
          <EmptyState title="No Lanterns">There are no Lanterns in the catalogue.</EmptyState>
        )}
      </Card>

      <Card title="Top purchases, last 7 days">
        <DataTable columns={purchaseCols} rows={d.topPurchases} rowKey={(r) => r.listingId} empty="Nobody bought anything in the last 7 days." minWidth={420} caption="Most bought shop listings in the last 7 days" />
      </Card>
    </div>
  );
}

function FlowBlock({ code, name, flows }: { code: string; name: string; flows: OverviewData['flows'] }) {
  const sources = flows.filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const sinks = flows.filter((f) => f.total < 0).sort((a, b) => a.total - b.total);
  const net = flows.reduce((n, f) => n + f.total, 0);
  const max = Math.max(1, ...flows.map((f) => Math.abs(f.total)));
  const list = (rows: typeof flows, tone: 'in' | 'out') =>
    rows.length ? (
      <ul className="flex flex-col gap-2">
        {rows.map((f) => (
          <li key={f.reason} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-text">
                {reasonLabel(f.reason)} <span className="text-xs text-text-3">· {plural(f.count, 'entry', 'entries')}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular ${tone === 'in' ? 'text-glim' : 'text-ember'}`}>
                {f.total > 0 ? '+' : '-'}
                {formatNumber(Math.abs(f.total))}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
              <div className={`h-full rounded-full ${tone === 'in' ? 'bg-glim/70' : 'bg-ember/70'}`} style={{ width: `${Math.max(2, (Math.abs(f.total) / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-text-3">{tone === 'in' ? 'Nothing earned.' : 'Nothing spent or removed.'}</p>
    );
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-sans font-semibold text-text">
          <CurrencyIcon code={code} size={18} />
          {name}
        </h3>
        <span className="text-sm text-text-2">
          Net{' '}
          <span className={`font-semibold tabular ${net >= 0 ? 'text-glim' : 'text-ember'}`}>
            {net >= 0 ? '+' : '-'}
            {formatNumber(Math.abs(net))}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-[var(--radius-m)] border border-line p-3">
          <h4 className="mb-2 font-sans text-xs font-semibold text-text-3">Earned (sources)</h4>
          {list(sources, 'in')}
        </div>
        <div className="min-w-0 rounded-[var(--radius-m)] border border-line p-3">
          <h4 className="mb-2 font-sans text-xs font-semibold text-text-3">Spent or removed (sinks)</h4>
          {list(sinks, 'out')}
        </div>
      </div>
    </div>
  );
}

function LanternOddsBlock({ lantern }: { lantern: OverviewData['lanterns'][number] }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-m)] border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-sans font-semibold text-text">{lantern.name}</h3>
        <span className="flex items-center gap-2 text-xs text-text-3">
          <StatusPill status={lantern.releaseState} />
          {plural(lantern.opened, 'opening')}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[240px] text-sm">
          <caption className="sr-only">Disclosed and observed odds for {lantern.name}</caption>
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th scope="col" className="py-1 font-semibold">
                Rarity
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Disclosed
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Observed
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Drawn
              </th>
            </tr>
          </thead>
          <tbody>
            {lantern.rarities.map((r) => {
              const diff = r.observedPercent === null ? null : r.observedPercent - r.disclosedPercent;
              return (
                <tr key={r.rarity} className="border-t border-line">
                  <td className="py-1.5">
                    <RarityBadge rarity={r.rarity} />
                  </td>
                  <td className="py-1.5 text-right tabular">{percentText(r.disclosedPercent)}</td>
                  <td className="py-1.5 text-right tabular">
                    {percentText(r.observedPercent)}
                    {diff !== null && lantern.opened > 0 ? (
                      <span className="block text-xs text-text-3 sm:ml-1 sm:inline">
                        ({diff >= 0 ? '+' : '-'}
                        {Math.abs(diff).toFixed(1)})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right tabular">{formatNumber(r.count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lantern.opened === 0 ? <p className="mt-2 text-xs text-text-3">No openings by real players in the last 7 days.</p> : null}
    </div>
  );
}

/* ---------------------------------- ledger ----------------------------------- */

function LedgerTab() {
  const [params, patch] = useQueryParams();
  const { choices } = useCurrencyChoices();
  const userId = params.get('userId') ?? '';
  const currency = params.get('currency') ?? '';
  const reason = params.get('reason') ?? '';
  const staffOnly = params.get('staff') === '1';
  const [pickOpen, setPickOpen] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const filters = { userId, currency, reason, staffOnly };
  const ledger = useInfiniteQuery({
    queryKey: ['admin', 'economy', 'ledger', filters],
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams();
      if (userId) qs.set('userId', userId);
      if (currency) qs.set('currency', currency);
      if (reason) qs.set('reason', reason);
      if (staffOnly) qs.set('staffOnly', '1');
      if (pageParam) qs.set('before', String(pageParam));
      return api.get<LedgerPage>(`/api/admin/economy/ledger?${qs}`, signal);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = ledger.data?.pages.flatMap((p) => p.entries);
  const shownUser = userLabel ?? rows?.find((r) => r.userId === userId)?.user ?? userId;
  const filterBy = (id: string, label: string) => {
    setUserLabel(label);
    patch({ userId: id });
  };
  const cols: Column<LedgerEntry>[] = [
    { key: 'time', header: 'Time', cell: (r) => <TimeCell iso={r.createdAt} /> },
    {
      key: 'account',
      header: 'Account',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {r.userId === userId ? (
            <span className="font-semibold whitespace-nowrap">{r.user}</span>
          ) : (
            <button type="button" className="text-left font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline" onClick={() => filterBy(r.userId, r.user)} title="Show only this account">
              {r.user}
            </button>
          )}
          {r.isTestAccount ? <Badge tone="sky">Test</Badge> : null}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <CurrencyIcon code={r.currency} size={16} />
          {currencyName(choices, r.currency)}
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Change',
      align: 'right',
      cell: (r) =>
        r.unlimited ? (
          <span className="text-text-3">0</span>
        ) : (
          <span className={`font-semibold ${r.delta > 0 ? 'text-glim' : r.delta < 0 ? 'text-ember' : 'text-text-3'}`}>
            {r.delta > 0 ? '+' : r.delta < 0 ? '-' : ''}
            {formatNumber(Math.abs(r.delta))}
          </span>
        ),
    },
    { key: 'after', header: 'Balance after', align: 'right', cell: (r) => formatNumber(r.balanceAfter) },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {reasonLabel(r.reason)}
          {r.unlimited ? (
            <Badge tone="violet" className="whitespace-normal">
              Unlimited test currency
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'actor', header: 'Staff', cell: (r) => r.actor ?? <span className="text-text-3">-</span> },
    { key: 'note', header: 'Note', className: 'min-w-[120px] max-w-[240px]', cell: (r) => (r.note ? <span className="break-words text-text-2">{r.note}</span> : <span className="text-text-3">-</span>) },
  ];
  const anyFilter = Boolean(userId || currency || reason || staffOnly);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.25fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-text">Account</span>
            {userId ? (
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-[var(--radius-m)] border border-line-strong bg-sunken pr-1 pl-3">
                <span className="min-w-0 flex-1 truncate text-[15px]">{shownUser}</span>
                <IconButton
                  label="Show every account"
                  size="sm"
                  onClick={() => {
                    setUserLabel(null);
                    patch({ userId: null });
                  }}
                >
                  <X className="size-4" />
                </IconButton>
              </div>
            ) : (
              <Button onClick={() => setPickOpen(true)} className="h-11 justify-start" icon={<Search className="size-4" />} aria-haspopup="dialog" aria-label="Showing every account. Choose one account">
                Every account
              </Button>
            )}
          </div>
          <Field label="Currency">
            {(p) => (
              <Select {...p} value={currency} onChange={(e) => patch({ currency: e.target.value })}>
                <option value="">Every currency</option>
                {choices.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Reason">
            {(p) => (
              <Select {...p} value={reason} onChange={(e) => patch({ reason: e.target.value })}>
                <option value="">Every reason</option>
                {Object.entries(LEDGER_REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="min-w-0 self-end">
            <Switch checked={staffOnly} onCheckedChange={(v) => patch({ staff: v ? '1' : null })} label="Staff changes only" description="Grants, removals and test resets." />
          </div>
        </div>
        {anyFilter ? (
          <div className="mt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setUserLabel(null);
                patch({ userId: null, currency: null, reason: null, staff: null });
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        loading={ledger.isLoading}
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
        empty={anyFilter ? 'No ledger entries match these filters.' : 'The ledger is empty.'}
        minWidth={820}
        caption="Ledger entries, newest first"
      />
      <OlderButton next={ledger.hasNextPage ? (ledger.data?.pages.at(-1)?.nextBefore ?? null) : null} onLoad={() => void ledger.fetchNextPage()} loading={ledger.isFetchingNextPage} />
      <Dialog open={pickOpen} onOpenChange={setPickOpen} title="Show one account's ledger" size="md">
        <AccountSearch
          onPick={(id, u) => {
            filterBy(id, u ? accountName(u) : id);
            setPickOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}

/* ----------------------------------- rules ----------------------------------- */

interface EconomyRules {
  welcomeSparks: number;
  starterItems: string[];
  game: {
    participationSparks: number;
    sparksPerCorrect: number;
    placeSparks: number[];
    minAnswered: number;
    dailySparkCap: number;
    soloMultiplier: number;
    xpParticipation: number;
    xpPerCorrect: number;
    xpWin: number;
    xpHost: number;
  };
  levelUp: { sparks: number; moonstonesEvery: number; moonstones: number };
  dailyStreak: { sparksPerDay: number; maxBonusDays: number; moonstonesOnWeek: number };
}

interface NumberRule {
  path: string;
  label: string;
  help: string;
  min: number;
  max: number;
  decimal?: boolean;
}

/** Every number in economyRulesSchema, grouped the way staff think about them. */
const RULE_GROUPS: { title: string; description: string; fields: NumberRule[] }[] = [
  {
    title: 'New accounts',
    description: 'Paid once, when an account is created.',
    fields: [{ path: 'welcomeSparks', label: 'Welcome Sparks', help: 'Sparks every new account starts with.', min: 0, max: 100_000 }],
  },
  {
    title: 'Games',
    description: 'Paid at the end of every game to each player who answered enough questions.',
    fields: [
      { path: 'game.participationSparks', label: 'Sparks for taking part', help: 'Paid to everyone who answered enough questions.', min: 0, max: 1000 },
      { path: 'game.sparksPerCorrect', label: 'Sparks per correct answer', help: 'Added for each correct answer.', min: 0, max: 100 },
      { path: 'game.minAnswered', label: 'Answers needed to earn', help: 'A game pays nothing until a player has answered this many questions, so joining and idling earns nothing.', min: 0, max: 50 },
      { path: 'game.dailySparkCap', label: 'Daily cap on game Sparks', help: 'Most Sparks one player can earn from games in a day (UTC).', min: 0, max: 1_000_000 },
      { path: 'game.soloMultiplier', label: 'Solo game multiplier', help: 'Game Sparks and XP are multiplied by this in solo play. 1 pays the same as a multiplayer game.', min: 0, max: 2, decimal: true },
      { path: 'game.xpParticipation', label: 'XP for taking part', help: 'Paid to everyone who answered enough questions.', min: 0, max: 1000 },
      { path: 'game.xpPerCorrect', label: 'XP per correct answer', help: 'Added for each correct answer.', min: 0, max: 100 },
      { path: 'game.xpWin', label: 'XP for winning', help: 'Extra XP for first place.', min: 0, max: 1000 },
      { path: 'game.xpHost', label: 'XP for hosting', help: 'Paid to the host when a game they ran finishes.', min: 0, max: 1000 },
    ],
  },
  {
    title: 'Level-ups',
    description: 'Paid each time a player reaches a new level.',
    fields: [
      { path: 'levelUp.sparks', label: 'Sparks per level-up', help: 'Paid on every new level.', min: 0, max: 10_000 },
      { path: 'levelUp.moonstonesEvery', label: 'Moonstones every this many levels', help: 'For example 5 pays Moonstones on levels 5, 10, 15 and so on.', min: 1, max: 50 },
      { path: 'levelUp.moonstones', label: 'Moonstones on those levels', help: 'Moonstones paid on every such level.', min: 0, max: 1000 },
    ],
  },
  {
    title: 'Daily streak',
    description: 'Paid with the first game of each day in a streak.',
    fields: [
      { path: 'dailyStreak.sparksPerDay', label: 'Streak Sparks per day', help: 'The bonus is this times the streak length, up to the limit below.', min: 0, max: 1000 },
      { path: 'dailyStreak.maxBonusDays', label: 'Streak days that count', help: 'The streak bonus stops growing after this many days.', min: 1, max: 30 },
      { path: 'dailyStreak.moonstonesOnWeek', label: 'Moonstones for each full week', help: 'Paid on day 7, 14, 21 and so on of a streak.', min: 0, max: 1000 },
    ],
  },
];

const PLACE_MAX = 10;

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]!] = value;
}

interface RulesDraft {
  values: Record<string, string>;
  places: string[];
  starters: string[];
}

function draftFrom(rules: EconomyRules): RulesDraft {
  const values: Record<string, string> = {};
  for (const g of RULE_GROUPS) for (const f of g.fields) values[f.path] = String(getPath(rules, f.path) ?? '');
  return { values, places: rules.game.placeSparks.map(String), starters: [...rules.starterItems] };
}

function buildRules(draft: RulesDraft): { rules: EconomyRules | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  for (const g of RULE_GROUPS) {
    for (const f of g.fields) {
      const text = (draft.values[f.path] ?? '').trim();
      let n: number | null;
      if (f.decimal) {
        n = /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
        if (n !== null && (n < f.min || n > f.max)) n = null;
        if (n === null) errors[f.path] = `Use a number from ${f.min} to ${f.max}, for example 0.6.`;
      } else {
        n = parseWhole(text, f.min, f.max);
        if (n === null) errors[f.path] = wholeError(f.min, f.max);
      }
      setPath(out, f.path, n);
    }
  }
  const places = draft.places.map((p) => parseWhole(p, 0, 5000));
  draft.places.forEach((_, i) => {
    if (places[i] === null) errors[`place.${i}`] = wholeError(0, 5000);
  });
  setPath(out, 'game.placeSparks', places);
  out.starterItems = draft.starters;
  return { rules: Object.keys(errors).length ? null : (out as unknown as EconomyRules), errors };
}

const sameRules = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function describeChanges(before: EconomyRules, after: EconomyRules): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  for (const g of RULE_GROUPS) {
    for (const f of g.fields) {
      const a = getPath(before, f.path);
      const b = getPath(after, f.path);
      if (a !== b) out.push({ label: f.label, from: String(a), to: String(b) });
    }
  }
  if (!sameRules(before.game.placeSparks, after.game.placeSparks)) out.push({ label: 'Podium Sparks', from: before.game.placeSparks.join(', ') || 'none', to: after.game.placeSparks.join(', ') || 'none' });
  if (!sameRules(before.starterItems, after.starterItems)) out.push({ label: 'Starter items', from: before.starterItems.join(', ') || 'none', to: after.starterItems.join(', ') || 'none' });
  return out;
}

function RulesTab() {
  const canConfigure = useCan('economy.configure');
  const q = useQuery({ queryKey: ['admin', 'economy', 'rules'], queryFn: () => api.get<{ rules: EconomyRules; defaults: EconomyRules }>('/api/admin/economy/rules') });
  const [draft, setDraft] = useState<RulesDraft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [adding, setAdding] = useState<PickedItem | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(draftFrom(q.data.rules));
  }, [q.data, draft]);
  const save = useStaffMutation((body: { rules: EconomyRules; reason: string }) => api.put<{ ok: true; rules: EconomyRules }>('/api/admin/economy/rules', body), {
    silentError: true,
    success: 'Economy rules saved. New values apply within 10 seconds.',
    invalidate: [['admin', 'economy', 'rules']],
    onSuccess: (res) => setDraft(draftFrom(res.rules)),
  });
  if (q.isError) return <ErrorNotice message="The economy rules did not load." onRetry={() => void q.refetch()} />;
  if (!q.data || !draft) return <Skeleton className="h-96" />;
  const { rules: current, defaults } = q.data;
  const built = buildRules(draft);
  const changes = built.rules ? describeChanges(current, built.rules) : [];
  const dirty = !sameRules(draftFrom(current), draft);
  const set = (path: string, v: string) => setDraft({ ...draft, values: { ...draft.values, [path]: v } });
  const ro = !canConfigure;
  return (
    <div className="flex flex-col gap-4">
      {ro ? (
        <p className="rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3 text-sm text-text-2" role="note">
          You can read the rules. Changing them needs the economy configuration permission, which administrators have.
        </p>
      ) : (
        <p className="text-sm text-text-2">Changes apply to everything earned after saving, within about 10 seconds. Nothing already paid changes. Each save asks for a reason and is recorded in the audit log.</p>
      )}
      {RULE_GROUPS.map((g) => (
        <Card key={g.title} title={g.title}>
          <p className="-mt-1 mb-3 text-sm text-text-3">{g.description}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {g.fields.map((f) => {
              const def = getPath(defaults, f.path);
              const now = getPath(current, f.path);
              const typed = draft.values[f.path] ?? '';
              return (
                <Field
                  key={f.path}
                  label={f.label}
                  error={built.errors[f.path]}
                  hint={
                    <>
                      {f.help} Default {String(def)}
                      {String(now) !== String(def) ? `, currently ${String(now)}` : ''}. Allowed {f.min} to {formatNumber(f.max)}.
                    </>
                  }
                >
                  {(p) => <Input {...p} inputMode={f.decimal ? 'decimal' : 'numeric'} value={typed} onChange={(e) => set(f.path, e.target.value)} disabled={ro} autoComplete="off" />}
                </Field>
              );
            })}
            {g.title === 'Games' ? (
              <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
                <span className="text-sm font-semibold text-text">Podium Sparks</span>
                <p className="text-xs text-text-3">
                  Extra Sparks by finishing place in a competitive game, first place first. In a team win everyone gets the second-place amount. Up to {PLACE_MAX} places. Default {defaults.game.placeSparks.join(', ')}.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {draft.places.map((v, i) => (
                    <Field key={i} label={`${ordinal(i + 1)} place`} error={built.errors[`place.${i}`]}>
                      {(p) => <Input {...p} inputMode="numeric" value={v} disabled={ro} onChange={(e) => setDraft({ ...draft, places: draft.places.map((x, j) => (j === i ? e.target.value : x)) })} autoComplete="off" />}
                    </Field>
                  ))}
                </div>
                {!ro ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<Plus className="size-4" />} disabled={draft.places.length >= PLACE_MAX} onClick={() => setDraft({ ...draft, places: [...draft.places, '0'] })}>
                      Add a place
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!draft.places.length} onClick={() => setDraft({ ...draft, places: draft.places.slice(0, -1) })}>
                      Remove last place
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {g.title === 'New accounts' ? (
              <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
                <span className="text-sm font-semibold text-text">Starter items</span>
                <p className="text-xs text-text-3">Given to every new account. The first one becomes the new player's buddy, so make it a Glim. Default {defaults.starterItems.join(', ') || 'none'}.</p>
                {draft.starters.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {draft.starters.map((id, i) => (
                      <li key={id} className="flex min-w-0 items-center gap-2 rounded-[var(--radius-m)] border border-line px-3 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-sm">{id}</span>
                        {i === 0 ? <Badge tone="mint">Buddy</Badge> : null}
                        {!ro && i > 0 ? (
                          <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, starters: [id, ...draft.starters.filter((s) => s !== id)] })}>
                            Make buddy
                          </Button>
                        ) : null}
                        {!ro ? (
                          <IconButton label={`Remove ${id}`} size="sm" onClick={() => setDraft({ ...draft, starters: draft.starters.filter((s) => s !== id) })}>
                            <X className="size-4" />
                          </IconButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-3">No starter items. New accounts start with no Glims.</p>
                )}
                {!ro ? (
                  <div className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-dashed border-line-strong p-3">
                    <ItemPicker label="Add a starter item" value={adding} onChange={setAdding} exclude={draft.starters} />
                    <div>
                      <Button
                        size="sm"
                        icon={<Plus className="size-4" />}
                        disabled={!adding || draft.starters.includes(adding.id)}
                        onClick={() => {
                          if (!adding) return;
                          setDraft({ ...draft, starters: [...draft.starters, adding.id] });
                          setAdding(null);
                        }}
                      >
                        Add to starter items
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ))}
      {!ro ? (
        <div className={`${dirty ? 'sticky bottom-24 z-10 shadow-[0_8px_24px_rgb(0_0_0/0.25)] lg:bottom-4' : ''} flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line-strong bg-raised px-4 py-3`}>
          <span className="text-sm text-text-2" aria-live="polite">
            {Object.keys(built.errors).length ? 'Fix the highlighted fields before saving.' : dirty ? `${plural(changes.length, 'change')} not saved.` : 'No changes.'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setDraft(draftFrom(defaults))}>
              Fill in defaults
            </Button>
            <Button disabled={!dirty} onClick={() => setDraft(draftFrom(current))}>
              Discard changes
            </Button>
            <Button variant="primary" disabled={!dirty || !built.rules || !changes.length} onClick={() => setConfirmOpen(true)}>
              Save rules
            </Button>
          </div>
        </div>
      ) : null}
      <ActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save economy rules"
        description="These take effect for everyone within about 10 seconds."
        confirmLabel="Save rules"
        disabled={!built.rules}
        onSubmit={async ({ reason }) => {
          if (!built.rules) return;
          await save.mutateAsync({ rules: built.rules, reason });
        }}
      >
        <div>
          <h3 className="mb-1.5 font-sans text-sm font-semibold text-text">What changes</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {changes.map((c) => (
              <li key={c.label} className="flex flex-wrap gap-x-2">
                <span className="text-text-2">{c.label}:</span>
                <span className="break-all">
                  <span className="text-text-3 line-through">{c.from}</span> <span className="text-text-3">to</span> <span className="font-semibold text-text">{c.to}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ActionDialog>
    </div>
  );
}

/* -------------------------------- currencies --------------------------------- */

interface CurrencyForm {
  code: string;
  kind: string;
  name: string;
  description: string;
  hue: string;
  howToEarn: string;
  howToSpend: string;
  expiresAt: string;
  sort: string;
  active: boolean;
}

function currencyForm(c?: AdminCurrency): CurrencyForm {
  return {
    code: c?.code ?? '',
    kind: c?.kind ?? 'event',
    name: c?.name ?? '',
    description: c?.description ?? '',
    hue: String(c?.hue ?? 200),
    howToEarn: c?.howToEarn ?? '',
    howToSpend: c?.howToSpend ?? '',
    expiresAt: isoToLocalInput(c?.expiresAt),
    sort: String(c?.sort ?? 0),
    active: c?.active ?? true,
  };
}

function CurrenciesTab() {
  const canConfigure = useCan('economy.configure');
  const q = useAdminCurrencies();
  const [editing, setEditing] = useState<AdminCurrency | null>(null);
  const [creating, setCreating] = useState(false);
  const cols: Column<AdminCurrency>[] = [
    {
      key: 'name',
      header: 'Currency',
      cell: (c) => (
        <div className="flex min-w-0 items-start gap-2.5">
          <CurrencyIcon code={c.code} size={22} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              {c.name}
              {c.core ? <Badge>Core</Badge> : null}
            </div>
            <div className="font-mono text-xs text-text-3">{c.code}</div>
            <div className="mt-0.5 max-w-[34ch] text-xs text-text-2">{c.description}</div>
          </div>
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', cell: (c) => KIND_INFO[c.kind]?.label ?? c.kind },
    { key: 'status', header: 'Status', cell: (c) => <StatusPill status={c.active ? 'active' : 'retired'} label={c.active ? 'On' : 'Switched off'} /> },
    { key: 'expires', header: 'Expires', cell: (c) => (c.expiresAt ? <span className="whitespace-nowrap">{dateTime(c.expiresAt)}</span> : <span className="text-text-3">Never</span>) },
    { key: 'listings', header: 'Priced listings', align: 'right', cell: (c) => formatNumber(c.listings) },
    { key: 'sort', header: 'Order', align: 'right', cell: (c) => c.sort },
    ...(canConfigure
      ? [
          {
            key: 'edit',
            header: 'Actions',
            align: 'right' as const,
            cell: (c: AdminCurrency) => (
              <Button size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-text-2">
          Sparks, Moonstones and Glow Dust are core currencies and cannot be switched off. Priced listings counts the active shop listings sold for each currency.
          {!canConfigure ? ' Creating and editing currencies needs the economy configuration permission.' : ''}
        </p>
        {canConfigure ? (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Create currency
          </Button>
        ) : null}
      </div>
      <DataTable columns={cols} rows={q.data?.currencies} rowKey={(c) => c.code} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty="No currencies yet." minWidth={760} caption="Currencies" />
      <CurrencyDialog open={creating} onOpenChange={setCreating} />
      <CurrencyDialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} currency={editing ?? undefined} key={editing?.code ?? 'none'} />
    </div>
  );
}

function CurrencyDialog({ open, onOpenChange, currency }: { open: boolean; onOpenChange: (v: boolean) => void; currency?: AdminCurrency }) {
  const [f, setF] = useState<CurrencyForm>(() => currencyForm(currency));
  useEffect(() => {
    if (open) setF(currencyForm(currency));
  }, [open, currency]);
  const create = useStaffMutation((body: Record<string, unknown>) => api.post('/api/admin/currencies', body), { silentError: true, success: (_r, b) => `Created ${String(b.name)}.`, invalidate: [['admin', 'currencies'], ['admin', 'economy']] });
  const update = useStaffMutation((body: Record<string, unknown>) => api.patch(`/api/admin/currencies/${currency?.code}`, body), {
    silentError: true,
    success: (_r, b) => (b.active === false ? `Switched off ${currency?.name ?? 'the currency'}.` : b.active === true ? `Switched ${currency?.name ?? 'the currency'} back on.` : `Saved ${currency?.name ?? 'the currency'}.`),
    invalidate: [['admin', 'currencies'], ['admin', 'economy'], ['admin', 'events']],
  });
  const set = <K extends keyof CurrencyForm>(k: K, v: CurrencyForm[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const errors: Partial<Record<keyof CurrencyForm, string>> = {};
  if (!currency && !/^[a-z][a-z0-9_]{1,31}$/.test(f.code)) errors.code = '2 to 32 characters: lowercase letters, digits and underscores, starting with a letter.';
  if (f.name.trim().length < 2 || f.name.trim().length > 32) errors.name = 'Use 2 to 32 characters.';
  for (const k of ['description', 'howToEarn', 'howToSpend'] as const) if (!f[k].trim() || f[k].trim().length > 200) errors[k] = 'Use 1 to 200 characters.';
  const hue = parseWhole(f.hue, 0, 359);
  if (hue === null) errors.hue = wholeError(0, 359);
  const sort = parseWhole(f.sort, -1000, 1000);
  if (sort === null) errors.sort = wholeError(-1000, 1000);
  const valid = Object.keys(errors).length === 0;

  const patch: Record<string, unknown> = {};
  if (currency && valid) {
    if (f.name.trim() !== currency.name) patch.name = f.name.trim();
    if (f.description.trim() !== currency.description) patch.description = f.description.trim();
    if (f.howToEarn.trim() !== currency.howToEarn) patch.howToEarn = f.howToEarn.trim();
    if (f.howToSpend.trim() !== currency.howToSpend) patch.howToSpend = f.howToSpend.trim();
    if (hue !== currency.hue) patch.hue = hue;
    if (sort !== currency.sort) patch.sort = sort;
    if (f.expiresAt !== isoToLocalInput(currency.expiresAt)) patch.expiresAt = localInputToIso(f.expiresAt);
    if (f.active !== currency.active) patch.active = f.active;
  }
  const switchingOff = Boolean(currency?.active && !f.active);
  const nothing = Boolean(currency) && Object.keys(patch).length === 0;
  const text = (k: 'name' | 'description' | 'howToEarn' | 'howToSpend', label: string, hint?: string, long = false) => (
    <Field label={label} error={errors[k] && f[k] !== (currency?.[k] ?? '') ? errors[k] : undefined} hint={hint}>
      {(p) => (long ? <Textarea {...p} rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} maxLength={200} /> : <Input {...p} value={f[k]} onChange={(e) => set(k, e.target.value)} maxLength={k === 'name' ? 32 : 200} />)}
    </Field>
  );
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={currency ? `Edit ${currency.name}` : 'Create a currency'}
      description={currency ? <span className="font-mono">{currency.code}</span> : 'New currencies start with every balance at zero. Event currencies usually get their expiry from their event.'}
      confirmWord={switchingOff ? currency!.code : null}
      confirmLabel={currency ? (switchingOff ? (Object.keys(patch).length > 1 ? `Save and switch off ${currency.name}` : `Switch off ${currency.name}`) : 'Save currency') : 'Create currency'}
      variant={switchingOff ? 'danger' : 'primary'}
      disabled={!valid || nothing}
      onSubmit={async ({ reason, confirm }) => {
        if (currency) {
          await update.mutateAsync({ ...patch, reason, ...(confirm !== undefined ? { confirm } : {}) });
        } else {
          await create.mutateAsync({
            code: f.code,
            kind: f.kind,
            name: f.name.trim(),
            description: f.description.trim(),
            hue,
            howToEarn: f.howToEarn.trim(),
            howToSpend: f.howToSpend.trim(),
            expiresAt: localInputToIso(f.expiresAt),
            sort,
            reason,
          });
        }
      }}
    >
      {!currency ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code" error={f.code && errors.code ? errors.code : undefined} hint="Permanent. Lowercase, for example spring_tokens.">
            {(p) => <Input {...p} value={f.code} onChange={(e) => set('code', e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} maxLength={32} />}
          </Field>
          <Field label="Kind" hint={KIND_INFO[f.kind]?.description}>
            {(p) => (
              <Select {...p} value={f.kind} onChange={(e) => set('kind', e.target.value)}>
                {CURRENCY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_INFO[k]?.label ?? k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ) : null}
      {text('name', 'Name', 'What players see, for example Frost Tickets.')}
      {text('description', 'Description', undefined, true)}
      {text('howToEarn', 'How to earn it', 'Shown to players in the currency guide.', true)}
      {text('howToSpend', 'How to spend it', 'Shown to players in the currency guide.', true)}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Hue" error={errors.hue} hint="0 to 359 on the colour wheel.">
          {(p) => (
            <div className="flex items-center gap-2">
              <Input {...p} inputMode="numeric" value={f.hue} onChange={(e) => set('hue', e.target.value)} className="min-w-0 flex-1" />
              <span className="size-9 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]" style={{ background: `hsl(${hue ?? 0} 80% 60%)` }} aria-hidden />
            </div>
          )}
        </Field>
        <Field label="Order" error={errors.sort} hint="Lower numbers are listed first.">
          {(p) => <Input {...p} inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value)} />}
        </Field>
      </div>
      <DateTimeField label="Expires" value={f.expiresAt} onChange={(v) => set('expiresAt', v)} clearable hint={f.kind === 'event' ? 'After this it can no longer be spent. Moving an event window on the Events page sets this for you.' : 'Leave empty for no expiry. After it, the currency can no longer be spent.'} />
      {currency ? (
        <Switch
          checked={f.active}
          onCheckedChange={(v) => set('active', v)}
          disabled={currency.core}
          label="Switched on"
          description={currency.core ? 'Sparks, Moonstones and Dust are always on.' : 'Switching off stops anyone spending it. You will type the code to confirm.'}
        />
      ) : null}
      <NoChangesNote show={nothing} />
    </ActionDialog>
  );
}

/* --------------------------------- grants ------------------------------------ */

function GrantTab() {
  const [params, patch] = useQueryParams();
  const canGrant = useCan('economy.grant');
  const canUsers = useCan('users.read');
  const canTest = useCan('testing.tools');
  const { choices } = useCurrencyChoices();
  const accountId = params.get('account') ?? '';
  const [picked, setPicked] = useState<StaffUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [direction, setDirection] = useState<'grant' | 'revoke'>('grant');
  const openDialog = (d: 'grant' | 'revoke') => {
    setDirection(d);
    setDialogOpen(true);
  };
  const wallet = useQuery({ queryKey: ['admin', 'wallet', accountId], queryFn: () => api.get<Wallet>(`/api/admin/users/${accountId}/wallet`), enabled: Boolean(accountId), retry: false });
  const recent = useQuery({
    queryKey: ['admin', 'economy', 'ledger', { userId: accountId, recent: true }],
    queryFn: () => api.get<LedgerPage>(`/api/admin/economy/ledger?userId=${accountId}`),
    enabled: Boolean(accountId),
  });
  const w = wallet.data;
  const name = picked?.id === accountId ? accountName(picked) : (w?.confirmWord ?? 'this account');
  const codes = [...new Set([...choices.map((c) => c.code), ...Object.keys(w?.balances ?? {})])];
  const target: MovementTarget | null = w ? { id: w.userId, name, isTest: w.isTestAccount, confirmWord: w.isTestAccount ? null : w.confirmWord, balances: w.balances } : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title="Account">
          <AccountSearch
            selectedId={accountId}
            onPick={(id, u) => {
              setPicked(u ?? null);
              patch({ account: id });
            }}
          />
          {!canGrant ? <p className="mt-3 text-xs text-text-3">You can look at wallets. Granting and removing needs the economy grant permission.</p> : null}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {!accountId ? (
            <EmptyState title="No account chosen">Search for an account to see its balances{canGrant ? ' and grant or remove currency or items' : ''}.</EmptyState>
          ) : wallet.isError ? (
            <ErrorNotice title="That account did not load" message={wallet.error instanceof Error ? wallet.error.message : 'Try again.'} onRetry={() => void wallet.refetch()} />
          ) : !w ? (
            <Skeleton className="h-56" />
          ) : (
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {name}
                  {w.isTestAccount ? <Badge tone="sky">Test account</Badge> : <Badge>Player account</Badge>}
                </span>
              }
              actions={
                canUsers ? (
                  <ButtonLink to={`/staff/users/${w.userId}`} size="sm" variant="ghost">
                    Open player page
                  </ButtonLink>
                ) : null
              }
            >
              {picked?.id === accountId ? <p className="-mt-2 mb-3 text-sm text-text-3">{picked.displayName}</p> : null}
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Balances">
                {codes.map((code) => (
                  <li key={code} className="flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-text-2">{currencyName(choices, code)}</span>
                    <Amount currency={code} value={w.balances[code] ?? 0} size="sm" />
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                {w.isTestAccount ? (
                  <p className="text-xs text-text-3">
                  Test account: up to {formatNumber(TEST_GRANT_MAX)} in one change, no typed confirmation.{' '}
                  {canTest ? (
                    <Link to={`/staff/testing?account=${w.userId}`} className="font-semibold text-link underline-offset-2 hover:underline">
                      Open it in the testing tools
                    </Link>
                  ) : null}
                </p>
                ) : (
                  <RealCapsNote choices={choices} />
                )}
              </div>
              {w.self ? (
                <p className="mt-3 rounded-[var(--radius-m)] border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-text-2" role="note">
                  This is your own account. Staff tools cannot change your own balance or items. Use a test account instead.
                </p>
              ) : canGrant ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openDialog('grant')}>
                    Grant currency or an item
                  </Button>
                  <Button variant="secondary" onClick={() => openDialog('revoke')}>
                    Remove currency or an item
                  </Button>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      </div>
      {accountId && w ? (
        <Card
          title="Recent ledger entries"
          actions={
            <ButtonLink to={`/staff/economy?tab=ledger&userId=${accountId}`} size="sm" variant="ghost">
              Full ledger
            </ButtonLink>
          }
        >
          <DataTable
            columns={[
              { key: 'time', header: 'Time', cell: (r: LedgerEntry) => <span className="whitespace-nowrap text-text-2">{dateTime(r.createdAt)}</span> },
              {
                key: 'change',
                header: 'Change',
                align: 'right',
                cell: (r: LedgerEntry) => (
                  <span className={`inline-flex items-center gap-1 font-semibold ${r.delta > 0 ? 'text-glim' : r.delta < 0 ? 'text-ember' : 'text-text-3'}`}>
                    <CurrencyIcon code={r.currency} size={14} />
                    {r.delta > 0 ? '+' : r.delta < 0 ? '-' : ''}
                    {formatNumber(Math.abs(r.delta))}
                  </span>
                ),
              },
              { key: 'after', header: 'Balance after', align: 'right', cell: (r: LedgerEntry) => formatNumber(r.balanceAfter) },
              { key: 'reason', header: 'Reason', cell: (r: LedgerEntry) => reasonLabel(r.reason) },
              { key: 'actor', header: 'Staff', cell: (r: LedgerEntry) => r.actor ?? <span className="text-text-3">-</span> },
            ]}
            rows={recent.data?.entries.slice(0, 10)}
            rowKey={(r) => r.id}
            loading={recent.isLoading}
            error={recent.error}
            onRetry={() => void recent.refetch()}
            empty="No balance changes yet."
            minWidth={520}
            caption="This account's latest ledger entries"
          />
        </Card>
      ) : null}
      {target ? <MovementDialog open={dialogOpen} onOpenChange={setDialogOpen} direction={direction} target={target} mode="staff" /> : null}
    </div>
  );
}
