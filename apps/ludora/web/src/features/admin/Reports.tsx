import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LibraryBig, Radio, UserRound } from 'lucide-react';
import { REPORT_REASON_INFO, REPORT_TARGETS, type ReportReason, type ReportTarget } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, plural, timeAgo } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Badge, EmptyState, ErrorNotice, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ActionDialog, Pager, StaffPage, StatusPill, dateTime, useStaffMutation } from './ui.tsx';
import { SetReviewDialog } from './Content.tsx';

/*
 * The report queue. Moderators act on the player (player page) or the set
 * (set review) first, then record the outcome here. Open reports are oldest
 * first so nothing waits forever; resolved ones are newest first.
 */

type Outcome = 'dismissed' | 'actioned';

interface ReportRow {
  id: number;
  targetType: ReportTarget;
  targetId: string;
  target: { label: string; status: string | null };
  reason: ReportReason;
  details: string;
  reporter: string;
  openReportsOnTarget: number;
  status: 'open' | 'resolved';
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ReportsPage {
  total: number;
  offset: number;
  open: Partial<Record<ReportTarget, number>>;
  reports: ReportRow[];
}

const PAGE = 50;

const TARGET_INFO: Record<ReportTarget, { filter: string; noun: string; label: string; icon: ReactNode }> = {
  user: { filter: 'Players', noun: 'player', label: 'Player', icon: <UserRound className="size-3.5" aria-hidden /> },
  set: { filter: 'Question sets', noun: 'set', label: 'Question set', icon: <LibraryBig className="size-3.5" aria-hidden /> },
  room: { filter: 'Live rooms', noun: 'room', label: 'Live room', icon: <Radio className="size-3.5" aria-hidden /> },
};

const TARGET_STATUS: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
  hidden: 'Hidden',
  public: 'Public',
  unlisted: 'Unlisted',
  private: 'Private',
};

const OUTCOME_LABEL: Record<Outcome, string> = { dismissed: 'Dismissed', actioned: 'Actioned' };

/** The server stores a resolution as "outcome: note". */
function parseResolution(res: string | null): { outcome: Outcome | null; note: string } {
  if (!res) return { outcome: null, note: '' };
  const m = /^(dismissed|actioned): ([\s\S]*)$/.exec(res);
  return m ? { outcome: m[1] as Outcome, note: m[2] ?? '' } : { outcome: null, note: res };
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const status: 'open' | 'resolved' = params.get('status') === 'resolved' ? 'resolved' : 'open';
  const typeParam = params.get('type');
  const type = (REPORT_TARGETS as readonly string[]).includes(typeParam ?? '') ? (typeParam as ReportTarget) : null;
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('offset' in changes)) next.delete('offset');
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams({ status, offset: String(offset), ...(type ? { targetType: type } : {}) });
  const list = useQuery({
    queryKey: ['admin', 'reports', query.toString()],
    queryFn: () => api.get<ReportsPage>(`/api/admin/reports?${query}`),
    placeholderData: (prev) => prev,
  });
  const can = { users: useCan('users.read'), sets: useCan('content.moderate'), rooms: useCan('rooms.manage') };
  const [resolving, setResolving] = useState<{ report: ReportRow; outcome: Outcome } | null>(null);
  const [reopening, setReopening] = useState<ReportRow | null>(null);
  const [reviewSet, setReviewSet] = useState<string | null>(null);

  const open = list.data?.open ?? {};
  const openTotal = REPORT_TARGETS.reduce((n, t) => n + (open[t] ?? 0), 0);
  const rows = list.data?.reports;
  const stale = list.isPlaceholderData;

  return (
    <StaffPage title="Reports" description="What players have reported about accounts, question sets and live rooms. Deal with the player or the set first, then record the outcome here.">
      <Tabs
        value={status}
        onValueChange={(v) => update({ status: v === 'resolved' ? 'resolved' : null })}
        label="Report status"
        items={[
          { value: 'open', label: 'Open', ...(list.data ? { count: openTotal } : {}) },
          { value: 'resolved', label: 'Resolved' },
        ]}
      >
        <TabPanel value={status} className="focus-visible:outline-none">
          <div role="group" aria-label="What was reported" className="mb-4 flex flex-wrap gap-2">
            {([null, ...REPORT_TARGETS] as (ReportTarget | null)[]).map((t) => {
              const active = type === t;
              const count = t ? (open[t] ?? 0) : openTotal;
              return (
                <button
                  key={t ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ type: t })}
                  // The chosen filter inverts, like the shared filter chips, so it stands out by lightness and not by its edge colour alone. 44px on phones.
                  className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors sm:h-9 ${active ? 'chip-on border-transparent' : 'border-line-strong text-text-2 hover:bg-surface-2 hover:text-text'}`}
                >
                  {t ? TARGET_INFO[t].filter : 'All types'}
                  {status === 'open' && list.data ? (
                    <span className="rounded-full bg-[color-mix(in_oklab,currentColor_14%,transparent)] px-1.5 text-xs tabular">
                      {formatNumber(count)}
                      <span className="sr-only"> open</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {list.error && !rows ? (
            <ErrorNotice message="The report queue could not be loaded." onRetry={() => void list.refetch()} />
          ) : !rows ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : rows.length === 0 && offset > 0 ? (
            // Happens when the last reports on a later page were just resolved.
            <EmptyState
              title="Nothing left on this page"
              action={
                <Button size="sm" onClick={() => update({ offset: null })}>
                  Back to the first page
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState title={status === 'open' ? (type ? `No open reports about ${TARGET_INFO[type].filter.toLowerCase()}` : 'No open reports') : 'No resolved reports'}>
              {status === 'open' ? 'New reports from players appear here, oldest first.' : 'Reports you and other staff resolve are listed here, most recent first.'}
            </EmptyState>
          ) : (
            <div aria-busy={stale || undefined} className={stale ? 'pointer-events-none opacity-60' : ''}>
              <p className="mb-2 text-sm text-text-3">
                {status === 'open' ? `${plural(list.data!.total, 'open report')}, oldest first.` : `${plural(list.data!.total, 'resolved report')}, most recently resolved first.`}
              </p>
              <ul className="flex flex-col gap-3">
                {rows.map((r) => (
                  <ReportCard
                    key={r.id}
                    r={r}
                    can={can}
                    onResolve={(outcome) => setResolving({ report: r, outcome })}
                    onReopen={() => setReopening(r)}
                    onReviewSet={() => setReviewSet(r.targetId)}
                  />
                ))}
              </ul>
              <Pager offset={offset} pageSize={PAGE} total={list.data!.total} onChange={(o) => update({ offset: o ? String(o) : null })} />
            </div>
          )}
        </TabPanel>
      </Tabs>

      {resolving ? <ResolveDialog key={`${resolving.report.id}-${resolving.outcome}`} report={resolving.report} outcome={resolving.outcome} onClose={() => setResolving(null)} /> : null}
      {reopening ? <ReopenDialog report={reopening} onClose={() => setReopening(null)} /> : null}
      <SetReviewDialog setId={reviewSet} onClose={() => setReviewSet(null)} />
    </StaffPage>
  );
}

function ReportCard({ r, can, onResolve, onReopen, onReviewSet }: { r: ReportRow; can: { users: boolean; sets: boolean; rooms: boolean }; onResolve: (o: Outcome) => void; onReopen: () => void; onReviewSet: () => void }) {
  const info = TARGET_INFO[r.targetType];
  const res = parseResolution(r.resolution);
  // A target with no status is a deleted account or set; rooms never have one.
  const exists = r.targetType === 'room' || r.target.status !== null;
  const others = r.openReportsOnTarget - (r.status === 'open' ? 1 : 0);
  return (
    <li className="min-w-0 rounded-[var(--radius-m)] border border-line bg-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-text-3">
            {info.icon}
            {info.label}
          </div>
          <h2 className="mt-0.5 flex flex-wrap items-center gap-2 font-sans text-base font-semibold break-words text-text">
            <span className={`min-w-0 break-words ${exists ? '' : 'text-text-3'}`}>{r.target.label}</span>
            {r.target.status ? <StatusPill status={r.target.status === 'public' ? 'published' : r.target.status} label={TARGET_STATUS[r.target.status] ?? r.target.status} /> : null}
          </h2>
        </div>
        <time dateTime={r.createdAt} title={dateTime(r.createdAt)} className="shrink-0 text-xs text-text-3">
          Reported {timeAgo(r.createdAt)}
        </time>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2">
        <Badge tone="coral">{REPORT_REASON_INFO[r.reason]?.label ?? r.reason}</Badge>
        <span>
          by <span className="font-semibold text-text">{r.reporter}</span>
        </span>
      </div>
      <p className={`mt-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap break-words ${r.details ? 'text-text' : 'text-text-3'}`}>{r.details || 'No details given.'}</p>
      <p className="mt-2 text-xs text-text-3">
        {r.status === 'open'
          ? others > 0
            ? `${plural(r.openReportsOnTarget, 'open report')} about this ${info.noun}, including this one.`
            : `The only open report about this ${info.noun}.`
          : r.openReportsOnTarget > 0
            ? `${plural(r.openReportsOnTarget, 'other open report')} about this ${info.noun}.`
            : `No open reports about this ${info.noun}.`}
      </p>

      {r.status === 'resolved' ? (
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3 text-sm">
          {res.outcome ? <StatusPill status={res.outcome === 'actioned' ? 'active' : 'resolved'} label={OUTCOME_LABEL[res.outcome]} /> : <StatusPill status="resolved" label="Resolved" />}
          <p className="min-w-0 flex-1 break-words text-text-2">
            {r.resolvedBy ? <span className="font-semibold text-text">{r.resolvedBy}</span> : 'Staff'}
            {r.resolvedAt ? <span title={dateTime(r.resolvedAt)}>, {timeAgo(r.resolvedAt)}</span> : null}
            {res.note ? <span className="whitespace-pre-wrap">: {res.note}</span> : null}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.targetType === 'user' && can.users && exists ? (
          <ButtonLink size="sm" variant={r.status === 'open' ? 'primary' : 'secondary'} to={`/staff/users/${r.targetId}${r.status === 'open' ? `?report=${r.id}` : ''}`}>
            Open player page
          </ButtonLink>
        ) : null}
        {r.targetType === 'set' && can.sets && exists ? (
          <Button size="sm" variant={r.status === 'open' ? 'primary' : 'secondary'} onClick={onReviewSet}>
            Review set
          </Button>
        ) : null}
        {r.targetType === 'room' && can.rooms ? (
          <ButtonLink size="sm" to={`/staff/rooms?room=${encodeURIComponent(r.targetId)}`}>
            View live room
          </ButtonLink>
        ) : null}
        {r.status === 'open' ? (
          <>
            <Button size="sm" onClick={() => onResolve('dismissed')}>
              Dismiss report
            </Button>
            <Button size="sm" onClick={() => onResolve('actioned')}>
              Mark actioned
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onReopen}>
            Reopen report
          </Button>
        )}
      </div>
    </li>
  );
}

const REPORT_KEYS = [['admin', 'reports'], ['admin', 'sets'], ['admin', 'set'], ['admin', 'user']];

function ResolveDialog({ report, outcome, onClose }: { report: ReportRow; outcome: Outcome; onClose: () => void }) {
  const [alsoSame, setAlsoSame] = useState(false);
  const noun = TARGET_INFO[report.targetType].noun;
  const others = Math.max(0, report.openReportsOnTarget - 1);
  const resolve = useStaffMutation(
    (v: { note: string; alsoSameTarget: boolean }) => api.post<{ ok: true; resolved: number }>(`/api/admin/reports/${report.id}/resolve`, { outcome, ...v }),
    {
      invalidate: REPORT_KEYS,
      success: (res) => {
        const verb = outcome === 'dismissed' ? 'dismissed' : 'marked as actioned';
        return res.resolved > 1 ? `${res.resolved} reports ${verb}` : `Report ${verb}`;
      },
      silentError: true,
    },
  );
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={outcome === 'dismissed' ? 'Dismiss this report' : 'Mark this report as actioned'}
      description={
        outcome === 'dismissed'
          ? `Close the report about ${report.target.label} without taking action. Use this when the report is mistaken or nothing breaks the rules.`
          : `Record that the report about ${report.target.label} has been dealt with. Take the action itself first, on the player page or in the set review. This only records the outcome.`
      }
      confirmLabel={outcome === 'dismissed' ? 'Dismiss report' : 'Mark actioned'}
      reasonLabel="Note"
      reasonHint="Saved with the report and in the audit log. The reporter is not told."
      onSubmit={({ reason }) => resolve.mutateAsync({ note: reason, alsoSameTarget: alsoSame })}
    >
      {others > 0 ? (
        <label className="flex items-start gap-2.5 text-sm text-text">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--lantern)]" checked={alsoSame} onChange={(e) => setAlsoSame(e.target.checked)} />
          <span>
            Also resolve the {plural(others, 'other open report')} about this {noun}
            <span className="block text-xs text-text-3">They are closed with the same outcome and note.</span>
          </span>
        </label>
      ) : null}
    </ActionDialog>
  );
}

function ReopenDialog({ report, onClose }: { report: ReportRow; onClose: () => void }) {
  const reopen = useStaffMutation((v: { reason: string }) => api.post(`/api/admin/reports/${report.id}/reopen`, v), { invalidate: REPORT_KEYS, success: 'Report reopened', silentError: true });
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reopen this report"
      description={`The report about ${report.target.label} goes back into the open queue. Its earlier outcome stays in the audit log.`}
      confirmLabel="Reopen report"
      onSubmit={({ reason }) => reopen.mutateAsync({ reason })}
    />
  );
}
