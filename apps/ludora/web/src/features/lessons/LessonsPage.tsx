import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, LayoutTemplate, ListOrdered, Plus } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, Panel, SectionTitle, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { errorText, usePageTitle } from '../reports/reportUi.tsx';
import { lessonKeys, minutesText, startsText, useLessons, useTemplates } from './data.ts';

/*
 * /lessons: a teacher's lessons, a new blank one, or one from a template. A lesson is an ordered
 * list of steps (games, info slides, discussions) run in one room.
 */

function useCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const create = async (key: string, body: object) => {
    setBusy(key);
    try {
      const res = await api.post<{ id: string }>('/api/lessons', body);
      void qc.invalidateQueries({ queryKey: lessonKeys.list, exact: true });
      navigate(`/lessons/${res.id}`);
    } catch (err) {
      toast.error(errorText(err, 'Could not make the lesson. Try again.'));
      setBusy(null);
    }
  };
  return { busy, create };
}

export default function LessonsPage() {
  usePageTitle('Lessons');
  const me = useMe();
  const teacher = me.data?.user?.accountType === 'teacher' && !me.data.user.isGuest;
  const list = useLessons(teacher);
  const templates = useTemplates(teacher);
  const { busy, create } = useCreate();

  if (me.isLoading) return <Skeleton className="h-40" />;
  if (!teacher) {
    return (
      <>
        <PageHeader title="Lessons" />
        <EmptyState icon={<ListOrdered />} title="Lessons are for teachers" action={<ButtonLink to="/settings">Open Settings</ButtonLink>}>
          A lesson runs several games and teaching steps in one room. Plan one with a teacher account; you can switch to one in Settings.
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Lessons"
        description="Plan a whole lesson: games, info slides and discussions in order, run in one room with the same players from start to finish."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} loading={busy === 'blank'} onClick={() => void create('blank', {})}>
            New lesson
          </Button>
        }
      />
      <section aria-labelledby="your-lessons" className="mb-8">
        <SectionTitle>
          <span id="your-lessons">Your lessons</span>
        </SectionTitle>
        {list.isError ? (
          <ErrorNotice message="Your lessons could not be loaded." onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <Skeleton className="h-24" />
        ) : list.data.lessons.length === 0 ? (
          <EmptyState icon={<ListOrdered />} title="No lessons yet">
            Start with a blank lesson or one of the templates below.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data.lessons.map((l) => (
              <li key={l.id} className="relative flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-4 transition-colors hover:border-line-strong hover:bg-surface-2">
                <h3 className="font-display text-xl leading-tight font-bold break-words">
                  <Link to={`/lessons/${l.id}`} className="text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-l)]">
                    {l.title}
                  </Link>
                </h3>
                <p className="text-sm text-text-2">
                  {plural(l.steps, 'step')}, {plural(l.games, 'game')}. {minutesText(l.minutes)}.
                </p>
                {l.startsAt && l.className ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarClock className="size-4 shrink-0 text-text-3" aria-hidden />
                    <span>
                      {l.className}: {startsText(l.startsAt)}
                    </span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Panel className="p-5" aria-labelledby="templates">
        <h2 id="templates" className="mb-1 flex items-center gap-2 font-display text-2xl font-bold">
          <LayoutTemplate className="size-6 text-text-3" aria-hidden /> Start from a template
        </h2>
        <p className="mb-4 text-sm text-text-2">Each template sets out the steps; you choose the question sets.</p>
        {templates.isError ? (
          <ErrorNotice message="Templates could not be loaded." onRetry={() => void templates.refetch()} />
        ) : templates.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {templates.data.templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-4">
                <h3 className="font-display text-xl leading-tight font-bold">{t.title}</h3>
                <p className="text-sm text-text-2">{t.description}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <Badge>{plural(t.steps, 'step')}</Badge>
                  <Button size="sm" loading={busy === t.id} onClick={() => void create(t.id, { template: t.id })} aria-label={`Use this template: ${t.title}`}>
                    Use this
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
