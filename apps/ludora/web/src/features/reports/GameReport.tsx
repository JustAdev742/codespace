import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSearch, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { duration, formatNumber, plural, formatDate } from '../../lib/format.ts';
import { AccountError, EmptyState, ErrorNotice, PageHeader, SectionTitle, Skeleton, Switch } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { PrintSheet, usePrinting } from '../classes/PrintSheet.tsx';
import { BackLink, dateTimeText, errorText, hasStatus, NoValue, percent, SignInPrompt, StatRow, StatTile, usePageTitle } from './reportUi.tsx';
import { CheckIn, ClassVoice, Pace, PlayerDialog, QuestionAnalysis, Standings, TeachNext, Teams, usePlayerDialog } from './GameSections.tsx';
import { loadAnswers, NextSteps, NoteEditor } from './GameActions.tsx';
import { ClassSheet, StudentSlips } from './GamePrint.tsx';
import type { AnswerLine } from './logic.ts';
import type { GameReportData } from './gameTypes.ts';

/*
 * /reports/:gameId (GET /api/games/:id/report): one finished game for its host, the teacher of
 * the class it was played in, or staff. The API answers 404 for anyone else, the same as for a
 * game that does not exist. Leads with what to teach next, then who to check in with, then the
 * numbers; ends with the next steps (reteach, assign, compare, print, download, delete).
 */

function endingText(endedBy: string, solo: boolean): string {
  if (endedBy === 'mode') return 'Played to the end';
  if (endedBy === 'host') return solo ? 'Finished early by the player' : 'Ended early by the host';
  if (endedBy === 'error') return 'Stopped by a problem in the game';
  return 'Ended';
}

const PACING_NOTE: Record<string, string> = {
  self: 'Everyone answered at their own pace.',
  solo: 'Played alone.',
};

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
  const [withGuests, setWithGuests] = useState(true);
  const player = usePlayerDialog();
  const printClass = usePrinting();
  const [slips, setSlips] = useState<AnswerLine[] | null>(null);
  const [loadingSlips, setLoadingSlips] = useState(false);

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
        <EmptyState icon={<FileSearch className="size-8" />} title="Report not found" action={<ButtonLink to="/reports">Your reports</ButtonLink>}>
          This game does not exist, its report was deleted, or it is not yours to see. Reports are for the host, and for the teacher when a game was played in their class.
        </EmptyState>
      </>
    );
  }
  if (!report.data) {
    return (
      <>
        <BackLink to="/reports">Your reports</BackLink>
        <PageHeader title="Game report" />
        <ErrorNotice message={errorText(report.error, 'The report could not be loaded. Check your connection and try again.')} onRetry={() => void report.refetch()} />
      </>
    );
  }

  const data = report.data;
  const { game, standings } = data;
  const view = !withGuests && data.viewAccounts ? data.viewAccounts : data.view;
  const people = standings.filter((s) => !s.isBot);
  const bots = standings.length - people.length;
  const guests = people.filter((s) => s.membership === 'guest').length;
  const showTeam = data.teams.length > 0;
  // The time by itself, in the viewer's chosen time zone and style (lib/format.ts), not cut out of a longer text.
  const timeOnly = (iso: string) => formatDate(new Date(iso), { hour: '2-digit', minute: '2-digit' });

  const printSlips = async () => {
    setLoadingSlips(true);
    try {
      setSlips((await loadAnswers(game.id)).answers);
    } catch (err) {
      toast.error(errorText(err, 'The slips could not be made. Check your connection and try again.'));
    } finally {
      setLoadingSlips(false);
    }
  };

  return (
    <>
      <BackLink to="/reports">Your reports</BackLink>
      <PageHeader
        eyebrow={
          <>
            {game.solo ? 'Solo game' : 'Game report'}, <time dateTime={game.startedAt}>{dateTimeText(game.startedAt)}</time>
          </>
        }
        title={<span className="break-words">{game.mode}</span>}
        description={
          <>
            <span className="break-words">{game.setTitle}</span>
            {game.className && game.classId ? (
              <>
                {' '}
                in <Link to={`/classes/${game.classId}`} className="underline underline-offset-2">{game.className}</Link>
              </>
            ) : null}
            {PACING_NOTE[game.pacing] ? ` ${PACING_NOTE[game.pacing]}` : ''}
          </>
        }
        actions={
          data.setup ? (
            <ButtonLink to={`/host?again=${game.id}`} variant="primary" icon={<RotateCcw className="size-4" aria-hidden />}>
              Host again
            </ButtonLink>
          ) : null
        }
      />

      {data.viewAccounts ? (
        <div className="mb-4 max-w-xl rounded-[var(--radius-l)] border border-line bg-raised px-4 py-2">
          <Switch
            checked={withGuests}
            onCheckedChange={setWithGuests}
            label="Count guests in the totals"
            description={`${plural(guests, 'player')} joined as a guest without signing in. Turn this off to see the class's numbers without them.`}
          />
        </div>
      ) : null}

      <StatRow label="Game summary">
        <StatTile label="Players" value={formatNumber(game.players)}>
          {bots ? `Plus ${plural(bots, 'practice bot')}.` : guests ? `${plural(guests, 'guest')}.` : game.solo ? 'Played solo.' : 'No practice bots.'}
        </StatTile>
        <StatTile label="Length" value={duration(game.durationMs)}>
          {timeOnly(game.startedAt)} to {timeOnly(game.endedAt)}. {endingText(game.endedBy, game.solo)}.
        </StatTile>
        <StatTile label="Right first time" value={view.totals.answered ? percent(view.totals.right / view.totals.answered) : <NoValue label="No answers" />}>
          {view.totals.answered ? `${formatNumber(view.totals.right)} of ${plural(view.totals.answered, 'first try', 'first tries')}${!withGuests ? ', guests left out' : ''}.` : 'Nobody answered a graded question.'}
        </StatTile>
        <StatTile label="Questions answered" value={formatNumber(view.questions.length)}>
          Different questions that at least one player answered.
        </StatTile>
      </StatRow>

      <TeachNext view={view} pacing={game.pacing} />
      <CheckIn data={data} onOpen={player.show} />
      {data.pace ? <Pace pace={data.pace} onOpen={player.show} /> : null}
      <Teams teams={data.teams} />
      <ClassVoice voice={data.voice} />

      <section className="mb-10" aria-labelledby="standings-title">
        <SectionTitle>
          <span id="standings-title">Standings</span>
        </SectionTitle>
        <p className="-mt-1 mb-3 max-w-[70ch] text-sm text-text-2">Choose a name to see that player's answers, question by question.</p>
        <Standings standings={standings} onOpen={player.show} showTeam={showTeam} />
      </section>

      <section className="mb-10" aria-labelledby="questions-title">
        <SectionTitle>
          <span id="questions-title">Every question, hardest first</span>
        </SectionTitle>
        <p className="-mt-1 mb-3 max-w-[70ch] text-sm text-text-2">Each player counts once per question, judged on their first try. Practice bots and poll votes are not counted.</p>
        <QuestionAnalysis questions={view.questions} />
      </section>

      <NextSteps data={data} view={view} onPrintClass={printClass.print} onPrintSlips={() => void printSlips()} printingSlips={loadingSlips} />

      <NoteEditor key={data.note?.updatedAt ?? 'none'} gameId={game.id} note={data.note} />

      <PlayerDialog gameId={game.id} playerKey={player.open} onClose={player.close} />
      {printClass.printing ? (
        <PrintSheet onDone={printClass.done} label="Class report">
          <ClassSheet data={data} view={view} />
        </PrintSheet>
      ) : null}
      {slips ? (
        <PrintSheet onDone={() => setSlips(null)} label="Student slips">
          <StudentSlips data={data} answers={slips} />
        </PrintSheet>
      ) : null}
    </>
  );
}
