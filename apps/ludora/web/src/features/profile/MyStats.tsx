import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, BarChart3, ChevronRight, History, Minus, Presentation, Target, User } from 'lucide-react';
import { MODE_CATEGORY_INFO, SUBJECT_LABELS, type Subject } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, useOverview, type Overview } from '../../lib/queries.ts';
import { formatNumber, ordinal, plural, timeAgo } from '../../lib/format.ts';
import { AccountError, Badge, EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { Dot } from '../social/parts.tsx';
import { errorText, usePageTitle } from '../social/data.ts';

/** GET /api/me/stats. */
interface StatsData {
  byMode: { modeId: string; mode: string; games: number; correct: number; answered: number; wins: number }[];
  bySubject: { subject: string; games: number; correct: number; answered: number }[];
  /** Only weeks with games, keyed by the Monday (UTC) they start on. */
  weekly: { weekOf: string; games: number; correct: number; answered: number }[];
  practise: { setId: string; setTitle: string; questionId: string; prompt: string; at: string }[];
}

interface PlayedGame {
  gameId: string;
  title: string;
  setTitle: string;
  endedAt: string;
  /** People in the game; practice bots are not counted. */
  players: number;
  /** Everyone the rank is out of, practice bots included. */
  entrants: number;
  isSolo: boolean;
  rank: number;
  label: string;
  correct: number;
  answered: number;
}

interface HostedGame {
  id: string;
  mode: string;
  setTitle: string;
  players: number;
  endedAt: string;
}

interface Week {
  key: string;
  start: Date;
  games: number;
  correct: number;
  answered: number;
}

const WEEKS = 8;
const DAY_MS = 86_400_000;

/** The Mondays (UTC) of the last eight weeks, oldest first, this week last. */
function lastWeeks(weekly: StatsData['weekly']): Week[] {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1));
  const byKey = new Map(weekly.map((w) => [w.weekOf, w]));
  return Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(monday - (WEEKS - 1 - i) * 7 * DAY_MS);
    const key = start.toISOString().slice(0, 10);
    const w = byKey.get(key);
    return { key, start, games: w?.games ?? 0, correct: w?.correct ?? 0, answered: w?.answered ?? 0 };
  });
}

/** 1, 2 or 5 times a power of ten, at least x and at least 1. */
function niceStep(x: number): number {
  if (x <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const weekDay = (d: Date, month: 'short' | 'long' = 'short') => d.toLocaleDateString('en-GB', { day: 'numeric', month, timeZone: 'UTC' });

const percent = (correct: number, answered: number) => (answered ? Math.round((correct / answered) * 100) : null);

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-m)] bg-white/[0.07] px-3.5 py-3 sm:px-4">
      <dt className="text-sm font-semibold text-text-2">{label}</dt>
      {/* Numbers are the heroes: big, condensed and tabular. Words ("None yet") are smaller, so they stay on one line on a phone. */}
      <dd className={/\d/.test(value) ? 'mt-1 font-display text-[2.75rem] leading-none font-extrabold tabular' : 'mt-2 mb-1 font-display text-2xl leading-none font-bold'}>
        {value}
        {unit ? <span className="ml-1 text-xl font-bold text-text-2">{unit}</span> : null}
      </dd>
      <dd className="mt-1.5 text-xs text-text-2">{note}</dd>
    </div>
  );
}

function Headline({ s }: { s: Overview['stats'] }) {
  const pct = s.accuracy === null ? null : Math.round(s.accuracy * 100);
  const streakNote = s.playedToday ? `Played today. Longest: ${plural(s.longestDailyStreak, 'day')}` : s.dailyStreak > 0 ? 'Play today to keep it going' : s.longestDailyStreak > 0 ? `Longest: ${plural(s.longestDailyStreak, 'day')}` : 'Play a game today to start one';
  // Your totals as a HUD on the stage, in both themes, like the stats graphic of a broadcast.
  return (
    <Stage className="rounded-[var(--radius-l)] p-2.5 sm:p-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Games played" value={formatNumber(s.gamesPlayed)} note={s.gamesHosted ? `And ${plural(s.gamesHosted, 'game')} hosted` : 'Every finished game counts'} />
        <Tile label="Wins" value={formatNumber(s.gamesWon)} note="First place against two or more players" />
        <Tile label="Podium finishes" value={formatNumber(s.podiums)} note="Top three against two or more players" />
        <Tile label="Accuracy" value={pct === null ? 'None yet' : `${pct}%`} note={s.questionsAnswered ? `${formatNumber(s.questionsCorrect)} of ${formatNumber(s.questionsAnswered)} right` : 'Answer a question to start'} />
        <Tile label="Best streak" value={formatNumber(s.bestStreak)} note="Right answers in a row" />
        <Tile label="Daily streak" value={formatNumber(s.dailyStreak)} unit={s.dailyStreak === 1 ? 'day' : 'days'} note={streakNote} />
      </dl>
    </Stage>
  );
}

function AccuracyRow({ label, badge, correct, answered, detail }: { label: string; badge?: string | undefined; correct: number; answered: number; detail: ReactNode }) {
  const pct = percent(correct, answered);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{label}</span>
          {badge ? <Badge>{badge}</Badge> : null}
        </span>
        <span className={pct === null ? 'shrink-0 text-sm font-semibold text-text-2' : 'shrink-0 font-display text-2xl leading-none font-extrabold tabular'}>
          {pct === null ? 'No answers yet' : `${pct}%`}
          {pct === null ? null : <span className="sr-only"> right</span>}
        </span>
      </div>
      <div aria-hidden className="mt-2 h-2.5 overflow-hidden rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="h-full rounded-[var(--radius-s)] bg-[var(--floodlight)] transition-[width] duration-200 ease-[var(--ease-out)]" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="mt-1 text-sm text-text-3">
        {formatNumber(correct)} of {formatNumber(answered)} right
        <Dot />
        {detail}
      </p>
    </li>
  );
}

function WeeklyChart({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.games));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const last = weeks.length - 1;
  const at = (n: number) => `${(n / top) * 100}%`;
  return (
    <div>
      <div className="flex gap-2">
        <div aria-hidden className="relative h-40 w-6 shrink-0 text-right text-xs text-text-3 tabular">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: at(t) }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1">
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ bottom: at(t) }} />
          ))}
          <ul className="absolute inset-0 flex items-end">
            {weeks.map((w, i) => (
              <li key={w.key} className="group relative flex h-full flex-1 items-end justify-center">
                <span className="sr-only">
                  {i === last ? 'This week' : `Week of ${weekDay(w.start, 'long')}`}: {plural(w.games, 'game')}
                  {w.answered ? `, ${w.correct} of ${w.answered} right` : ''}
                </span>
                <div aria-hidden className={`w-full max-w-6 rounded-t-[var(--radius-s)] group-hover:brightness-110 ${i === last ? 'bg-text' : 'bg-[var(--floodlight)]'}`} style={{ height: at(w.games) }} />
                {i === last && w.games > 0 ? (
                  <span aria-hidden className="absolute font-display text-base leading-none font-bold text-text tabular" style={{ bottom: `calc(${at(w.games)} + 4px)` }}>
                    {w.games}
                  </span>
                ) : null}
                <div
                  aria-hidden
                  className={`lift pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-[var(--radius-s)] border border-line bg-raised px-2.5 py-1.5 text-xs group-hover:block ${i < 2 ? 'left-0' : i > last - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
                  style={{ bottom: `calc(${at(w.games)} + 22px)` }}
                >
                  <div className="font-bold text-text">{plural(w.games, 'game')}</div>
                  <div className="text-text-2">{i === last ? 'This week' : `Week of ${weekDay(w.start)}`}</div>
                  {w.answered ? (
                    <div className="text-text-3">
                      {w.correct} of {w.answered} right
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div aria-hidden className="mt-1.5 flex pl-8">
        {weeks.map((w, i) => (
          <span key={w.key} className={`flex-1 text-center text-[11px] leading-tight ${i === last ? 'font-bold text-text' : 'text-text-3'}`}>
            {w.start.getUTCDate()}
            <br />
            {w.start.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
          </span>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer py-2.5 font-semibold text-link">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">Games each week</caption>
          <thead className="text-text-3">
            <tr>
              <th scope="col" className="py-1.5 font-semibold">
                Week of
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Games
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Right answers
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.key} className="border-t border-line">
                <td className="py-1.5">{weekDay(w.start, 'long')}</td>
                <td className="py-1.5 text-right tabular">{w.games}</td>
                <td className="py-1.5 text-right tabular">{w.answered ? `${w.correct} of ${w.answered}` : 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function PractiseList({ items }: { items: StatsData['practise'] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map((q) => (
          <li key={`${q.setId}:${q.questionId}`}>
            <Link to={`/sets/${q.setId}`} className="block rounded-[var(--radius-m)] bg-surface-2 px-3.5 py-3 text-text no-underline transition-colors hover:bg-surface-3">
              <span className="line-clamp-2 font-semibold">{q.prompt}</span>
              <span className="mt-0.5 block truncate text-sm text-text-3">
                {q.setTitle}
                <Dot />
                Missed {timeAgo(q.at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 5 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-11 text-sm font-semibold text-link" aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      ) : null}
    </>
  );
}

/** Gold, silver and bronze, as on the leaderboards. */
const MEDALS: Record<number, string> = { 1: 'var(--lantern)', 2: '#c3c8de', 3: '#d0884f' };

/** Where you finished. A podium finish against other players sits on its medal colour; the words say it as well. */
function Finish({ g }: { g: PlayedGame }) {
  if (g.isSolo) return <div className="font-display text-2xl leading-none font-bold text-text-2">Solo</div>;
  const medal = g.players > 1 ? MEDALS[g.rank] : undefined;
  return (
    <div className="flex items-baseline justify-end gap-1.5">
      <span className={`font-display text-2xl leading-none font-extrabold tabular ${medal ? 'rounded-[var(--radius-s)] px-1.5 py-0.5 text-on-accent' : ''}`} style={medal ? { background: medal } : undefined}>
        {ordinal(g.rank)}
      </span>
      {g.players > 1 ? <span className="text-sm text-text-2">of {g.entrants}</span> : null}
    </div>
  );
}

/** This week against last week, in words and with an arrow, never by colour alone. */
function WeekChange({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-2">
      <Icon className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
      {diff > 0 ? `${diff} more than last week` : diff < 0 ? `${-diff} fewer than last week` : 'Same as last week'}
    </span>
  );
}

function PanelTitle({ id, children, note }: { id: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-2">
      <h2 id={id} className="font-display text-2xl font-bold">
        {children}
      </h2>
      {note ? <p className="mt-0.5 text-sm text-text-3">{note}</p> : null}
    </div>
  );
}

function PlayedPanel() {
  const history = useInfiniteQuery({
    queryKey: ['my-history'],
    queryFn: ({ pageParam }) => api.get<{ games: PlayedGame[]; nextBefore: string | null }>(`/api/me/history?limit=10${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const games = history.data?.pages.flatMap((p) => p.games) ?? [];
  return (
    <Panel className="p-5" aria-labelledby="played-heading">
      <PanelTitle id="played-heading">Recent games</PanelTitle>
      {history.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : history.isError && !games.length ? (
        <ErrorNotice message={errorText(history.error, 'Your games could not be loaded.')} onRetry={() => void history.refetch()} />
      ) : !games.length ? (
        <EmptyState
          icon={<History className="size-7" />}
          title="No games yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/play" variant="primary" size="sm">
                Join a game
              </ButtonLink>
              <ButtonLink to="/host?solo=1" size="sm">
                Play solo
              </ButtonLink>
            </div>
          }
        >
          Join a game with a code, or play one on your own. Every game you finish shows up here.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {games.map((g) => (
              <li key={g.gameId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{g.title}</div>
                  <div className="truncate text-sm text-text-3">
                    {g.setTitle}
                    {g.label ? (
                      <>
                        <Dot />
                        {g.label}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Finish g={g} />
                  <div className="text-xs text-text-3">
                    {g.answered ? `${g.correct} of ${g.answered} right` : 'No answers'}
                    <Dot />
                    <time dateTime={g.endedAt}>{timeAgo(g.endedAt)}</time>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="sr-only" aria-live="polite">
            Showing {plural(games.length, 'game')}
          </p>
          {history.isFetchNextPageError ? <p className="mt-2 text-sm font-semibold text-ember">{errorText(history.error, 'More games did not load. Try again.')}</p> : null}
          {history.hasNextPage ? (
            <Button className="mt-3 w-full" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function HostedPanel() {
  const hosted = useInfiniteQuery({
    queryKey: ['my-hosted'],
    queryFn: ({ pageParam }) => api.get<{ games: HostedGame[]; nextBefore: string | null }>(`/api/me/hosted${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const games = hosted.data?.pages.flatMap((p) => p.games) ?? [];
  return (
    <Panel className="p-5" aria-labelledby="hosted-heading">
      <PanelTitle id="hosted-heading" note={games.length ? 'Open one to see its report: who played and how each question went.' : undefined}>
        Games you hosted
      </PanelTitle>
      {hosted.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : hosted.isError && !games.length ? (
        <ErrorNotice message={errorText(hosted.error, 'Your hosted games could not be loaded.')} onRetry={() => void hosted.refetch()} />
      ) : !games.length ? (
        <EmptyState
          icon={<Presentation className="size-7" />}
          title="Nothing hosted yet"
          action={
            <ButtonLink to="/host" size="sm" variant="primary">
              Host a game
            </ButtonLink>
          }
        >
          When you host a game for other players, it shows up here with a report of how everyone did.
        </EmptyState>
      ) : (
        <>
          <ul className="-mx-2 flex flex-col">
            {games.map((g) => (
              <li key={g.id}>
                <Link to={`/reports/${g.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] px-2 py-3 text-text no-underline transition-colors hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      <span className="sr-only">Report for </span>
                      {g.mode}
                    </div>
                    <div className="truncate text-sm text-text-3">{g.setTitle}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold">{plural(g.players, 'player')}</div>
                    <div className="text-xs text-text-3">
                      <time dateTime={g.endedAt}>{timeAgo(g.endedAt)}</time>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {hosted.isFetchNextPageError ? <p className="mt-2 text-sm font-semibold text-ember">{errorText(hosted.error, 'More games did not load. Try again.')}</p> : null}
          {hosted.hasNextPage ? (
            <Button className="mt-3 w-full" loading={hosted.isFetchingNextPage} onClick={() => void hosted.fetchNextPage()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

export default function MyStats() {
  usePageTitle('My stats');
  const me = useMe();
  const user = me.data?.user ?? null;
  const overview = useOverview();
  const modes = useModes();
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api.get<StatsData>('/api/me/stats'), enabled: Boolean(user) });

  if (me.isLoading) {
    return (
      <>
        <PageHeader title="My stats" />
        <Skeleton className="h-72" />
      </>
    );
  }
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="My stats" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!user) {
    return (
      <>
        <PageHeader title="My stats" />
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="Sign in to see your stats"
          action={
            <ButtonLink to="/signin?next=/me" variant="primary">
              Sign in
            </ButtonLink>
          }
        >
          Your games, how often you get answers right and what to practise next.
        </EmptyState>
      </>
    );
  }

  const categoryOf = (modeId: string) => {
    const category = modes.data?.modes.find((m) => m.meta.id === modeId)?.meta.category;
    return category ? MODE_CATEGORY_INFO[category].label : undefined;
  };
  const s = stats.data;
  const weeks = s ? lastWeeks(s.weekly) : [];
  const weekTotal = weeks.reduce((n, w) => n + w.games, 0);
  const thisWeek = weeks[weeks.length - 1]?.games ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.games ?? 0;

  return (
    <>
      <PageHeader
        title="My stats"
        description="Your games, how often you get answers right and what to practise next. Only you can see this page."
        actions={
          <ButtonLink to={`/profile/${user.id}`} icon={<User className="size-4" />}>
            My profile
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-6">
        {overview.isError ? (
          <ErrorNotice message={errorText(overview.error, 'Your totals could not be loaded.')} onRetry={() => void overview.refetch()} />
        ) : overview.data ? (
          <Headline s={overview.data.stats} />
        ) : (
          <Skeleton className="h-[236px] rounded-[var(--radius-l)] sm:h-[164px] xl:h-[116px]" />
        )}

        {stats.isError ? (
          <ErrorNotice message={errorText(stats.error, 'Your detailed stats could not be loaded.')} onRetry={() => void stats.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel className="p-5" aria-labelledby="by-mode-heading">
                <PanelTitle id="by-mode-heading" note="How many of your answers were right in each game mode.">
                  Accuracy by mode
                </PanelTitle>
                {!s ? (
                  <Skeleton className="h-40" />
                ) : s.byMode.length ? (
                  <ul className="divide-y divide-line">
                    {s.byMode.map((r) => (
                      <AccuracyRow
                        key={r.modeId}
                        label={r.mode}
                        badge={categoryOf(r.modeId)}
                        correct={r.correct}
                        answered={r.answered}
                        detail={
                          <>
                            {plural(r.games, 'game')}
                            {r.wins ? (
                              <>
                                <Dot />
                                {plural(r.wins, 'win')}
                              </>
                            ) : null}
                          </>
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-text-2">Play a game and your accuracy in each mode shows up here.</p>
                )}
              </Panel>

              <Panel className="p-5" aria-labelledby="by-subject-heading">
                <PanelTitle id="by-subject-heading" note="How many of your answers were right in each subject.">
                  Accuracy by subject
                </PanelTitle>
                {!s ? (
                  <Skeleton className="h-40" />
                ) : s.bySubject.length ? (
                  <ul className="divide-y divide-line">
                    {s.bySubject.map((r) => (
                      <AccuracyRow key={r.subject} label={SUBJECT_LABELS[r.subject as Subject] ?? r.subject} correct={r.correct} answered={r.answered} detail={plural(r.games, 'game')} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-text-2">Play a game and your accuracy in each subject shows up here.</p>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel className="p-5" aria-labelledby="weekly-heading">
                <PanelTitle id="weekly-heading" note={s && weekTotal ? `${formatNumber(weekTotal)} in the last 8 weeks, Monday to Sunday.` : 'Games you played each week, Monday to Sunday.'}>
                  Games each week
                </PanelTitle>
                {!s ? (
                  <Skeleton className="h-48" />
                ) : weekTotal ? (
                  <>
                    <p className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-[2.75rem] leading-none font-extrabold tabular">{formatNumber(thisWeek)}</span>
                      <span className="text-text-2">{thisWeek === 1 ? 'game this week' : 'games this week'}</span>
                      <WeekChange now={thisWeek} before={lastWeek} />
                    </p>
                    <WeeklyChart weeks={weeks} />
                  </>
                ) : (
                  <p className="py-2 text-sm text-text-2">No games in the last 8 weeks. Play one and this chart starts to fill in.</p>
                )}
              </Panel>

              <Panel className="p-5" aria-labelledby="practise-heading">
                <PanelTitle id="practise-heading" note="Questions you got wrong in the last 30 days. Open the set to practise them.">
                  Worth another look
                </PanelTitle>
                {!s ? (
                  <Skeleton className="h-48" />
                ) : s.practise.length ? (
                  <PractiseList items={s.practise} />
                ) : (
                  <div className="flex items-start gap-3 py-2 text-sm text-text-2">
                    <Target className="mt-0.5 size-5 shrink-0 text-text-3" aria-hidden />
                    <p>Nothing to practise right now. Questions you miss in games show up here for 30 days.</p>
                  </div>
                )}
              </Panel>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <PlayedPanel />
          <HostedPanel />
        </div>
      </div>
    </>
  );
}
