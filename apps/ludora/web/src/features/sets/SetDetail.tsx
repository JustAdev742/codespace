import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Flag, Folder, History, ListPlus, Pencil, Play, Presentation, Printer, Share2, Star } from 'lucide-react';
import { QUESTION_TYPE_LABELS, SUBJECT_LABELS, type Question, type QuestionType } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, Panel, Spinner } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { FavouriteStar } from '../profile/parts.tsx';
import { SetCover } from './SetCover.tsx';
import { FolderDialog, ShareDialog, StatsPanel, VersionsDialog } from './SetTools.tsx';
import { answerText } from './answers.ts';
import { MathText } from './math/MathText.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';
import { AiSetTools } from '../ai/AiSetTools.tsx';
import { PlayInMadeGame } from '../modestudio/MakerGames.tsx';

// Lessons: "Add to a lesson" (features/lessons), loaded when opened.
const AddToLessonDialog = lazy(() => import('../lessons/AddToLesson.tsx'));

interface SetResponse {
  set: SetSummary;
  editable: boolean;
  owner?: boolean;
  questions: Question[] | null;
  preview: { id: string; type: QuestionType; prompt: string; choices?: string[] }[] | null;
  typeCounts: Record<string, number>;
}

export default function SetDetail() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const data = useQuery({ queryKey: ['set', id], queryFn: () => api.get<SetResponse>(`/api/sets/${id}`) });
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [versions, setVersions] = useState(false);
  const [filing, setFiling] = useState(false);
  const [lessoning, setLessoning] = useState(false);
  const qc = useQueryClient();
  const star = useMutation({
    mutationFn: (favourite: boolean) => api.patch(`/api/sets/${id}/organise`, { favourite }),
    onSuccess: (_r, favourite) => {
      void qc.invalidateQueries({ queryKey: ['set', id] });
      void qc.invalidateQueries({ queryKey: ['sets'] });
      void qc.invalidateQueries({ queryKey: ['sets-organise'] });
      toast.success(favourite ? 'Added to your favourites' : 'Taken out of your favourites');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'That did not save. Try again.'),
  });
  const copy = useMutation({
    mutationFn: () => api.post<{ set: SetSummary }>(`/api/sets/${id}/copy`),
    onSuccess: (r) => {
      toast.success('Copied to your sets');
      navigate(`/sets/${r.set.id}/edit`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not copy the set.'),
  });
  if (data.isLoading) return <Spinner />;
  if (data.isError) {
    const status = data.error instanceof ApiError ? data.error.status : 0;
    return (
      <div className="flex flex-col gap-6">
        <Link to="/library" className="text-sm font-semibold">
          All question sets
        </Link>
        <PageHeader title="Question set" />
        {/* A malformed id is refused before any lookup (400); a set that is missing or private is a 404. */}
        {status === 400 ? (
          <EmptyState title="This link does not point to a set" action={<ButtonLink to="/library">Browse the library</ButtonLink>}>
            Part of the address may be missing or mistyped. Check the link, or find the set in the library.
          </EmptyState>
        ) : status === 404 ? (
          <EmptyState title="Set not found" action={<ButtonLink to="/library">Back to the library</ButtonLink>}>
            It may be private or deleted.
          </EmptyState>
        ) : (
          <ErrorNotice message="The set could not be loaded." onRetry={() => data.refetch()} />
        )}
      </div>
    );
  }
  const { set, editable, questions, preview, typeCounts } = data.data!;
  const owner = Boolean(data.data!.owner);
  const signedIn = Boolean(me.data?.user);
  const account = signedIn && !me.data?.user?.isGuest;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/library" className="text-sm font-semibold">
        All question sets
      </Link>
      <div className="flex flex-wrap items-start gap-5">
        <SetCover cover={set.cover} subject={set.subject} size={88} described />
        <div className="min-w-0 flex-1">
          <FavouriteStar kind="sets" id={set.id} label={set.title} className="float-right ml-3" />
          <h1 className="font-display text-[2.25rem] leading-[1.02] font-bold break-words sm:text-[2.9rem]">{set.title}</h1>
          {set.description ? <p className="mt-2 max-w-[62ch] break-words text-text-2">{set.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>{plural(set.questionCount, 'question')}</Badge>
            <Badge>{SUBJECT_LABELS[set.subject as keyof typeof SUBJECT_LABELS] ?? set.subject}</Badge>
            {set.gradeBand ? <Badge>{set.gradeBand}</Badge> : null}
            {set.topic ? <Badge>{set.topic}</Badge> : null}
            {owner && set.folder ? (
              <Badge>
                <Folder className="mr-1 inline size-3.5" aria-hidden />
                {set.folder}
              </Badge>
            ) : null}
            {editable && !owner ? <Badge tone="amber">You are a co-editor</Badge> : null}
            {set.isOfficial ? <Badge tone="amber">By Ludora</Badge> : set.ownerName ? <Badge>By {set.ownerName}</Badge> : null}
            {set.visibility !== 'public' ? <Badge>{set.visibility === 'private' ? 'Private' : 'Unlisted'}</Badge> : null}
            {set.plays ? <Badge>{set.plays === 1 ? 'Played once' : `Played ${formatNumber(set.plays)} times`}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/host?set=${set.id}`} variant="primary" icon={<Presentation className="size-4" />}>
            Host this
          </ButtonLink>
          <ButtonLink to={`/host?solo=1&set=${set.id}`} icon={<Play className="size-4" />}>
            Solo
          </ButtonLink>
          <PlayInMadeGame setId={set.id} />
          {me.data?.user?.accountType === 'teacher' ? (
            <Button icon={<ListPlus className="size-4" />} onClick={() => setLessoning(true)}>
              Add to a lesson
            </Button>
          ) : null}
          {editable ? (
            <ButtonLink to={`/sets/${set.id}/edit`} icon={<Pencil className="size-4" />}>
              Edit
            </ButtonLink>
          ) : null}
          {account ? (
            <Button icon={<Copy className="size-4" />} loading={copy.isPending} onClick={() => copy.mutate()}>
              {editable ? 'Make a copy' : 'Copy and edit'}
            </Button>
          ) : null}
          {account ? (
            <IconButton label={set.favourite ? 'Take out of favourites' : 'Add to favourites'} aria-pressed={Boolean(set.favourite)} onClick={() => star.mutate(!set.favourite)}>
              <Star className={`size-5 ${set.favourite ? 'fill-lantern text-lantern' : ''}`} />
            </IconButton>
          ) : null}
          {signedIn && !editable ? (
            <Button variant="ghost" icon={<Flag className="size-4" />} onClick={() => setReporting(true)}>
              Report
            </Button>
          ) : null}
        </div>
      </div>
      <ReportDialog open={reporting} onOpenChange={setReporting} target={{ type: 'set', id: set.id, label: 'this question set' }} />
      {lessoning ? (
        <Suspense fallback={null}>
          <AddToLessonDialog open={lessoning} onOpenChange={setLessoning} game={{ setId: set.id, modeId: 'classic', variantId: null }} what={`“${set.title}” as a Classic game`} />
        </Suspense>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Set tools">
          {owner ? (
            <Button size="sm" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
              Share
            </Button>
          ) : null}
          <Button size="sm" icon={<History className="size-4" />} onClick={() => setVersions(true)}>
            Version history
          </Button>
          <ButtonLink size="sm" to={`/sets/${set.id}/print`} icon={<Printer className="size-4" />}>
            Print
          </ButtonLink>
          {owner ? (
            <Button size="sm" icon={<Folder className="size-4" />} onClick={() => setFiling(true)}>
              {set.folder ? 'Change folder' : 'Put in a folder'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {owner ? <ShareDialog setId={set.id} token={set.shareToken ?? null} open={sharing} onOpenChange={setSharing} /> : null}
      {editable ? <VersionsDialog setId={set.id} open={versions} onOpenChange={setVersions} /> : null}
      {owner ? <FolderDialog key={set.folder ?? ''} setId={set.id} folder={set.folder ?? null} open={filing} onOpenChange={setFiling} /> : null}
      {editable ? <StatsPanel setId={set.id} /> : null}
      {editable && questions ? <AiSetTools set={set} questions={questions} /> : null}
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {Object.entries(typeCounts).map(([t, n]) => (
            <Badge key={t}>
              <span className="tabular">{n}</span> {QUESTION_TYPE_LABELS[t as QuestionType]}
            </Badge>
          ))}
        </div>
        {questions ? (
          <ol className="flex flex-col divide-y divide-line">
            {questions.map((q, i) => (
              <li key={q.id} className="flex gap-3 py-3">
                <span className="w-8 shrink-0 font-display text-xl leading-6 font-bold text-text-3 tabular">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">
                    <MathText text={q.prompt} />
                  </p>
                  {/* The answer is marked by a tick and its label, not only by its colour. */}
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-glim [overflow-wrap:anywhere]">
                    <Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} aria-hidden />
                    <span>
                      <span className="sr-only">Answer: </span>
                      <MathText text={answerText(q)} />
                    </span>
                  </p>
                  {q.explanation ? <p className="mt-0.5 text-sm text-text-3">{q.explanation}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-3">A preview of the first questions. Answers are hidden so the game stays fair.</p>
            <ol className="flex flex-col divide-y divide-line">
              {(preview ?? []).map((q, i) => (
                <li key={q.id} className="flex gap-3 py-3">
                  <span className="w-8 shrink-0 font-display text-xl leading-6 font-bold text-text-3 tabular">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-semibold [overflow-wrap:anywhere]">
                      <MathText text={q.prompt} />
                    </p>
                    {q.choices ? <p className="text-sm text-text-3">{q.choices.join(', ')}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>
    </div>
  );
}
