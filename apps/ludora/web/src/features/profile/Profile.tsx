import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, BarChart3, Check, Flag, Lock, Shirt, UserMinus, UserPlus, UserX, Users } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import type { EquippedSlot } from '../../lib/queries.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ProfileCard } from '../collection/ProfileCard.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';
import { errorText, useFocusAfterUpdate, useReturnFocus, useSocialRefresh, usePageTitle } from '../social/data.ts';

/** GET /api/profiles/:id. Stats and the join date only come back when the viewer may see the full profile. */
interface PublicProfile {
  id: string;
  displayName: string;
  avatar: AvatarLite | null;
  equipped: Record<string, EquippedSlot>;
  level: number;
  isFriend: boolean;
  isSelf: boolean;
  friendship: 'none' | 'friends' | 'requested' | 'incoming';
  canRequest: boolean;
  blockedByMe: boolean;
  isGuest: boolean;
  restricted: boolean;
  joinedAt?: string;
  stats?: { gamesPlayed: number; gamesWon: number; podiums: number; bestStreak: number; longestDailyStreak: number; glims: number };
}

const OWN_VISIBILITY = {
  public: 'Everyone can see your stats here.',
  friends: 'Only your friends can see your stats here. Everyone else sees just your card.',
  private: 'Only you can see your stats here. Everyone else sees just your card.',
} as const;

function StatsPanel({ stats, joinedAt }: { stats: NonNullable<PublicProfile['stats']>; joinedAt?: string | undefined }) {
  const tiles = [
    { label: 'Games played', value: formatNumber(stats.gamesPlayed) },
    { label: 'Wins', value: formatNumber(stats.gamesWon) },
    { label: 'Podium finishes', value: formatNumber(stats.podiums) },
    { label: 'Best answer streak', value: formatNumber(stats.bestStreak) },
    { label: 'Longest daily streak', value: plural(stats.longestDailyStreak, 'day') },
    { label: 'Glims collected', value: formatNumber(stats.glims) },
  ];
  return (
    <Panel className="rounded-[var(--radius-l)] p-5" aria-labelledby="profile-stats">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="profile-stats" className="font-display text-[1.6rem] font-bold">
          Stats
        </h2>
        {joinedAt ? <span className="text-sm text-text-3">Playing since {new Date(joinedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[var(--radius-m)] border border-line bg-surface-2 px-3.5 py-3">
            <dt className="text-sm text-text-2">{t.label}</dt>
            <dd className="mt-1 font-display text-[2rem] leading-none font-extrabold tabular">{t.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-text-3">Solo games do not count towards wins or podium finishes.</p>
    </Panel>
  );
}

export default function Profile() {
  const { id = '' } = useParams();
  const me = useMe();
  const viewer = me.data?.user ?? null;
  const profile = useQuery({ queryKey: ['profile', id], queryFn: () => api.get<PublicProfile>(`/api/profiles/${id}`), enabled: Boolean(id) });
  const p = profile.data;
  usePageTitle(p ? p.displayName : 'Profile');
  const socialRefresh = useSocialRefresh();
  const actionsRef = useRef<HTMLDivElement>(null);
  const focusAfter = useFocusAfterUpdate(profile.data);
  // Every action replaces the button that was pressed, so afterwards focus the panel that says what changed.
  const refresh = async () => {
    focusAfter(actionsRef);
    await socialRefresh();
  };
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  const [reporting, setReporting] = useState(false);
  const returnConfirmFocus = useReturnFocus(confirm !== null);
  const returnReportFocus = useReturnFocus(reporting);
  const name = p?.displayName ?? 'this player';

  const request = useMutation({
    mutationFn: () => api.post<{ status: 'pending' | 'accepted'; displayName: string }>('/api/friends/request', { userId: id }),
    onSuccess: async (r) => {
      toast.success(r.status === 'accepted' ? `You and ${r.displayName} are now friends` : `Friend request sent to ${r.displayName}`);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'The request did not go through. Try again.')),
  });
  const accept = useMutation({
    mutationFn: () => api.post(`/api/friends/${id}/accept`),
    onSuccess: async () => {
      toast.success(`You and ${name} are now friends`);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not accept the request.')),
  });
  const drop = useMutation({
    mutationFn: (_kind: 'decline' | 'cancel' | 'remove') => api.delete(`/api/friends/${id}`),
    onSuccess: async (_r, kind) => {
      toast.success(kind === 'decline' ? `Declined ${name}'s request` : kind === 'cancel' ? `Cancelled your request to ${name}` : `Removed ${name} from your friends`);
      setConfirm(null);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'That did not work. Try again.')),
  });
  const block = useMutation({
    mutationFn: () => api.post('/api/blocks', { userId: id }),
    onSuccess: async () => {
      toast.success(`Blocked ${name}`);
      setConfirm(null);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not block this player. Try again.')),
  });
  const unblock = useMutation({
    mutationFn: () => api.delete(`/api/blocks/${id}`),
    onSuccess: async () => {
      toast.success(`Unblocked ${name}`);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not unblock this player. Try again.')),
  });

  if (profile.isLoading || (me.isLoading && !p)) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <h1 className="sr-only">Profile</h1>
        <p role="status" className="sr-only">
          Loading the profile
        </p>
        <Skeleton className="h-80" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-36" />
          <Skeleton className="h-52" />
        </div>
      </div>
    );
  }

  if (profile.isError || !p) {
    // A player who blocked you looks exactly like one who does not exist; a malformed link is the same to the reader.
    const missing = profile.error instanceof ApiError && (profile.error.status === 404 || profile.error.status === 400);
    return (
      <>
        <PageHeader title="Profile" />
        {missing || !profile.isError ? (
          <EmptyState
            icon={<UserX className="size-8" />}
            title="Player not found"
            action={
              viewer && !viewer.isGuest ? (
                <ButtonLink to="/friends" icon={<Users className="size-4" />}>
                  Back to friends
                </ButtonLink>
              ) : (
                <ButtonLink to="/">Go home</ButtonLink>
              )
            }
          >
            The link may be old, or the player is no longer on Ludora.
          </EmptyState>
        ) : (
          <ErrorNotice message={errorText(profile.error, 'The profile could not be loaded.')} onRetry={() => void profile.refetch()} />
        )}
      </>
    );
  }

  const busy = request.isPending || accept.isPending || drop.isPending || unblock.isPending;
  // A new key per state, so a button never morphs into a different one (Add friend into Unblock, say).
  const actionKey = p.isSelf ? 'self' : !viewer ? 'signed-out' : viewer.isGuest ? 'guest' : p.blockedByMe ? 'blocked' : p.isGuest ? 'their-guest' : `${p.friendship}-${p.canRequest}`;
  let actions: ReactNode;
  if (p.isSelf) {
    const visibility = viewer?.preferences.privacy.profileVisibility ?? 'public';
    actions = (
      <>
        <p className="text-text-2">This is your profile. Other players see this card in games and when they open your profile.</p>
        <p className="mt-1 text-sm text-text-3">
          {OWN_VISIBILITY[visibility]}{' '}
          <Link to="/settings#privacy" className="font-semibold">
            Change in Settings
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to="/locker" variant="primary" icon={<Shirt className="size-4" />}>
            Edit in Locker
          </ButtonLink>
          <ButtonLink to="/me" icon={<BarChart3 className="size-4" />}>
            My stats
          </ButtonLink>
        </div>
      </>
    );
  } else if (!viewer) {
    actions = (
      <>
        <p className="text-text-2">Sign in to add {p.displayName} as a friend.</p>
        <ButtonLink to={`/signin?next=/profile/${p.id}`} variant="primary" className="mt-4">
          Sign in
        </ButtonLink>
      </>
    );
  } else if (viewer.isGuest) {
    actions = (
      <>
        <p className="text-text-2">Guests cannot add friends. Create a free account to add {p.displayName}. Your progress comes with you.</p>
        <ButtonLink to="/signup" variant="primary" className="mt-4">
          Create a free account
        </ButtonLink>
      </>
    );
  } else if (p.blockedByMe) {
    actions = (
      <>
        <p className="text-text-2">You have blocked {p.displayName}. Neither of you can send the other a friend request, and they cannot open your profile.</p>
        <Button className="mt-4" loading={unblock.isPending} onClick={() => unblock.mutate()}>
          Unblock
        </Button>
      </>
    );
  } else if (p.isGuest) {
    actions = <p className="text-text-2">{p.displayName} is playing as a guest, so they cannot add friends yet.</p>;
  } else if (p.friendship === 'friends') {
    actions = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-text-2">
          <Badge tone="mint">
            <Check className="size-3.5" aria-hidden /> Friends
          </Badge>
          You and {p.displayName} are friends.
        </p>
        <Button
          variant="ghost"
          icon={<UserMinus className="size-4" />}
          disabled={busy}
          onClick={(e) => {
            returnConfirmFocus(e.currentTarget);
            setConfirm('remove');
          }}
        >
          Remove friend
        </Button>
      </div>
    );
  } else if (p.friendship === 'requested') {
    actions = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-text-2">
          <Badge tone="violet">Request sent</Badge>
          Waiting for {p.displayName} to answer.
        </p>
        <Button loading={drop.isPending} disabled={busy} onClick={() => drop.mutate('cancel')}>
          Cancel request
        </Button>
      </div>
    );
  } else if (p.friendship === 'incoming') {
    actions = (
      <>
        <p className="text-text-2">{p.displayName} sent you a friend request.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="success" icon={<Check className="size-4" />} loading={accept.isPending} disabled={busy} onClick={() => accept.mutate()}>
            Accept
          </Button>
          <Button loading={drop.isPending} disabled={busy} onClick={() => drop.mutate('decline')}>
            Decline
          </Button>
        </div>
      </>
    );
  } else if (p.canRequest) {
    actions = (
      <>
        <p className="text-text-2">Send {p.displayName} a friend request. They choose whether to accept.</p>
        <Button variant="primary" className="mt-4" icon={<UserPlus className="size-4" />} loading={request.isPending} disabled={busy} onClick={() => request.mutate()}>
          Add friend
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        <p className="text-text-2">To add {p.displayName}, ask them for their friend code and enter it on your Friends page.</p>
        <ButtonLink to="/friends" className="mt-4" icon={<Users className="size-4" />}>
          Go to Friends
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <h1 className="sr-only">{p.displayName}</h1>
          <ProfileCard name={p.displayName} level={p.level} avatar={p.avatar} equipment={{ frame: p.equipped.frame?.art, banner: p.equipped.banner?.art, title: p.equipped.title?.art, theme: p.equipped.theme?.art }} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="rounded-[var(--radius-l)] p-5" aria-label={p.isSelf ? 'Your profile' : `You and ${p.displayName}`}>
            <div key={actionKey} ref={actionsRef} tabIndex={-1} className="focus:outline-none">
              {actions}
            </div>
            {viewer && !p.isSelf ? (
              <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
                {!viewer.isGuest && !p.blockedByMe ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Ban className="size-4" />}
                    onClick={(e) => {
                      returnConfirmFocus(e.currentTarget);
                      setConfirm('block');
                    }}
                  >
                    Block
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Flag className="size-4" />}
                  onClick={(e) => {
                    returnReportFocus(e.currentTarget);
                    setReporting(true);
                  }}
                >
                  Report
                </Button>
              </div>
            ) : null}
          </Panel>
          {p.stats ? (
            <StatsPanel stats={p.stats} joinedAt={p.joinedAt} />
          ) : p.restricted && !p.blockedByMe ? (
            <Panel className="flex items-start gap-3 rounded-[var(--radius-l)] p-5">
              <Lock className="mt-0.5 size-5 shrink-0 text-text-3" aria-hidden />
              <p className="text-text-2">{p.displayName} keeps their profile private.</p>
            </Panel>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirm === 'remove'}
        onOpenChange={(o) => {
          if (!o && !drop.isPending) setConfirm(null);
        }}
        title={`Remove ${p.displayName}?`}
        description="They are not told. You can send them a new request later."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(null)} disabled={drop.isPending}>
              Keep
            </Button>
            <Button variant="danger" icon={<UserMinus className="size-4" />} loading={drop.isPending} onClick={() => drop.mutate('remove')}>
              Remove friend
            </Button>
          </>
        }
      />

      <Dialog
        open={confirm === 'block'}
        onOpenChange={(o) => {
          if (!o && !block.isPending) setConfirm(null);
        }}
        title={`Block ${p.displayName}?`}
        description="They are not told."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(null)} disabled={block.isPending}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Ban className="size-4" />} loading={block.isPending} onClick={() => block.mutate()}>
              Block
            </Button>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-2">
          <li>Any friendship or friend request between you ends.</li>
          <li>Neither of you can send the other a friend request.</li>
          <li>They cannot open your profile.</li>
        </ul>
        <p className="mt-3 text-sm text-text-2">You can unblock them later from your Friends page.</p>
      </Dialog>

      {viewer && !p.isSelf ? <ReportDialog open={reporting} onOpenChange={setReporting} target={{ type: 'user', id: p.id, label: p.displayName }} /> : null}
    </>
  );
}
