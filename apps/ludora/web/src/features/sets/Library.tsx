import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Folder, Plus, Search, Star, Trash2 } from 'lucide-react';
import { SUBJECTS, SUBJECT_LABELS, YEAR_LEVELS } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useSets } from '../../lib/queries.ts';
import { plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, Input, PageHeader, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { SetCover } from './SetCover.tsx';

type Scope = 'public' | 'official' | 'mine' | 'shared';
const SCOPE_LABEL: Record<Scope, string> = { public: 'Everything', official: 'By Ludora', mine: 'My sets', shared: 'Shared with me' };
type Sort = '' | 'recent' | 'title' | 'plays';
const SORT_LABEL: Record<Sort, string> = { '': 'Best match', recent: 'Recently changed', title: 'Title, A to Z', plays: 'Most played' };

interface Organise {
  folders: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  favourites: number;
  shared: number;
}

export default function Library() {
  const me = useMe();
  const canWrite = Boolean(me.data?.user && !me.data.user.isGuest);
  // The filters live in the address, so opening a set and coming back keeps them (they used to reset to page 1 of Everything).
  const [params, setParams] = useSearchParams();
  const rawScope = params.get('scope');
  const scope: Scope = rawScope === 'official' || ((rawScope === 'mine' || rawScope === 'shared') && canWrite) ? rawScope : 'public';
  const subject = params.get('subject') ?? '';
  const year = params.get('year') ?? '';
  const topic = params.get('topic') ?? '';
  const folder = scope === 'mine' ? (params.get('folder') ?? '') : '';
  const favourites = scope === 'mine' && params.get('favourites') === '1' ? '1' : '';
  const tag = scope === 'mine' ? (params.get('tag') ?? '') : '';
  const rawSort = params.get('sort');
  const sort: Sort = rawSort === 'recent' || rawSort === 'title' || rawSort === 'plays' ? rawSort : '';
  const organise = useQuery({ queryKey: ['sets-organise'], queryFn: () => api.get<Organise>('/api/sets/organise'), enabled: canWrite, staleTime: 30_000 });

  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const filtered = Boolean(q || subject || year || topic || folder || favourites || tag);
  const update = (patch: Record<string, string>) => {
    // Start from the address as it is now, not as it was at the render this function came from:
    // the search writes a quarter of a second after typing, and a filter chosen just before must not be lost.
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === 'scope' && v === 'public') || (k === 'page' && v === '1')) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
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
  const sets = useSets({ scope, q: q || undefined, subject: subject || undefined, year: year || undefined, topic: topic || undefined, folder: folder || undefined, favourites: favourites || undefined, tag: tag || undefined, sort: sort || undefined, page });
  const [typedTopic, setTypedTopic] = useState(topic);
  useEffect(() => setTypedTopic((t) => (t.trim() === topic ? t : topic)), [topic]);
  useEffect(() => {
    if (typedTopic.trim() === topic) return;
    const t = window.setTimeout(() => update({ topic: typedTopic.trim(), page: '1' }), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedTopic]);
  const clearAll = () => {
    setTyped('');
    setTypedTopic('');
    update({ q: '', subject: '', year: '', topic: '', folder: '', favourites: '', tag: '', page: '1' });
  };
  const scopes: Scope[] = ['public', 'official', ...(canWrite ? (['mine'] as const) : []), ...(canWrite && (organise.data?.shared ?? 0) > 0 ? (['shared'] as const) : [])];
  const pages = sets.data ? Math.max(1, Math.ceil(sets.data.total / sets.data.pageSize)) : 1;
  return (
    <>
      <PageHeader
        title="Question sets"
        description="Every set works with every game mode. Start from the library or write your own."
        actions={
          canWrite ? (
            <>
              <ButtonLink to="/sets/bin" variant="ghost" icon={<Trash2 className="size-4" />}>
                Bin
              </ButtonLink>
              <ButtonLink to="/sets/new" variant="primary" icon={<Plus className="size-4" />}>
                New set
              </ButtonLink>
            </>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ToggleChips<Scope>
          value={scope}
          onChange={(s) => update({ scope: s, page: '1', folder: '', favourites: '', tag: '' })}
          label="Which sets to show"
          options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
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
      <div className="mb-5 flex flex-wrap items-end gap-2" role="group" aria-label="More filters">
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
          Year level
          <Select value={year} onChange={(e) => update({ year: e.target.value, page: '1' })} className="w-40">
            <option value="">Any year</option>
            {YEAR_LEVELS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
          Topic
          <Input value={typedTopic} onChange={(e) => setTypedTopic(e.target.value)} placeholder="Any topic" className="w-44" maxLength={60} />
        </label>
        {scope === 'mine' ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
              Folder
              <Select value={folder} onChange={(e) => update({ folder: e.target.value, page: '1' })} className="w-44">
                <option value="">All folders</option>
                <option value="-">Not in a folder</option>
                {(organise.data?.folders ?? []).map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({f.count})
                  </option>
                ))}
              </Select>
            </label>
            {(organise.data?.tags.length ?? 0) > 0 ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
                Tag
                <Select value={tag} onChange={(e) => update({ tag: e.target.value, page: '1' })} className="w-40">
                  <option value="">Any tag</option>
                  {organise.data!.tags.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <Button size="sm" variant={favourites ? 'primary' : 'secondary'} aria-pressed={Boolean(favourites)} icon={<Star className="size-4" />} onClick={() => update({ favourites: favourites ? '' : '1', page: '1' })}>
              Favourites
            </Button>
          </>
        ) : null}
        <label className="ml-auto flex flex-col gap-1 text-xs font-semibold text-text-2">
          Sort by
          <Select value={sort} onChange={(e) => update({ sort: e.target.value, page: '1' })} className="w-44">
            {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {sets.isError ? <ErrorNotice message="Sets could not be loaded." onRetry={() => sets.refetch()} /> : null}
      {sets.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : sets.data && sets.data.sets.length === 0 ? (
        <EmptyState
          icon={scope === 'mine' && !filtered ? <BookOpen /> : <Search />}
          title={scope === 'mine' && !filtered ? 'No sets yet' : 'Nothing matches'}
          action={
            scope === 'mine' && !filtered ? (
              <ButtonLink to="/sets/new" variant="primary">
                Make your first set
              </ButtonLink>
            ) : (
              <Button onClick={clearAll}>Clear the search</Button>
            )
          }
        >
          {scope === 'mine' && !filtered ? 'Write questions once and play them in any mode: type them, import a spreadsheet, or start from a copy of a library set.' : 'Try a different word, or fewer filters.'}
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
                      <span className="flex shrink-0 items-center gap-1">
                        {s.favourite ? <Star className="size-4 fill-lantern text-lantern" aria-label="Favourite" /> : null}
                        {s.visibility !== 'public' ? <Badge>{s.visibility === 'private' ? 'Private' : 'Unlisted'}</Badge> : null}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-2">{s.description}</p>
                    <p className="mt-2 text-xs text-text-3">
                      {plural(s.questionCount, 'question')}, {SUBJECT_LABELS[s.subject as keyof typeof SUBJECT_LABELS] ?? s.subject}
                      {s.gradeBand ? `, ${s.gradeBand}` : ''}
                      {s.ownerName && scope !== 'mine' ? `, by ${s.ownerName}` : ''}
                    </p>
                    {s.folder ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-text-2">
                        <Folder className="size-3.5" aria-hidden />
                        {s.folder}
                      </p>
                    ) : null}
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
