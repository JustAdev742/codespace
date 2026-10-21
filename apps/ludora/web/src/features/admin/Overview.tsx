import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS, ROLE_INFO, type Permission, type Role } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, timeAgo } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import { Badge, Skeleton } from '../../ui/primitives.tsx';
import { Card, StaffPage, Stat } from './ui.tsx';
import { SECTIONS } from './StaffApp.tsx';

interface SystemSnapshot {
  realtime: { rooms: number; running: number; players: number };
  accounts: { registered: number; activeLastDay: number };
  gamesLastDay: number;
  errorsLastDay: Record<string, number>;
  database: { latencyMs: number };
}

interface AuditRow {
  id: number;
  actorName: string;
  action: string;
  targetName: string | null;
  targetType: string | null;
  reason: string | null;
  createdAt: string;
}

const PERMISSION_TEXT: Record<Permission, string> = {
  'sets.create': 'Make question sets',
  'sets.publish_public': 'Publish sets to the public library',
  'rooms.host': 'Host games',
  'staff.access': 'Open the staff area',
  'users.read': 'Look up accounts',
  'users.moderate': 'Warn, mute, suspend and ban players',
  'users.edit': 'Help with sign-in (recovery codes, sign out, unlock)',
  'roles.assign': 'Give and remove roles below your own',
  'reports.handle': 'Work through player reports',
  'rooms.manage': 'See and close live rooms',
  'modes.manage': 'Publish, feature and hide game modes',
  'content.moderate': 'Review, hide and feature question sets',
  'catalog.manage': 'Edit items, collections and Lanterns',
  'shop.manage': 'Edit shop listings',
  'economy.view': 'See the economy and transaction history',
  'economy.configure': 'Change economy rules and currencies',
  'economy.grant': 'Give or take currency and items (capped and audited)',
  'events.manage': 'Run limited-time events',
  'flags.manage': 'Change feature flags',
  'system.view': 'See system health and error reports',
  'audit.read': 'Read the audit log',
  'testing.tools': 'Use test accounts and QA tools',
  'testing.entitlements': 'Grant test entitlements in production and convert accounts',
};

export default function Overview() {
  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const reports = useQuery({
    queryKey: ['admin', 'reports', 'summary'],
    queryFn: () => api.get<{ total: number; open: Record<string, number> }>('/api/admin/reports?status=open'),
    enabled: perms.has('reports.handle'),
  });
  const system = useQuery({ queryKey: ['admin', 'system'], queryFn: () => api.get<SystemSnapshot>('/api/admin/system'), enabled: perms.has('system.view'), refetchInterval: 30_000 });
  const audit = useQuery({ queryKey: ['admin', 'audit', 'recent'], queryFn: () => api.get<{ entries: AuditRow[] }>('/api/admin/audit'), enabled: perms.has('audit.read') });
  const roles = (me.data?.roles ?? []) as Role[];
  const errors = system.data ? Object.values(system.data.errorsLastDay).reduce((n, v) => n + v, 0) : 0;
  const areas = SECTIONS.filter((s) => s.path && perms.has(s.permission));

  return (
    <StaffPage title="Staff overview" description="What needs attention, and what your role lets you do.">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {perms.has('reports.handle') ? (
          <Link to="/staff/reports" className="block rounded-[var(--radius-m)] focus-visible:outline-2">
            <Stat label="Open reports" value={reports.data ? formatNumber(reports.data.total) : '-'} hint={reports.data ? Object.entries(reports.data.open).map(([k, v]) => `${v} ${k}`).join(', ') || 'Queue is clear' : undefined} />
          </Link>
        ) : null}
        {system.data ? (
          <>
            <Link to="/staff/rooms" className="block rounded-[var(--radius-m)]">
              <Stat label="Live rooms" value={formatNumber(system.data.realtime.rooms)} hint={`${system.data.realtime.running} running, ${system.data.realtime.players} players`} />
            </Link>
            <Stat label="Games in the last day" value={formatNumber(system.data.gamesLastDay)} hint={`${formatNumber(system.data.accounts.activeLastDay)} accounts active`} />
            <Link to="/staff/system" className="block rounded-[var(--radius-m)]">
              <Stat label="Errors in the last day" value={formatNumber(errors)} hint={`Database ${system.data.database.latencyMs} ms`} />
            </Link>
          </>
        ) : perms.has('system.view') ? (
          <Skeleton className="col-span-3 h-20" />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Your tools">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {areas.map((s) => (
                <li key={s.path}>
                  <Link to={`/staff/${s.path}`} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-sm font-semibold text-text hover:bg-surface-2">
                    <span className="text-text-3">{s.icon}</span>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {perms.has('audit.read') ? (
            <Card title="Recent staff actions" actions={<Link to="/staff/audit" className="text-sm font-semibold text-link">Audit log</Link>}>
              {audit.isLoading ? (
                <Skeleton className="h-40" />
              ) : audit.data?.entries.length ? (
                <ol className="flex flex-col divide-y divide-line text-sm">
                  {audit.data.entries.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                      <span className="min-w-0">
                        <span className="font-semibold">{e.actorName}</span> <code className="text-xs text-text-2">{e.action}</code>
                        {e.targetName ? <span className="text-text-2"> on {e.targetName}</span> : null}
                        {e.reason ? <span className="block truncate text-xs text-text-3">{e.reason}</span> : null}
                      </span>
                      <span className="text-xs text-text-3">{timeAgo(e.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-2">No staff actions yet.</p>
              )}
            </Card>
          ) : null}
        </div>
        <Card title="Your access">
          <div className="mb-3 flex flex-wrap gap-1">
            {roles.length ? roles.map((r) => <Badge key={r} tone="violet">{ROLE_INFO[r]?.label ?? r}</Badge>) : <Badge>Player</Badge>}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-text-2">
            {PERMISSIONS.filter((p) => perms.has(p) && !['sets.create', 'rooms.host', 'staff.access'].includes(p)).map((p) => (
              <li key={p}>{PERMISSION_TEXT[p]}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-3">Roles are given by an administrator above you. Everything you change here is recorded with your name and reason.</p>
        </Card>
      </div>
    </StaffPage>
  );
}
