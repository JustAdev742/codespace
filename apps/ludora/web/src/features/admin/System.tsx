import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber, timeAgo } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Badge, EmptyState, ErrorNotice, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Card, OlderButton, StaffPage, Stat, dateTime } from './ui.tsx';

/*
 * System health for this server process, refreshed every 15 seconds, and the
 * error reports the server, the game server and browsers send in.
 */

interface SystemHealth {
  environment: string;
  version: string;
  node: string;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number };
  database: { ok: boolean; latencyMs: number; sizeMb: number; pool: { total: number; idle: number; waiting: number } };
  realtime: { rooms: number; running: number; players: number; sockets: number | null };
  accounts: { registered: number; guests: number; test: number; activeLastDay: number };
  gamesLastDay: number;
  errorsLastDay: Record<string, number>;
  features: { aiQuestionDrafts: boolean; email: boolean };
}

type Source = 'server' | 'client' | 'realtime';

interface ErrorReport {
  id: number;
  source: Source;
  message: string;
  stack: string | null;
  context: unknown;
  userId: string | null;
  createdAt: string;
}

const REFRESH_MS = 15_000;

const ENVIRONMENTS: Record<string, string> = { production: 'Production', sandbox: 'Sandbox', development: 'Development', test: 'Test' };

const SOURCES: Record<Source, { label: string; tone: 'coral' | 'amber' | 'sky' }> = {
  server: { label: 'Server', tone: 'coral' },
  client: { label: 'Browser', tone: 'amber' },
  realtime: { label: 'Game server', tone: 'sky' },
};

function uptimeText(s: number): string {
  const days = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (days) return `${days} ${days === 1 ? 'day' : 'days'} ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-2 font-display text-lg leading-tight font-bold text-text">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function FeatureStat({ label, on, needs }: { label: string; on: boolean; needs: string }) {
  return (
    <Stat
      label={label}
      value={
        <span className="flex items-center gap-1.5 text-lg break-words">
          {on ? <Check className="size-5 text-glim" aria-hidden /> : <X className="size-5 text-text-3" aria-hidden />}
          {on ? 'Configured' : 'Not configured'}
        </span>
      }
      hint={on ? 'Ready to use' : `Needs ${needs} on the server`}
    />
  );
}

export default function System() {
  const system = useQuery({ queryKey: ['admin', 'system'], queryFn: () => api.get<SystemHealth>('/api/admin/system'), refetchInterval: REFRESH_MS });
  const s = system.data;
  const errorsTotal = s ? Object.values(s.errorsLastDay).reduce((n, v) => n + v, 0) : 0;
  const errorsBySource = s
    ? (Object.keys(SOURCES) as Source[])
        .filter((k) => s.errorsLastDay[k])
        .map((k) => `${formatNumber(s.errorsLastDay[k] ?? 0)} ${SOURCES[k].label.toLowerCase()}`)
        .join(', ')
    : '';

  return (
    <StaffPage
      title="System health"
      description="How this server is doing, and the latest error reports. The figures refresh every 15 seconds."
      actions={
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 text-xs text-text-3">
            <span className={`size-2 rounded-full ${system.error ? 'bg-ember' : 'bg-glim'}`} aria-hidden />
            {system.dataUpdatedAt ? `Checked ${clock(system.dataUpdatedAt)}` : 'Checking'}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void system.refetch()} loading={system.isFetching && !system.isLoading}>
            Check now
          </Button>
        </div>
      }
    >
      {system.error && s ? (
        <p role="status" className="mb-4 rounded-[var(--radius-m)] border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-text">
          The latest check failed, so these figures are from {clock(system.dataUpdatedAt)}.
        </p>
      ) : null}
      {system.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[84px]" />
          ))}
        </div>
      ) : !s ? (
        <ErrorNotice message="System health could not be loaded." onRetry={() => void system.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <Section title="Server">
            <Stat label="Environment" value={<span className="text-xl break-words">{ENVIRONMENTS[s.environment] ?? s.environment}</span>} />
            <Stat label="Version" value={s.version} hint={`Node.js ${s.node}`} />
            <Stat label="Up for" value={uptimeText(s.uptimeSeconds)} hint={`Since ${dateTime(new Date(system.dataUpdatedAt - s.uptimeSeconds * 1000).toISOString())}`} />
            <Stat label="Memory" value={`${formatNumber(s.memory.rssMb)} MB`} hint={`${formatNumber(s.memory.heapUsedMb)} MB of heap in use`} />
          </Section>
          <Section title="Database">
            <Stat label="Response time" value={`${s.database.latencyMs} ms`} hint={s.database.ok ? 'Answering' : 'Not answering'} />
            <Stat label="Size" value={`${formatNumber(s.database.sizeMb)} MB`} />
            <Stat label="Connections" value={formatNumber(s.database.pool.total)} hint={`${formatNumber(s.database.pool.idle)} idle, ${formatNumber(s.database.pool.waiting)} waiting`} />
          </Section>
          <Section title="Game server">
            <Stat label="Live rooms" value={formatNumber(s.realtime.rooms)} hint={`${formatNumber(s.realtime.running)} with a game running`} />
            <Stat label="Players in rooms" value={formatNumber(s.realtime.players)} hint="Bots included" />
            <Stat label="Open connections" value={s.realtime.sockets === null ? 'Off' : formatNumber(s.realtime.sockets)} hint={s.realtime.sockets === null ? 'Realtime server not running' : 'Hosts and players together'} />
          </Section>
          <Section title="Accounts">
            <Stat label="Registered" value={formatNumber(s.accounts.registered)} />
            <Stat label="Guests" value={formatNumber(s.accounts.guests)} />
            <Stat label="Test accounts" value={formatNumber(s.accounts.test)} />
            <Stat label="Active in the last day" value={formatNumber(s.accounts.activeLastDay)} />
          </Section>
          <Section title="Last 24 hours">
            <Stat label="Games finished" value={formatNumber(s.gamesLastDay)} />
            <Stat label="Errors reported" value={formatNumber(errorsTotal)} hint={errorsBySource || undefined} />
          </Section>
          <Section title="Optional features">
            <FeatureStat label="AI question drafts" on={s.features.aiQuestionDrafts} needs="ANTHROPIC_API_KEY" />
            <FeatureStat label="Email" on={s.features.email} needs="SMTP_URL" />
          </Section>
        </div>
      )}

      <ErrorReports />
    </StaffPage>
  );
}

function contextSummary(e: ErrorReport): string | null {
  const c = e.context && typeof e.context === 'object' ? (e.context as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  if (e.source === 'server' && str(c.route)) return `${str(c.method) ?? ''} ${str(c.route)}`.trim();
  if (e.source === 'client' && str(c.url)) return `On ${str(c.url)}`;
  if (e.source === 'realtime' && str(c.room)) return `Room ${str(c.room)}${str(c.mode) ? `, mode ${str(c.mode)}` : ''}`;
  return null;
}

function ErrorReports() {
  const [source, setSource] = useState<Source | 'all'>('all');
  const canUsers = useCan('users.read');
  const errors = useInfiniteQuery({
    queryKey: ['admin', 'errors', source],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ ...(source !== 'all' ? { source } : {}), ...(pageParam ? { before: String(pageParam) } : {}) });
      return api.get<{ errors: ErrorReport[]; nextBefore: number | null }>(`/api/admin/errors${q.size ? `?${q}` : ''}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = errors.data?.pages.flatMap((p) => p.errors);
  const next = errors.data?.pages.at(-1)?.nextBefore;

  return (
    <Card title="Error reports" className="mt-6">
      <Tabs
        value={source}
        onValueChange={(v) => setSource(v as Source | 'all')}
        label="Where the error came from"
        items={[{ value: 'all', label: 'All' }, ...(Object.keys(SOURCES) as Source[]).map((k) => ({ value: k, label: SOURCES[k].label }))]}
      >
        <TabPanel value={source} className="focus-visible:outline-none">
          {errors.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : errors.error && !items ? (
            <ErrorNotice message="Error reports could not be loaded." onRetry={() => void errors.refetch()} />
          ) : !items?.length ? (
            <EmptyState title="No error reports">{source === 'all' ? 'Nothing has been reported. New reports appear here, newest first.' : `Nothing has been reported from the ${SOURCES[source].label.toLowerCase()}.`}</EmptyState>
          ) : (
            <>
              <ol className="flex flex-col divide-y divide-line">
                {items.map((e) => {
                  const summary = contextSummary(e);
                  return (
                    <li key={e.id} className="min-w-0 py-3 first:pt-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-3">
                        <Badge tone={SOURCES[e.source]?.tone ?? 'neutral'}>{SOURCES[e.source]?.label ?? e.source}</Badge>
                        <time dateTime={e.createdAt} title={dateTime(e.createdAt)}>
                          {timeAgo(e.createdAt)}
                        </time>
                        <span>Report {e.id}</span>
                        {e.userId ? (
                          canUsers ? (
                            <Link to={`/staff/users/${e.userId}`} className="font-semibold text-link">
                              Signed-in account
                            </Link>
                          ) : (
                            <span>Signed-in account</span>
                          )
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-[13px] break-words whitespace-pre-wrap text-text">{e.message}</p>
                      {summary ? <p className="mt-0.5 font-mono text-xs break-all text-text-3">{summary}</p> : null}
                      {e.stack || e.context ? (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-sm font-semibold text-link">{e.stack ? 'Stack trace and details' : 'Details'}</summary>
                          {e.stack ? <pre className="mt-2 max-h-80 overflow-auto rounded-[var(--radius-m)] bg-sunken p-3 font-mono text-xs leading-relaxed text-text-2">{e.stack}</pre> : null}
                          {e.context ? <pre className="mt-2 max-h-48 overflow-auto rounded-[var(--radius-m)] bg-sunken p-3 font-mono text-xs leading-relaxed text-text-2">{JSON.stringify(e.context, null, 2)}</pre> : null}
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <OlderButton next={next} onLoad={() => void errors.fetchNextPage()} loading={errors.isFetchingNextPage} />
            </>
          )}
        </TabPanel>
      </Tabs>
    </Card>
  );
}
