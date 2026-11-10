import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarX, HandHelping, Lightbulb, ListRestart, Timer } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { duration, plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Panel, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { errorText, percent, questionTypeLabel, RateBar } from '../reports/reportUi.tsx';
import { classKeys, type InsightsData } from './classData.ts';

/*
 * What the class's results say: who may need a hand (and with what), the questions
 * the class missed most with a one-click reteach set, accuracy by question type, and
 * how long students spent on each assignment.
 */

const THRESHOLDS = [0.5, 0.6, 0.7, 0.8];

function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  const id = useId();
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="flex items-center gap-2 font-display text-xl font-bold text-text">
          <span className="grid size-8 place-items-center rounded-[var(--radius-s)] bg-surface-3 text-text-2" aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </Panel>
  );
}

function Reteach({ classId, data }: { classId: string; data: InsightsData }) {
  const qc = useQueryClient();
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{
    id: string;
    title: string;
    questionCount: number;
  } | null>(null);
  const make = async () => {
    setBusy(true);
    try {
      const res = await api.post<{
        set: { id: string; title: string; questionCount: number };
      }>(`/api/classes/${classId}/reteach`, { count });
      setMade(res.set);
      toast.success(`${res.set.title} is in your sets`);
      void qc.invalidateQueries({ queryKey: ['sets'] });
    } catch (err) {
      toast.error(errorText(err, 'The reteach set was not made. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };
  if (!data.mostMissed.length) return <p className="text-sm text-text-3">Questions show up here once someone gets one wrong.</p>;
  return (
    <>
      <ol className="flex flex-col gap-2">
        {data.mostMissed.map((m, i) => (
          <li key={`${m.setId}-${m.questionId}`} className="flex flex-col gap-1.5 rounded-[var(--radius-m)] bg-surface-2 p-3 sm:flex-row sm:items-center sm:gap-3">
            <span className="w-6 shrink-0 font-display text-lg font-bold text-text-3 tabular" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-text">{m.prompt}</span>
              <span className="block text-xs text-text-3">
                {questionTypeLabel(m.type) ?? 'Question'}
                {m.setTitle ? `, ${m.setTitle}` : ''}, missed {plural(m.wrong, 'time')} of {m.tries}
              </span>
            </span>
            <span className="shrink-0" aria-label={`${percent(m.rate)} right first time`}>
              <RateBar rate={m.rate} />
            </span>
          </li>
        ))}
      </ol>
      {made ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 sm:flex-row sm:items-center" role="status">
          <p className="min-w-0 flex-1 text-sm text-text">
            <strong className="font-semibold break-words">{made.title}</strong> is a private set in your library with {plural(made.questionCount, 'question')}, hardest first. Set it as an assignment, or host it live.
          </p>
          <ButtonLink to={`/sets/${made.id}`} size="sm">
            Open the set
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            Questions
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-28">
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  Up to {n}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="primary" icon={<ListRestart className="size-4" aria-hidden />} loading={busy} onClick={() => void make()}>
            Make a reteach set
          </Button>
        </div>
      )}
    </>
  );
}

export function InsightsPanel({ classId }: { classId: string }) {
  const [threshold, setThreshold] = useState(0.6);
  const q = useQuery({
    queryKey: [...classKeys.insights(classId), threshold],
    queryFn: () => api.get<InsightsData>(`/api/classes/${encodeURIComponent(classId)}/insights?threshold=${threshold}`),
    placeholderData: (prev) => prev,
  });
  const data = q.data;
  if (q.isPending) return <Skeleton className="h-64" />;
  if (!data) return <ErrorNotice message={errorText(q.error, 'Insights did not load.')} onRetry={() => void q.refetch()} />;
  if (!data.assignments.length) {
    return (
      <EmptyState icon={<Lightbulb className="size-8" />} title="Insights need some results">
        Set an assignment. Once students play it, this shows who may need a hand, which questions tripped the class up and how long work took.
      </EmptyState>
    );
  }
  const help = data.needsAHand;
  const titleOf = new Map(data.assignments.map((a) => [a.id, a.title]));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Card
        title="May need a hand"
        icon={<HandHelping className="size-4" />}
        action={
          <label className="flex items-center gap-2 text-sm text-text-2">
            Under
            <Select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="h-10 w-24" aria-label="Right-first-time threshold">
              {THRESHOLDS.map((t) => (
                <option key={t} value={t}>
                  {percent(t)}
                </option>
              ))}
            </Select>
          </label>
        }
      >
        <p className="text-sm text-text-2">
          Students under {percent(help.threshold)} right first time in the last {help.days} days, from at least 5 answers, with the questions they missed most recently.
        </p>
        {help.students.length === 0 ? (
          <p className="rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm text-text">Nobody is under {percent(help.threshold)} right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {help.students.map((s) => (
              <li key={s.id} className="rounded-[var(--radius-m)] bg-surface-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/classes/${classId}/students/${s.id}`} className="font-semibold break-words text-text">
                    {s.displayName}
                  </Link>
                  <span className="text-sm text-text-2">
                    <span className="font-display text-lg font-bold text-text tabular">{percent(s.rate)}</span> right first time, of {s.answers}
                  </span>
                </div>
                {s.missed.length ? (
                  <ul className="mt-1.5 list-disc pl-5 text-sm text-text-2">
                    {s.missed.map((m) => (
                      <li key={`${m.setId}-${m.questionId}`} className="break-words">
                        {m.prompt}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.overdue ? <p className="mt-1.5 text-sm text-text-2">{plural(s.overdue, 'assignment')} past due and not played.</p> : null}
              </li>
            ))}
          </ul>
        )}
        {help.notStarted.length ? (
          <div className="flex items-start gap-2 text-sm text-text-2">
            <CalendarX className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
            <p>
              <span className="font-semibold text-text">Not started work that is due: </span>
              {help.notStarted.map((s, i) => (
                <span key={s.id}>
                  {i ? ', ' : ''}
                  <Link to={`/classes/${classId}/students/${s.id}`}>{s.displayName}</Link> ({s.overdue})
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </Card>

      <Card title="Most missed" icon={<ListRestart className="size-4" />}>
        <p className="text-sm text-text-2">Across every assignment, judged on each student’s first try in each game.</p>
        <Reteach classId={classId} data={data} />
      </Card>

      <Card title="By question type" icon={<Lightbulb className="size-4" />}>
        {data.byType.length === 0 ? (
          <p className="text-sm text-text-3">Shows once students have answered.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.byType.map((t) => (
              <li key={t.type} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-text">
                  {questionTypeLabel(t.type) ?? 'Other'}
                  <span className="block text-xs text-text-3">{plural(t.answers, 'answer')}</span>
                </span>
                <span aria-label={`${percent(t.rate)} right first time`}>
                  <RateBar rate={t.rate} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Time on task" icon={<Timer className="size-4" />}>
        <p className="text-sm text-text-2">Time in each assignment’s games, added up per student. The middle student is the median.</p>
        <ul className="flex flex-col gap-2">
          {data.timeOnTask.map((t) => (
            <li key={t.assignmentId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
              <span className="min-w-0 font-semibold break-words text-text">{titleOf.get(t.assignmentId)}</span>
              <span className="text-sm text-text-2">
                {t.students ? (
                  <>
                    <span className="font-display text-lg font-bold text-text tabular">{duration(t.medianMs ?? 0)}</span> median, {duration(t.totalMs)} in all, {plural(t.students, 'student')}
                  </>
                ) : (
                  'Not played yet'
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
