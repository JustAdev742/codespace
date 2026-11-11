import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { BackLink, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { KIND_LABEL, minutesText, useLesson } from './data.ts';

/*
 * /lessons/:id/print: the lesson plan on paper, for the teacher: goals, each step with its timing,
 * what it is, and the teacher's own plan notes. The print stylesheet hides the app around it and
 * prints black on white.
 */

export default function LessonPrint() {
  const { id = '' } = useParams();
  const lesson = useLesson(id);
  usePageTitle(lesson.data ? `${lesson.data.lesson.title}: plan` : 'Lesson plan');
  if (lesson.isPending) return <Skeleton className="h-64" />;
  if (lesson.isError) {
    return hasStatus(lesson.error, 404, 403) ? (
      <EmptyState title="Lesson not found" action={<ButtonLink to="/lessons">Your lessons</ButtonLink>}>
        It may have been deleted, or it belongs to someone else.
      </EmptyState>
    ) : (
      <ErrorNotice message="The lesson could not be loaded." onRetry={() => void lesson.refetch()} />
    );
  }
  const { lesson: l, info, totalMinutes } = lesson.data;
  let clock = 0;
  return (
    <div className="flex flex-col gap-5">
      <style>{`@media print { body { background: #fff !important; color: #000 !important; } body * { visibility: hidden; } [data-print-sheet], [data-print-sheet] * { visibility: visible; color: #000 !important; background: #fff !important; } [data-print-sheet] { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0 !important; border: 0 !important; } .print-step { break-inside: avoid; } }`}</style>
      <div className="flex flex-col gap-4">
        <BackLink to={`/lessons/${l.id}`}>{l.title}</BackLink>
        <PageHeader
          title="Print the lesson plan"
          description="Your plan with timings and your private notes, for you. Print it or save it as a PDF."
          actions={
            <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
              Print
            </Button>
          }
        />
      </div>
      <article data-print-sheet className="rounded-[var(--radius-l)] border border-line bg-white p-6 text-[#0b1020]">
        <h2 className="font-display text-3xl font-bold break-words">{l.title}</h2>
        <p className="mt-1 text-sm">
          {plural(l.steps.length, 'step')}, {minutesText(totalMinutes).toLowerCase()}.{l.className && l.startsAt ? ` ${l.className}, ${new Date(l.startsAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''}
          {l.standings ? ' Lesson standings on.' : ''}
        </p>
        {l.goals.length ? (
          <>
            <h3 className="mt-4 font-bold">Learning goals</h3>
            <ul className="list-disc pl-5">
              {l.goals.map((g, i) => (
                <li key={i} className="break-words">
                  {g}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <ol className="mt-4 flex flex-col gap-3">
          {l.steps.map((s, i) => {
            const at = clock;
            clock += info[i]?.minutes ?? 0;
            return (
              <li key={s.id} className="print-step border-t border-[#c8ccd8] pt-3">
                <p className="font-bold break-words">
                  {i + 1}. {info[i]?.title ?? KIND_LABEL[s.kind]}
                  <span className="font-normal">
                    {' '}
                    ({KIND_LABEL[s.kind]}, from {at} min, about {info[i]?.minutes ?? 0} min)
                  </span>
                </p>
                {s.kind === 'game' ? (
                  <p className="text-sm">
                    {info[i]?.modeTitle}
                    {info[i]?.setTitle ? ` with "${info[i]!.setTitle}"` : ''}
                    {s.common.questionLimit ? `, ${plural(s.common.questionLimit, 'question')}` : ''}
                  </p>
                ) : s.kind === 'slide' ? (
                  s.lines.length ? (
                    <ul className="list-disc pl-5 text-sm">
                      {s.lines.map((line, j) => (
                        <li key={j} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null
                ) : (
                  <p className="text-sm break-words">
                    "{s.prompt}" ({Math.round(s.seconds / 60) || 1} min)
                  </p>
                )}
                {s.note ? (
                  <p className="mt-1 text-sm break-words whitespace-pre-line">
                    <strong>Note:</strong> {s.note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </article>
    </div>
  );
}
