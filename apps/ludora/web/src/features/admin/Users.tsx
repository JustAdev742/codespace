import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { ROLE_INFO, ROLES, type Role } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { timeAgo } from '../../lib/format.ts';
import { Badge, Input, Select } from '../../ui/primitives.tsx';
import { DataTable, Pager, StaffPage, StatusPill, useDebounced, type Column } from './ui.tsx';

export interface StaffUser {
  id: string;
  username: string | null;
  displayName: string;
  isGuest: boolean;
  accountType: 'player' | 'student' | 'teacher';
  ageBand: string | null;
  isTestAccount: boolean;
  status: 'active' | 'suspended' | 'banned';
  level: number;
  roles: Role[];
  createdAt: string;
  lastSeenAt: string | null;
}

export function AccountBadges({ u }: { u: Pick<StaffUser, 'isGuest' | 'isTestAccount' | 'roles' | 'accountType' | 'ageBand'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {u.isTestAccount ? <Badge tone="amber">Test account</Badge> : null}
      {u.isGuest ? <Badge>Guest</Badge> : null}
      {u.accountType === 'teacher' ? <Badge tone="sky">Teacher</Badge> : null}
      {u.ageBand === 'under13' ? <Badge tone="coral">Under 13</Badge> : null}
      {u.roles.map((r) => (
        <Badge key={r} tone="violet">
          {ROLE_INFO[r]?.label ?? r}
        </Badge>
      ))}
    </span>
  );
}

export default function Users() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim());
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const kind = params.get('kind') ?? '';
  const offset = Number(params.get('offset') ?? 0) || 0;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'offset') next.delete('offset');
    setParams(next, { replace: true });
  };
  const query = new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}), ...(kind ? { kind } : {}), offset: String(offset) });
  const list = useQuery({
    queryKey: ['admin', 'users', query.toString()],
    queryFn: () => api.get<{ users: StaffUser[]; total: number; offset: number; pageSize: number }>(`/api/admin/users?${query}`),
    placeholderData: (prev) => prev,
  });

  const columns: Column<StaffUser>[] = [
    {
      key: 'name',
      header: 'Account',
      cell: (u) => (
        <div className="min-w-0">
          <Link to={`/staff/users/${u.id}`} className="font-semibold text-text hover:underline" onClick={(e) => e.stopPropagation()}>
            {u.displayName}
          </Link>
          <div className="text-xs text-text-3">{u.username ? `@${u.username}` : 'Guest'}</div>
        </div>
      ),
    },
    { key: 'badges', header: 'Type and roles', cell: (u) => <AccountBadges u={u} /> },
    { key: 'status', header: 'Status', cell: (u) => <StatusPill status={u.status} /> },
    { key: 'level', header: 'Level', align: 'right', cell: (u) => u.level },
    { key: 'created', header: 'Joined', cell: (u) => <span title={u.createdAt}>{timeAgo(u.createdAt)}</span> },
    { key: 'seen', header: 'Last seen', cell: (u) => (u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'Never') },
  ];

  return (
    <StaffPage title="Players" description="Find an account by username, display name, friend code or account id. Open one to see its history and act on it.">
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Search accounts</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              set('q', e.target.value.trim());
            }}
            placeholder="Username, name, friend code or id"
            className="pl-9"
          />
        </label>
        <Select aria-label="Role" value={role} onChange={(e) => set('role', e.target.value)}>
          <option value="">Any role</option>
          {ROLES.filter((r) => r !== 'player').map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </Select>
        <Select aria-label="Account kind" value={kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="">All accounts</option>
          <option value="registered">Registered</option>
          <option value="guest">Guests</option>
          <option value="test">Test accounts</option>
        </Select>
      </div>
      <DataTable
        caption="Accounts"
        columns={columns}
        rows={list.data?.users}
        rowKey={(u) => u.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(u) => navigate(`/staff/users/${u.id}`)}
        empty={q ? `No accounts match "${q}".` : 'No accounts match these filters.'}
      />
      {list.data ? <Pager offset={list.data.offset} pageSize={list.data.pageSize} total={list.data.total} onChange={(o) => set('offset', String(o))} /> : null}
    </StaffPage>
  );
}
