import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Badge, EmptyState, PageHeader } from '../../ui/primitives.tsx';
import { BackLink, dateTimeText, NoValue, percent, StatRow, StatTile, TableBox, Th, usePageTitle } from './reportUi.tsx';
import { PairBars } from './charts.tsx';
import { compareGames, type ComparedQuestion } from './logic.ts';
import type { GameReportData } from './gameTypes.ts';
import { ReportGate, useSignedIn } from './pageKit.tsx';

/*
 * /reports/compare?a=&b=: two games of the same set, before and after teaching. Both reports
 * come from GET /api/games/:id/report, so the server checks each one is yours. The older game
 * is always "before".
 */

const CHANGE = {
  improved: { label: 'Improved', tone: 'mint', icon: ArrowUp },
  declined: { label: 'Fell', tone: 'coral', icon: ArrowDown },
  same: { label: 'About the same', tone: 'neutral', icon: Minus },
} as const;

function ChangeBadge({ q }: { q: ComparedQuestion }) {
  const c = CHANGE[q.change];
  const Icon = c.icon;
  return (
    <Badge tone={c.tone}>
      <Icon className="size-3" aria-hidden />
      {c.label}
      {q.points ? ` (${q.points > 0 ? '+' : ''}${q.points} points)` : ''}
    </Badge>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const a = params.get('a') ?? '';
  const b = params.get('b') ?? '';
  const { me, signedIn } = useSignedIn();
  const both = useQuery({
    queryKey: ['reports', 'compare', a, b],
    queryFn: async () => {
      const [x, y] = await Promise.all([a, b].map((id) => api.get<GameReportData>(`/api/games/${encodeURIComponent(id)}/report`)));
      return new Date(x!.game.endedAt) <= new Date(y!.game.endedAt) ? { before: x!, after: y! } : { before: y!, after: x! };
    },
    enabled: signedIn && Boolean(a && b),
  });
  usePageTitle('Before and after');
  return (
    <ReportGate me={me} query={both} title="Before and after" next={`/reports/compare?a=${a}&b=${b}`} notFound="One of these games does not exist, its report was deleted, or it is not yours to see.">
      {({ before, after }) => {
        const r = compareGames(before.view.questions, after.view.questions);
        const sameSet = before.game.setId && before.game.setId === after.game.setId;
        return (
          <>
            <BackLink to={`/reports/${after.game.id}`}>Back to the later game</BackLink>
            <PageHeader title="Before and after" description={`${before.game.setTitle}: ${dateTimeText(before.game.startedAt)} (before) and ${dateTimeText(after.game.startedAt)} (after).`} />
            {!sameSet ? <p className="mb-4 rounded-[var(--radius-m)] border border-lantern/60 bg-lantern/10 px-4 py-3 text-sm text-text">These games used different sets, so only questions with the same id in both are compared.</p> : null}
            <StatRow label="Before and after in numbers">
              <StatTile label="Before" value={r.before === null ? <NoValue /> : percent(r.before)}>
                <Link to={`/reports/${before.game.id}`} className="underline underline-offset-2">{before.game.mode}</Link>, {plural(before.game.players, 'player')}.
              </StatTile>
              <StatTile label="After" value={r.after === null ? <NoValue /> : percent(r.after)}>
                <Link to={`/reports/${after.game.id}`} className="underline underline-offset-2">{after.game.mode}</Link>, {plural(after.game.players, 'player')}.
              </StatTile>
              <StatTile label="Improved" value={r.improved}>
                Questions up by 10 points or more.
              </StatTile>
              <StatTile label="Did not improve" value={r.same + r.declined}>
                {r.declined ? `${r.declined} fell by 10 points or more.` : 'None fell by 10 points or more.'}
              </StatTile>
            </StatRow>
            <p className="mb-3 max-w-[70ch] text-sm text-text-2">Right first time on the questions both games asked. Each player counts once per question.</p>
            {!r.questions.length ? (
              <EmptyState title="No questions in common">The two games did not ask any of the same questions.</EmptyState>
            ) : (
              <>
                <div className="hidden md:block">
                  <TableBox caption="Each question before and after" minWidth={760}>
                    <thead className="bg-surface-2">
                      <tr>
                        <Th>Question</Th>
                        <Th>Right first time</Th>
                        <Th>Change</Th>
                        <Th>Most common wrong answer after</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.questions.map((q) => (
                        <tr key={q.questionId} className="border-t border-line align-top">
                          <td className="min-w-[14rem] px-3 py-3 font-semibold text-text [overflow-wrap:anywhere]">{q.prompt}</td>
                          <td className="px-3 py-3">
                            <PairBars before={q.before} after={q.after} />
                          </td>
                          <td className="px-3 py-3">
                            <ChangeBadge q={q} />
                          </td>
                          <td className="px-3 py-3 text-text-2 [overflow-wrap:anywhere]">{q.afterWrong ? `${q.afterWrong.text} (${q.afterWrong.count})` : <NoValue />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                </div>
                <ul className="flex flex-col gap-2 md:hidden" aria-label="Each question before and after">
                  {r.questions.map((q) => (
                    <li key={q.questionId} className="rounded-[var(--radius-l)] border border-line bg-raised p-4">
                      <p className="font-semibold text-text [overflow-wrap:anywhere]">{q.prompt}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <PairBars before={q.before} after={q.after} />
                        <ChangeBadge q={q} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {r.onlyBefore.length || r.onlyAfter.length ? (
              <p className="mt-4 text-sm text-text-3">
                Not compared: {r.onlyBefore.length ? `${plural(r.onlyBefore.length, 'question')} only in the earlier game` : ''}
                {r.onlyBefore.length && r.onlyAfter.length ? ' and ' : ''}
                {r.onlyAfter.length ? `${plural(r.onlyAfter.length, 'question')} only in the later one` : ''}.
              </p>
            ) : null}
          </>
        );
      }}
    </ReportGate>
  );
}
