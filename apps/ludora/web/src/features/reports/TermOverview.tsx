import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { EmptyState, PageHeader, SectionTitle } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { BackLink, dateText, NoValue, percent, RateBar, StatRow, StatTile, TableBox, Th, usePageTitle } from './reportUi.tsx';
import { BarLineChart } from './charts.tsx';
import { fillWeeks, localDay, schoolYearStart, share, termStart } from './logic.ts';
import { ReportGate, useSignedIn } from './pageKit.tsx';

/*
 * /reports/term (GET /api/reports/overview): the teacher's term at a glance. Games each week with
 * the accuracy trend, the modes and sets used most, and totals. Only games you hosted.
 */

interface Overview {
  from: string;
  to: string;
  totals: { games: number; players: number; minutes: number; students: number };
  weekly: { weekOf: string; games: number; correct: number; answered: number }[];
  modes: { modeId: string; mode: string; games: number }[];
  sets: { setId: string; title: string; games: number; correct: number; answered: number }[];
}

type Range = 'term' | 'weeks' | 'year';

export default function TermOverview() {
  const { me, signedIn } = useSignedIn();
  const [range, setRange] = useState<Range>('term');
  const today = new Date();
  const from = range === 'term' ? termStart(today) : range === 'year' ? schoolYearStart(today) : localDay(new Date(today.getTime() - 12 * 7 * 86_400_000));
  const q = useQuery({ queryKey: ['reports', 'overview', from], queryFn: () => api.get<Overview>(`/api/reports/overview?from=${from}`), enabled: signedIn, placeholderData: keepPreviousData });
  usePageTitle('Term overview');
  return (
    <ReportGate me={me} query={q} title="Term overview" next="/reports/term" notFound="The overview could not be found.">
      {(d) => {
        const weeks = fillWeeks(d.weekly, from, localDay(today));
        const answered = d.weekly.reduce((n, w) => n + w.answered, 0);
        const correct = d.weekly.reduce((n, w) => n + w.correct, 0);
        const maxMode = Math.max(1, ...d.modes.map((m) => m.games));
        return (
          <>
            <BackLink to="/reports">Your reports</BackLink>
            <PageHeader title="Term overview" description={`The games you hosted since ${dateText(`${from}T12:00:00`)}.`} />
            <div className="mb-6">
              <Segmented<Range>
                label="Period"
                value={range}
                onChange={setRange}
                options={[
                  { value: 'term', label: 'This term' },
                  { value: 'weeks', label: 'Last 12 weeks' },
                  { value: 'year', label: 'This school year' },
                ]}
              />
            </div>
            {!d.totals.games ? (
              <EmptyState icon={<BarChart3 className="size-8" />} title="No games in this period" action={<ButtonLink to="/host" variant="primary">Host a game</ButtonLink>}>
                Host a game for a group and this page fills in week by week: how often you played, how accuracy moved, and which modes and sets you used.
              </EmptyState>
            ) : (
              <>
                <StatRow label="The period in numbers">
                  <StatTile label="Games" value={formatNumber(d.totals.games)}>
                    {formatNumber(d.totals.minutes)} minutes of play.
                  </StatTile>
                  <StatTile label="Right" value={answered ? percent(correct / answered) : <NoValue />}>
                    Across {plural(answered, 'answer')}.
                  </StatTile>
                  <StatTile label="Players" value={formatNumber(d.totals.players)}>
                    Added up over every game.
                  </StatTile>
                  <StatTile label="Students" value={formatNumber(d.totals.students)}>
                    Different signed-in players.
                  </StatTile>
                </StatRow>
                <section aria-labelledby="weeks-title" className="mb-10">
                  <SectionTitle>
                    <span id="weeks-title">Week by week</span>
                  </SectionTitle>
                  <BarLineChart bars={weeks.map((w) => ({ key: w.weekOf, label: dateText(`${w.weekOf}T12:00:00`), value: w.games, rate: share(w.correct, w.answered) }))} barName="Games" rateName="Accuracy" />
                  <div className="mt-4">
                      <TableBox caption="Week by week" minWidth={420}>
                        <thead className="bg-surface-2">
                          <tr>
                            <Th>Week of</Th>
                            <Th align="right">Games</Th>
                            <Th>Right</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeks.map((w) => (
                            <tr key={w.weekOf} className="border-t border-line">
                              <td className="px-3 py-2 text-text">{dateText(`${w.weekOf}T12:00:00`)}</td>
                              <td className="px-3 py-2 text-right text-text tabular">{w.games}</td>
                              <td className="px-3 py-2">{w.answered ? <RateBar rate={w.correct / w.answered} /> : <NoValue label="No answers" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </TableBox>
                  </div>
                </section>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <section aria-labelledby="modes-title">
                    <SectionTitle>
                      <span id="modes-title">Most-used modes</span>
                    </SectionTitle>
                    <ul className="flex flex-col gap-2" aria-label="Most-used modes">
                      {d.modes.map((m) => (
                        <li key={m.modeId} className="rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3">
                          <span className="flex items-center justify-between gap-3">
                            <Link to={`/reports?mode=${m.modeId}&from=${from}`} className="font-semibold">
                              {m.mode}
                            </Link>
                            <span className="text-sm text-text-2 tabular">{plural(m.games, 'game')}</span>
                          </span>
                          <span className="mt-2 block h-2 overflow-hidden rounded-[var(--radius-s)] bg-sunken" aria-hidden>
                            <span className="block h-full bg-[var(--floodlight)]" style={{ width: `${Math.round((m.games / maxMode) * 100)}%` }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section aria-labelledby="sets-title">
                    <SectionTitle>
                      <span id="sets-title">Most-used sets</span>
                    </SectionTitle>
                    <ul className="flex flex-col gap-2" aria-label="Most-used sets">
                      {d.sets.map((s) => (
                        <li key={s.setId} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3">
                          <span className="min-w-0">
                            <Link to={`/reports/sets/${s.setId}`} className="font-semibold break-words">
                              {s.title}
                            </Link>
                            <span className="block text-sm text-text-3">{plural(s.games, 'game')}</span>
                          </span>
                          {s.answered ? <RateBar rate={s.correct / s.answered} /> : <NoValue label="No answers" />}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </>
            )}
          </>
        );
      }}
    </ReportGate>
  );
}
