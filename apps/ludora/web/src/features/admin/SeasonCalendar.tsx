import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SeasonView } from '@ludora/content/seasons';
import { api } from '../../lib/api.ts';
import { useCan } from '../../lib/session.ts';
import { Badge, ErrorNotice, Field, Input, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, useStaffMutation } from './ui.tsx';

/*
 * The seasonal calendar. Celebrations come round by themselves in Sydney
 * time; this is where staff move one for a single year (Book Week announced
 * a week late), leave one out, or put it back to the usual dates. The server
 * checks the dates and writes each change to the audit log.
 */

interface CalendarRow {
  id: string;
  name: string;
  tagline: string;
  priority: number;
  usual: { start: string; end: string } | null;
  window: { start: string; end: string } | null;
  changed: 'moved' | 'off' | null;
}

interface CalendarData {
  today: SeasonView;
  year: number;
  celebrations: CalendarRow[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};
const range = (w: { start: string; end: string } | null) => (!w ? 'Not on' : w.start === w.end ? day(w.start) : `${day(w.start)} to ${day(w.end)}`);

export function SeasonCalendar() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const key = ['admin', 'season', year] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api.get<CalendarData>(`/api/admin/season?year=${year}`) });
  const can = useCan('events.manage');
  const [editing, setEditing] = useState<{ row: CalendarRow; action: 'move' | 'off' | 'reset' } | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const change = useStaffMutation((vars: { id: string; body: Record<string, unknown> }) => api.patch(`/api/admin/season/${vars.id}`, vars.body), {
    invalidate: [['admin', 'season'], ['season']],
    success: (_r, v) => ('off' in v.body ? 'Left out for that year.' : 'reset' in v.body ? 'Back to the usual dates.' : 'Dates saved.'),
  });

  const today = q.data?.today;
  const now = today?.celebration ?? today?.season;
  const thisYear = new Date().getFullYear();
  const dateError = editing?.action === 'move' ? (!start || !end ? 'Both dates are needed.' : start > end ? 'The end has to be on or after the start.' : !start.startsWith(String(year)) || !end.startsWith(String(year)) ? `Both dates have to be in ${year}.` : undefined) : undefined;

  return (
    <Card
      title="Seasonal calendar"
      actions={
        <label className="flex items-center gap-2 text-sm text-text-2">
          Year
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 w-28">
            {[thisYear, thisYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
      }
    >
      <p className="-mt-1 mb-4 text-sm text-text-2">
        The site dresses itself for the season and for these celebrations, in Sydney time, with no one switching anything on. Change a celebration only when its real dates differ from the usual rule. Each change is for one year.
      </p>
      {q.isError ? (
        <ErrorNotice message="The calendar did not load." onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {now ? (
            <p className="mb-4 text-sm">
              <span className="font-semibold">Today: {now.name}.</span> <span className="text-text-2">{now.tagline}</span>
            </p>
          ) : null}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-text-3">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Celebration</th>
                  <th className="py-2 pr-3 font-semibold">Usual dates</th>
                  <th className="py-2 pr-3 font-semibold">In {year}</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.celebrations.map((row) => (
                  <tr key={row.id} className="border-t border-line align-middle">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-text">{row.name}</div>
                      <div className="text-xs text-text-3">{row.tagline}</div>
                    </td>
                    <td className="py-2.5 pr-3 tabular whitespace-nowrap text-text-2">{range(row.usual)}</td>
                    <td className="py-2.5 pr-3 tabular whitespace-nowrap">
                      <span className="mr-2">{range(row.window)}</span>
                      {row.changed === 'moved' ? <Badge tone="sky">Moved</Badge> : row.changed === 'off' ? <Badge tone="amber">Left out</Badge> : null}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {can ? (
                        <div className="inline-flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setStart(row.window?.start ?? row.usual?.start ?? `${year}-01-01`);
                              setEnd(row.window?.end ?? row.usual?.end ?? `${year}-01-01`);
                              setEditing({ row, action: 'move' });
                            }}
                          >
                            Move
                          </Button>
                          {row.changed ? (
                            <Button size="sm" variant="ghost" onClick={() => setEditing({ row, action: 'reset' })}>
                              Usual dates
                            </Button>
                          ) : row.window ? (
                            <Button size="sm" variant="ghost" onClick={() => setEditing({ row, action: 'off' })}>
                              Leave out
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ActionDialog
        open={Boolean(editing)}
        onOpenChange={(v) => !v && setEditing(null)}
        title={!editing ? '' : editing.action === 'move' ? `Move ${editing.row.name} in ${year}` : editing.action === 'off' ? `Leave out ${editing.row.name} in ${year}` : `Put ${editing.row.name} back to its usual dates`}
        description={
          !editing
            ? null
            : editing.action === 'move'
              ? `Usually ${range(editing.row.usual)}. A celebration lasts a month at most.`
              : editing.action === 'off'
                ? `The site will not dress up for ${editing.row.name} in ${year}. It comes back as usual the year after.`
                : `${range(editing.row.usual)} in ${year}.`
        }
        confirmLabel={!editing ? 'Save' : editing.action === 'move' ? 'Save dates' : editing.action === 'off' ? 'Leave it out' : 'Use the usual dates'}
        disabled={Boolean(dateError)}
        onSubmit={async ({ reason }) => {
          if (!editing) return;
          const body = editing.action === 'move' ? { year, start, end, reason } : editing.action === 'off' ? { year, off: true, reason } : { year, reset: true, reason };
          await change.mutateAsync({ id: editing.row.id, body });
          setEditing(null);
        }}
      >
        {editing?.action === 'move' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First day">{(p) => <Input type="date" value={start} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setStart(e.target.value)} {...p} />}</Field>
            <Field label="Last day" error={dateError}>
              {(p) => <Input type="date" value={end} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setEnd(e.target.value)} {...p} />}
            </Field>
          </div>
        ) : null}
      </ActionDialog>
    </Card>
  );
}
