import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlarmClock, BarChart3, ChevronRight, ClipboardList, PencilLine, Play, Plus, Presentation } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { useNow } from '../../lib/useNow.ts';
import { Badge, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { classKeys, useClassList, type ClassDetail, type StudentAssignment } from '../classes/classData.ts';
import { ClassIcon, DueLabel, JoinCode } from '../classes/classUi.tsx';
import { JoinPanel } from '../classes/Classes.tsx';
import { errorText } from '../reports/reportUi.tsx';
import { studentWork } from '../classes/classLogic.ts';

/*
 * The first thing to do, for whoever is signed in. A teacher gets their classes,
 * their last game's report and the three things teachers start with; a student
 * gets the assignments waiting for them, or a way to join their class. Players
 * who are neither keep the plain dashboard.
 */

interface HostedGame {
  id: string;
  mode: string;
  setTitle: string;
  players: number;
  endedAt: string;
}

function ActionTile({ to, icon, title, text, tone }: { to: string; icon: React.ReactNode; title: string; text: string; tone: string }) {
  return (
    <Link to={to} className="press-soft group flex min-h-[4.5rem] items-center gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 text-text no-underline transition-colors hover:border-line-strong hover:bg-surface-3">
      <span className={`grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] text-on-accent ${tone}`} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-text-2">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function TeacherNextUp() {
  const classes = useClassList(true);
  const hosted = useQuery({
    queryKey: ['reports', 'hosted', 'latest'],
    queryFn: () => api.get<{ games: HostedGame[] }>('/api/me/hosted'),
  });
  const active = (classes.data?.teaching ?? []).filter((c) => !c.archived);
  const last = hosted.data?.games[0];
  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="teaching-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="teaching-title" className="font-display text-[1.75rem] leading-tight font-bold">
          Your teaching
        </h2>
        <Link to="/classes" className="text-sm font-semibold">
          All classes
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <ActionTile to="/host" icon={<Presentation className="size-5" />} title="Host a game" text="Pick a set and a mode, then share the code." tone="bg-lantern" />
        <ActionTile to="/sets/new" icon={<PencilLine className="size-5" />} title="Write a question set" text="Type questions in, or import a spreadsheet." tone="bg-sky" />
        <ActionTile to="/classes?new=1" icon={<Plus className="size-5" />} title="Make a class" text="Students join with a code. Set homework." tone="bg-glim" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="teaching-classes">
          <h3 id="teaching-classes" className="mb-2 text-sm font-semibold text-text-2">
            Classes
          </h3>
          {classes.isError ? (
            <ErrorNotice message="Your classes did not load." onRetry={() => void classes.refetch()} />
          ) : classes.isPending ? (
            <Skeleton className="h-28" />
          ) : active.length === 0 ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-m)] bg-surface-2 p-4">
              <ClassIcon />
              <p className="text-sm text-text-2">
                <span className="block font-bold text-text">No classes yet</span>A class keeps your students together: they join with a code, you set games as homework, and you see who played and which questions were hard.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <Link to={`/classes/${c.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-2.5 text-text no-underline transition-colors hover:bg-surface-3">
                    <ClassIcon />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">{c.name}</span>
                      <span className="block text-sm text-text-3">
                        {plural(c.members, 'student')}, {plural(c.assignments, 'assignment')}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-xs text-text-3">Join code</span>
                      <JoinCode code={c.joinCode} className="text-base" />
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
                  </Link>
                </li>
              ))}
              {active.length > 3 ? (
                <li className="px-1 text-sm text-text-3">
                  And {plural(active.length - 3, 'more class', 'more classes')}. <Link to="/classes">See them all</Link>
                </li>
              ) : null}
            </ul>
          )}
        </section>
        <section aria-labelledby="teaching-last">
          <h3 id="teaching-last" className="mb-2 text-sm font-semibold text-text-2">
            Your last game
          </h3>
          {hosted.isPending ? (
            <Skeleton className="h-28" />
          ) : last ? (
            <Link to={`/reports/${last.id}`} className="flex min-h-28 flex-col justify-between gap-3 rounded-[var(--radius-m)] bg-surface-2 p-4 text-text no-underline transition-colors hover:bg-surface-3">
              <span>
                <span className="block font-display text-xl leading-tight font-bold break-words">{last.mode}</span>
                <span className="block text-sm break-words text-text-2">
                  {last.setTitle}, {plural(last.players, 'player')}, {timeAgo(last.endedAt)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-link">
                <BarChart3 className="size-4" aria-hidden />
                See which questions were hard
              </span>
            </Link>
          ) : (
            <div className="rounded-[var(--radius-m)] bg-surface-2 p-4 text-sm text-text-2">
              <span className="block font-bold text-text">No games hosted yet</span>
              After a game you see every player&apos;s score and the questions that tripped people up.
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}

function StudentNextUp() {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const list = useClassList(true);
  const member = list.data?.member ?? [];
  const details = useQueries({
    queries: member.slice(0, 6).map((c) => ({
      queryKey: classKeys.detail(c.id),
      queryFn: () => api.get<ClassDetail>(`/api/classes/${encodeURIComponent(c.id)}`),
    })),
  });
  const [starting, setStarting] = useState<string | null>(null);
  if (list.isError) return <ErrorNotice message="Your classes did not load." onRetry={() => void list.refetch()} />;
  if (list.isPending) return <Skeleton className="h-36" />;
  // Not in a class yet: joining one is the first thing a student does.
  if (member.length === 0) return <JoinPanel />;

  const waiting: (StudentAssignment & {
    className: string;
    archived: boolean;
  })[] = [];
  for (const d of details) {
    const data = d.data;
    if (!data || data.role !== 'student' || data.class.archived) continue;
    // Closed work, or work with no tries left, is not waiting for anyone.
    for (const a of data.assignments)
      if (!a.mine && !a.blocked)
        waiting.push({
          ...a,
          className: data.class.name,
          archived: data.class.archived,
        });
  }
  // Soonest due first; no due date last.
  waiting.sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));
  const loading = details.some((d) => d.isPending);
  const soon = waiting.filter((a) => studentWork(a, now) === 'dueSoon');
  const late = waiting.filter((a) => studentWork(a, now) === 'overdue');

  const play = async (id: string) => {
    setStarting(id);
    try {
      const res = await api.post<{ code: string }>(`/api/assignments/${id}/play`);
      navigate(`/room/${res.code}`);
    } catch (err) {
      setStarting(null);
      toast.error(errorText(err, 'Could not start the assignment. Check your connection and try again.'));
    }
  };

  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="homework-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="homework-title" className="font-display text-[1.75rem] leading-tight font-bold">
          From your teacher
        </h2>
        <Link to="/classes" className="text-sm font-semibold">
          {member.length === 1 ? member[0]!.name : 'Your classes'}
        </Link>
      </div>
      {loading && waiting.length === 0 ? (
        <Skeleton className="h-20" />
      ) : waiting.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[var(--radius-m)] bg-surface-2 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] bg-glim text-on-accent" aria-hidden>
            <ClipboardList className="size-6" />
          </span>
          <p className="text-sm text-text-2">
            <span className="block font-bold text-text">You are all caught up</span>
            New assignments from {member.length === 1 ? member[0]!.teacher : 'your teachers'} show up here.
          </p>
        </div>
      ) : (
        <>
          {soon.length || late.length ? (
            <p className="mb-3 flex items-start gap-2 rounded-[var(--radius-m)] border-l-4 border-lantern bg-surface-2 p-3 text-sm text-text" role="status">
              <AlarmClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {soon.length ? `${plural(soon.length, 'assignment')} due in the next two days.` : ''}
                {soon.length && late.length ? ' ' : ''}
                {late.length ? `${plural(late.length, 'assignment')} past due: you can still play ${late.length === 1 ? 'it' : 'them'}.` : ''}
              </span>
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {waiting.slice(0, 3).map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-[var(--radius-m)] bg-surface-2 p-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold break-words">
                    {a.title}
                    {studentWork(a, now) === 'dueSoon' ? <Badge tone="amber">Due soon</Badge> : null}
                  </p>
                  <p className="text-sm break-words text-text-2">
                    {a.className}, {a.setTitle}
                  </p>
                  <p className="mt-1 text-sm">
                    <DueLabel dueAt={a.dueAt} now={now} />
                  </p>
                </div>
                <Button
                  variant="primary"
                  icon={<Play className="size-4" aria-hidden />}
                  loading={starting === a.id}
                  disabled={starting !== null && starting !== a.id}
                  onClick={() => void play(a.id)}
                  aria-label={`Play: ${a.title}`}
                  className="self-start sm:self-center"
                >
                  Play
                </Button>
              </li>
            ))}
            {waiting.length > 3 ? (
              <li className="px-1 text-sm text-text-3">
                And {plural(waiting.length - 3, 'more')}. <Link to="/classes">See your classes</Link>
              </li>
            ) : null}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Teachers and students get their next step; guests and other players get nothing extra. */
export function NextUp() {
  const me = useMe();
  const user = me.data?.user;
  if (!user || user.isGuest) return null;
  if (user.accountType === 'teacher') return <TeacherNextUp />;
  if (user.accountType === 'student') return <StudentNextUp />;
  return null;
}

