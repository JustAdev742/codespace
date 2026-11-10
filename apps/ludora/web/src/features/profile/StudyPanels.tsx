import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flame, Heart, Medal, Star } from 'lucide-react';
import { QUESTION_TYPE_LABELS, type QuestionType } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { IconButton } from '../../ui/Button.tsx';
import { Meter } from '../../ui/game.tsx';

/*
 * Study panels for My stats and the profile: a calendar of the days you
 * played, personal bests in each mode, accuracy by question type and your
 * favourite mode. All from the player's own saved games.
 */

interface CalendarData {
  month: string;
  today: string;
  firstPlayed: string | null;
  days: { day: string; games: number; correct: number; answered: number; daily: boolean }[];
  streak: number;
  longest: number;
}

export interface PersonalBest {
  modeId: string;
  title: string;
  games: number;
  bestScore: number;
  bestLabel: string;
  bestScoreAt: string;
  bestAccuracy: number | null;
  bestStreak: number;
  bestRank: number | null;
}

interface Insights {
  byType: { type: QuestionType; answered: number; correct: number }[];
  favouriteMode: { modeId: string; title: string; games: number; share: number } | null;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const monthTitle = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayTitle = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** How strongly a day is filled in: none, one game, two or three, four or more. */
function shade(games: number): string {
  if (games === 0) return 'bg-surface-2 text-text-3';
  if (games === 1) return 'bg-glim/35 text-text';
  if (games <= 3) return 'bg-glim/65 text-text';
  return 'bg-glim text-on-accent';
}

/** A month of play: each day filled in by how many games you finished, with a star for the daily challenge. */
export function StudyCalendar() {
  const [month, setMonth] = useState<string | null>(null);
  const cal = useQuery({ queryKey: ['calendar', month ?? 'now'], queryFn: () => api.get<CalendarData>(`/api/me/calendar${month ? `?month=${month}` : ''}`), placeholderData: (prev) => prev });
  const c = cal.data;
  const current = c?.month ?? null;
  const thisMonth = c?.today.slice(0, 7) ?? null;
  const canBack = Boolean(c && c.firstPlayed && current! > c.firstPlayed);
  const canForward = Boolean(c && current! < thisMonth!);
  // Monday-first weeks: blanks before the 1st.
  const lead = c ? (new Date(`${c.days[0]!.day}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const cells: (CalendarData['days'][number] | null)[] = c ? [...Array.from({ length: lead }, () => null), ...c.days] : [];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const played = c?.days.filter((d) => d.games > 0).length ?? 0;
  return (
    <Panel className="p-5" aria-labelledby="calendar-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="calendar-heading" className="font-display text-2xl font-bold">
            Study calendar
          </h2>
          <p className="text-sm text-text-2">Days you finished a game, in UTC like your streak.</p>
        </div>
        {c ? (
          <p className="flex gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Flame className="size-4 text-lantern" aria-hidden />
              <span>
                <span className="font-display text-xl font-bold tabular">{c.streak}</span> day streak
              </span>
            </span>
            <span className="text-text-2">
              Best <span className="font-display text-xl font-bold text-text tabular">{c.longest}</span>
            </span>
          </p>
        ) : null}
      </div>
      {cal.isError ? (
        <ErrorNotice message="Your calendar did not load." onRetry={() => void cal.refetch()} />
      ) : !c ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <IconButton label="Previous month" onClick={() => setMonth(shiftMonth(current!, -1))} disabled={!canBack}>
              <ChevronLeft className="size-5" aria-hidden />
            </IconButton>
            <p className="font-display text-xl font-bold" aria-live="polite">
              {monthTitle(current!)}
            </p>
            <IconButton label="Next month" onClick={() => setMonth(shiftMonth(current!, 1))} disabled={!canForward}>
              <ChevronRight className="size-5" aria-hidden />
            </IconButton>
          </div>
          <table className="w-full table-fixed border-separate border-spacing-1">
            <caption className="sr-only">
              {monthTitle(current!)}: {plural(played, 'day')} with games
            </caption>
            <thead>
              <tr>
                {WEEKDAYS.map((w) => (
                  <th key={w} scope="col" className="pb-1 text-xs font-semibold text-text-3">
                    <abbr title={w} className="no-underline">
                      {w.slice(0, 1)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={i}>
                  {w.map((d, j) =>
                    d ? (
                      <td key={d.day} className="p-0">
                        <div className={`relative grid aspect-square place-items-center rounded-[var(--radius-s)] text-sm font-semibold tabular ${shade(d.games)} ${d.day === c.today ? 'ring-2 ring-lantern ring-offset-1 ring-offset-[var(--bg-raised)]' : ''}`}>
                          <span aria-hidden>{Number(d.day.slice(8))}</span>
                          {d.daily ? <Star className="absolute top-0.5 right-0.5 size-3 fill-current" aria-hidden /> : null}
                          <span className="sr-only">
                            {dayTitle(d.day)}
                            {d.day === c.today ? ', today' : ''}: {d.games ? `${plural(d.games, 'game')}, ${formatNumber(d.correct)} right` : 'no games'}
                            {d.daily ? ', daily challenge done' : ''}
                          </span>
                        </div>
                      </td>
                    ) : (
                      <td key={`blank-${i}-${j}`} className="p-0" aria-hidden />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2" aria-label="Key">
            <li className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-[3px] bg-glim/35" aria-hidden /> 1 game
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-[3px] bg-glim/65" aria-hidden /> 2 or 3
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-[3px] bg-glim" aria-hidden /> 4 or more
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Star className="size-3.5 fill-current" aria-hidden /> Daily challenge
            </li>
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Personal bests in each mode, most played first: top score in the mode's own words, best accuracy, streak and place. */
export function PersonalBests({ limit, heading = 'h2' }: { limit?: number; heading?: 'h2' | 'h3' }) {
  const bests = useQuery({ queryKey: ['bests'], queryFn: () => api.get<{ bests: PersonalBest[] }>('/api/me/bests') });
  const H = heading;
  const list = (bests.data?.bests ?? []).slice(0, limit ?? 99);
  return (
    <Panel className="p-5" aria-labelledby="bests-heading">
      <H id="bests-heading" className="font-display text-2xl font-bold">
        Personal bests
      </H>
      <p className="mb-3 text-sm text-text-2">Your best game in each mode. Beat one and the results screen tells you.</p>
      {bests.isError ? (
        <ErrorNotice message="Your bests did not load." onRetry={() => void bests.refetch()} />
      ) : !bests.data ? (
        <Skeleton className="h-40" />
      ) : list.length === 0 ? (
        <p className="py-2 text-sm text-text-2">Play a game and your best in that mode shows up here.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {list.map((b) => (
            <li key={b.modeId} className="rounded-[var(--radius-m)] border border-line bg-surface-2 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-bold">{b.title}</p>
                <p className="shrink-0 text-xs text-text-2">{plural(b.games, 'game')}</p>
              </div>
              <p className="mt-1 flex items-center gap-1.5 font-display text-[1.6rem] leading-none font-extrabold tabular">
                <Medal className="size-5 shrink-0 text-lantern" aria-hidden />
                <span className="truncate">{b.bestLabel}</span>
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                {b.bestAccuracy !== null ? (
                  <div className="flex gap-1">
                    <dt className="text-text-2">Accuracy</dt>
                    <dd className="font-semibold tabular">{Math.round(b.bestAccuracy * 100)}%</dd>
                  </div>
                ) : null}
                {b.bestStreak > 0 ? (
                  <div className="flex gap-1">
                    <dt className="text-text-2">Streak</dt>
                    <dd className="font-semibold tabular">{b.bestStreak}</dd>
                  </div>
                ) : null}
                {b.bestRank ? (
                  <div className="flex gap-1">
                    <dt className="text-text-2">Best place</dt>
                    <dd className="font-semibold tabular">{ordinal(b.bestRank)}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Accuracy for each kind of question, and the mode you play most. */
export function InsightPanels() {
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insights>('/api/me/insights') });
  const d = q.data;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel className="p-5" aria-labelledby="by-type-heading">
        <h2 id="by-type-heading" className="font-display text-2xl font-bold">
          Accuracy by question type
        </h2>
        <p className="mb-3 text-sm text-text-2">How many of your answers were right for each kind of question, over the last six months.</p>
        {q.isError ? (
          <ErrorNotice message="This did not load." onRetry={() => void q.refetch()} />
        ) : !d ? (
          <Skeleton className="h-40" />
        ) : d.byType.length === 0 ? (
          <p className="py-2 text-sm text-text-2">Play a game and your accuracy for each kind of question shows up here.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.byType.map((t) => {
              const p = t.answered ? Math.round((t.correct / t.answered) * 100) : 0;
              return (
                <li key={t.type}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{QUESTION_TYPE_LABELS[t.type] ?? t.type}</span>
                    <span className="text-sm text-text-2 tabular">
                      <span className="font-display text-lg font-bold text-text">{p}%</span> of {formatNumber(t.answered)}
                    </span>
                  </div>
                  <Meter value={t.correct} max={t.answered} tone={p >= 70 ? 'mint' : p >= 40 ? 'amber' : 'rose'} label={`${QUESTION_TYPE_LABELS[t.type] ?? t.type}: ${p}% right`} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel className="flex flex-col p-5" aria-labelledby="fav-mode-heading">
        <h2 id="fav-mode-heading" className="font-display text-2xl font-bold">
          Favourite mode
        </h2>
        <p className="mb-3 text-sm text-text-2">The mode you have played most.</p>
        {!d ? (
          q.isError ? null : <Skeleton className="h-28" />
        ) : d.favouriteMode ? (
          <div className="flex flex-1 items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-m)] bg-rose text-on-accent" aria-hidden>
              <Heart className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[2rem] leading-none font-extrabold break-words">{d.favouriteMode.title}</p>
              <p className="mt-1 text-sm text-text-2">
                {plural(d.favouriteMode.games, 'game')}, {Math.round(d.favouriteMode.share * 100)}% of everything you have played
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-2">Play a few games and your favourite shows up here.</p>
        )}
      </Panel>
    </div>
  );
}
