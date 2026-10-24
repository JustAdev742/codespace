import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSearch } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { duration, formatNumber, ordinal, plural } from '../../lib/format.ts';
import { AccountError, Badge, EmptyState, ErrorNotice, PageHeader, SectionTitle, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { csvDateTime, csvPercent, downloadCsv, fileDate, slug, type CsvCell } from './csv.ts';
import {
  BackLink,
  dateTimeText,
  errorText,
  hardestFirst,
  hasStatus,
  NoValue,
  percent,
  QuestionTable,
  questionTypeLabel,
  seconds,
  SignInPrompt,
  StatRow,
  StatTile,
  TableBox,
  Th,
  usePageTitle,
  type QuestionStat,
} from './reportUi.tsx';

/*
 * /reports/:gameId (GET /api/games/:id/report): one finished game for its
 * host, the teacher of the class it was played in, or staff. The API answers
 * 404 for anyone else, the same as for a game that does not exist.
 */

interface Standing {
  rank: number;
  name: string;
  isGuest: boolean;
  isBot: boolean;
  score: number;
  label: string;
  correct: number;
  answered: number;
  avgResponseMs: number;
  bestStreak: number;
  leftEarly: boolean;
}

interface GameReportData {
  game: {
    id: string;
    mode: string;
    modeId: string;
    variantId: string | null;
    setTitle: string;
    setId: string | null;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    /** People, not counting practice bots. */
    players: number;
    endedBy: string;
    solo: boolean;
  };
  standings: Standing[];
  questions: QuestionStat[];
}

function endingText(endedBy: string, solo: boolean): string {
  if (endedBy === 'mode') return 'Played to the end';
  if (endedBy === 'host') return solo ? 'Finished early by the player' : 'Ended early by the host';
  if (endedBy === 'error') return 'Stopped by a problem in the game';
  return 'Ended';
}

const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function Standings({ standings }: { standings: Standing[] }) {
  return (
    <TableBox caption="Standings" minWidth={860}>
      <thead className="bg-surface-2">
        <tr>
          <Th>Rank</Th>
          <Th>Player</Th>
          <Th align="right">Score</Th>
          <Th>Result</Th>
          <Th align="right">Correct</Th>
          <Th align="right">Average time</Th>
          <Th align="right">Best streak</Th>
          <Th>Left early</Th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={`${s.rank}-${s.name}-${i}`} className="border-t border-line">
            <td className="px-3 py-2.5 font-display text-lg leading-none font-bold whitespace-nowrap text-text tabular">{ordinal(s.rank)}</td>
            <td className="px-3 py-2.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold break-words text-text">{s.name}</span>
                {s.isBot ? <Badge>Bot</Badge> : s.isGuest ? <Badge tone="sky">Guest</Badge> : null}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(s.score)}</td>
            <td className="px-3 py-2.5 break-words text-text-2">{s.label}</td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap text-text tabular">
              {s.correct} of {s.answered}
              {s.answered ? <span className="text-text-3"> ({percent(s.correct / s.answered)})</span> : null}
            </td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap text-text tabular">{s.answered && s.avgResponseMs > 0 ? seconds(s.avgResponseMs) : <NoValue />}</td>
            <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(s.bestStreak)}</td>
            <td className="px-3 py-2.5">{s.leftEarly ? <Badge tone="coral">Yes</Badge> : <span className="text-text-3">No</span>}</td>
          </tr>
        ))}
      </tbody>
    </TableBox>
  );
}

export default function GameReport() {
  const { gameId = '' } = useParams();
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const report = useQuery({
    queryKey: ['reports', 'game', gameId],
    queryFn: () => api.get<GameReportData>(`/api/games/${encodeURIComponent(gameId)}/report`),
    enabled: signedIn && Boolean(gameId),
  });
  usePageTitle(report.data ? `${report.data.game.mode} report` : 'Game report');

  if (me.isLoading || (signedIn && report.isPending)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading the report
        </span>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-1/2 max-w-sm" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Game report" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!signedIn || hasStatus(report.error, 401)) {
    return (
      <>
        <PageHeader title="Game report" />
        <SignInPrompt title="Sign in to see this report" next={`/reports/${gameId}`}>
          Game reports are for the person who hosted the game, and for the teacher when it was played in their class.
        </SignInPrompt>
      </>
    );
  }
  if (hasStatus(report.error, 400, 404)) {
    return (
      <>
        <PageHeader title="Game report" />
        <EmptyState icon={<FileSearch className="size-8" />} title="Report not found" action={<ButtonLink to="/reports">Games you hosted</ButtonLink>}>
          This game does not exist, or its report is not yours to see. Reports are for the host, and for the teacher when a game was played in their class.
        </EmptyState>
      </>
    );
  }
  if (!report.data) {
    return (
      <>
        <BackLink to="/reports">Games you hosted</BackLink>
        <PageHeader title="Game report" />
        <ErrorNotice message={errorText(report.error, 'The report could not be loaded. Check your connection and try again.')} onRetry={() => void report.refetch()} />
      </>
    );
  }

  const { game, standings, questions } = report.data;
  const people = standings.filter((s) => !s.isBot);
  const bots = standings.length - people.length;
  const answered = people.reduce((n, s) => n + s.answered, 0);
  const correct = people.reduce((n, s) => n + s.correct, 0);

  const download = () => {
    const rows: CsvCell[][] = [
      ['Game mode', game.mode],
      ['Question set', game.setTitle],
      ['Started', csvDateTime(game.startedAt)],
      ['Ended', csvDateTime(game.endedAt)],
      ['Length (minutes)', Math.round(game.durationMs / 6000) / 10],
      ['Players', game.players],
      ['How it ended', endingText(game.endedBy, game.solo)],
      [],
      ['Standings'],
      ['Rank', 'Name', 'Guest', 'Bot', 'Score', 'Result', 'Correct', 'Answered', 'Accuracy (%)', 'Average time (s)', 'Best streak', 'Left early'],
      ...standings.map((s) => [
        s.rank,
        s.name,
        s.isGuest && !s.isBot ? 'Yes' : 'No',
        s.isBot ? 'Yes' : 'No',
        s.score,
        s.label,
        s.correct,
        s.answered,
        s.answered ? csvPercent(s.correct / s.answered) : null,
        s.answered && s.avgResponseMs > 0 ? Math.round(s.avgResponseMs / 100) / 10 : null,
        s.bestStreak,
        s.leftEarly ? 'Yes' : 'No',
      ]),
      [],
      ['Questions, hardest first'],
      ['Question', 'Type', 'Right first time (%)', 'Players', 'Attempts', 'Average time (s)'],
      ...hardestFirst(questions).map((q) => [q.prompt, questionTypeLabel(q.type) ?? '', csvPercent(q.firstTryRate), q.players, q.attempts, q.avgResponseMs > 0 ? Math.round(q.avgResponseMs / 100) / 10 : null]),
    ];
    downloadCsv(`ludora-${slug(game.mode, 30)}-${slug(game.setTitle, 30)}-${fileDate(new Date(game.startedAt))}.csv`, rows);
  };

  return (
    <>
      <BackLink to="/reports">Games you hosted</BackLink>
      <PageHeader
        eyebrow={
          <>
            {game.solo ? 'Solo game' : 'Game report'}, <time dateTime={game.startedAt}>{dateTimeText(game.startedAt)}</time>
          </>
        }
        title={<span className="break-words">{game.mode}</span>}
        description={game.setTitle}
        actions={
          <Button icon={<Download className="size-4" />} onClick={download}>
            Download CSV
          </Button>
        }
      />

      <StatRow label="Game summary">
        <StatTile label="Players" value={formatNumber(game.players)}>
          {bots ? `Plus ${plural(bots, 'practice bot')}.` : game.solo ? 'Played solo.' : 'No practice bots.'}
        </StatTile>
        <StatTile label="Length" value={duration(game.durationMs)}>
          {timeOnly(game.startedAt)} to {timeOnly(game.endedAt)}. {endingText(game.endedBy, game.solo)}.
        </StatTile>
        <StatTile label="Answers right" value={answered ? percent(correct / answered) : <NoValue label="No answers" />}>
          {answered ? `${formatNumber(correct)} of ${plural(answered, 'answer')}${bots ? ', not counting bots' : ''}.` : 'Nobody answered a question.'}
        </StatTile>
        <StatTile label="Questions answered" value={formatNumber(questions.length)}>
          Different questions that at least one player answered.
        </StatTile>
      </StatRow>

      <section className="mb-8">
        <SectionTitle>Standings</SectionTitle>
        {standings.length === 0 ? (
          <EmptyState title="Nobody played">There are no players in the results for this game.</EmptyState>
        ) : (
          <Standings standings={standings} />
        )}
      </section>

      <section>
        <SectionTitle>Questions, hardest first</SectionTitle>
        <p className="-mt-1 mb-3 max-w-[70ch] text-sm text-text-2">Each player counts once per question, judged on their first try. Practice bots are not counted.</p>
        <QuestionTable questions={questions} caption="Questions, hardest first" empty="Nobody answered a question in this game." />
      </section>
    </>
  );
}
