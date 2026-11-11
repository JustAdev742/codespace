import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { Skeleton } from '../../ui/primitives.tsx';
import { percent } from './reportUi.tsx';
import { localDay, mondayOf } from './logic.ts';
import type { ReportListGame } from './HostedGames.tsx';

/*
 * The "this week" strip on a teacher's home page: the newest reports from this week (Monday on),
 * each with its accuracy, and a way to all reports. Falls back to the last game when there were
 * none this week. Reads only the teacher's own games (GET /api/reports/games).
 */

export function ThisWeek() {
  const list = useQuery({
    queryKey: ['reports', 'list', 'home'],
    queryFn: () => api.get<{ games: ReportListGame[]; total: number }>('/api/reports/games?sort=newest'),
  });
  const monday = mondayOf(localDay(new Date()));
  const games = list.data?.games ?? [];
  const week = games.filter((g) => localDay(new Date(g.endedAt)) >= monday);
  const shown = week.length ? week.slice(0, 3) : games.slice(0, 1);
  if (list.isPending) return <Skeleton className="h-28" />;
  if (!games.length) {
    return (
      <div className="rounded-[var(--radius-m)] bg-surface-2 p-4 text-sm text-text-2">
        <span className="block font-bold text-text">No games hosted yet</span>
        After a game you see every player&apos;s score, the wrong answers players shared, and who to check in with.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-2">{week.length ? `${plural(week.length, 'game')} this week.` : 'No games yet this week. Your last one:'}</p>
      <ul className="flex flex-col gap-2" aria-label={week.length ? 'This week’s reports' : 'Your last report'}>
        {shown.map((g) => (
          <li key={g.id}>
            <Link to={`/reports/${g.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-3 text-text no-underline transition-colors hover:bg-surface-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words">{g.mode}</span>
                <span className="block text-sm break-words text-text-2">
                  {g.setTitle}, {plural(g.players, 'player')}, {timeAgo(g.endedAt)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-xl leading-none font-bold tabular">{g.accuracy === null ? '–' : percent(g.accuracy)}</span>
                <span className="text-xs text-text-3">{g.accuracy === null ? 'no answers' : 'right'}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <BarChart3 className="size-4" aria-hidden />
        All your reports
      </Link>
    </div>
  );
}
