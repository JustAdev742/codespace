import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, UserPlus } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Dialog, ErrorNotice, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { errorText, getFriends, type Friend } from './data.ts';

/*
 * Invite a friend from inside the lobby (finish): the room you are in, with the existing invite
 * (POST /api/invites), which checks on the server that you are in this room, that they are your
 * friend and that neither of you blocked the other. Only for a signed-in account: a player who
 * joined with just a name never sees it, so nothing here asks for a session they do not have.
 */

function FriendRow({ friend, code }: { friend: Friend; code: string }) {
  const invite = useMutation({ mutationFn: () => api.post('/api/invites', { userId: friend.id, code }) });
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
      <span className="min-w-0 flex-1 font-semibold break-words">{friend.displayName}</span>
      {invite.isSuccess ? (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-2" role="status">
          <Check className="size-4" aria-hidden /> Invited
        </span>
      ) : (
        <Button size="sm" variant="primary" loading={invite.isPending} onClick={() => invite.mutate()} aria-label={`Invite ${friend.displayName}`}>
          Invite
        </Button>
      )}
      {invite.isError ? (
        <p className="basis-full text-sm font-semibold text-ember" role="alert">
          {errorText(invite.error, 'The invite did not send. Try again.')}
        </p>
      ) : null}
    </li>
  );
}

function FriendList({ code }: { code: string }) {
  const friends = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  if (friends.isError) return <ErrorNotice message={errorText(friends.error, 'Your friends could not be loaded.')} onRetry={() => void friends.refetch()} />;
  if (!friends.data) return <Skeleton className="h-24" />;
  if (!friends.data.friends.length)
    return (
      <div className="flex flex-col items-start gap-3 text-sm text-text-2">
        <p>You have no friends on Ludora yet. Share your friend code on the Friends page, or give them the game code instead.</p>
        <ButtonLink to="/friends" size="sm" target="_blank" rel="noopener">
          Open Friends
        </ButtonLink>
      </div>
    );
  return (
    <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto" aria-label="Your friends">
      {friends.data.friends.map((f) => (
        <FriendRow key={f.id} friend={f} code={code} />
      ))}
    </ul>
  );
}

/** "Invite a friend" for the lobby. Renders nothing for a guest or a name-only player. */
export function InviteFriendsButton({ code, className = '' }: { code: string; className?: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const user = me.data?.user;
  if (!user || user.isGuest) return null;
  return (
    <>
      <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setOpen(true)} className={className}>
        Invite a friend
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Invite a friend" description={`They get a notification with a Join button for game ${code}.`} size="sm">
        {open ? <FriendList code={code} /> : null}
      </Dialog>
    </>
  );
}
