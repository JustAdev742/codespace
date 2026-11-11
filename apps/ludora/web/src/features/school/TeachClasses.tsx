import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronRight, Presentation, School, Swords, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { BackLink, errorText, usePageTitle } from '../reports/reportUi.tsx';
import { HostSchoolGame, type SchoolGameKind } from './HostSchoolGame.tsx';

/*
 * /school/classes, for teachers: host a house match, class against class or an assembly, and open
 * a class to sort its students into houses, give merits and set its sport days.
 */
export default function TeachClasses() {
  usePageTitle('My classes');
  const classes = useQuery({ queryKey: ['school', 'my-classes'], queryFn: () => api.get<{ classes: { id: string; name: string; members: number }[] }>('/api/school/my-classes') });
  const [game, setGame] = useState<SchoolGameKind | null>(null);
  return (
    <>
      <BackLink to="/school">School</BackLink>
      <PageHeader title="My classes" description="Houses, merits and sport days for your classes, and live games with school teams." />
      <Panel className="mb-6 flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="school-games">
        <h2 id="school-games" className="font-display text-2xl font-bold text-text">
          Host with school teams
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Users className="size-4" />} onClick={() => setGame({ kind: 'houses' })}>
            House match
          </Button>
          <Button icon={<Swords className="size-4" />} onClick={() => setGame({ kind: 'classes' })}>
            Class against class
          </Button>
          <Button icon={<Presentation className="size-4" />} onClick={() => setGame({ kind: 'assembly' })}>
            Run an assembly
          </Button>
        </div>
      </Panel>
      {classes.isPending ? <Skeleton className="h-40" /> : null}
      {classes.isError ? <ErrorNotice message={errorText(classes.error, 'Your classes did not load.')} onRetry={() => void classes.refetch()} /> : null}
      {classes.data && !classes.data.classes.length ? (
        <EmptyState icon={<School />} title="No classes yet" action={<ButtonLink to="/classes" variant="primary">Make a class</ButtonLink>}>
          Make a class and invite your students, then sort them into houses here.
        </EmptyState>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {classes.data?.classes.map((c) => (
          <li key={c.id}>
            <Link to={`/school/classes/${c.id}`} className="press-soft flex min-h-16 items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4 text-text">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block text-sm text-text-3">{plural(c.members, 'member')}</span>
              </span>
              <ChevronRight className="size-5 text-text-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {game ? <HostSchoolGame open onOpenChange={(v) => !v && setGame(null)} game={game} /> : null}
    </>
  );
}
