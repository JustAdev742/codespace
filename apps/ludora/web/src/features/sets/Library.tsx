import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookOpen, Plus, Search } from 'lucide-react';
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
  const canWrite = Boolean(me.data?.user && !me.data.user.isGuest);
  // The filters live in the address, so opening a set and coming back keeps them (they used to reset to page 1 of Everything).
  const [params, setParams] = useSearchParams();
  const rawScope = params.get('scope');
  const scope: Scope = rawScope === 'official' || (rawScope === 'mine' && canWrite) ? rawScope : 'public';
  const subject = params.get('subject') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (!v || (k === 'scope' && v === 'public') || (k === 'page' && v === '1')) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  // Typing searches after a short pause, not on every key.
  const [typed, setTyped] = useState(q);
  // Back and forward change the address: show its search in the box.
  useEffect(() => setTyped((t) => (t.trim() === q ? t : q)), [q]);
  useEffect(() => {
    if (typed.trim() === q) return;
    const t = window.setTimeout(() => update({ q: typed.trim(), page: '1' }), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  const setPage = (n: number) => update({ page: String(n) });
  const sets = useSets({ scope, q: q || undefined, subject: subject || undefined, page });
  const pages = sets.data ? Math.max(1, Math.ceil(sets.data.total / sets.data.pageSize)) : 1;
  return (
    <>
      <PageHeader
        title="Question sets"
        description="Every set works with every game mode. Start from the library or write your own."
        actions={canWrite ? <ButtonLink to="/sets/new" variant="primary" icon={<Plus className="size-4" />}>New set</ButtonLink> : null}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ToggleChips<Scope>
          value={scope}
          onChange={(s) => update({ scope: s, page: '1' })}
          label="Which sets to show"
          options={(['public', 'official', ...(canWrite ? (['mine'] as const) : [])] as Scope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
        />
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search sets" className="pl-9" />
          </label>
          <label>
            <span className="sr-only">Subject</span>
            <Select value={subject} onChange={(e) => update({ subject: e.target.value, page: '1' })} className="w-40">
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
        <EmptyState
          icon={scope === 'mine' && !q && !subject ? <BookOpen /> : <Search />}
          title={scope === 'mine' && !q && !subject ? 'No sets yet' : 'Nothing matches'}
          action={
            scope === 'mine' && !q && !subject ? (
              <ButtonLink to="/sets/new" variant="primary">
                Make your first set
              </ButtonLink>
            ) : (
              <Button
                onClick={() => {
                  setTyped('');
                  update({ q: '', subject: '', page: '1' });
                }}
              >
                Clear the search
              </Button>
            )
          }
        >
          {scope === 'mine' && !q && !subject ? 'Write questions once and play them in any mode: type them, import a spreadsheet, or start from a copy of a library set.' : 'Try a different word or subject.'}
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
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-text-2 tabular">
                Page {page} of {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
