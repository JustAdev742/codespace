import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ToggleGroup } from 'radix-ui';
import { School, Trophy, Users } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe, type MeUser } from '../../lib/session.ts';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { AccountError, EmptyState, ErrorNotice, PageHeader, Select, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { Stage } from '../../ui/Stage.tsx';
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

/** Gold, silver and bronze, as the medals on the quests page. Ink text passes AA on each. */
const MEDALS: Record<number, string> = { 1: 'var(--lantern)', 2: '#c3c8de', 3: '#d0884f' };

/** Monday 00:00 UTC of this week: the moment weekly scores start again. */
function weekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)));
}

/** Like the segmented controls in Settings: the chosen period is lifted out of the groove, not only coloured. 44px on phones. */
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
      className="inline-flex rounded-[var(--radius-m)] border border-line bg-sunken p-1 max-sm:w-full"
    >
      {options.map(([v, label]) => (
        <ToggleGroup.Item
          key={v}
          value={v}
          className="h-9 rounded-[var(--radius-s)] px-3.5 text-sm font-semibold text-text-2 transition-colors hover:text-text data-[state=on]:bg-raised data-[state=on]:text-text data-[state=on]:shadow-[0_1px_3px_rgb(2_5_20/0.3)] data-[state=on]:ring-1 data-[state=on]:ring-line-strong max-sm:h-11 max-sm:flex-1"
        >
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** The rank: a medal tile for the top three, a big plain number below them. */
function Rank({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (medal) {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] font-display text-[1.75rem] leading-none font-extrabold text-on-accent tabular" style={{ background: medal }}>
        <span className="sr-only">Rank </span>
        {rank}
      </span>
    );
  }
  return (
    <span className="w-11 shrink-0 text-center font-display text-[1.75rem] leading-none font-extrabold text-text-2 tabular">
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}

/** "You" beside your own name: one of three marks on your row, with the gold edge and bar, so it never rests on colour. */
function YouTag() {
  return <span className="shrink-0 rounded-[var(--radius-s)] bg-lantern px-1.5 text-xs leading-5 font-bold text-on-accent">You</span>;
}

function Row({ e }: { e: Entry }) {
  const podium = e.rank <= 3;
  return (
    <li className={`relative flex items-center gap-3 rounded-[var(--radius-m)] px-2.5 sm:px-3.5 ${podium ? 'py-3' : 'py-2.5'} ${e.me ? 'bg-white/[0.14] ring-2 ring-lantern' : podium ? 'bg-white/[0.09]' : 'bg-white/[0.05]'}`}>
      {e.me ? <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-[3px] bg-lantern" aria-hidden /> : null}
      <Rank rank={e.rank} />
      <PlayerAvatar avatar={e.avatar} size={podium ? 44 : 40} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {e.id ? (
            <Link to={`/profile/${e.id}`} className={`truncate text-text underline-offset-2 hover:underline ${e.me ? 'font-bold' : 'font-semibold'}`}>
              {e.displayName}
            </Link>
          ) : (
            <span className={`truncate ${e.me ? 'font-bold' : 'font-semibold'}`}>{e.displayName}</span>
          )}
          {e.me ? <YouTag /> : null}
        </div>
        <div className="text-sm text-text-2">Level {e.level}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`font-display leading-none font-extrabold tabular ${podium ? 'text-[2rem]' : 'text-[1.75rem]'}`}>
          {formatNumber(e.score)}
          <span className="sr-only"> correct answers</span>
        </div>
        <div className="mt-0.5 text-xs text-text-2">{plural(e.games, 'game')}</div>
      </div>
    </li>
  );
}

/** Your place on the board, as a broadcast caption: the rank on the gold plate, your score, and how far behind the next place you are. */
function YourPlace({ rank, score, above }: { rank: number; score: number; above: Entry | null }) {
  const gap = above ? above.score - score : 0;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-m)] bg-white/[0.07] px-3.5 py-3">
      <span className="plate plate-gold text-[2rem]">
        <span className="tabular">
          <span className="sr-only">Your place: </span>
          {ordinal(rank)}
        </span>
      </span>
      <p className="min-w-0 flex-1 text-text-2">
        <span aria-hidden className="block font-semibold text-text">
          Your place
        </span>
        {plural(score, 'correct answer')}
        {rank === 1 ? ', top of the board' : above ? (gap > 0 ? `, ${gap} behind ${above.displayName}` : `, level with ${above.displayName}`) : ''}
      </p>
    </div>
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
  return <p className="mt-3 rounded-[var(--radius-m)] border border-dashed border-line-strong px-3.5 py-3 text-sm text-text-2">{text}</p>;
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
  const mine = board.entries.findIndex((e) => e.me);
  const me = mine >= 0 ? board.entries[mine]! : null;
  return (
    <div aria-busy={dim || undefined} className={`transition-opacity ${dim ? 'opacity-60' : ''}`}>
      {/* The scoreboard sits on the stage in both themes, like a broadcast graphic. */}
      <Stage className="rounded-[var(--radius-l)] p-2.5 sm:p-4">
        {me ? <YourPlace rank={me.rank} score={me.score} above={mine > 0 ? board.entries[mine - 1]! : null} /> : board.me ? <YourPlace rank={board.me.rank} score={board.me.score} above={null} /> : null}
        <div aria-hidden className="mb-1.5 flex justify-between px-3.5 text-xs font-semibold text-text-2">
          <span>Player</span>
          <span>Correct answers</span>
        </div>
        <ol className="flex flex-col gap-1.5">
          {board.entries.map((e) => (
            <Row key={e.rank} e={e} />
          ))}
        </ol>
        {board.me ? (
          <div className="relative mt-3 flex items-center gap-3 rounded-[var(--radius-m)] bg-white/[0.14] px-2.5 py-2.5 ring-2 ring-lantern sm:px-3.5">
            <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-[3px] bg-lantern" aria-hidden />
            <span className="w-11 shrink-0 text-center font-display text-[1.75rem] leading-none font-extrabold tabular" aria-hidden>
              {board.me.rank}
            </span>
            <p className="text-sm text-text-2">
              <span className="font-semibold text-text">You are {ordinal(board.me.rank)}</span> with {plural(board.me.score, 'correct answer')}. Only the top 50 are listed.
            </p>
          </div>
        ) : null}
      </Stage>
      {me || board.me ? null : <NotOnBoard user={user} scope={scope} period={period} teaching={teaching} />}
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
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Leaderboards" />
        <AccountError onRetry={() => void me.refetch()} />
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
                      <Select value={chosenClass.id} onChange={(e) => update({ class: e.target.value })} className="w-auto max-w-56 min-w-0">
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
                  <p className="mb-4 rounded-[var(--radius-m)] bg-surface-2 px-3.5 py-3 text-sm text-text-2">Other players cannot see you on leaderboards. You still see yourself here.</p>
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
