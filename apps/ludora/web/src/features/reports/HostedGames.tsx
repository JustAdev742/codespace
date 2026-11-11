import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, Clock, Database, GraduationCap, Presentation, RotateCcw, Search, SlidersHorizontal, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { duration, formatNumber, plural } from '../../lib/format.ts';
import { AccountError, EmptyState, ErrorNotice, Input, PageHeader, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { dateTimeText, errorText, hasStatus, percent, SignInPrompt, usePageTitle } from './reportUi.tsx';
import { activeFilterCount, apiQuery, readFilters, SORTS, writeFilters, type ReportFilters } from './logic.ts';

/*
 * /reports: the reports home. Every game you hosted for a group (GET /api/reports/games, which
 * only ever reads your own games), with search, filters by class, set, mode and dates, sorting,
 * and each game's headline numbers. Filters live in the address, so Back returns to them.
 */

export interface ReportListGame {
  id: string;
  mode: string;
  modeId: string;
  setTitle: string;
  setId: string | null;
  classId: string | null;
  className: string | null;
  players: number;
  accuracy: number | null;
  questions: number;
  endedAt: string;
  durationMs: number;
}

interface ListResponse {
  games: ReportListGame[];
  total: number;
  pageSize: number;
  filters: { classes: { id: string; name: string }[]; sets: { id: string; title: string }[]; modes: { id: string; title: string }[] };
}

function Headline({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-text-3 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function GameRow({ g }: { g: ReportListGame }) {
  return (
    <li className="flex items-stretch gap-2">
      <Link to={`/reports/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised px-4 py-3 text-text no-underline transition-colors hover:border-line-strong hover:bg-surface-2">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl leading-tight font-bold break-words">{g.mode}</span>
            <span className="block text-sm break-words text-text-2">
              {g.setTitle}
              {g.className ? <span className="text-text-3"> · {g.className}</span> : null}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2 lg:justify-end">
            <Headline icon={<BarChart3 />}>
              <span className="font-bold text-text tabular">{g.accuracy === null ? 'No answers' : percent(g.accuracy)}</span>
              {g.accuracy === null ? null : ' right'}
            </Headline>
            <Headline icon={<Users />}>{plural(g.players, 'player')}</Headline>
            <span>{plural(g.questions, 'question')}</span>
            <Headline icon={<Clock />}>{duration(g.durationMs)}</Headline>
            <time dateTime={g.endedAt} className="text-text-3">
              {dateTimeText(g.endedAt)}
            </time>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
      </Link>
      {/* The same set, mode and settings again. The Host page says so if the set has gone. */}
      <ButtonLink to={`/host?again=${g.id}`} className="h-auto! self-stretch" icon={<RotateCcw className="size-4" aria-hidden />} aria-label={`Host again: ${g.mode} with ${g.setTitle}`}>
        <span className="max-sm:sr-only">Host again</span>
      </ButtonLink>
    </li>
  );
}

function Filters({ value, onChange, options }: { value: ReportFilters; onChange: (f: ReportFilters) => void; options: ListResponse['filters'] | undefined }) {
  const [q, setQ] = useState(value.q);
  const [open, setOpen] = useState(activeFilterCount(value) - (value.q ? 1 : 0) > 0);
  const id = useId();
  useEffect(() => setQ(value.q), [value.q]);
  const set = (patch: Partial<ReportFilters>) => onChange({ ...value, ...patch });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q });
  };
  const extra = activeFilterCount(value) - (value.q ? 1 : 0);
  return (
    <div className="mb-4 flex flex-col gap-3">
      <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`${id}-q`} className="mb-1.5 block text-sm font-semibold text-text">
            Search by set, class or mode
          </label>
          <Input id={`${id}-q`} type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="For example: fractions" />
        </div>
        <Button type="submit" icon={<Search className="size-4" aria-hidden />}>
          Search
        </Button>
        <Button aria-expanded={open} aria-controls={`${id}-more`} icon={<SlidersHorizontal className="size-4" aria-hidden />} onClick={() => setOpen((o) => !o)}>
          Filters{extra ? ` (${extra})` : ''}
        </Button>
        <div className="basis-48 max-sm:flex-1">
          <label htmlFor={`${id}-sort`} className="mb-1.5 block text-sm font-semibold text-text">
            Sort
          </label>
          <Select id={`${id}-sort`} value={value.sort} onChange={(e) => set({ sort: e.target.value as ReportFilters['sort'] })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </form>
      <div id={`${id}-more`} hidden={!open} className="grid grid-cols-1 gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor={`${id}-class`} className="mb-1.5 block text-sm font-semibold text-text">
            Class
          </label>
          <Select id={`${id}-class`} value={value.classId} onChange={(e) => set({ classId: e.target.value })}>
            <option value="">Any class</option>
            {options?.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-set`} className="mb-1.5 block text-sm font-semibold text-text">
            Question set
          </label>
          <Select id={`${id}-set`} value={value.setId} onChange={(e) => set({ setId: e.target.value })}>
            <option value="">Any set</option>
            {options?.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-mode`} className="mb-1.5 block text-sm font-semibold text-text">
            Game mode
          </label>
          <Select id={`${id}-mode`} value={value.modeId} onChange={(e) => set({ modeId: e.target.value })}>
            <option value="">Any mode</option>
            {options?.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-from`} className="mb-1.5 block text-sm font-semibold text-text">
            From
          </label>
          <Input id={`${id}-from`} type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="mb-1.5 block text-sm font-semibold text-text">
            To
          </label>
          <Input id={`${id}-to`} type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
        {extra ? (
          <div className="sm:col-span-2 lg:col-span-5">
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, classId: '', setId: '', modeId: '', from: '', to: '' })}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function HostedGames() {
  usePageTitle('Your reports');
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [pages, setPages] = useState(1);
  const key = apiQuery(filters, 0);
  useEffect(() => setPages(1), [key]);
  const list = useQuery({
    queryKey: ['reports', 'list', key, pages],
    queryFn: async () => {
      const first = await api.get<ListResponse>(`/api/reports/games?${apiQuery(filters, 0)}`);
      const more = [];
      for (let p = 1; p < pages; p++) more.push(...(await api.get<ListResponse>(`/api/reports/games?${apiQuery(filters, p * first.pageSize)}`)).games);
      return { ...first, games: [...first.games, ...more] };
    },
    enabled: signedIn,
    placeholderData: keepPreviousData,
  });
  const games = list.data?.games ?? [];
  const filtered = activeFilterCount(filters) > 0;

  const header = (
    <PageHeader
      title="Your reports"
      description="Every game you hosted, with what to teach next. Open one to see the questions that tripped players up and who to check in with."
      actions={
        signedIn ? (
          <>
            <ButtonLink to="/reports/term" icon={<BarChart3 className="size-4" aria-hidden />}>
              Term overview
            </ButtonLink>
            <ButtonLink to="/reports/students" icon={<GraduationCap className="size-4" aria-hidden />}>
              Students
            </ButtonLink>
            <ButtonLink to="/reports/data" icon={<Database className="size-4" aria-hidden />}>
              Your report data
            </ButtonLink>
          </>
        ) : null
      }
    />
  );

  if (me.isError && !me.data) {
    return (
      <>
        {header}
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && (!signedIn || hasStatus(list.error, 401))) {
    return (
      <>
        {header}
        <SignInPrompt title="Sign in to see your game reports" next="/reports">
          Reports are kept for the games you host, so you can look back at who played and which questions were hardest.
        </SignInPrompt>
      </>
    );
  }

  const noGamesAtAll = list.data && list.data.total === 0 && !filtered;
  return (
    <>
      {header}
      {noGamesAtAll ? null : <Filters value={filters} onChange={(f) => setParams(writeFilters(f), { replace: true })} options={list.data?.filters} />}
      {me.isLoading || list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only" role="status">
            Loading your reports
          </span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : list.isError && !games.length ? (
        <ErrorNotice message={errorText(list.error, 'Your reports could not be loaded. Check your connection and try again.')} onRetry={() => void list.refetch()} />
      ) : noGamesAtAll ? (
        <EmptyState
          icon={<Presentation className="size-8" />}
          title="Host a game to see a report here"
          action={
            <ButtonLink to="/host" variant="primary">
              Host a game
            </ButtonLink>
          }
        >
          When a game you host for a group ends, its report appears here: the wrong answers players shared, the hardest questions, and who to check in with. Solo games and assignments are in your classes instead.
        </EmptyState>
      ) : games.length === 0 ? (
        <EmptyState
          icon={<Search className="size-8" />}
          title="No games match"
          action={
            <Button onClick={() => setParams(new URLSearchParams(), { replace: true })} variant="primary">
              Show every game
            </Button>
          }
        >
          None of your games match this search and these filters. Try fewer filters or a wider date range.
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-text-2" role="status">
            {filtered ? `${plural(list.data!.total, 'game')} match.` : `${plural(list.data!.total, 'game')} hosted.`}
          </p>
          <ul className="flex flex-col gap-2" aria-label="Your games">
            {games.map((g) => (
              <GameRow key={g.id} g={g} />
            ))}
          </ul>
          <div className="mt-4 flex justify-center">
            {games.length < (list.data?.total ?? 0) ? (
              <Button loading={list.isFetching} onClick={() => setPages((p) => p + 1)}>
                Show {formatNumber(Math.min(list.data!.pageSize, list.data!.total - games.length))} more
              </Button>
            ) : (
              <p className="text-sm text-text-3">{games.length > 1 ? `That is all ${games.length}.` : 'That is the only one.'}</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
