import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ListOrdered, Printer, Timer } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { formatDate, plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { PrintSheet, usePrinting } from '../classes/PrintSheet.tsx';
import { errorText, usePageTitle } from '../reports/reportUi.tsx';
import { makingKeys } from './data.ts';
import { dayBounds } from './day.ts';

/*
 * /today: a teacher's day on one page. The lessons planned for it, the homework due, what is due
 * in the coming week, and work past its date that someone has still not done, each one press
 * from its report. Classroom tools for each class are one press away. Prints on one sheet.
 */

interface Work {
  id: string;
  classId: string;
  className: string;
  title: string;
  dueAt: string | null;
  students: number;
  done: number;
}

interface TodayData {
  lessons: { id: string; title: string; startsAt: string | null; classId: string | null; className: string | null; steps: number }[];
  dueToday: Work[];
  dueSoon: Work[];
  followUp: Work[];
  classes: { id: string; name: string }[];
}

const time = (iso: string) => formatDate(iso, { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

function WorkRow({ w, when }: { w: Work; when: 'time' | 'day' }) {
  const missing = w.students - w.done;
  return (
    <li className="relative flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-m)] border border-line bg-raised p-3 hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <Link to={`/classes/${w.classId}/assignments/${w.id}`} className="block font-bold break-words text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-m)]">
          {w.title}
        </Link>
        <p className="text-sm text-text-2">
          {w.className}
          {w.dueAt ? `, due ${when === 'time' ? time(w.dueAt) : `${day(w.dueAt)} ${time(w.dueAt)}`}` : ''}
        </p>
      </div>
      <Badge tone={missing === 0 ? 'mint' : 'neutral'}>
        {w.done} of {plural(w.students, 'student')} done
      </Badge>
    </li>
  );
}

function Section({ id, title, icon, empty, children, count }: { id: string; title: string; icon: React.ReactNode; empty: string; children: React.ReactNode; count: number }) {
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 font-display text-2xl font-bold">
        <span className="text-text-3" aria-hidden>
          {icon}
        </span>
        {title}
        {count ? <span className="text-base font-semibold text-text-2">({count})</span> : null}
      </h2>
      {count ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-sm text-text-2">{empty}</p>}
    </Panel>
  );
}

function Sheet({ data, label }: { data: TodayData; label: string }) {
  const line = (w: Work) => `${w.title} (${w.className}): ${w.done} of ${w.students} done${w.dueAt ? `, due ${day(w.dueAt)} ${time(w.dueAt)}` : ''}`;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{label}</h1>
      <h2 className="mt-4 text-lg font-bold">Lessons</h2>
      <ul>{data.lessons.length ? data.lessons.map((l) => <li key={l.id}>{`${l.startsAt ? time(l.startsAt) : ''} ${l.title}${l.className ? ` (${l.className})` : ''}, ${plural(l.steps, 'step')}`}</li>) : <li>None planned.</li>}</ul>
      <h2 className="mt-4 text-lg font-bold">Homework due</h2>
      <ul>{data.dueToday.length ? data.dueToday.map((w) => <li key={w.id}>{line(w)}</li>) : <li>None.</li>}</ul>
      <h2 className="mt-4 text-lg font-bold">To follow up</h2>
      <ul>{data.followUp.length ? data.followUp.map((w) => <li key={w.id}>{`${line(w)}; ${w.students - w.done} still to do`}</li>) : <li>Nothing.</li>}</ul>
      <h2 className="mt-4 text-lg font-bold">Due in the next week</h2>
      <ul>{data.dueSoon.length ? data.dueSoon.map((w) => <li key={w.id}>{line(w)}</li>) : <li>None.</li>}</ul>
    </div>
  );
}

export default function Today() {
  usePageTitle('Your day');
  const me = useMe();
  const teacher = me.data?.user?.accountType === 'teacher';
  const [offset, setOffset] = useState(0);
  const { from, to, key } = useMemo(() => dayBounds(new Date(), offset), [offset]);
  const today = useQuery({
    queryKey: makingKeys.today(key),
    queryFn: () => api.get<TodayData>(`/api/making/today?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
    enabled: teacher,
  });
  const printing = usePrinting();
  const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : formatDate(from, { weekday: 'long', day: 'numeric', month: 'long' });
  const fullLabel = `${label}, ${formatDate(from, { weekday: 'long', day: 'numeric', month: 'long' })}`;

  if (me.isLoading) return <Skeleton className="h-40" />;
  if (!teacher)
    return (
      <>
        <PageHeader title="Your day" />
        <EmptyState icon={<CalendarDays />} title="This is for teachers" action={<ButtonLink to="/">Go home</ButtonLink>}>
          The day view shows a teacher’s lessons and homework. You can switch to a teacher account in Settings.
        </EmptyState>
      </>
    );
  const d = today.data;
  return (
    <>
      <PageHeader
        eyebrow={<Link to="/make">Make</Link>}
        title="Your day"
        description={offset === 0 ? 'Lessons and homework for today, and anything that needs following up.' : undefined}
        actions={
          <Button icon={<Printer className="size-4" aria-hidden />} onClick={printing.print} disabled={!d}>
            Print
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <IconButton label="The day before" variant="secondary" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <p className="min-w-[12rem] text-center font-display text-xl font-bold" aria-live="polite">
          {fullLabel}
        </p>
        <IconButton label="The day after" variant="secondary" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
        {offset !== 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
            Back to today
          </Button>
        ) : null}
      </div>
      {today.isError ? <ErrorNotice message={errorText(today.error, 'Your day could not be loaded.')} onRetry={() => void today.refetch()} /> : null}
      {today.isPending ? <Skeleton className="h-60" /> : null}
      {d ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Section id="today-lessons" title="Lessons" icon={<ListOrdered className="size-6" />} empty="No lessons planned for this day. Plan one from Lessons and give it a class and a time." count={d.lessons.length}>
            {d.lessons.map((l) => (
              <li key={l.id} className="relative flex items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-3 hover:bg-surface-2">
                <span className="w-14 shrink-0 font-display text-lg font-bold tabular">{l.startsAt ? time(l.startsAt) : ''}</span>
                <div className="min-w-0 flex-1">
                  <Link to={`/lessons/${l.id}`} className="block font-bold break-words text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-m)]">
                    {l.title}
                  </Link>
                  <p className="text-sm text-text-2">
                    {l.className ? `${l.className}, ` : ''}
                    {plural(l.steps, 'step')}
                  </p>
                </div>
              </li>
            ))}
          </Section>
          <Section id="today-due" title="Homework due" icon={<ClipboardList className="size-6" />} empty="No homework is due on this day." count={d.dueToday.length}>
            {d.dueToday.map((w) => (
              <WorkRow key={w.id} w={w} when="time" />
            ))}
          </Section>
          <Section id="today-follow" title="To follow up" icon={<AlarmClock className="size-6" />} empty="Nothing to follow up: everyone has played the work due in the last fortnight." count={d.followUp.length}>
            {d.followUp.map((w) => (
              <WorkRow key={w.id} w={w} when="day" />
            ))}
          </Section>
          <Section id="today-soon" title="Due in the next week" icon={<CalendarDays className="size-6" />} empty="Nothing is due in the week after this day." count={d.dueSoon.length}>
            {d.dueSoon.map((w) => (
              <WorkRow key={w.id} w={w} when="day" />
            ))}
          </Section>
          {d.classes.length ? (
            <Panel className="flex flex-col gap-3 p-4 sm:p-5 lg:col-span-2" aria-labelledby="today-tools">
              <h2 id="today-tools" className="flex items-center gap-2 font-display text-2xl font-bold">
                <Timer className="size-6 text-text-3" aria-hidden /> Classroom tools
              </h2>
              <p className="text-sm text-text-2">A fair picker, groups, a timer, a check-in and a scoreboard, ready for the board.</p>
              <ul className="flex flex-wrap gap-2">
                {d.classes.map((c) => (
                  <li key={c.id}>
                    <ButtonLink to={`/classes/${c.id}/tools`} size="sm" aria-label={`Classroom tools for ${c.name}`}>
                      {c.name}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyState title="No classes yet" action={<ButtonLink to="/classes?new=1" variant="primary">Make a class</ButtonLink>}>
              Homework and classroom tools need a class. Students join with a code.
            </EmptyState>
          )}
        </div>
      ) : null}
      {printing.printing && d ? (
        <PrintSheet onDone={printing.done} label="Your day">
          <Sheet data={d} label={fullLabel} />
        </PrintSheet>
      ) : null}
    </>
  );
}
