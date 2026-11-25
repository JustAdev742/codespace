import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { Badge, ErrorNotice, Field, Input } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, StaffPage, dateTime } from './ui.tsx';

/*
 * The super administrator's clean-up (admin/cleanup.ts on the server): bring every balance above an
 * amount down to it, and find and remove junk accounts. Both show exactly who they will change; the
 * change needs a reason and the number of accounts typed back. Staff and test accounts never appear.
 */

interface CapPreview {
  currency: string;
  cap: number;
  count: number;
  removed: number;
  accounts: { id: string; username: string | null; displayName: string; balance: number }[];
}

interface Suspect {
  id: string;
  username: string | null;
  displayName: string;
  accountType: string;
  status: string;
  createdAt: string;
  lastSeenAt: string | null;
  signs: string[];
  copyOf: { id: string; username: string | null; displayName: string; createdAt: string } | null;
  matchesSearch: boolean;
  games: number;
  sets: number;
  sparks: number;
  reports: number;
  network: number;
}

const whole = (v: string) => /^\d+$/.test(v.trim()) && Number(v) <= 100_000_000;
const nameOf = (a: { username: string | null; displayName: string }) => (a.username ? `@${a.username}` : a.displayName);

function CapBalances() {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<'sparks' | 'moonstones'>('sparks');
  const [cap, setCap] = useState('5000');
  const [asked, setAsked] = useState<{ currency: string; cap: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const preview = useQuery({
    queryKey: ['admin', 'cleanup', 'cap', asked],
    queryFn: () => api.get<CapPreview>(`/api/admin/cleanup/balances?currency=${asked!.currency}&cap=${asked!.cap}`),
    enabled: Boolean(asked),
  });
  const p = preview.data;
  return (
    <Card title="Bring big balances down">
      <p className="mb-3 max-w-[70ch] text-sm text-text-2">Every player holding more than the amount is brought down to it. The difference is taken off through the ledger, so each account's history shows it. Staff and test accounts are left alone.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-44">
          <Field label="Currency">
            {(f) => (
              <select {...f} value={currency} onChange={(e) => setCurrency(e.target.value as 'sparks' | 'moonstones')} className="h-11 w-full rounded-[var(--radius-m)] border border-line bg-surface px-3 text-sm">
                <option value="sparks">Sparks</option>
                <option value="moonstones">Moonstones</option>
              </select>
            )}
          </Field>
        </div>
        <div className="w-full sm:w-44">
          <Field label="Bring down to" error={whole(cap) ? undefined : 'A whole number.'}>
            {(f) => <Input {...f} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />}
          </Field>
        </div>
        <Button disabled={!whole(cap)} loading={preview.isFetching} onClick={() => setAsked({ currency, cap: Number(cap) })}>
          Show who has more
        </Button>
      </div>
      {preview.error ? <div className="mt-3"><ErrorNotice message={preview.error instanceof ApiError ? preview.error.message : 'Could not load the list.'} /></div> : null}
      {p ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            {p.count === 0 ? (
              <>Nobody holds more than {formatNumber(p.cap)} {p.currency}.</>
            ) : (
              <>
                <strong>{formatNumber(p.count)}</strong> {p.count === 1 ? 'account holds' : 'accounts hold'} more than {formatNumber(p.cap)} {p.currency}. Bringing them down takes off {formatNumber(p.removed)} in all.
                {p.count > p.accounts.length ? ` The list shows the ${p.accounts.length} biggest.` : ''}
              </>
            )}
          </p>
          {p.count ? (
            <>
              <DataTable
                caption="Accounts over the amount"
                rows={p.accounts}
                rowKey={(a) => a.id}
                minWidth={420}
                columns={[
                  { key: 'who', header: 'Account', cell: (a) => <Link className="font-semibold underline-offset-2 hover:underline" to={`/staff/users/${a.id}`}>{nameOf(a)}</Link> },
                  { key: 'now', header: 'Has now', align: 'right', cell: (a) => formatNumber(a.balance) },
                  { key: 'off', header: 'Taken off', align: 'right', cell: (a) => formatNumber(a.balance - p.cap) },
                ]}
              />
              <div>
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  Bring {formatNumber(p.count)} {p.count === 1 ? 'account' : 'accounts'} down to {formatNumber(p.cap)}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <ActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={p ? `Bring ${formatNumber(p.count)} accounts down to ${formatNumber(p.cap)} ${p.currency}` : 'Bring balances down'}
        description="This cannot be undone from here: putting a balance back means a grant to each account."
        confirmWord={p ? String(p.count) : null}
        confirmLabel="Bring them down"
        variant="danger"
        onSubmit={async ({ reason }) => {
          if (!p) return;
          const res = await api.post<{ accounts: number; removed: number }>('/api/admin/cleanup/balances', { currency: p.currency, cap: p.cap, reason, confirm: String(p.count) });
          toast.success(`${formatNumber(res.accounts)} accounts brought down to ${formatNumber(p.cap)} ${p.currency}`);
          await qc.invalidateQueries({ queryKey: ['admin', 'cleanup'] });
        }}
      />
    </Card>
  );
}

function JunkAccounts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [like, setLike] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const list = useQuery({ queryKey: ['admin', 'cleanup', 'spam', like], queryFn: () => api.get<{ accounts: Suspect[] }>(`/api/admin/cleanup/spam${like ? `?like=${encodeURIComponent(like)}` : ''}`) });
  const rows = list.data?.accounts;
  const chosen = useMemo(() => (rows ?? []).filter((r) => picked.has(r.id)), [rows, picked]);
  const toggle = (id: string, on: boolean) => setPicked((cur) => {
    const next = new Set(cur);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
  return (
    <Card title="Junk and copied accounts">
      <p className="mb-3 max-w-[70ch] text-sm text-text-2">
        Accounts whose names look like keyboard mashing ("aaa", "sdfghj"), or that copy an older account's name ("singto2", "s1ngt0"). This is a list of signals, not proof: someone called "sam2" may just have found "sam" taken. Check the games, sets and reports before you pick. Nothing is picked until you tick it.
      </p>
      <form
        className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setLike(search.trim());
          setPicked(new Set());
        }}
      >
        <div className="w-full sm:w-72">
          <Field label="Also find names like" hint="For example singto: finds singto2, s1ngt0, siingto.">
            {(f) => <Input {...f} value={search} onChange={(e) => setSearch(e.target.value)} maxLength={40} autoComplete="off" />}
          </Field>
        </div>
        <Button type="submit">Search</Button>
        {like ? (
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setLike(''); setPicked(new Set()); }}>
            Clear search
          </Button>
        ) : null}
      </form>
      <DataTable
        caption="Possible junk accounts"
        rows={rows}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowKey={(r) => r.id}
        empty="No junk-looking accounts found."
        minWidth={880}
        columns={[
          {
            key: 'pick',
            header: <span className="sr-only">Pick</span>,
            cell: (r) => <input type="checkbox" aria-label={`Pick ${nameOf(r)}`} className="size-4 accent-[var(--lantern)]" checked={picked.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />,
          },
          {
            key: 'who',
            header: 'Account',
            cell: (r) => (
              <div className="min-w-0">
                <Link className="font-semibold underline-offset-2 hover:underline" to={`/staff/users/${r.id}`}>{nameOf(r)}</Link>
                {r.username && r.displayName !== r.username ? <span className="block text-xs text-text-3">{r.displayName}</span> : null}
              </div>
            ),
          },
          {
            key: 'why',
            header: 'Why it is listed',
            cell: (r) => (
              <ul className="flex flex-col gap-0.5 text-xs">
                {r.copyOf ? <li>Copies <Link className="underline" to={`/staff/users/${r.copyOf.id}`}>{nameOf(r.copyOf)}</Link>, made {dateTime(r.copyOf.createdAt)}</li> : null}
                {r.signs.map((s) => <li key={s}>Name: {s}</li>)}
                {r.matchesSearch && !r.copyOf && !r.signs.length ? <li>Matches your search</li> : null}
              </ul>
            ),
          },
          { key: 'made', header: 'Made', cell: (r) => dateTime(r.createdAt) },
          { key: 'games', header: 'Games', align: 'right', cell: (r) => formatNumber(r.games) },
          { key: 'sets', header: 'Sets', align: 'right', cell: (r) => formatNumber(r.sets) },
          { key: 'reports', header: 'Reports', align: 'right', cell: (r) => (r.reports ? <Badge tone="coral">{r.reports}</Badge> : '0') },
          { key: 'net', header: 'Same network', align: 'right', cell: (r) => (r.network ? `${r.network} other` : '-') },
          { key: 'status', header: 'Status', cell: (r) => (r.status === 'active' ? 'Active' : <Badge tone="amber">{r.status}</Badge>) },
        ]}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="danger" disabled={!chosen.length} onClick={() => setConfirming(true)}>
          {chosen.length ? `Remove ${chosen.length} picked ${chosen.length === 1 ? 'account' : 'accounts'}` : 'Pick accounts to remove'}
        </Button>
        {rows?.length ? (
          <Button variant="ghost" onClick={() => setPicked(chosen.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
            {chosen.length === rows.length ? 'Untick all' : `Tick all ${rows.length}`}
          </Button>
        ) : null}
      </div>
      <ActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${chosen.length} ${chosen.length === 1 ? 'account' : 'accounts'}`}
        description={
          <>
            They are deleted for good: their sign-in, Sparks, collection, friends and private sets go. Past game scores stay as "Player". The audit log keeps each username and your reason.
            <span className="mt-2 block text-text">{chosen.slice(0, 12).map(nameOf).join(', ')}{chosen.length > 12 ? ` and ${chosen.length - 12} more` : ''}</span>
          </>
        }
        confirmWord={String(chosen.length)}
        confirmLabel="Remove for good"
        variant="danger"
        onSubmit={async ({ reason }) => {
          const res = await api.post<{ removed: number }>('/api/admin/cleanup/remove', { userIds: chosen.map((c) => c.id), reason, confirm: String(chosen.length) });
          toast.success(`${formatNumber(res.removed)} ${res.removed === 1 ? 'account' : 'accounts'} removed`);
          setPicked(new Set());
          await qc.invalidateQueries({ queryKey: ['admin', 'cleanup'] });
        }}
      />
    </Card>
  );
}

export default function Cleanup() {
  return (
    <StaffPage title="Clean-up" description="For super administrators: bring inflated balances down and remove junk accounts. Each change shows exactly who it touches first, needs a reason and the count typed back, and goes in the audit log.">
      <div className="flex flex-col gap-6">
        <CapBalances />
        <JunkAccounts />
      </div>
    </StaffPage>
  );
}
