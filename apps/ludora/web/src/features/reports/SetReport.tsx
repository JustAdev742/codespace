import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PencilLine } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Badge, PageHeader, SectionTitle } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { BackLink, dateText, dateTimeText, NoValue, percent, questionTypeLabel, RateBar, seconds, StatRow, StatTile, TableBox, Th, usePageTitle } from './reportUi.tsx';
import { Sparkline } from './charts.tsx';
import { ReportGate, useSignedIn } from './pageKit.tsx';
import type { WrongAnswer } from './logic.ts';

/*
 * /reports/sets/:setId (GET /api/reports/sets/:id): one set across every game you hosted with
 * it. How each question has done over every play, and which to look at again, with the reason.
 * Only sets you have hosted: anything else is "not found".
 */

type Reason = 'too_hard' | 'too_easy' | 'one_wrong_answer' | 'slow';

interface SetReportData {
  set: { id: string; title: string; exists: boolean; editable: boolean };
  games: { id: string; mode: string; endedAt: string; players: number }[];
  questions: { questionId: string; prompt: string; type: string; inSet: boolean; games: number; players: number; rate: number; avgResponseMs: number; history: { gameId: string; endedAt: string; rate: number; players: number }[]; commonWrong: WrongAnswer | null; reasons: Reason[] }[];
  unplayed: { questionId: string; prompt: string; type: string }[];
}

const REASON: Record<Reason, string> = {
  too_hard: 'Almost nobody gets it: check the wording and the right answer, or teach it first.',
  too_easy: 'Everybody gets it: make it harder or drop it.',
  one_wrong_answer: 'Half the players or more pick the same wrong answer: is that choice misleading?',
  slow: 'Takes twice as long as most questions: could it be shorter or clearer?',
};

function History({ h }: { h: SetReportData['questions'][number]['history'] }) {
  const text = h.map((x) => `${dateText(x.endedAt)} ${percent(x.rate)}`).join(', ');
  return (
    <span className="flex items-center gap-2">
      <Sparkline rates={h.map((x) => x.rate)} label={text} />
      <span className="sr-only">Each game, oldest first: {text}.</span>
    </span>
  );
}

export default function SetReport() {
  const { setId = '' } = useParams();
  const { me, signedIn } = useSignedIn();
  const q = useQuery({ queryKey: ['reports', 'set', setId], queryFn: () => api.get<SetReportData>(`/api/reports/sets/${encodeURIComponent(setId)}`), enabled: signedIn && Boolean(setId) });
  usePageTitle(q.data ? `${q.data.set.title} across your games` : 'Set across your games');
  return (
    <ReportGate me={me} query={q} title="Set across your games" next={`/reports/sets/${setId}`} notFound="You have not hosted a game with this set, or its games have been deleted.">
      {(d) => {
        const flagged = d.questions.filter((x) => x.reasons.length);
        const players = d.questions.reduce((n, x) => n + x.players, 0);
        const right = d.questions.reduce((n, x) => n + Math.round(x.rate * x.players), 0);
        return (
          <>
            <BackLink to={`/reports?set=${d.set.id}`}>Games with this set</BackLink>
            <PageHeader
              eyebrow="Set across your games"
              title={<span className="break-words">{d.set.title}</span>}
              description={`How each question has done over ${plural(d.games.length, 'game')} you hosted, and which to look at again.`}
              actions={
                d.set.editable ? (
                  <ButtonLink to={`/sets/${d.set.id}/edit`} icon={<PencilLine className="size-4" aria-hidden />}>
                    Edit the set
                  </ButtonLink>
                ) : null
              }
            />
            {!d.set.exists ? <p className="mb-4 rounded-[var(--radius-m)] border border-lantern/60 bg-lantern/10 px-4 py-3 text-sm text-text">This set has been deleted. Its games' results are still here.</p> : null}
            <StatRow label="The set in numbers">
              <StatTile label="Games" value={d.games.length}>
                First on {dateText(d.games[0]!.endedAt)}.
              </StatTile>
              <StatTile label="Right first time" value={players ? percent(right / players) : <NoValue />}>
                Across every question and game.
              </StatTile>
              <StatTile label="To look at again" value={flagged.length}>
                Questions with at least 8 answers and a reason below.
              </StatTile>
              <StatTile label="Never asked" value={d.unplayed.length}>
                In the set but not reached in your games yet.
              </StatTile>
            </StatRow>

            <section aria-labelledby="rewrite-title" className="mb-10">
              <SectionTitle>
                <span id="rewrite-title">Worth rewriting</span>
              </SectionTitle>
              {flagged.length ? (
                <ul className="flex flex-col gap-2" aria-label="Worth rewriting">
                  {flagged.map((x) => (
                    <li key={x.questionId} className="rounded-[var(--radius-l)] border border-line bg-raised p-4">
                      <p className="font-semibold text-text [overflow-wrap:anywhere]">{x.prompt}</p>
                      <p className="mt-1 text-sm text-text-2">
                        {percent(x.rate)} right first time over {plural(x.players, 'answer')} in {plural(x.games, 'game')}
                        {x.commonWrong ? `; most common wrong answer “${x.commonWrong.text}” (${x.commonWrong.count})` : ''}.
                      </p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {x.reasons.map((r) => (
                          <li key={r} className="flex items-start gap-2 text-sm text-text">
                            <Badge tone="amber">Look again</Badge>
                            <span>{REASON[r]}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-3">Nothing stands out yet. A question needs at least 8 answers before Ludora suggests changing it.</p>
              )}
            </section>

            <section aria-labelledby="every-title">
              <SectionTitle>
                <span id="every-title">Every question</span>
              </SectionTitle>
              <div className="hidden md:block">
                <TableBox caption="Every question across your games" minWidth={760}>
                  <thead className="bg-surface-2">
                    <tr>
                      <Th>Question</Th>
                      <Th>Right first time</Th>
                      <Th>Game by game</Th>
                      <Th align="right">Answers</Th>
                      <Th align="right">Average time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.questions.map((x) => (
                      <tr key={x.questionId} className="border-t border-line align-top">
                        <td className="min-w-[14rem] px-3 py-3">
                          <p className="font-semibold text-text [overflow-wrap:anywhere]">{x.prompt}</p>
                          <p className="text-xs text-text-3">
                            {questionTypeLabel(x.type) ?? ''}
                            {!x.inSet ? ' No longer in the set.' : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <RateBar rate={x.rate} />
                        </td>
                        <td className="px-3 py-3">{x.history.length > 1 ? <History h={x.history} /> : <span className="text-sm text-text-3">One game</span>}</td>
                        <td className="px-3 py-3 text-right text-text tabular">{x.players}</td>
                        <td className="px-3 py-3 text-right text-text tabular">{x.avgResponseMs > 0 ? seconds(x.avgResponseMs) : <NoValue />}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableBox>
              </div>
              <ul className="flex flex-col gap-2 md:hidden" aria-label="Every question across your games">
                {d.questions.map((x) => (
                  <li key={x.questionId} className="rounded-[var(--radius-l)] border border-line bg-raised p-4">
                    <p className="font-semibold text-text [overflow-wrap:anywhere]">{x.prompt}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <RateBar rate={x.rate} />
                      {x.history.length > 1 ? <History h={x.history} /> : null}
                    </div>
                    <p className="mt-1 text-sm text-text-2">{plural(x.players, 'answer')}</p>
                  </li>
                ))}
              </ul>
              {d.unplayed.length ? (
                <p className="mt-4 text-sm text-text-2">
                  Not asked in any of your games yet: {d.unplayed.slice(0, 5).map((u) => u.prompt).join('; ')}
                  {d.unplayed.length > 5 ? `, and ${d.unplayed.length - 5} more` : ''}.
                </p>
              ) : null}
              <p className="mt-6 text-sm text-text-2">
                Games: {d.games.map((g, i) => (
                  <span key={g.id}>
                    {i ? ', ' : ''}
                    <Link to={`/reports/${g.id}`} className="underline underline-offset-2">{dateTimeText(g.endedAt)}</Link>
                  </span>
                ))}
                .
              </p>
            </section>
          </>
        );
      }}
    </ReportGate>
  );
}
