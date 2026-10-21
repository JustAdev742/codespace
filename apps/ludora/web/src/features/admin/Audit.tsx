import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { ROLE_INFO, type Permission, type Role } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { timeAgo } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import { Badge, EmptyState, ErrorNotice, Input, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Card, OlderButton, StaffPage, dateTime, useDebounced } from './ui.tsx';

/*
 * The audit log: every staff change, who made it, why, and the state
 * before and after. Read-only. Names are stored as they were at the time.
 */

interface AuditEntry {
  id: number;
  actorId: string | null;
  actorName: string;
  actorRoles: string[];
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  environment: string;
  createdAt: string;
}

const ACTION_PREFIXES: { value: string; label: string }[] = [
  { value: 'user.', label: 'Player accounts' },
  { value: 'report.', label: 'Reports' },
  { value: 'set.', label: 'Question sets' },
  { value: 'room.', label: 'Live rooms' },
  { value: 'mode.', label: 'Game modes' },
  { value: 'flag.', label: 'Feature flags' },
  { value: 'economy.', label: 'Economy' },
  { value: 'currency.', label: 'Currencies' },
  { value: 'item.', label: 'Items' },
  { value: 'collection.', label: 'Collections' },
  { value: 'pack.', label: 'Lanterns' },
  { value: 'listing.', label: 'Shop listings' },
  { value: 'event.', label: 'Events' },
  { value: 'testing.', label: 'Testing tools' },
];

const TARGET_LABEL: Record<string, string> = {
  user: 'Player',
  set: 'Question set',
  room: 'Room',
  mode: 'Mode',
  flag: 'Flag',
  item: 'Item',
  collection: 'Collection',
  pack: 'Lantern',
  listing: 'Listing',
  currency: 'Currency',
  economy: 'Economy',
  event: 'Event',
};

/** Where a target can be opened, and the permission that needs. */
function targetLink(type: string | null, id: string | null): { to: string; permission: Permission } | null {
  if (!type || !id) return null;
  switch (type) {
    case 'user':
      return { to: `/staff/users/${id}`, permission: 'users.read' };
    case 'set':
      return { to: `/staff/content?filter=all&set=${encodeURIComponent(id)}`, permission: 'content.moderate' };
    case 'room':
      return { to: `/staff/rooms?room=${encodeURIComponent(id)}`, permission: 'rooms.manage' };
    case 'mode':
      return { to: '/staff/modes', permission: 'modes.manage' };
    case 'flag':
      return { to: '/staff/flags', permission: 'flags.manage' };
    default:
      return null;
  }
}

function actorLabel(name: string): string {
  if (!name.startsWith('system:')) return name;
  const which = name.slice('system:'.length);
  return which === 'cli' ? 'Operator command line' : `System (${which})`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Top-level fields that differ between before and after. */
function changedKeys(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

export default function Audit() {
  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim());
  const action = params.get('action') ?? '';
  const actor = params.get('actor') ?? '';
  const type = params.get('type') ?? '';
  const target = params.get('target') ?? '';
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(action ? { action } : {}),
    ...(actor ? { actorId: actor } : {}),
    ...(type ? { targetType: type } : {}),
    ...(target ? { targetId: target } : {}),
  });
  const log = useInfiniteQuery({
    queryKey: ['admin', 'audit', 'log', query.toString()],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(query);
      if (pageParam) p.set('before', String(pageParam));
      return api.get<{ entries: AuditEntry[]; nextBefore: number | null }>(`/api/admin/audit${p.size ? `?${p}` : ''}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const entries = log.data?.pages.flatMap((p) => p.entries);
  const next = log.data?.pages.at(-1)?.nextBefore;
  const filtered = Boolean(q || action || actor || type || target);
  const actorName = actor ? entries?.find((e) => e.actorId === actor)?.actorName : undefined;
  const targetName = target ? entries?.find((e) => e.targetId === target)?.targetName : undefined;

  return (
    <StaffPage title="Audit log" description="Every change made with staff tools: who made it, why, and what it changed. Select a person or a target in an entry to see only their history.">
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Search the audit log</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              update({ q: e.target.value.trim() || null });
            }}
            placeholder="Search staff names, targets and reasons"
            className="pl-9"
          />
        </label>
        <Select aria-label="Kind of action" value={action} onChange={(e) => update({ action: e.target.value || null })} className="sm:w-64">
          <option value="">Every kind of action</option>
          {ACTION_PREFIXES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} ({p.value})
            </option>
          ))}
        </Select>
      </div>

      {actor || target || filtered ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {actor ? (
            <FilterChip label={`By ${actorName ? actorLabel(actorName) : 'one staff member'}`} onClear={() => update({ actor: null })} />
          ) : null}
          {target ? (
            <FilterChip label={`${TARGET_LABEL[type] ?? type ?? 'Target'} ${targetName ?? target}`} onClear={() => update({ type: null, target: null })} />
          ) : type ? (
            <FilterChip label={`Changes to: ${TARGET_LABEL[type] ?? type}`} onClear={() => update({ type: null })} />
          ) : null}
          {filtered ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear all filters
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        {log.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : log.error && !entries ? (
          <ErrorNotice message="The audit log could not be loaded." onRetry={() => void log.refetch()} />
        ) : !entries?.length ? (
          <EmptyState title={filtered ? 'Nothing matches' : 'No staff actions yet'}>{filtered ? 'No entries match these filters. Try fewer filters or other words.' : 'Changes made with staff tools are recorded here, newest first.'}</EmptyState>
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-line">
              {entries.map((e) => (
                <AuditItem key={e.id} e={e} perms={perms} onActor={(id) => update({ actor: id })} onTarget={(t, id) => update({ type: t, target: id })} />
              ))}
            </ol>
            <OlderButton next={next} onLoad={() => void log.fetchNextPage()} loading={log.isFetchingNextPage} />
          </>
        )}
      </Card>
    </StaffPage>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-lantern bg-surface-2 py-0.5 pr-1 pl-3 font-semibold text-text">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} className="grid size-6 shrink-0 place-items-center rounded-full text-text-3 hover:bg-surface-3 hover:text-text" aria-label={`Remove filter: ${label}`}>
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

function AuditItem({ e, perms, onActor, onTarget }: { e: AuditEntry; perms: Set<Permission>; onActor: (id: string) => void; onTarget: (type: string, id: string) => void }) {
  const link = targetLink(e.targetType, e.targetId);
  const targetText = e.targetType ? `${TARGET_LABEL[e.targetType] ?? e.targetType} ${e.targetName ?? e.targetId ?? ''}`.trim() : null;
  const system = e.actorName.startsWith('system:');
  return (
    <li className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <div className="flex flex-wrap gap-x-2 text-xs text-text-3 sm:block">
        <time dateTime={e.createdAt} className="font-semibold text-text-2">
          {dateTime(e.createdAt)}
        </time>
        <div>{timeAgo(e.createdAt)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {e.actorId ? (
            <button type="button" className="font-semibold text-text hover:underline" title={`Show only actions by ${e.actorName}`} onClick={() => onActor(e.actorId!)}>
              {e.actorName}
            </button>
          ) : (
            <span className="font-semibold text-text">{actorLabel(e.actorName)}</span>
          )}
          {system ? <Badge>System</Badge> : null}
          {e.actorRoles.map((r) => (
            <Badge key={r} tone="violet">
              {ROLE_INFO[r as Role]?.label ?? r}
            </Badge>
          ))}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2">
          <code className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-xs font-semibold break-all text-text">{e.action}</code>
          {targetText ? (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
              <span>on</span>
              {e.targetType && e.targetId ? (
                <button type="button" className="min-w-0 text-left font-semibold break-words text-text hover:underline" title={`Show the history of ${targetText}`} onClick={() => onTarget(e.targetType!, e.targetId!)}>
                  {targetText}
                </button>
              ) : (
                <span className="font-semibold text-text">{targetText}</span>
              )}
              {link && perms.has(link.permission) ? (
                <Link to={link.to} className="inline-grid size-6 place-items-center rounded-[6px] text-link hover:bg-surface-2" aria-label={`Open ${targetText}`} title={`Open ${targetText}`}>
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </span>
          ) : null}
        </div>
        {e.reason ? (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words text-text">
            <span className="text-text-3">Reason: </span>
            {e.reason}
          </p>
        ) : null}
        {e.before != null || e.after != null ? <Changes before={e.before} after={e.after} /> : null}
      </div>
    </li>
  );
}

/** Pretty JSON; top-level fields that changed are highlighted (the summary above also lists them). */
function JsonBlock({ label, value, changed }: { label: string; value: unknown; changed: string[] }) {
  const lines =
    isRecord(value) && changed.length ? (
      <>
        <span className="block">{'{'}</span>
        {Object.entries(value).map(([k, v], i, all) => (
          <span key={k} className={`block ${changed.includes(k) ? '-mx-1 rounded-[4px] bg-lantern/20 px-1 text-text' : ''}`}>
            {`  ${JSON.stringify(k)}: ${(JSON.stringify(v, null, 2) ?? 'null').replace(/\n/g, '\n  ')}${i < all.length - 1 ? ',' : ''}`}
          </span>
        ))}
        <span className="block">{'}'}</span>
      </>
    ) : (
      JSON.stringify(value, null, 2)
    );
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-semibold text-text-3">{label}</div>
      <pre className="max-h-96 overflow-auto rounded-[10px] bg-sunken p-3 font-mono text-xs leading-relaxed text-text-2">{lines}</pre>
    </div>
  );
}

function Changes({ before, after }: { before: unknown; after: unknown }) {
  const both = before != null && after != null;
  const changed = changedKeys(before, after);
  const label = both ? 'Show before and after' : before != null ? 'Show the state before' : 'Show what was saved';
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-sm font-semibold text-link">
        {label}
        {changed.length ? (
          <span className="font-normal text-text-3">
            {' '}
            ({changed.length === 1 ? 'field changed' : 'fields changed'}:{' '}
            {changed.slice(0, 5).map((k, i) => (
              <span key={k}>
                {i ? ', ' : ''}
                <code className="font-mono text-xs">{k}</code>
              </span>
            ))}
            {changed.length > 5 ? ` and ${changed.length - 5} more` : ''})
          </span>
        ) : null}
      </summary>
      <div className={`mt-2 grid grid-cols-1 gap-2 ${both ? 'lg:grid-cols-2' : ''}`}>
        {before != null ? <JsonBlock label="Before" value={before} changed={changed} /> : null}
        {after != null ? <JsonBlock label="After" value={after} changed={changed} /> : null}
      </div>
    </details>
  );
}
