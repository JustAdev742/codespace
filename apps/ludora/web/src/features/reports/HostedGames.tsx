import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Presentation, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { duration, plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { dateTimeText, errorText, hasStatus, SignInPrompt, usePageTitle } from './reportUi.tsx';

/* /reports: games you hosted for a group (GET /api/me/hosted), newest first, each opening its report. */

interface HostedGame {
  id: string;
  mode: string;
  setTitle: string;
  players: number;
  endedAt: string;
  durationMs: number;
}

interface HostedPage {
  games: HostedGame[];
  nextBefore: string | null;
}

function GameRow({ g }: { g: HostedGame }) {
  return (
    <li>
      <Link to={`/reports/${g.id}`} className="flex items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-4 py-3 text-text no-underline transition-colors hover:border-line-strong">
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight font-bold break-words">{g.mode}</span>
            <span className="block text-sm break-words text-text-2">{g.setTitle}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2 sm:justify-end">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-text-3" aria-hidden />
              {plural(g.players, 'player')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-text-3" aria-hidden />
              {duration(g.durationMs)}
            </span>
            <time dateTime={g.endedAt} className="text-text-3">
              {dateTimeText(g.endedAt)}
            </time>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
      </Link>
    </li>
  );
}

export default function HostedGames() {
  usePageTitle('Games you hosted');
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const hosted = useInfiniteQuery({
    queryKey: ['reports', 'hosted'],
    queryFn: ({ pageParam }) => api.get<HostedPage>(`/api/me/hosted${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: signedIn,
  });
  const games = hosted.data?.pages.flatMap((p) => p.games) ?? [];

  const header = (
    <PageHeader
      title="Games you hosted"
      description="Newest first. Open a game to see each player's result and how every question went."
      actions={
        // With no games yet, the empty state below carries the same link.
        signedIn && games.length > 0 ? (
          <ButtonLink to="/host" variant="primary" icon={<Presentation className="size-4" />}>
            Host a game
          </ButtonLink>
        ) : null
      }
    />
  );

  if (!me.isLoading && (!signedIn || hasStatus(hosted.error, 401))) {
    return (
      <>
        {header}
        <SignInPrompt title="Sign in to see your game reports" next="/reports">
          Reports are kept for the games you host, so you can look back at who played and which questions were hardest.
        </SignInPrompt>
      </>
    );
  }

  return (
    <>
      {header}
      {me.isLoading || hosted.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only" role="status">
            Loading your games
          </span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : hosted.isError && !games.length ? (
        <ErrorNotice message={errorText(hosted.error, 'Your hosted games could not be loaded. Check your connection and try again.')} onRetry={() => void hosted.refetch()} />
      ) : games.length === 0 ? (
        <EmptyState
          icon={<Presentation className="size-8" />}
          title="No hosted games yet"
          action={
            <ButtonLink to="/host" variant="primary">
              Host a game
            </ButtonLink>
          }
        >
          Host a game for a group and its report appears here when it ends. Solo games and assignments are not listed.
        </EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {games.map((g) => (
              <GameRow key={g.id} g={g} />
            ))}
          </ul>
          {hosted.isFetchNextPageError ? (
            <div className="mt-3">
              <ErrorNotice title="More games did not load" message={errorText(hosted.error, 'Check your connection and try again.')} onRetry={() => void hosted.fetchNextPage()} />
            </div>
          ) : null}
          <div className="mt-4 flex justify-center">
            {hosted.hasNextPage ? (
              <Button loading={hosted.isFetchingNextPage} onClick={() => void hosted.fetchNextPage()}>
                Load more
              </Button>
            ) : (
              <p className="text-sm text-text-3">{games.length > 1 ? `That is all ${games.length} games you have hosted.` : 'That is the only game you have hosted.'}</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
