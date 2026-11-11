import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpenCheck, Download } from 'lucide-react';
import { EmptyState, ErrorNotice, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { csvDateTime, csvPercent, downloadCsv, fileDate, slug, type CsvCell } from '../reports/csv.ts';
import { dateText, errorText, NoValue, percent, SortTh, TableBox, type SortState } from '../reports/reportUi.tsx';
import { useInsights, type ClassMember, type GradeCell, type InsightsData } from './classData.ts';
import { BandLegend, GradeCellView } from './gradeUi.tsx';

/*
 * The gradebook: every assignment across, every student down, each student's best
 * result in each cell. Sort by name, by average or by any assignment. On a phone it
 * becomes one assignment at a time. Downloads: the gradebook, or all the class's data.
 */

type Row = InsightsData['gradebook'][number];

function average(row: Row): number | null {
  const rates = Object.values(row.cells)
    .map((c) => c.best?.accuracy)
    .filter((r): r is number => typeof r === 'number');
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

function cellStatus(c: GradeCell | undefined): string {
  if (!c || !c.attempts) return 'Not played';
  return c.late ? 'Late' : 'Played';
}

function gradebookRows(data: InsightsData): CsvCell[][] {
  return [
    ['Student', 'Username', 'Average accuracy (%)', ...data.assignments.flatMap((a) => [`${a.title}: best (%)`, `${a.title}: right`, `${a.title}: answered`, `${a.title}: attempts`, `${a.title}: status`])],
    ...data.gradebook.map((r) => [
      r.displayName,
      r.username ?? '',
      csvPercent(average(r)),
      ...data.assignments.flatMap((a) => {
        const c = r.cells[a.id];
        if (!(a.id in r.cells)) return [null, null, null, null, 'Not set for this student'];
        return [csvPercent(c?.best?.accuracy), c?.best?.correct ?? null, c?.best?.answered ?? null, c?.attempts ?? 0, cellStatus(c)];
      }),
    ]),
  ];
}

export function GradebookPanel({ classId, className, members }: { classId: string; className: string; members: ClassMember[] }) {
  const q = useInsights(classId);
  const [sort, setSort] = useState<SortState<string>>({
    key: 'name',
    dir: 'asc',
  });
  const [phoneTask, setPhoneTask] = useState<string>('');
  const data = q.data;
  const rows = useMemo(() => {
    if (!data) return [];
    const value = (r: Row): string | number | null => (sort.key === 'name' ? r.displayName.toLocaleLowerCase('en-GB') : sort.key === 'average' ? average(r) : (r.cells[sort.key]?.best?.accuracy ?? null));
    const byName = (a: Row, b: Row) => a.displayName.localeCompare(b.displayName, 'en-GB');
    return [...data.gradebook].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
      const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'en-GB') : Number(va) - Number(vb);
      return (sort.dir === 'asc' ? c : -c) || byName(a, b);
    });
  }, [data, sort]);

  if (q.isPending) return <Skeleton className="h-64" />;
  if (!data) return <ErrorNotice message={errorText(q.error, 'The gradebook did not load.')} onRetry={() => void q.refetch()} />;
  if (!data.assignments.length || !data.gradebook.length) {
    return (
      <EmptyState icon={<BookOpenCheck className="size-8" />} title="The gradebook fills in as students play">
        {data.assignments.length ? 'Once students join, each one gets a row here.' : 'Set an assignment, and each student’s best result shows here, one column per assignment.'}
      </EmptyState>
    );
  }

  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const base = `ludora-${slug(className, 30)}`;
  const downloadGradebook = () => downloadCsv(`${base}-gradebook-${fileDate()}.csv`, [['Class', className], ['Downloaded', csvDateTime(new Date().toISOString())], [], ...gradebookRows(data)]);
  const downloadClass = () => {
    const byId = new Map(members.map((m) => [m.id, m]));
    downloadCsv(`${base}-class-data-${fileDate()}.csv`, [
      ['Class', className],
      ['Downloaded', csvDateTime(new Date().toISOString())],
      [],
      ['Students'],
      ['Name', 'Username', 'Level', 'Joined', 'Last seen', 'Class login'],
      ...data.gradebook.map((r) => {
        const m = byId.get(r.id);
        return [r.displayName, r.username ?? '', m?.level ?? null, csvDateTime(m?.joinedAt), csvDateTime(m?.lastSeenAt), m?.classLogin ? 'Yes' : 'No'];
      }),
      [],
      ['Assignments'],
      ['Title', 'Question set', 'Due', 'Attempts allowed'],
      ...data.assignments.map((a) => [a.title, a.setTitle, a.dueAt ? csvDateTime(a.dueAt) : 'No due date', a.maxAttempts ?? 'Any']),
      [],
      ['Gradebook'],
      ...gradebookRows(data),
    ]);
  };
  const task = data.assignments.find((a) => a.id === phoneTask) ?? data.assignments[data.assignments.length - 1]!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-text-2">Each cell is the student’s best game at that assignment: the share right, how many right of how many answered, and how many tries.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={downloadGradebook}>
            Gradebook CSV
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-4" aria-hidden />} onClick={downloadClass}>
            All class data
          </Button>
        </div>
      </div>
      <BandLegend />

      {/* A phone shows one assignment at a time instead of a grid wider than the screen. */}
      <div className="flex flex-col gap-3 sm:hidden">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-text">
          Assignment
          <Select value={task.id} onChange={(e) => setPhoneTask(e.target.value)}>
            {data.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {a.groupName ? ` (for ${a.groupName})` : ''}
              </option>
            ))}
          </Select>
        </label>
        <ul className="flex flex-col gap-2" aria-label={`Results for ${task.title}`}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-3">
              <Link to={`/classes/${classId}/students/${r.id}`} className="min-w-0 font-semibold break-words text-text">
                {r.displayName}
              </Link>
              <GradeCellView cell={r.cells[task.id]} maxAttempts={task.maxAttempts} notSet={!(task.id in r.cells)} />
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden sm:block">
        <TableBox caption={`Gradebook for ${className}`} minWidth={Math.max(640, 260 + data.assignments.length * 120)}>
          <thead className="bg-surface-2">
            <tr>
              <SortTh label="Student" sortKey="name" sort={sort} onSort={onSort} />
              <SortTh label="Average" sortKey="average" sort={sort} onSort={onSort} />
              {data.assignments.map((a) => (
                <th key={a.id} scope="col" aria-sort={sort.key === a.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="px-2 py-2.5 align-bottom text-xs font-semibold text-text-2">
                  <button type="button" onClick={() => onSort(a.id)} className={`flex w-[6.5rem] flex-col items-center gap-0.5 text-center hover:text-text ${sort.key === a.id ? 'text-text' : ''}`}>
                    <span className="line-clamp-2 break-words">{a.title}</span>
                    <span className="font-normal text-text-3">{a.dueAt ? `Due ${dateText(a.dueAt)}` : 'No due date'}</span>
                    {a.groupName ? <span className="font-normal text-text-3">For {a.groupName}</span> : null}
                    <span className="sr-only">, sort by this assignment</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avg = average(r);
              return (
                <tr key={r.id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-[1] bg-raised px-3 py-2 text-left font-normal">
                    <Link to={`/classes/${classId}/students/${r.id}`} className="font-semibold break-words text-text">
                      {r.displayName}
                    </Link>
                    {r.username ? <div className="text-xs text-text-3">@{r.username}</div> : null}
                  </th>
                  <td className="px-3 py-2 font-display text-lg font-bold text-text tabular">{avg === null ? <NoValue label="No games yet" /> : percent(avg)}</td>
                  {data.assignments.map((a) => (
                    <td key={a.id} className="px-2 py-1.5 text-center">
                      <GradeCellView cell={r.cells[a.id]} maxAttempts={a.maxAttempts} notSet={!(a.id in r.cells)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      </div>
    </div>
  );
}
