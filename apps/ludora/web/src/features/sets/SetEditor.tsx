import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, LogIn, UserPlus } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { useCan, useMe } from '../../lib/session.ts';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { SetCover } from './SetCover.tsx';
import { Editor, type SetResponse } from './editor/Editor.tsx';
import { handoff } from './editor/handoff.ts';
import { blankDetails, blankQuestion, detailsFromSet, fromQuestion, newId, type LoadedSet } from './editor/model.ts';
import type { EditorState } from './editor/state.ts';

/**
 * /sets/new and /sets/:id/edit. Works out who is asking and what they may do,
 * then hands over to the editor.
 */
export default function SetEditorPage() {
  const { id } = useParams();
  const me = useMe();
  const location = useLocation();
  const canCreate = useCan('sets.create');
  const canPublish = useCan('sets.publish_public');

  if (me.isLoading) return <EditorSkeleton />;
  if (me.isError) return <ErrorNotice message="Your account could not be checked. Check your connection and try again." onRetry={() => me.refetch()} />;
  const user = me.data?.user;
  const title = id ? 'Edit question set' : 'New question set';

  if (!user) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState
          title="Sign in to write question sets"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to={`/signin?next=${encodeURIComponent(location.pathname)}`} variant="primary" icon={<LogIn className="size-4" />}>
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup" icon={<UserPlus className="size-4" />}>
                Create an account
              </ButtonLink>
            </div>
          }
        >
          Sets you write can be played in every game mode, by you or anyone you share them with.
        </EmptyState>
      </>
    );
  }
  if (user.isGuest) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState
          title="Create a free account to write sets"
          action={
            <ButtonLink to="/signup" variant="primary" icon={<UserPlus className="size-4" />}>
              Create an account
            </ButtonLink>
          }
        >
          Guests can play and host, but saving question sets needs an account. Everything you have earned comes with you.
        </EmptyState>
      </>
    );
  }
  if (!id && !canCreate) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState title="Your account cannot write sets right now" action={<ButtonLink to="/library">Browse the library</ButtonLink>}>
          You can still play and host any set in the library.
        </EmptyState>
      </>
    );
  }
  return <EditorSession routeId={id ?? null} userId={user.id} canPublish={canPublish} />;
}

/**
 * Keeps one editor for a new set from its first keystroke to long after its
 * first save. Saving moves the address to /sets/:id/edit; this component stays
 * mounted across that, so the editor and everything typed in it carry on.
 */
function EditorSession({ routeId, userId, canPublish }: { routeId: string | null; userId: string; canPublish: boolean }) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [newSetKey, setNewSetKey] = useState(0);
  // Coming back to /sets/new from a set made here starts another new set. (While the
  // first save is under way the address is still /sets/new, so that is not a change.)
  const [lastRoute, setLastRoute] = useState(routeId);
  if (routeId !== lastRoute) {
    setLastRoute(routeId);
    if (routeId === null && createdId !== null) {
      setCreatedId(null);
      setNewSetKey((k) => k + 1);
    }
  }
  if (routeId === null || routeId === createdId) return <NewSet key={newSetKey} userId={userId} canPublish={canPublish} createdId={createdId} onCreated={setCreatedId} />;
  return <ExistingSet key={routeId} id={routeId} userId={userId} canPublish={canPublish} />;
}

function NewSet({ userId, canPublish, createdId, onCreated }: { userId: string; canPublish: boolean; createdId: string | null; onCreated: (id: string) => void }) {
  // A new set starts with one multiple choice question, ready to type into.
  const [initial] = useState<EditorState>(() => {
    const first = blankQuestion('mcq', newId('q'));
    return { details: blankDetails(), questions: [first], open: { [first.id]: true } };
  });
  // This editor carried on after the first save, so the fallback handoff is not needed.
  useEffect(() => {
    if (createdId) handoff.clear(createdId);
  }, [createdId]);
  return <Editor userId={userId} setId={createdId} initial={initial} baseUpdatedAt={null} canPublish={canPublish} savedVisibility={null} onCreated={(set) => onCreated(set.id)} />;
}

function ExistingSet({ id, userId, canPublish }: { id: string; userId: string; canPublish: boolean }) {
  // A set this tab has just created is already in the cache, exactly as saved.
  const [created] = useState(() => handoff.peek(id));
  useEffect(() => {
    handoff.clear(id);
  }, [id]);
  // Otherwise load afresh when opening the editor, so it never starts from an old copy.
  const query = useQuery({ queryKey: ['set', id], queryFn: ({ signal }) => api.get<SetResponse>(`/api/sets/${id}`, signal), refetchOnMount: 'always' });
  const fresh = query.isFetchedAfterMount || created !== null;

  if (query.isError && !query.data) {
    // A malformed id is refused before any lookup.
    if (query.error instanceof ApiError && query.error.status === 400) {
      return (
        <>
          <PageHeader title="Edit question set" />
          <EmptyState title="This link does not point to a set" action={<ButtonLink to="/library">Browse the library</ButtonLink>}>
            Part of the address may be missing or mistyped. Check the link, or open the set from the library.
          </EmptyState>
        </>
      );
    }
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <>
          <PageHeader title="Edit question set" />
          <EmptyState title="Set not found" action={<ButtonLink to="/library">Back to the library</ButtonLink>}>
            It may have been deleted, or the link may be wrong.
          </EmptyState>
        </>
      );
    }
    return (
      <>
        <PageHeader title="Edit question set" />
        <ErrorNotice title="The set did not load" message={query.error instanceof ApiError ? query.error.message : 'Something went wrong.'} onRetry={() => query.refetch()} />
      </>
    );
  }
  if (!query.data || (!fresh && query.isFetching)) return <EditorSkeleton />;

  const { set, editable, questions } = query.data;
  if (!editable) return <NotOwner set={set} />;
  return <LoadedEditor set={set} questions={questions ?? []} open={created?.open} userId={userId} canPublish={canPublish} />;
}

function LoadedEditor({ set, questions, open, userId, canPublish }: { set: SetSummary; questions: NonNullable<SetResponse['questions']>; open: Record<string, boolean> | undefined; userId: string; canPublish: boolean }) {
  // Built once: later refreshes of the cached set must not reset what the author is typing.
  const [initial] = useState<EditorState>(() => ({
    details: detailsFromSet(set as LoadedSet),
    questions: questions.map(fromQuestion),
    // Short sets open fully; long ones start collapsed so the list is easy to scan.
    open: open ?? Object.fromEntries(questions.map((q) => [q.id, questions.length <= 3])),
  }));
  return <Editor key={set.id} userId={userId} setId={set.id} initial={initial} baseUpdatedAt={set.updatedAt} canPublish={canPublish} savedVisibility={set.visibility} />;
}

/** Someone else's set: offer a copy instead of the editor. */
function NotOwner({ set }: { set: SetSummary }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const copy = useMutation({
    mutationFn: () => api.post<{ set: SetSummary }>(`/api/sets/${set.id}/copy`),
    onSuccess: (r) => {
      toast.success('Copied to your sets');
      void qc.invalidateQueries({ queryKey: ['sets'] });
      void navigate(`/sets/${r.set.id}/edit`, { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The set could not be copied. Try again.'),
  });
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={`/sets/${set.id}`} className="font-semibold">
            Back to the set
          </Link>
        }
        title="Edit question set"
      />
      <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <SetCover cover={set.cover} subject={set.subject} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-text [overflow-wrap:anywhere]">“{set.title}” belongs to someone else</h2>
          <p className="mt-1 max-w-[62ch] text-text-2">Only the person who wrote a set can change it. Make a copy to get your own version that you can edit, play and share. The original stays as it is.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={<Copy className="size-4" />} loading={copy.isPending} onClick={() => copy.mutate()}>
              Make a copy
            </Button>
            <ButtonLink to={`/sets/${set.id}`}>View the set</ButtonLink>
          </div>
        </div>
      </Panel>
    </>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span role="status" className="sr-only">
        Loading the set
      </span>
      <Skeleton className="h-12 w-72 max-w-full" />
      <Skeleton className="h-72" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}
