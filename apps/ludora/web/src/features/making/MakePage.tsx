import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, CalendarDays, Check, ChevronRight, FileText, Layers, ListChecks, ListOrdered, PencilRuler, Sigma, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { errorText, usePageTitle } from '../reports/reportUi.tsx';
import { MAKE_REGISTRY, canMake } from './registry.tsx';
import { makingKeys, RECENT_LABEL, RECENT_LINK, useMakingOverview, type DraftSummary, type MakingOverview } from './data.ts';

/*
 * /make: one place to make things. What you were last working on (drafts kept on the server, so
 * they carry on from any device, and the sets, lessons and games you changed last), guided starts
 * for someone who has made nothing yet, a checklist that ticks itself off, and everything there is
 * to make from the registry (registry.tsx).
 */

function Tile({ to, icon, title, text, tone = 'bg-surface-3 text-text-2' }: { to: string; icon: React.ReactNode; title: string; text: string; tone?: string }) {
  return (
    <Link to={to} className="press-soft group flex min-h-[5rem] items-start gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-3.5 text-text no-underline transition-colors hover:border-line-strong hover:bg-surface-2">
      <span className={`grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] ${tone}`} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold break-words">{title}</span>
        <span className="block text-sm text-text-2">{text}</span>
      </span>
      <ChevronRight className="mt-3 size-5 shrink-0 text-text-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Three or four ways in for someone who has made nothing yet. */
function GuidedStarts({ teacher }: { teacher: boolean }) {
  return (
    <Panel className="mb-6 p-5 sm:p-6" aria-labelledby="start-here">
      <h2 id="start-here" className="font-display text-[1.75rem] leading-tight font-bold">
        Start here
      </h2>
      <p className="mb-4 text-sm text-text-2">Pick one. Each gets you to a game you can play in about a minute, and you can change everything afterwards.</p>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <Tile to="/make/quick" icon={<FileText className="size-6" />} title="Turn your notes into a game" text="Paste notes, a word list or a table and keep the questions you like." tone="bg-lantern text-on-accent" />
        <Tile to="/make/quick?start=topic" icon={<BookOpen className="size-6" />} title="Start from a ready-made set" text="Pick a topic from the built-in sets and make it your own." tone="bg-sky text-on-accent" />
        <Tile to="/make/quick?start=maths" icon={<Sigma className="size-6" />} title="Maths practice in a minute" text="Choose the sums and the numbers; every answer is worked out for you." tone="bg-glim text-on-accent" />
        {teacher ? (
          <Tile to="/lessons" icon={<ListOrdered className="size-6" />} title="Plan a lesson" text="A starter, a main game and an exit ticket, from a template." tone="bg-ember text-on-accent" />
        ) : (
          <Tile to="/host?solo=1" icon={<Layers className="size-6" />} title="Play a set on your own" text="Try a built-in set solo to see how the game modes work." tone="bg-ember text-on-accent" />
        )}
      </div>
    </Panel>
  );
}

interface Step {
  done: boolean;
  title: string;
  to: string;
  action: string;
}

/** The first things to make, ticked off from what the account has really made. Closed for good with the cross. */
function Checklist({ data, teacher }: { data: MakingOverview; teacher: boolean }) {
  const qc = useQueryClient();
  const overview = useOverview();
  const key = teacher ? 'make-start' : 'make-student';
  const dismiss = useMutation({
    mutationFn: () => api.post(`/api/making/help/${key}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: makingKeys.overview }),
    onError: (err) => toast.error(errorText(err, 'That did not close. Try again.')),
  });
  if (data.dismissed.includes(key)) return null;
  const c = data.counts;
  const played = (overview.data?.stats.gamesPlayed ?? 0) > 0;
  const steps: Step[] = teacher
    ? [
        { done: c.sets > 0, title: 'Make a set from your notes, or copy a built-in one', to: '/make/quick', action: 'Make a set' },
        { done: c.hosted > 0, title: 'Host a game for your class', to: '/host', action: 'Host a game' },
        { done: c.classes > 0, title: 'Make a class', to: '/classes?new=1', action: 'Make a class' },
        { done: c.homework > 0, title: 'Set some homework', to: '/make/organise?tab=homework', action: 'Set homework' },
        { done: c.lessons > 0, title: 'Plan a lesson', to: '/lessons', action: 'Plan a lesson' },
      ]
    : [
        { done: played, title: 'Join a game, or play one on your own', to: '/play', action: 'Join a game' },
        { done: c.sets > 0, title: 'Make a set of your own', to: '/make/quick', action: 'Make a set' },
        { done: c.games > 0, title: 'Save a game to play again', to: '/games', action: 'Save a game' },
      ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Panel className="mb-6 p-5 sm:p-6" aria-labelledby="make-checklist">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="make-checklist" className="flex items-center gap-2 font-display text-[1.75rem] leading-tight font-bold">
            <ListChecks className="size-6 text-text-3" aria-hidden /> First things to make
          </h2>
          <p className="text-sm text-text-2">
            {done} of {steps.length} done. Each one ticks itself off when you have done it.
          </p>
        </div>
        <IconButton label="Close the first things to make checklist for good" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>
      <ol className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {steps.map((s) => (
          <li key={s.title} className={`flex items-center gap-3 rounded-[var(--radius-m)] p-3 ${s.done ? 'bg-glim/10' : 'bg-surface-2'}`}>
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${s.done ? 'bg-glim text-on-accent' : 'border-2 border-line-strong'}`} aria-hidden>
              {s.done ? <Check className="size-4" /> : null}
            </span>
            <p className={`min-w-0 flex-1 font-semibold break-words ${s.done ? 'text-text-2 line-through decoration-2' : ''}`}>
              {s.title}
              <span className="sr-only">{s.done ? ', done' : ', to do'}</span>
            </p>
            {!s.done ? (
              <ButtonLink to={s.to} size="sm" className="shrink-0">
                {s.action}
              </ButtonLink>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const STEP_TEXT: Record<DraftSummary['step'], string> = { paste: 'Notes pasted', choose: 'Choosing questions', done: 'Saved as a set' };

function CarryOn({ data }: { data: MakingOverview }) {
  const qc = useQueryClient();
  const [binning, setBinning] = useState<DraftSummary | null>(null);
  const bin = useMutation({
    mutationFn: (id: string) => api.delete(`/api/making/drafts/${id}`),
    onSuccess: async () => {
      setBinning(null);
      toast.success('Draft thrown away');
      await qc.invalidateQueries({ queryKey: makingKeys.overview });
    },
    onError: (err) => toast.error(errorText(err, 'The draft was not thrown away. Try again.')),
  });
  if (!data.drafts.length && !data.recent.length) return null;
  return (
    <section aria-labelledby="carry-on" className="mb-8">
      <h2 id="carry-on" className="mb-3 font-display text-[1.75rem] leading-tight font-bold">
        Carry on where you stopped
      </h2>
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {data.drafts.map((d) => (
          <li key={d.id} className="relative flex items-start gap-3 rounded-[var(--radius-m)] border border-dashed border-line-strong bg-raised p-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-m)] bg-lantern/20 text-text" aria-hidden>
              <PencilRuler className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Link to={`/make/quick?draft=${d.id}`} className="block font-bold break-words text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-m)] hover:underline">
                {d.title || 'Untitled draft'}
              </Link>
              <p className="text-sm text-text-2">
                Draft: {STEP_TEXT[d.step]}, {plural(d.questions, 'question')}. {timeAgo(d.updatedAt)}
              </p>
            </div>
            <IconButton label={`Throw away the draft ${d.title || 'Untitled draft'}`} size="sm" className="relative z-[1]" onClick={() => setBinning(d)}>
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </li>
        ))}
        {data.recent.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="relative flex items-start gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <Link to={RECENT_LINK[r.kind](r.id)} className="block font-bold break-words text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-m)]">
                {r.title}
              </Link>
              <p className="text-sm text-text-2">
                {RECENT_LABEL[r.kind]}, {r.detail}. Changed {timeAgo(r.at)}
              </p>
            </div>
            <Badge>{RECENT_LABEL[r.kind]}</Badge>
          </li>
        ))}
      </ul>
      <Dialog
        open={binning !== null}
        onOpenChange={(o) => (!o ? setBinning(null) : undefined)}
        title="Throw away this draft?"
        description={binning ? `“${binning.title || 'Untitled draft'}” and the questions in it will be gone for good. Sets you already saved from it stay.` : undefined}
        footer={
          <>
            <Button onClick={() => setBinning(null)}>Keep it</Button>
            <Button variant="danger" loading={bin.isPending} onClick={() => binning && bin.mutate(binning.id)}>
              Throw it away
            </Button>
          </>
        }
      />
    </section>
  );
}

export default function MakePage() {
  usePageTitle('Make');
  const me = useMe();
  const user = me.data?.user;
  const signedIn = Boolean(user && !user.isGuest);
  const teacher = user?.accountType === 'teacher';
  const overview = useMakingOverview();

  if (me.isLoading) return <Skeleton className="h-40" />;
  if (!signedIn) {
    return (
      <>
        <PageHeader title="Make" />
        <EmptyState icon={<PencilRuler />} title="Sign in to make things" action={<ButtonLink to="/signin?next=/make" variant="primary">Sign in</ButtonLink>}>
          Question sets, saved games and lessons are kept with your account, so you can carry on from any device.
        </EmptyState>
      </>
    );
  }
  const who = { accountType: user?.accountType, signedIn, permissions: me.data?.permissions ?? [] };
  const entries = MAKE_REGISTRY.filter((e) => canMake(e.who, who));
  const data = overview.data;
  const nothingYet = data ? data.counts.sets + data.counts.lessons + data.counts.games + data.drafts.length === 0 : false;

  return (
    <>
      <PageHeader
        title="Make"
        description={teacher ? 'Everything you make for your classes, in one place: carry on with a draft, or start something new.' : 'Make your own question sets and games, and carry on from any device.'}
        actions={
          <>
            {teacher ? (
              <ButtonLink to="/today" icon={<CalendarDays className="size-4" aria-hidden />}>
                Your day
              </ButtonLink>
            ) : null}
            <ButtonLink to="/make/quick" variant="primary" icon={<Sparkles className="size-4" aria-hidden />}>
              From your notes
            </ButtonLink>
          </>
        }
      />
      {overview.isError ? <ErrorNotice message={errorText(overview.error, 'What you made could not be loaded.')} onRetry={() => void overview.refetch()} /> : null}
      {overview.isPending ? <Skeleton className="mb-6 h-40" /> : null}
      {data ? (
        <>
          {nothingYet ? <GuidedStarts teacher={teacher} /> : null}
          <Checklist data={data} teacher={teacher} />
          <CarryOn data={data} />
        </>
      ) : null}
      {(['play', 'class'] as const).map((group) => {
        const list = entries.filter((e) => e.group === group);
        if (!list.length) return null;
        return (
          <section key={group} aria-labelledby={`make-${group}`} className="mb-8">
            <h2 id={`make-${group}`} className="mb-3 font-display text-[1.75rem] leading-tight font-bold">
              {group === 'play' ? 'Make something new' : 'For your classes'}
            </h2>
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {list.map((e) => (
                <li key={e.id}>
                  <Tile to={e.to} icon={e.icon} title={e.title} text={e.text} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {teacher ? (
        <p className="text-sm text-text-2">
          Many sets or classes to sort out? <Link to="/make/organise" className="font-semibold underline">Organise them in bulk</Link>: file sets in a folder, send old ones to the bin, or set the same homework for several classes at once.
        </p>
      ) : null}
    </>
  );
}
