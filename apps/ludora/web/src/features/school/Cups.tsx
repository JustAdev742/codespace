import { useQuery } from '@tanstack/react-query';
import { Award, CalendarRange, Crown, Trophy } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { errorText } from '../reports/reportUi.tsx';
import { HouseCrest } from './emblems.tsx';
import { HouseBoard } from './Standings.tsx';
import { dayText, schoolKeys, type PastCup, type RankedHouse } from './schoolData.ts';

/* The current house cup, the ones coming up, and the hall of fame: past cups and tournament winners. */

interface CupsData {
  current: { id: string; name: string; startsOn: string; endsOn: string; standings: RankedHouse[] } | null;
  upcoming: { id: string; name: string; startsOn: string; endsOn: string }[];
  past: PastCup[];
}

interface Fame {
  cups: PastCup[];
  tournaments: { id: string; name: string; format: string; winnerName: string; finishedAt: string }[];
}

export function CupsPanel() {
  const cups = useQuery({ queryKey: schoolKeys.cups, queryFn: () => api.get<CupsData>('/api/school/cups') });
  const fame = useQuery({ queryKey: schoolKeys.fame, queryFn: () => api.get<Fame>('/api/school/hall-of-fame') });
  if (cups.isPending || fame.isPending) return <Skeleton className="h-64" />;
  if (cups.isError) return <ErrorNotice message={errorText(cups.error, 'The cups did not load.')} onRetry={() => void cups.refetch()} />;
  const { current, upcoming } = cups.data;
  return (
    <div className="flex flex-col gap-5">
      {current ? (
        <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="cup-now">
          <div>
            <p className="text-sm font-semibold text-text-3">On now</p>
            <h2 id="cup-now" className="font-display text-3xl font-bold text-text">
              {current.name}
            </h2>
            <p className="text-sm text-text-2">
              {dayText(current.startsOn)} to {dayText(current.endsOn)}. The house with the most points when it ends wins.
            </p>
          </div>
          <HouseBoard houses={current.standings} caption={`${current.name} standings`} />
        </Panel>
      ) : (
        <EmptyState icon={<Trophy />} title="No house cup running">
          {upcoming.length ? `The next one, ${upcoming[0]!.name}, starts on ${dayText(upcoming[0]!.startsOn)}.` : 'School staff can start one under Run the school.'}
        </EmptyState>
      )}
      {current && upcoming.length ? (
        <p className="flex items-center gap-2 text-sm text-text-2">
          <CalendarRange className="size-4" aria-hidden /> Next: {upcoming[0]!.name}, from {dayText(upcoming[0]!.startsOn)}.
        </p>
      ) : null}
      <section aria-labelledby="hall-of-fame" className="flex flex-col gap-3">
        <h2 id="hall-of-fame" className="font-display text-2xl font-bold text-text">
          Hall of fame
        </h2>
        {fame.isError ? <ErrorNotice message={errorText(fame.error, 'The hall of fame did not load.')} /> : null}
        {fame.data && !fame.data.cups.length && !fame.data.tournaments.length ? <p className="text-text-2">Winners of house cups and tournaments are kept here.</p> : null}
        <ul className="grid gap-3 md:grid-cols-2">
          {fame.data?.cups.map((c) => {
            const winner = c.totals.find((t) => t.rank === 1 && t.points > 0);
            return (
              <li key={c.id}>
                <Panel as="article" className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    {winner ? <HouseCrest house={winner} size={48} /> : <Crown className="size-8 text-text-3" aria-hidden />}
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-xl font-bold text-text">{c.name}</h3>
                      <p className="text-sm text-text-2">{c.winnerName ? `Won by ${c.winnerName}` : 'No points were earned'}</p>
                    </div>
                  </div>
                  <ol className="flex flex-col gap-1 text-sm" aria-label={`${c.name} final standings`}>
                    {c.totals.map((t) => (
                      <li key={t.id} className="flex justify-between gap-3 border-t border-line pt-1">
                        <span className="truncate text-text-2">
                          {t.rank}. {t.name}
                        </span>
                        <span className="font-semibold text-text tabular">{formatNumber(t.points)}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-text-3">
                    {dayText(c.startsOn)} to {dayText(c.endsOn)}
                  </p>
                </Panel>
              </li>
            );
          })}
          {fame.data?.tournaments.map((t) => (
            <li key={t.id}>
              <Panel as="article" className="flex h-full items-center gap-3 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-m)] bg-lantern text-on-accent" aria-hidden>
                  <Award className="size-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-xl font-bold text-text">{t.name}</h3>
                  <p className="text-sm text-text-2">
                    {t.format === 'knockout' ? 'Knockout' : 'Round robin'} won by {t.winnerName}, {new Date(t.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
