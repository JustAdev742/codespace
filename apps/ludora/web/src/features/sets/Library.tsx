import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { SUBJECTS, SUBJECT_LABELS } from '@ludora/shared';
import { useMe } from '../../lib/session.ts';
import { useSets } from '../../lib/queries.ts';
import { Badge, EmptyState, ErrorNotice, Input, PageHeader, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { SetCover } from './SetCover.tsx';

export default function Library() {
  const me = useMe();
  const [scope, setScope] = useState<'public' | 'official' | 'mine'>('public');
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);
  const sets = useSets({ scope, q: q || undefined, subject: subject || undefined, page });
  const pages = sets.data ? Math.max(1, Math.ceil(sets.data.total / sets.data.pageSize)) : 1;
  return (
    <>
      <PageHeader
        title="Question sets"
        description="Every set works with every game mode. Start from the library or write your own."
        actions={me.data?.user && !me.data.user.isGuest ? <ButtonLink to="/sets/new" variant="primary" icon={<Plus className="size-4" />}>New set</ButtonLink> : null}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(['public', 'official', ...(me.data?.user ? ['mine'] : [])] as const).map((s) => (
          <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s as typeof scope); setPage(1); }} className={`h-9 rounded-full px-4 text-sm font-semibold ${scope === s ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
            {s === 'public' ? 'Everything' : s === 'official' ? 'By Ludora' : 'My sets'}
          </button>
        ))}
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search sets" className="h-10 pl-9" />
          </label>
          <label>
            <span className="sr-only">Subject</span>
            <Select value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }} className="h-10 w-40">
              <option value="">All subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      {sets.isError ? <ErrorNotice message="Sets could not be loaded." onRetry={() => sets.refetch()} /> : null}
      {sets.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : sets.data && sets.data.sets.length === 0 ? (
        <EmptyState title={scope === 'mine' ? 'No sets yet' : 'Nothing matches'} action={scope === 'mine' ? <ButtonLink to="/sets/new" variant="primary">Make your first set</ButtonLink> : undefined}>
          {scope === 'mine' ? 'Write questions once and play them in any mode.' : 'Try a different word or subject.'}
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(sets.data?.sets ?? []).map((s) => (
              <li key={s.id}>
                <Link to={`/sets/${s.id}`} className="text-text no-underline flex h-full gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-4 transition-colors hover:border-line-strong">
                  <SetCover cover={s.cover} subject={s.subject} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-lg leading-tight font-bold">{s.title}</h2>
                      {s.visibility !== 'public' ? <Badge>{s.visibility === 'private' ? 'Private' : 'Unlisted'}</Badge> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-2">{s.description}</p>
                    <p className="mt-2 text-xs text-text-3">
                      {s.questionCount} questions, {SUBJECT_LABELS[s.subject as keyof typeof SUBJECT_LABELS] ?? s.subject}
                      {s.ownerName ? `, by ${s.ownerName}` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-text-2 tabular">
                Page {page} of {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
