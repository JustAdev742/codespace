import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MODE_CATEGORY_INFO, type ModeCategory, type ModeStatus, type ModeVisibilityValue } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { Badge, Select } from '../../ui/primitives.tsx';
import { ActionDialog, Card, DataTable, StaffPage, StatusPill, useStaffMutation, type Column } from './ui.tsx';

/*
 * Mode publication. The engine decides whether a mode is built (live, beta,
 * planned); staff decide whether players see it (published, featured,
 * hidden). Every change needs a reason and is audited.
 */

interface VariantRow {
  id: string;
  title: string;
  status: ModeStatus;
  visibility: ModeVisibilityValue;
  plays30d: number;
}

interface ModeRow {
  id: string;
  title: string;
  status: ModeStatus;
  category: ModeCategory;
  visibility: ModeVisibilityValue;
  plays30d: number;
  variants: VariantRow[];
}

type Row = (VariantRow & { kind: 'variant'; mode: ModeRow }) | (ModeRow & { kind: 'mode' });

const VISIBILITY_INFO: Record<ModeVisibilityValue, { label: string; effect: string }> = {
  published: { label: 'Published', effect: 'Players can see and start it.' },
  featured: { label: 'Featured', effect: 'Shown first in the mode picker.' },
  hidden: { label: 'Hidden', effect: 'Players cannot see or start it. Staff still can.' },
};

const STATUS_INFO: Record<ModeStatus, { label: string; tone: 'mint' | 'amber' | 'neutral'; effect: string }> = {
  playable: { label: 'Live', tone: 'mint', effect: 'Built and passing the automated full-game test.' },
  beta: { label: 'Beta', tone: 'amber', effect: 'Playable but still changing. Only players with the modes.beta flag see it.' },
  planned: { label: 'Planned', tone: 'neutral', effect: 'Designed but not built. Nobody can start it yet.' },
};

function changeCopy(row: Row, to: ModeVisibilityValue): { title: string; confirm: string; description: string; danger: boolean } {
  const what = row.kind === 'mode' ? 'mode' : 'variant';
  let base: { title: string; confirm: string; description: string; danger: boolean };
  if (to === 'hidden') {
    base = { title: `Hide ${row.title}`, confirm: `Hide ${what}`, danger: true, description: `Players can no longer see or start this ${what}. Games already running carry on, and staff can still start it.` };
  } else if (to === 'featured') {
    base = { title: `Feature ${row.title}`, confirm: `Feature ${what}`, danger: false, description: `It is shown first in the mode picker.` };
  } else if (row.visibility === 'featured') {
    base = { title: `Stop featuring ${row.title}`, confirm: 'Stop featuring', danger: false, description: 'Players can still see and start it, but it is no longer shown first.' };
  } else {
    base = { title: `Publish ${row.title}`, confirm: `Publish ${what}`, danger: false, description: `Players can see and start this ${what} again.` };
  }
  const notes: string[] = [];
  if (row.kind === 'variant' && row.mode.visibility === 'hidden' && to !== 'hidden') notes.push(`Its mode, ${row.mode.title}, is hidden, so players still cannot start it.`);
  if (row.status === 'planned' && to !== 'hidden') notes.push('It is still planned, so nobody can start it until it is built.');
  if (row.status === 'beta' && to !== 'hidden') notes.push('It is in beta, so only players with the modes.beta flag see it.');
  return notes.length ? { ...base, description: `${base.description} ${notes.join(' ')}` } : base;
}

export default function Modes() {
  const modes = useQuery({ queryKey: ['admin', 'modes'], queryFn: () => api.get<{ modes: ModeRow[] }>('/api/admin/modes') });
  const [pending, setPending] = useState<{ row: Row; to: ModeVisibilityValue } | null>(null);
  const change = useStaffMutation((v: { row: Row; to: ModeVisibilityValue; reason: string }) => api.put(`/api/admin/modes/${encodeURIComponent(v.row.id)}`, { visibility: v.to, reason: v.reason }), {
    invalidate: [['admin', 'modes'], ['modes']],
    success: (_res, v) => `${v.row.title} is now ${VISIBILITY_INFO[v.to].label.toLowerCase()}`,
    silentError: true,
  });

  const rows: Row[] | undefined = modes.data?.modes.flatMap((m) => [{ ...m, kind: 'mode' as const }, ...m.variants.map((v) => ({ ...v, kind: 'variant' as const, mode: m }))]);
  const variantCount = modes.data?.modes.reduce((n, m) => n + m.variants.length, 0) ?? 0;
  const hiddenCount = rows?.filter((r) => r.visibility === 'hidden').length ?? 0;

  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: 'Mode',
      cell: (r) =>
        r.kind === 'mode' ? (
          <div className="min-w-0">
            <div className="font-semibold text-text">{r.title}</div>
            <code className="text-xs text-text-3">{r.id}</code>
          </div>
        ) : (
          <div className="relative ml-1 min-w-0 border-l-2 border-line pl-3">
            <div className="font-semibold text-text">
              <span className="sr-only">Variant of {r.mode.title}: </span>
              {r.title}
            </div>
            <code className="text-xs text-text-3">{r.id}</code>
          </div>
        ),
    },
    { key: 'visibility', header: 'Visibility', cell: (r) => <StatusPill status={r.visibility} label={VISIBILITY_INFO[r.visibility]?.label ?? r.visibility} /> },
    {
      key: 'change',
      header: 'Change visibility',
      cell: (r) => {
        // Featuring only affects whole modes in the picker, so variants are published or hidden.
        const options = (['published', 'featured', 'hidden'] as const).filter((v) => r.kind === 'mode' || v !== 'featured' || r.visibility === 'featured');
        return (
          <div className="w-40">
            <Select
              aria-label={`Visibility of ${r.title}`}
              value={r.visibility}
              onChange={(e) => {
                const to = e.target.value as ModeVisibilityValue;
                if (to !== r.visibility) setPending({ row: r, to });
              }}
            >
              {options.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_INFO[v].label}
                </option>
              ))}
            </Select>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span title={STATUS_INFO[r.status]?.effect}>
          <Badge tone={STATUS_INFO[r.status]?.tone ?? 'neutral'}>{STATUS_INFO[r.status]?.label ?? r.status}</Badge>
        </span>
      ),
    },
    { key: 'plays', header: 'Plays, last 30 days', align: 'right', cell: (r) => formatNumber(r.plays30d) },
    { key: 'category', header: 'Category', cell: (r) => (r.kind === 'mode' ? (MODE_CATEGORY_INFO[r.category]?.label ?? r.category) : <span className="text-text-3">-</span>) },
  ];

  const copy = pending ? changeCopy(pending.row, pending.to) : null;

  return (
    <StaffPage title="Game modes" description="Choose which modes and variants players can see. Whether a mode is built is decided in the code; whether players see it is decided here.">
      <Card title="What each visibility does for players" className="mb-4">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {(['published', 'featured', 'hidden'] as const).map((v) => (
            <div key={v} className="min-w-0">
              <dt>
                <StatusPill status={v} label={VISIBILITY_INFO[v].label} />
              </dt>
              <dd className="mt-1 text-text-2">{VISIBILITY_INFO[v].effect}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-text-3">Featuring applies to whole modes, so variants are either published or hidden. A mode's plays include its variants. Beta modes only reach players with the modes.beta flag, and planned ones cannot be started by anyone.</p>
      </Card>
      {modes.data ? (
        <p className="mb-2 text-sm text-text-3">
          {plural(modes.data.modes.length, 'mode')} and {plural(variantCount, 'variant')}. {hiddenCount ? `${formatNumber(hiddenCount)} hidden from players.` : 'None are hidden.'}
        </p>
      ) : null}
      <DataTable
        caption="Game modes and variants"
        minWidth={820}
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.kind}:${r.id}`}
        loading={modes.isLoading}
        error={modes.error}
        onRetry={() => void modes.refetch()}
        empty="No game modes are registered."
      />
      <ActionDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy?.title ?? ''}
        description={copy?.description}
        confirmLabel={copy?.confirm ?? ''}
        variant={copy?.danger ? 'danger' : 'primary'}
        onSubmit={({ reason }) => change.mutateAsync({ row: pending!.row, to: pending!.to, reason })}
      />
    </StaffPage>
  );
}
