import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { SUBJECTS, SUBJECT_LABELS } from '@ludora/shared';
import { useMe } from '../../lib/session.ts';
import { useSets } from '../../lib/queries.ts';
import { plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, Input, PageHeader, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { SetCover } from './SetCover.tsx';

type Scope = 'public' | 'official' | 'mine';
const SCOPE_LABEL: Record<Scope, string> = { public: 'Everything', official: 'By Ludora', mine: 'My sets' };

export default function Library() {
  const me = useMe();
  const [scope, setScope] = useState<Scope>('public');
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
        <ToggleChips<Scope>
          value={scope}
          onChange={(s) => {
            setScope(s);
            setPage(1);
          }}
          label="Which sets to show"
          options={(['public', 'official', ...(me.data?.user ? (['mine'] as const) : [])] as Scope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
        />
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search sets" className="pl-9" />
          </label>
          <label>
            <span className="sr-only">Subject</span>
            <Select value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }} className="w-40">
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
                <Link to={`/sets/${s.id}`} className="flex h-full gap-3.5 rounded-[var(--radius-l)] border border-line bg-raised p-4 text-text no-underline transition-colors hover:border-line-strong hover:bg-surface-2">
                  <SetCover cover={s.cover} subject={s.subject} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-xl leading-tight font-bold">{s.title}</h2>
                      {s.visibility !== 'public' ? <Badge>{s.visibility === 'private' ? 'Private' : 'Unlisted'}</Badge> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-2">{s.description}</p>
                    <p className="mt-2 text-xs text-text-3">
                      {plural(s.questionCount, 'question')}, {SUBJECT_LABELS[s.subject as keyof typeof SUBJECT_LABELS] ?? s.subject}
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
