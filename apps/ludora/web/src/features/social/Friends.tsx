import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Eye, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe, type Preferences } from '../../lib/session.ts';
import { formatNumber, timeAgo } from '../../lib/format.ts';
import { AccountError, Dialog, EmptyState, ErrorNotice, Input, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Dot, PlayerAvatar } from './parts.tsx';
import { blocksKey, errorText, friendsKey, getBlocks, getFriends, shortDate, useFocusAfterUpdate, useReturnFocus, useSocialRefresh, usePageTitle, type BlockedPlayer, type Friend } from './data.ts';

type Privacy = Preferences['privacy'];

const VISIBILITY_TEXT: Record<Privacy['profileVisibility'], string> = {
  public: 'Everyone can see your profile.',
  friends: 'Only your friends can see your profile.',
  private: 'Only you can see your profile.',
};

const REQUESTS_TEXT: Record<Privacy['allowFriendRequests'], string> = {
  everyone: 'Anyone can send you a friend request.',
  friend_code: 'Only people with your friend code can send you a request.',
  nobody: 'Nobody can send you friend requests.',
};

/** "abcd 1234" or "ABCD-1234" becomes "ABCD-1234"; anything that is not eight letters and digits is null. */
function tidyCode(raw: string): string | null {
  const chars = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{8}$/.test(chars) ? `${chars.slice(0, 4)}-${chars.slice(4)}` : null;
}

function PersonRow({ person, detail, children }: { person: Friend; detail: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <PlayerAvatar avatar={person.avatar} size={44} />
      <div className="min-w-0 grow basis-28">
        <Link to={`/profile/${person.id}`} className="block truncate font-semibold text-text underline-offset-2 hover:underline">
          {person.displayName}
        </Link>
        <p className="text-sm text-text-3">
          Level {person.level}
          <Dot />
          {detail}
        </p>
      </div>
      {children ? <div className="ml-auto flex shrink-0 gap-2">{children}</div> : null}
    </li>
  );
}

function SectionHeading({ id, children, action, headingRef }: { id?: string; children: ReactNode; action?: ReactNode; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={id} ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold text-text focus:outline-none">
        {children}
      </h2>
      {action}
    </div>
  );
}

function CodePanel({ code, requestsOff }: { code: string; requestsOff: boolean }) {
  const refresh = useSocialRefresh();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The button is disabled while sending, which drops focus; put it back in the box for the next code.
  const backToInput = () => {
    if (!document.activeElement || document.activeElement === document.body) input.current?.focus();
  };
  const send = useMutation({
    mutationFn: (friendCode: string) => api.post<{ status: 'pending' | 'accepted'; displayName: string }>('/api/friends/request', { friendCode }),
    onSuccess: async (r) => {
      toast.success(r.status === 'accepted' ? `You and ${r.displayName} are now friends` : `Friend request sent to ${r.displayName}`);
      setValue('');
      backToInput();
      await refresh();
    },
    onError: (err) => {
      setError(errorText(err, 'The request did not go through. Try again.'));
      backToInput();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const tidy = tidyCode(value);
    if (!tidy) {
      setError(value.trim() ? 'Friend codes look like ABCD-1234.' : 'Enter a friend code.');
      return;
    }
    setValue(tidy);
    setError(null);
    send.mutate(tidy);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Friend code copied');
    } catch {
      toast.error('Could not copy. Select the code and copy it yourself.');
    }
  };
  return (
    <Panel className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold">Your friend code</h2>
        <p className="mt-1 text-sm text-text-2">Give it to people you know. They enter it on their Friends page to send you a request.</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border-2 border-dashed border-line-strong bg-sunken px-4 py-3">
          <code className="font-display text-2xl font-bold tracking-wider select-all">{code}</code>
          <Button size="sm" icon={<Copy className="size-4" />} onClick={() => void copy()} aria-label="Copy your friend code">
            Copy
          </Button>
        </div>
        {requestsOff ? (
          <p className="mt-2 text-sm text-text-3">
            You have turned off friend requests, so this code does not work right now. You can change that in{' '}
            <Link to="/settings#privacy" className="font-semibold">
              Settings
            </Link>
            .
          </p>
        ) : null}
      </div>
      <form className="min-w-0" onSubmit={submit} noValidate>
        <h2 className="font-display text-xl font-bold">Add a friend</h2>
        <p className="mt-1 text-sm text-text-2">Ask a friend for their code and enter it here.</p>
        <label htmlFor={inputId} className="mt-3 block text-sm font-semibold">
          Friend code
        </label>
        <div className="mt-1.5 flex gap-2">
          <Input
            ref={input}
            id={inputId}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="ABCD-1234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            aria-invalid={Boolean(error)}
            aria-describedby={`${inputId}-msg`}
            className="min-w-0 flex-1 font-display font-bold tracking-wider placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
          />
          <Button type="submit" variant="primary" icon={<UserPlus className="size-4" />} loading={send.isPending}>
            Send request
          </Button>
        </div>
        <p id={`${inputId}-msg`} aria-live="polite" className={`mt-1.5 text-xs ${error ? 'font-semibold text-ember' : 'text-text-3'}`}>
          {error ?? 'It looks like ABCD-1234.'}
        </p>
      </form>
    </Panel>
  );
}

function PrivacyPanel({ privacy }: { privacy: Privacy }) {
  return (
    <Panel className="p-5">
      <h2 className="mb-3 font-display text-xl font-bold">Your privacy</h2>
      <ul className="flex flex-col gap-2.5 text-sm text-text-2">
        <li className="flex gap-2.5">
          <Eye className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
          {VISIBILITY_TEXT[privacy.profileVisibility]}
        </li>
        <li className="flex gap-2.5">
          <UserPlus className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
          {REQUESTS_TEXT[privacy.allowFriendRequests]}
        </li>
        <li className="flex gap-2.5">
          <Trophy className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
          {privacy.showOnLeaderboards ? 'Other players can see you on leaderboards.' : 'Other players cannot see you on leaderboards.'}
        </li>
      </ul>
      <Link to="/settings#privacy" className="mt-4 inline-block text-sm font-semibold">
        Change these in Settings
      </Link>
    </Panel>
  );
}

function SignedOut() {
  return (
    <>
      <PageHeader title="Friends" />
      <EmptyState
        icon={<Users className="size-8" />}
        title="Sign in to see your friends"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink to="/signin?next=/friends" variant="primary">
              Sign in
            </ButtonLink>
            <ButtonLink to="/signup">Create an account</ButtonLink>
          </div>
        }
      >
        Add friends with a friend code, then see how you compare on the leaderboards.
      </EmptyState>
    </>
  );
}

function GuestPrompt() {
  return (
    <>
      <PageHeader title="Friends" />
      <EmptyState
        icon={<Users className="size-8" />}
        title="Friends need an account"
        action={
          <ButtonLink to="/signup" variant="primary">
            Create a free account
          </ButtonLink>
        }
      >
        Guests cannot add friends. Create a free account to get your own friend code. Your progress comes with you.
      </EmptyState>
    </>
  );
}

export default function Friends() {
  usePageTitle('Friends');
  const me = useMe();
  const user = me.data?.user ?? null;
  const isAccount = Boolean(user && !user.isGuest);
  const friends = useQuery({ queryKey: friendsKey, queryFn: getFriends, enabled: isAccount });
  const blocks = useQuery({ queryKey: blocksKey, queryFn: getBlocks, enabled: isAccount });
  const refresh = useSocialRefresh();
  const [removing, setRemoving] = useState<Friend | null>(null);
  const requestsHeading = useRef<HTMLHeadingElement>(null);
  const friendsHeading = useRef<HTMLHeadingElement>(null);
  const blockedHeading = useRef<HTMLHeadingElement>(null);
  const focusAfter = useFocusAfterUpdate(friends.data, blocks.data);
  const returnFocus = useReturnFocus(Boolean(removing));

  const accept = useMutation({
    mutationFn: (p: Friend) => api.post(`/api/friends/${p.id}/accept`),
    onSuccess: async (_r, p) => {
      toast.success(`You and ${p.displayName} are now friends`);
      focusAfter(friendsHeading);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not accept the request.')),
  });
  const drop = useMutation({
    mutationFn: ({ person }: { person: Friend; kind: 'decline' | 'cancel' | 'remove' }) => api.delete(`/api/friends/${person.id}`),
    onSuccess: async (_r, { person, kind }) => {
      toast.success(kind === 'decline' ? `Declined ${person.displayName}'s request` : kind === 'cancel' ? `Cancelled your request to ${person.displayName}` : `Removed ${person.displayName} from your friends`);
      setRemoving(null);
      if (kind === 'remove') focusAfter(friendsHeading);
      else focusAfter(requestsHeading, friendsHeading);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'That did not work. Try again.')),
  });
  const unblock = useMutation({
    mutationFn: (b: BlockedPlayer) => api.delete(`/api/blocks/${b.id}`),
    onSuccess: async (_r, b) => {
      toast.success(`Unblocked ${b.displayName}`);
      focusAfter(blockedHeading);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not unblock. Try again.')),
  });

  if (me.isLoading) {
    return (
      <>
        <PageHeader title="Friends" />
        <Skeleton className="h-72" />
      </>
    );
  }
  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Friends" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!user) return <SignedOut />;
  const refusedAsGuest = friends.error instanceof ApiError && friends.error.status === 403;
  if (user.isGuest || refusedAsGuest) return <GuestPrompt />;

  const data = friends.data;
  const hasRequests = Boolean(data && (data.incoming.length || data.outgoing.length));
  const busy = (p: Friend) => (accept.isPending && accept.variables?.id === p.id) || (drop.isPending && drop.variables?.person.id === p.id);
  const blocked = blocks.data?.blocked ?? [];

  return (
    <>
      <PageHeader
        title="Friends"
        description="Add friends with their friend code, then see how you compare on the leaderboards."
        actions={
          <ButtonLink to="/leaderboards" icon={<Trophy className="size-4" />}>
            Leaderboards
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <CodePanel code={data?.friendCode ?? user.friendCode} requestsOff={user.preferences.privacy.allowFriendRequests === 'nobody'} />

          {hasRequests && data ? (
            <Panel className="p-5" aria-labelledby="requests-heading">
              <SectionHeading id="requests-heading" headingRef={requestsHeading}>
                Friend requests
              </SectionHeading>
              {data.incoming.length ? (
                <>
                  <h3 className="mt-3 text-sm font-semibold text-text-2">Waiting for you</h3>
                  <ul className="divide-y divide-line">
                    {data.incoming.map((p) => (
                      <PersonRow key={p.id} person={p} detail={`Asked ${timeAgo(p.since)}`}>
                        <Button size="sm" variant="success" icon={<Check className="size-4" />} disabled={busy(p)} loading={accept.isPending && accept.variables?.id === p.id} onClick={() => accept.mutate(p)} aria-label={`Accept ${p.displayName}`}>
                          Accept
                        </Button>
                        <Button size="sm" disabled={busy(p)} loading={drop.isPending && drop.variables?.person.id === p.id} onClick={() => drop.mutate({ person: p, kind: 'decline' })} aria-label={`Decline ${p.displayName}`}>
                          Decline
                        </Button>
                      </PersonRow>
                    ))}
                  </ul>
                </>
              ) : null}
              {data.outgoing.length ? (
                <>
                  <h3 className="mt-3 text-sm font-semibold text-text-2">Waiting for them</h3>
                  <ul className="divide-y divide-line">
                    {data.outgoing.map((p) => (
                      <PersonRow key={p.id} person={p} detail={`Sent ${timeAgo(p.since)}`}>
                        <Button size="sm" variant="ghost" loading={drop.isPending && drop.variables?.person.id === p.id} onClick={() => drop.mutate({ person: p, kind: 'cancel' })} aria-label={`Cancel request to ${p.displayName}`}>
                          Cancel request
                        </Button>
                      </PersonRow>
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          ) : null}

          <Panel className="p-5" aria-labelledby="friends-heading">
            <SectionHeading id="friends-heading" headingRef={friendsHeading} action={data ? <span className="text-sm text-text-3 tabular">{formatNumber(data.friends.length)} of {formatNumber(data.max)}</span> : null}>
              Your friends
            </SectionHeading>
            {friends.isLoading ? (
              <div className="mt-3 flex flex-col gap-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : friends.isError ? (
              <div className="mt-3">
                <ErrorNotice message={errorText(friends.error, 'Your friends could not be loaded.')} onRetry={() => void friends.refetch()} />
              </div>
            ) : data && data.friends.length === 0 ? (
              <div className="mt-3">
                <EmptyState icon={<Users className="size-8" />} title="No friends yet">
                  Share your friend code, or enter a friend's code above. When someone sends you a request, it shows up on this page for you to accept.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {(data?.friends ?? []).map((p) => (
                  <PersonRow key={p.id} person={p} detail={`Friends since ${shortDate(p.since)}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<UserMinus className="size-4" />}
                      onClick={(e) => {
                        returnFocus(e.currentTarget);
                        setRemoving(p);
                      }}
                      aria-label={`Remove ${p.displayName}`}
                    >
                      Remove
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <PrivacyPanel privacy={user.preferences.privacy} />

          <Panel className="p-5" aria-labelledby="blocked-heading">
            <SectionHeading id="blocked-heading" headingRef={blockedHeading}>
              Blocked players
            </SectionHeading>
            <p className="text-sm text-text-3">Blocked players cannot send you friend requests or open your profile.</p>
            {blocks.isLoading ? (
              <Skeleton className="mt-3 h-12" />
            ) : blocks.isError ? (
              <div className="mt-3">
                <ErrorNotice message={errorText(blocks.error, 'Your blocked list could not be loaded.')} onRetry={() => void blocks.refetch()} />
              </div>
            ) : blocked.length === 0 ? (
              <p className="mt-3 text-sm text-text-2">You have not blocked anyone. To block a player, open their profile and choose Block.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link to={`/profile/${b.id}`} className="block truncate font-semibold text-text underline-offset-2 hover:underline">
                        {b.displayName}
                      </Link>
                      <p className="text-xs text-text-3">Blocked {timeAgo(b.since)}</p>
                    </div>
                    <Button size="sm" loading={unblock.isPending && unblock.variables?.id === b.id} onClick={() => unblock.mutate(b)} aria-label={`Unblock ${b.displayName}`}>
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Dialog
        open={Boolean(removing)}
        onOpenChange={(o) => {
          if (!o && !drop.isPending) setRemoving(null);
        }}
        title={`Remove ${removing?.displayName ?? 'this friend'}?`}
        description="They are not told. You can send them a new request later."
        size="sm"
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={drop.isPending}>
              Keep
            </Button>
            <Button variant="danger" icon={<UserMinus className="size-4" />} loading={drop.isPending} onClick={() => removing && drop.mutate({ person: removing, kind: 'remove' })}>
              Remove friend
            </Button>
          </>
        }
      />
    </>
  );
}
