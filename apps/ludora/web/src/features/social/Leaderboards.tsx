import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ToggleGroup } from 'radix-ui';
import { School, Trophy, Users } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe, type MeUser } from '../../lib/session.ts';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, Select, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { PlayerAvatar } from './parts.tsx';
import { errorText, friendsKey, getFriends, usePageTitle } from './data.ts';

type Scope = 'friends' | 'class' | 'global';
type Period = 'week' | 'all';

/** GET /api/leaderboards. The global board leaves out ids (except yours), so those rows have no profile link. */
interface Entry {
  rank: number;
  id?: string;
  displayName: string;
  level: number;
  avatar: AvatarLite | null;
  score: number;
  games: number;
  me: boolean;
}

interface Board {
  scope: Scope;
  period: Period;
  week: { label: string; since: string } | null;
  entries: Entry[];
  /** Your place when you are on the board but outside the top 50. */
  me: { rank: number; score: number } | null;
}

interface ClassesData {
  teaching: { id: string; name: string; archived: boolean }[];
  member: { id: string; name: string; teacher: string }[];
}

interface ClassOption {
  id: string;
  name: string;
  teaching: boolean;
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'class', label: 'Class' },
  { value: 'global', label: 'Everyone' },
];

const MEDALS: Record<number, string> = { 1: '#f5c451', 2: '#c7cbe0', 3: '#d89a6a' };

/** Monday 00:00 UTC of this week: the moment weekly scores start again. */
function weekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)));
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  const options: [Period, string][] = [
    ['week', 'This week'],
    ['all', 'All time'],
  ];
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v === 'week' || v === 'all') onChange(v);
      }}
      aria-label="Time period"
      className="inline-flex rounded-[12px] border border-line bg-sunken p-1"
    >
      {options.map(([v, label]) => (
        <ToggleGroup.Item key={v} value={v} className="h-8 rounded-[9px] px-3 text-sm font-semibold text-text-2 transition-colors hover:text-text data-[state=on]:bg-raised data-[state=on]:text-text data-[state=on]:shadow-[0_1px_0_var(--line-strong)]">
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

function Row({ e }: { e: Entry }) {
  const medal = MEDALS[e.rank];
  return (
    <li className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${e.me ? 'bg-dusk/20 ring-2 ring-lantern' : 'bg-surface-2'}`}>
      <span
        className={medal ? 'grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-extrabold text-on-accent' : 'w-8 shrink-0 text-center font-display font-bold text-text-3 tabular'}
        style={medal ? { background: medal } : undefined}
      >
        <span className="sr-only">Rank </span>
        {e.rank}
      </span>
      <PlayerAvatar avatar={e.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {e.id ? (
            <Link to={`/profile/${e.id}`} className="truncate font-semibold text-text underline-offset-2 hover:underline">
              {e.displayName}
            </Link>
          ) : (
            <span className="truncate font-semibold">{e.displayName}</span>
          )}
          {e.me ? <Badge tone="violet">You</Badge> : null}
        </div>
        <div className="text-sm text-text-3">Level {e.level}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular">
          {formatNumber(e.score)}
          <span className="sr-only"> correct answers</span>
        </div>
        <div className="text-xs text-text-3">{plural(e.games, 'game')}</div>
      </div>
    </li>
  );
}

function NotOnBoard({ user, scope, period, teaching }: { user: MeUser; scope: Scope; period: Period; teaching: boolean }) {
  let text: ReactNode;
  if (user.isGuest) {
    text = (
      <>
        Guests do not appear on leaderboards.{' '}
        <Link to="/signup" className="font-semibold">
          Create a free account
        </Link>{' '}
        to get on the board.
      </>
    );
  } else if (user.isTestAccount) {
    text = 'Test accounts do not appear on leaderboards.';
  } else if (scope === 'class' && teaching) {
    text = 'You teach this class, so you are not on its board.';
  } else {
    text = period === 'week' ? 'You are not on this board yet. Finish a game this week to get on it.' : 'You are not on this board yet. Finish a game to get on it.';
  }
  return <p className="mt-3 rounded-[12px] border border-dashed border-line-strong px-3 py-2.5 text-sm text-text-2">{text}</p>;
}

function BoardView({ board, dim, user, scope, period, teaching }: { board: Board; dim: boolean; user: MeUser; scope: Scope; period: Period; teaching: boolean }) {
  if (!board.entries.length) {
    return (
      <EmptyState
        icon={<Trophy className="size-8" />}
        title={period === 'week' ? 'No scores yet this week' : 'No scores yet'}
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
        {user.isGuest ? 'Guests do not appear on leaderboards, but players with accounts who finish a game do.' : period === 'week' ? 'Scores start again every Monday. Finish a game to get on the board.' : 'Finish a game to get on the board.'}
      </EmptyState>
    );
  }
  const onBoard = board.entries.some((e) => e.me);
  return (
    <div aria-busy={dim || undefined} className={`transition-opacity ${dim ? 'opacity-60' : ''}`}>
      <div aria-hidden className="mb-1.5 flex justify-between px-3 text-xs font-semibold text-text-3">
        <span>Player</span>
        <span>Correct answers</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {board.entries.map((e) => (
          <Row key={e.rank} e={e} />
        ))}
      </ol>
      {board.me ? (
        <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-dusk/20 px-3 py-2.5 ring-2 ring-lantern">
          <span className="w-8 shrink-0 text-center font-display font-bold tabular" aria-hidden>
            {board.me.rank}
          </span>
          <p className="text-sm text-text-2">
            <span className="font-semibold text-text">You are {ordinal(board.me.rank)}</span> with {plural(board.me.score, 'correct answer')}. Only the top 50 are listed.
          </p>
        </div>
      ) : onBoard ? null : (
        <NotOnBoard user={user} scope={scope} period={period} teaching={teaching} />
      )}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <p role="status" className="sr-only">
        Loading the leaderboard
      </p>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[60px]" />
      ))}
    </div>
  );
}

export default function Leaderboards() {
  usePageTitle('Leaderboards');
  const me = useMe();
  const user = me.data?.user ?? null;
  const isAccount = Boolean(user && !user.isGuest);
  const [params, setParams] = useSearchParams();
  const rawScope = params.get('scope');
  const scope: Scope = rawScope === 'friends' || rawScope === 'class' || rawScope === 'global' ? rawScope : isAccount ? 'friends' : 'global';
  const period: Period = params.get('period') === 'all' ? 'all' : 'week';

  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<ClassesData>('/api/classes'), enabled: isAccount });
  const friends = useQuery({ queryKey: friendsKey, queryFn: getFriends, enabled: isAccount });
  const classOptions = useMemo<ClassOption[]>(() => {
    const d = classes.data;
    if (!d) return [];
    return [...d.member.map((c) => ({ id: c.id, name: c.name, teaching: false })), ...d.teaching.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, teaching: true }))];
  }, [classes.data]);
  const chosenClass = classOptions.find((c) => c.id === params.get('class')) ?? classOptions[0] ?? null;

  const ready = Boolean(user) && (scope === 'global' || (isAccount && (scope === 'friends' || (scope === 'class' && Boolean(chosenClass)))));
  const classId = scope === 'class' ? (chosenClass?.id ?? null) : null;
  const board = useQuery({
    queryKey: ['leaderboard', scope, period, classId],
    queryFn: () => api.get<Board>(`/api/leaderboards?${new URLSearchParams({ scope, period, ...(classId ? { classId } : {}) })}`),
    enabled: ready,
    // Keep the old board on screen (dimmed) while a new period or class loads, but never show one scope's board under another's tab.
    placeholderData: (prev) => (prev?.scope === scope ? prev : undefined),
  });

  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) next.set(k, v);
        return next;
      },
      { replace: true },
    );

  if (me.isLoading) {
    return (
      <>
        <PageHeader title="Leaderboards" />
        <RowsSkeleton />
      </>
    );
  }
  if (!user) {
    return (
      <>
        <PageHeader title="Leaderboards" />
        <EmptyState
          icon={<Trophy className="size-8" />}
          title="Sign in to see the leaderboards"
          action={
            <ButtonLink to="/signin?next=/leaderboards" variant="primary">
              Sign in
            </ButtonLink>
          }
        >
          Compare scores with your friends, your class and everyone on Ludora.
        </EmptyState>
      </>
    );
  }

  const since = weekStart().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  let content: ReactNode;
  if (scope !== 'global' && user.isGuest) {
    content = (
      <EmptyState
        icon={<Users className="size-8" />}
        title="Friends and classes need an account"
        action={
          <ButtonLink to="/signup" variant="primary">
            Create a free account
          </ButtonLink>
        }
      >
        Create a free account to add friends, join a class and compare scores with them. Your progress comes with you.
      </EmptyState>
    );
  } else if (scope === 'friends' && friends.data && friends.data.friends.length === 0) {
    content = (
      <EmptyState
        icon={<Users className="size-8" />}
        title="No friends yet"
        action={
          <ButtonLink to="/friends" variant="primary">
            Add friends
          </ButtonLink>
        }
      >
        Add friends with their friend code, then see how your scores compare here.
      </EmptyState>
    );
  } else if (scope === 'class' && classes.isLoading) {
    content = <RowsSkeleton />;
  } else if (scope === 'class' && classes.isError) {
    content = <ErrorNotice message={errorText(classes.error, 'Your classes could not be loaded.')} onRetry={() => void classes.refetch()} />;
  } else if (scope === 'class' && !chosenClass) {
    content = (
      <EmptyState
        icon={<School className="size-8" />}
        title="You are not in a class yet"
        action={
          <ButtonLink to="/classes" variant="primary">
            Go to Classes
          </ButtonLink>
        }
      >
        Join a class with the code your teacher gives you, then compare scores with your classmates here.
      </EmptyState>
    );
  } else if (board.isError && !board.data) {
    content = <ErrorNotice message={errorText(board.error, 'The leaderboard could not be loaded.')} onRetry={() => void board.refetch()} />;
  } else if (!board.data) {
    content = <RowsSkeleton />;
  } else {
    content = <BoardView board={board.data} dim={board.isPlaceholderData} user={user} scope={scope} period={period} teaching={Boolean(chosenClass?.teaching)} />;
  }

  const showControls = !(scope !== 'global' && user.isGuest);
  return (
    <>
      <PageHeader
        title="Leaderboards"
        description="Who has answered the most questions correctly, among your friends, in your class and across Ludora."
        actions={
          isAccount ? (
            <ButtonLink to="/friends" icon={<Users className="size-4" />}>
              Friends
            </ButtonLink>
          ) : null
        }
      />
      <div className="max-w-3xl">
        <Tabs value={scope} onValueChange={(v) => update({ scope: v })} label="Leaderboard" items={SCOPES.map((s) => ({ value: s.value, label: s.label }))}>
          <TabPanel value={scope}>
            {showControls ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <PeriodToggle value={period} onChange={(v) => update({ period: v })} />
                  {scope === 'class' && chosenClass ? (
                    <label className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      Class
                      <Select value={chosenClass.id} onChange={(e) => update({ class: e.target.value })} className="h-10 w-auto max-w-56 min-w-0">
                        {classOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.teaching ? `${c.name} (you teach it)` : c.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                </div>
                <p className="mb-4 text-sm text-text-2">
                  {period === 'week' ? `Scores count correct answers since ${since}.` : 'Scores count correct answers in every game so far.'} Anyone can hide from leaderboards in{' '}
                  <Link to="/settings#privacy" className="font-semibold">
                    Settings
                  </Link>
                  .
                </p>
                {isAccount && !user.preferences.privacy.showOnLeaderboards ? (
                  <p className="mb-4 rounded-[12px] bg-surface-2 px-3 py-2.5 text-sm text-text-2">Other players cannot see you on leaderboards. You still see yourself here.</p>
                ) : null}
              </>
            ) : null}
            {content}
          </TabPanel>
        </Tabs>
      </div>
    </>
  );
}
