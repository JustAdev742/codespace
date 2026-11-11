import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { BackLink, dateTimeText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { KIND_LABEL, lessonKeys, type RunReport } from './data.ts';
import { HomeworkDialog } from './Homework.tsx';

/*
 * /lessons/runs/:runId: one report for a lesson as it was run. Each step, each game with a link to
 * its own game report, the lesson standings and the goals, and homework from its sets.
 */

export default function LessonReport() {
  const { runId = '' } = useParams();
  const report = useQuery({ queryKey: lessonKeys.report(runId), queryFn: () => api.get<RunReport>(`/api/lessons/runs/${runId}`), retry: false });
  const [homework, setHomework] = useState(false);
  usePageTitle(report.data ? `${report.data.lesson.title}: lesson report` : 'Lesson report');
  if (report.isPending) return <Skeleton className="h-64" />;
  if (report.isError) {
    return (
      <>
        <BackLink to="/lessons">All lessons</BackLink>
        {hasStatus(report.error, 404, 403) ? (
          <EmptyState title="Lesson report not found" action={<ButtonLink to="/lessons">Your lessons</ButtonLink>}>
            It may have been deleted with its lesson.
          </EmptyState>
        ) : (
          <ErrorNotice message="The lesson report could not be loaded." onRetry={() => void report.refetch()} />
        )}
      </>
    );
  }
  const r = report.data;
  return (
    <>
      <BackLink to={`/lessons/${r.lesson.id}`}>{r.lesson.title}</BackLink>
      <PageHeader
        title="Lesson report"
        description={`${r.lesson.title}, ${dateTimeText(r.run.startedAt)}. ${r.run.finishedAt ? 'Finished.' : `Stopped at step ${r.run.index + 1} of ${r.steps.length}.`}`}
        actions={
          r.sets.length ? (
            <Button icon={<ClipboardList className="size-4" aria-hidden />} onClick={() => setHomework(true)}>
              Set homework
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        {r.lesson.goals.length ? (
          <Panel className="p-5" aria-labelledby="goals">
            <h2 id="goals" className="mb-2 font-display text-2xl font-bold">
              Today we
            </h2>
            <ul className="flex flex-col gap-1.5">
              {r.lesson.goals.map((g, i) => (
                <li key={i} className="flex gap-2 break-words">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-text-3" aria-hidden /> {g}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        <Panel className="p-5" aria-labelledby="steps">
          <h2 id="steps" className="mb-3 font-display text-2xl font-bold">
            Steps and games
          </h2>
          <ol className="flex flex-col gap-2">
            {r.steps.map((s, i) => {
              const games = r.games.filter((g) => g.index === i);
              return (
                <li key={i} className="flex flex-col gap-1 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2.5">
                  <p className="font-semibold break-words">
                    {i + 1}. {s.title} <span className="text-sm font-normal text-text-2">({KIND_LABEL[s.kind]}{i > r.run.index ? ', not reached' : ''})</span>
                  </p>
                  {games.map((g, j) => (
                    <p key={j} className="text-sm">
                      {g.gameId ? (
                        <Link to={`/reports/${g.gameId}`} className="font-semibold">
                          Game report{games.length > 1 ? ` ${j + 1}` : ''}: {g.modeTitle ?? g.title}
                        </Link>
                      ) : (
                        <span className="text-text-2">The report for this game was deleted.</span>
                      )}
                      {g.players !== null ? <span className="text-text-2"> · {plural(g.players, 'player')}</span> : null}
                    </p>
                  ))}
                  {s.kind === 'game' && i <= r.run.index && !games.length ? <p className="text-sm text-text-2">Not played.</p> : null}
                </li>
              );
            })}
          </ol>
        </Panel>
        {r.lesson.standingsOn ? (
          <Panel className="p-5" aria-labelledby="standings">
            <h2 id="standings" className="mb-3 font-display text-2xl font-bold">
              Lesson standings
            </h2>
            {r.standings.length ? (
              <table className="w-full text-left">
                <caption className="sr-only">Lesson points, best first</caption>
                <thead>
                  <tr className="border-b border-line text-sm text-text-2">
                    <th scope="col" className="py-1.5 pr-3">
                      Place
                    </th>
                    <th scope="col" className="py-1.5 pr-3">
                      Name
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.standings.map((s, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-3 tabular">{s.rank}</td>
                      <td className="py-1.5 pr-3 break-words">{s.name}</td>
                      <td className="py-1.5 text-right tabular">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-text-2">No games were finished, so there are no points.</p>
            )}
          </Panel>
        ) : null}
      </div>
      <HomeworkDialog runId={r.run.id} classId={r.run.classId} open={homework} onOpenChange={setHomework} />
    </>
  );
}
