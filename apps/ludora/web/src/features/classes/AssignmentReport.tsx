import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Download, Lock, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, ProgressBar, SectionTitle } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { csvDateTime, csvPercent, downloadCsv, fileDate, slug, type CsvCell } from '../reports/csv.ts';
import {
  BackLink,
  dateTimeText,
  errorText,
  hardestFirst,
  hasStatus,
  NoValue,
  percent,
  QuestionTable,
  questionTypeLabel,
  RateBar,
  SortTh,
  StatRow,
  StatTile,
  TableBox,
  Th,
  usePageTitle,
  type SortState,
} from '../reports/reportUi.tsx';
import { classKeys, useAccountState, useClassDetail, useModeInfo, type AssignmentReportData, type ReportStudent } from './classData.ts';
import { ClassAccountGate, ClassPageSkeleton } from './classUi.tsx';

/*
 * /classes/:id/assignments/:aid, for the class teacher only. Who has played,
 * each student's best game, and which questions were hardest. The CSV is
 * built here from the same data.
 */

type SortKey = 'name' | 'attempts' | 'score' | 'accuracy' | 'last';

function statusOf(s: ReportStudent, dueAt: string | null): 'Not started' | 'Late' | 'On time' | 'Played' {
  if (s.attempts === 0) return 'Not started';
  if (s.late) return 'Late';
  return dueAt ? 'On time' : 'Played';
}

function StatusBadge({ status }: { status: ReturnType<typeof statusOf> }) {
  const tone = status === 'Late' ? 'coral' : status === 'Not started' ? 'neutral' : 'mint';
  return <Badge tone={tone}>{status}</Badge>;
}

function sortValue(s: ReportStudent, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return s.displayName.toLocaleLowerCase('en-GB');
    case 'attempts':
      return s.attempts;
    case 'score':
      return s.best?.score ?? null;
    case 'accuracy':
      return s.best?.accuracy ?? null;
    case 'last':
      return s.lastPlayedAt ? Date.parse(s.lastPlayedAt) : null;
  }
}

function StudentsTable({ students, dueAt }: { students: ReportStudent[]; dueAt: string | null }) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'name', dir: 'asc' });
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const rows = useMemo(() => {
    const byName = (a: ReportStudent, b: ReportStudent) => a.displayName.localeCompare(b.displayName, 'en-GB');
    return [...students].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      // Students with no number for this column always go last, whichever way it is sorted.
      if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
      const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'en-GB') : Number(va) - Number(vb);
      return (sort.dir === 'asc' ? c : -c) || byName(a, b);
    });
  }, [students, sort]);
  return (
    <TableBox caption="Each student's results" minWidth={900}>
      <thead className="bg-surface-2">
        <tr>
          <SortTh label="Student" sortKey="name" sort={sort} onSort={onSort} />
          <SortTh label="Attempts" sortKey="attempts" sort={sort} onSort={onSort} align="right" />
          <SortTh label="Best score" sortKey="score" sort={sort} onSort={onSort} align="right" />
          <Th align="right">Correct</Th>
          <SortTh label="Accuracy" sortKey="accuracy" sort={sort} onSort={onSort} />
          <Th>First played</Th>
          <SortTh label="Last played" sortKey="last" sort={sort} onSort={onSort} />
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="border-t border-line">
            <td className="px-3 py-2.5">
              <div className="font-semibold break-words text-text">{s.displayName}</div>
              {s.username ? <div className="text-xs text-text-3">@{s.username}</div> : null}
            </td>
            <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(s.attempts)}</td>
            <td className="px-3 py-2.5 text-right text-text tabular">{s.best ? formatNumber(s.best.score) : <NoValue />}</td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap text-text tabular">
              {s.best ? (
                <>
                  {s.best.correct} of {s.best.answered}
                </>
              ) : (
                <NoValue />
              )}
            </td>
            <td className="px-3 py-2.5">{s.best && s.best.accuracy !== null ? <RateBar rate={s.best.accuracy} /> : <NoValue />}</td>
            <td className="px-3 py-2.5 whitespace-nowrap text-text-2">{s.firstPlayedAt ? <time dateTime={s.firstPlayedAt}>{dateTimeText(s.firstPlayedAt)}</time> : <NoValue />}</td>
            <td className="px-3 py-2.5 whitespace-nowrap text-text-2">{s.lastPlayedAt ? <time dateTime={s.lastPlayedAt}>{dateTimeText(s.lastPlayedAt)}</time> : <NoValue />}</td>
            <td className="px-3 py-2.5">
              <StatusBadge status={statusOf(s, dueAt)} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableBox>
  );
}

export default function AssignmentReport() {
  const { id = '', aid = '' } = useParams();
  const account = useAccountState();
  const enabled = account === 'account' && Boolean(id && aid);
  const report = useQuery({
    queryKey: classKeys.report(id, aid),
    queryFn: () => api.get<AssignmentReportData>(`/api/classes/${encodeURIComponent(id)}/assignments/${encodeURIComponent(aid)}/report`),
    enabled,
  });
  // For the class name in the back link and the file name; usually already loaded by the class page.
  const cls = useClassDetail(id, enabled && report.isSuccess);
  const modeInfo = useModeInfo();
  usePageTitle(report.data ? `${report.data.assignment.title} report` : 'Assignment report');

  const here = `/classes/${id}/assignments/${aid}`;
  if (account === 'loading' || (enabled && report.isPending)) return <ClassPageSkeleton />;
  if (account === 'signedOut' || hasStatus(report.error, 401)) {
    return (
      <>
        <PageHeader title="Assignment report" />
        <ClassAccountGate state="signedOut" next={here} />
      </>
    );
  }
  if (account === 'guest') {
    return (
      <>
        <PageHeader title="Assignment report" />
        <ClassAccountGate state="guest" next={here} />
      </>
    );
  }
  if (hasStatus(report.error, 403)) {
    return (
      <>
        <PageHeader title="Assignment report" />
        <EmptyState icon={<Lock className="size-8" />} title="This report is for the teacher" action={<ButtonLink to={`/classes/${id}`}>Back to the class</ButtonLink>}>
          {errorText(report.error, 'Only the teacher can see the class report.')} Your own results are on the class page.
        </EmptyState>
      </>
    );
  }
  if (hasStatus(report.error, 400, 404)) {
    return (
      <>
        <PageHeader title="Assignment report" />
        <EmptyState icon={<ClipboardList className="size-8" />} title="Report not found" action={<ButtonLink to={id ? `/classes/${id}` : '/classes'}>{id ? 'Back to the class' : 'All classes'}</ButtonLink>}>
          {errorText(report.error, 'That assignment does not exist.')} It may have been deleted.
        </EmptyState>
      </>
    );
  }
  if (!report.data) {
    return (
      <>
        <BackLink to={`/classes/${id}`}>Back to the class</BackLink>
        <PageHeader title="Assignment report" />
        <ErrorNotice message={errorText(report.error, 'The report could not be loaded. Check your connection and try again.')} onRetry={() => void report.refetch()} />
      </>
    );
  }

  const { assignment: a, summary, students, questions } = report.data;
  const info = modeInfo(a.modeId, a.variantId);
  const className = cls.data?.class.name;
  const notStarted = summary.students - summary.started;
  const lateCount = students.filter((s) => s.late).length;
  const games = students.reduce((n, s) => n + s.attempts, 0);

  const download = () => {
    const rows: CsvCell[][] = [
      ['Assignment', a.title],
      ['Class', className ?? ''],
      ['Question set', a.setTitle],
      ['Game mode', info.title],
      ['Due', a.dueAt ? csvDateTime(a.dueAt) : 'No due date'],
      ['Students who started', summary.started],
      ['Students in the class', summary.students],
      ['Average accuracy (%)', csvPercent(summary.averageAccuracy)],
      ['Downloaded', csvDateTime(new Date().toISOString())],
      [],
      ['Students'],
      ['Name', 'Username', 'Attempts', 'Best score', 'Correct', 'Answered', 'Accuracy (%)', 'First played', 'Last played', 'Status'],
      ...students.map((s) => [s.displayName, s.username ?? '', s.attempts, s.best?.score ?? null, s.best?.correct ?? null, s.best?.answered ?? null, csvPercent(s.best?.accuracy), csvDateTime(s.firstPlayedAt), csvDateTime(s.lastPlayedAt), statusOf(s, a.dueAt)]),
      [],
      ['Questions, hardest first'],
      ['Question', 'Type', 'Right first time (%)', 'Games', 'Attempts', 'Average time (s)'],
      ...hardestFirst(questions).map((q) => [q.prompt, questionTypeLabel(q.type) ?? '', csvPercent(q.firstTryRate), q.players, q.attempts, q.avgResponseMs > 0 ? Math.round(q.avgResponseMs / 100) / 10 : null]),
    ];
    downloadCsv(`ludora-${className ? `${slug(className, 30)}-` : ''}${slug(a.title)}-${fileDate()}.csv`, rows);
  };

  return (
    <>
      <BackLink to={`/classes/${id}`}>{className ?? 'Back to the class'}</BackLink>
      <PageHeader
        eyebrow="Assignment report"
        title={<span className="break-words">{a.title}</span>}
        description={
          <>
            {a.setTitle}, played as {info.title}.{' '}
            {a.dueAt ? (
              <>
                Due <time dateTime={a.dueAt}>{dateTimeText(a.dueAt)}</time>.
              </>
            ) : (
              'No due date.'
            )}
          </>
        }
        actions={
          <Button icon={<Download className="size-4" />} onClick={download}>
            Download CSV
          </Button>
        }
      />

      <StatRow label="Summary">
        <StatTile label="Started" value={`${formatNumber(summary.started)} of ${formatNumber(summary.students)}`}>
          <ProgressBar value={summary.started} max={summary.students} label={`${summary.started} of ${summary.students} students started`} />
        </StatTile>
        <StatTile label="Average accuracy" value={summary.averageAccuracy === null ? <NoValue label="No results yet" /> : percent(summary.averageAccuracy)}>
          {summary.averageAccuracy === null ? 'Nobody has played yet.' : "From each student's best game."}
        </StatTile>
        <StatTile label="Not started" value={formatNumber(notStarted)}>
          {summary.students === 0 ? 'No students in the class yet.' : notStarted === 0 ? 'Everyone has played.' : `Of ${formatNumber(summary.students)} in the class.`}
        </StatTile>
        {a.dueAt ? (
          <StatTile label="Played late" value={formatNumber(lateCount)}>
            Only played after the due date.
          </StatTile>
        ) : (
          <StatTile label="Games played" value={formatNumber(games)}>
            Every attempt by students in the class.
          </StatTile>
        )}
      </StatRow>

      <section className="mb-8">
        <SectionTitle>Students</SectionTitle>
        {students.length === 0 ? (
          <EmptyState icon={<Users className="size-8" />} title="No students in this class yet">
            Share the join code from the class page. Students who join can play this assignment straight away.
          </EmptyState>
        ) : (
          <StudentsTable students={students} dueAt={a.dueAt} />
        )}
      </section>

      <section>
        <SectionTitle>Questions, hardest first</SectionTitle>
        <p className="-mt-1 mb-3 max-w-[70ch] text-sm text-text-2">
          Each game counts once per question, judged on the first try in that game, so a student who played twice counts twice. Attempts include retries in puzzle modes.
        </p>
        <QuestionTable questions={questions} caption="Questions, hardest first" countLabel="Games" empty="Questions show up here once a student has played." />
      </section>
    </>
  );
}
