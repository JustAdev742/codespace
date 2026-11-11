import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, GraduationCap, Search } from 'lucide-react';
import { SUBJECT_LABELS, type Subject } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { ordinal, plural } from '../../lib/format.ts';
import { Badge, EmptyState, Input, PageHeader, SectionTitle } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { BackLink, dateText, NoValue, percent, questionTypeLabel, RateBar, StatRow, StatTile, TableBox, Th, usePageTitle } from './reportUi.tsx';
import { BarLineChart } from './charts.tsx';
import { ReportGate, useSignedIn } from './pageKit.tsx';

/*
 * /reports/students and /reports/students/:key: one student across the games you hosted, only
 * for students in your own classes. The key is a keyed hash the server checks against your
 * roster; it names no account. (A guest is seen within one game, from that game's report.)
 */

interface StudentListData {
  students: { key: string; name: string; classes: string[]; games: number; rate: number | null }[];
}

interface StudentData {
  student: { key: string; name: string; classes: { id: string; name: string }[] };
  games: { id: string; mode: string; setTitle: string; endedAt: string; correct: number; answered: number; rank: number; players: number; leftEarly: boolean }[];
  bySubject: { subject: string; games: number; correct: number; answered: number }[];
  byType: { type: string; right: number; answered: number }[];
}

export function StudentsList() {
  const { me, signedIn } = useSignedIn();
  const q = useQuery({ queryKey: ['reports', 'students'], queryFn: () => api.get<StudentListData>('/api/reports/students'), enabled: signedIn });
  const [search, setSearch] = useState('');
  usePageTitle('Students across your games');
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.students ?? []).filter((x) => !s || x.name.toLowerCase().includes(s) || x.classes.some((c) => c.toLowerCase().includes(s)));
  }, [q.data, search]);
  return (
    <ReportGate me={me} query={q} title="Students" next="/reports/students" notFound="This list could not be found.">
      {(d) => (
        <>
          <BackLink to="/reports">Your reports</BackLink>
          <PageHeader title="Students" description="Students in your classes, and how they have done in the games you hosted. Guests are in each game's report." />
          {!d.students.length ? (
            <EmptyState icon={<GraduationCap className="size-8" />} title="No students yet" action={<ButtonLink to="/classes">Your classes</ButtonLink>}>
              Students who join one of your classes appear here, with every game of yours they played.
            </EmptyState>
          ) : (
            <>
              <div className="mb-4 max-w-md">
                <label htmlFor="student-search" className="mb-1.5 block text-sm font-semibold text-text">
                  Find a student or class
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                  <Input id="student-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
              <p className="mb-2 text-sm text-text-2" role="status">
                {shown.length === d.students.length ? plural(d.students.length, 'student') : `${shown.length} of ${plural(d.students.length, 'student')}`}
              </p>
              <ul className="flex flex-col gap-2" aria-label="Students">
                {shown.map((s) => (
                  <li key={s.key}>
                    <Link to={`/reports/students/${s.key}`} className="flex items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised px-4 py-3 text-text no-underline hover:border-line-strong hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words">{s.name}</span>
                        <span className="block text-sm break-words text-text-2">{s.classes.join(', ')}</span>
                      </span>
                      <span className="shrink-0 text-right text-sm text-text-2">
                        <span className="block font-bold text-text tabular">{s.rate === null ? 'No games yet' : percent(s.rate)}</span>
                        {s.games ? plural(s.games, 'game') : null}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </ReportGate>
  );
}

export function StudentAcross() {
  const { key = '' } = useParams();
  const { me, signedIn } = useSignedIn();
  const q = useQuery({ queryKey: ['reports', 'student', key], queryFn: () => api.get<StudentData>(`/api/reports/students/${encodeURIComponent(key)}`), enabled: signedIn && Boolean(key) });
  usePageTitle(q.data ? `${q.data.student.name} across your games` : 'Student');
  return (
    <ReportGate me={me} query={q} title="Student" next={`/reports/students/${key}`} notFound="This student is not in any of your classes.">
      {(d) => {
        const answered = d.games.reduce((n, g) => n + g.answered, 0);
        const correct = d.games.reduce((n, g) => n + g.correct, 0);
        const recent = d.games.slice(-12);
        return (
          <>
            <BackLink to="/reports/students">Students</BackLink>
            <PageHeader
              eyebrow="Across your games"
              title={<span className="break-words">{d.student.name}</span>}
              description={
                <>
                  In{' '}
                  {d.student.classes.map((c, i) => (
                    <span key={c.id}>
                      {i ? ', ' : ''}
                      <Link to={`/classes/${c.id}`} className="underline underline-offset-2">{c.name}</Link>
                    </span>
                  ))}
                  . Their assignments are on each class page.
                </>
              }
            />
            {!d.games.length ? (
              <EmptyState title="No games with you yet">{d.student.name} has not played in a game you hosted. Their results appear here after they do.</EmptyState>
            ) : (
              <>
                <StatRow label={`${d.student.name} in numbers`}>
                  <StatTile label="Games" value={d.games.length}>
                    Since {dateText(d.games[0]!.endedAt)}.
                  </StatTile>
                  <StatTile label="Right" value={answered ? percent(correct / answered) : <NoValue />}>
                    {correct} of {plural(answered, 'answer')}.
                  </StatTile>
                  <StatTile label="Left early" value={d.games.filter((g) => g.leftEarly).length}>
                    Games they left before the end.
                  </StatTile>
                  <StatTile label="Latest" value={recent.at(-1)!.answered ? percent(recent.at(-1)!.correct / recent.at(-1)!.answered) : <NoValue />}>
                    {dateText(recent.at(-1)!.endedAt)}.
                  </StatTile>
                </StatRow>

                <section aria-labelledby="over-time" className="mb-10">
                  <SectionTitle>
                    <span id="over-time">Accuracy over time</span>
                  </SectionTitle>
                  <BarLineChart bars={recent.map((g) => ({ key: g.id, label: dateText(g.endedAt), value: g.answered, rate: g.answered ? g.correct / g.answered : null }))} barName="Questions answered" rateName="Accuracy" />
                  <div className="mt-4">
                    <TableBox caption="Each game, oldest first" minWidth={340}>
                      <thead className="bg-surface-2">
                        <tr>
                          <Th>Game</Th>
                          <Th>Right</Th>
                          <Th align="right">Place</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.games.map((g) => (
                          <tr key={g.id} className="border-t border-line">
                            <td className="px-3 py-2.5">
                              <Link to={`/reports/${g.id}`} className="font-semibold">
                                {g.mode}: {g.setTitle}
                              </Link>
                              <span className="block text-xs text-text-3">
                                {dateText(g.endedAt)}
                                {g.leftEarly ? ', left early' : ''}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">{g.answered ? <RateBar rate={g.correct / g.answered} /> : <NoValue label="No answers" />}</td>
                            <td className="px-3 py-2.5 text-right text-text tabular">
                              {ordinal(g.rank)} of {g.players}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </TableBox>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <section aria-labelledby="by-subject">
                    <SectionTitle>
                      <span id="by-subject">By subject</span>
                    </SectionTitle>
                    <ul className="flex flex-col gap-2" aria-label="By subject">
                      {d.bySubject.map((s) => (
                        <li key={s.subject} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3">
                          <span className="font-semibold text-text">
                            {SUBJECT_LABELS[s.subject as Subject] ?? s.subject} <span className="text-sm font-normal text-text-3">({plural(s.games, 'game')})</span>
                          </span>
                          {s.answered ? <RateBar rate={s.correct / s.answered} /> : <NoValue label="No answers" />}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section aria-labelledby="by-type">
                    <SectionTitle>
                      <span id="by-type">By question type</span>
                    </SectionTitle>
                    {d.byType.length ? (
                      <ul className="flex flex-col gap-2" aria-label="By question type">
                        {d.byType.map((t) => (
                          <li key={t.type} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3">
                            <span className="font-semibold text-text">
                              {questionTypeLabel(t.type) ?? 'Other'} <span className="text-sm font-normal text-text-3">({plural(t.answered, 'question')})</span>
                            </span>
                            <RateBar rate={t.answered ? t.right / t.answered : 0} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-3">No graded answers yet.</p>
                    )}
                    <p className="mt-2 text-xs text-text-3">
                      <Badge>First tries</Badge> Each question counts once per game, on the first try.
                    </p>
                  </section>
                </div>
              </>
            )}
          </>
        );
      }}
    </ReportGate>
  );
}

export default StudentsList;
