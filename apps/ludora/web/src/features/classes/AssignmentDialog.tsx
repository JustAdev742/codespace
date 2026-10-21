import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { SUBJECT_LABELS } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useModes, useSets, thumbFor, type CatalogEntry, type CatalogVariant, type SetSummary } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, Skeleton, Textarea } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { SetCover } from '../sets/SetCover.tsx';
import { classKeys, fromLocalInput, toLocalInput, useModeInfo, type TeacherAssignment } from './classData.ts';

/*
 * New and edit assignment. A new assignment needs a question set (the
 * teacher's own or one from the library) and a mode or variant that works
 * with one player. Once a set or mode is chosen its picker folds away into
 * a one-line summary, so the form stays short. Only the title, instructions
 * and due date can be changed later; the API does not change the set or mode.
 */

type Choice = { mode: CatalogEntry; variant: CatalogVariant | null };

const subjectLabel = (s: string) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SetPicker({ onPick }: { onPick: (s: SetSummary) => void }) {
  // Start on the teacher's own sets, or on the library when they have none.
  const mine = useSets({ scope: 'mine', page: 1 });
  const [scope, setScope] = useState<'mine' | 'public' | null>(null);
  const shownScope = scope ?? (mine.data && mine.data.total === 0 ? 'public' : 'mine');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const [page, setPage] = useState(1);
  const sets = useSets({ scope: shownScope, ...(q ? { q } : {}), page });
  const pages = sets.data ? Math.max(1, Math.ceil(sets.data.total / sets.data.pageSize)) : 1;
  const list = sets.data?.sets ?? [];
  const choose = (s: 'mine' | 'public') => {
    setScope(s);
    setPage(1);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="group" aria-label="Where to look">
          {(['mine', 'public'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={shownScope === s} onClick={() => choose(s)} className={`h-9 rounded-full px-4 text-sm font-semibold ${shownScope === s ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
              {s === 'mine' ? 'My sets' : 'Library'}
            </button>
          ))}
        </div>
        <label className="relative min-w-[11rem] flex-1">
          <span className="sr-only">Search sets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(1);
            }}
            placeholder="Search sets"
            className="h-9 pl-9"
          />
        </label>
      </div>
      {sets.isError && !sets.data ? (
        <ErrorNotice message="Question sets could not be loaded." onRetry={() => void sets.refetch()} />
      ) : sets.isPending ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        q ? (
          <EmptyState title="No sets match">Try another word, or look in {shownScope === 'mine' ? 'the library' : 'your own sets'}.</EmptyState>
        ) : shownScope === 'mine' ? (
          <EmptyState
            title="You have no sets yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => choose('public')}>
                  Browse the library
                </Button>
                <ButtonLink to="/sets/new" size="sm">
                  Make a set
                </ButtonLink>
              </div>
            }
          >
            Pick one from the library, or write your own questions first.
          </EmptyState>
        ) : (
          <EmptyState title="The library is empty">There are no public sets yet.</EmptyState>
        )
      ) : (
        <>
          <ul className={`grid max-h-[19rem] grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2 ${sets.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={sets.isPlaceholderData || undefined}>
            {list.map((s) => (
              <li key={s.id}>
                {s.hidden ? (
                  <div className="flex items-center gap-3 rounded-[14px] border-2 border-dashed border-line p-2.5 opacity-70">
                    <SetCover cover={s.cover} subject={s.subject} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.title}</span>
                      <Badge tone="coral">Hidden by moderators</Badge>
                    </span>
                  </div>
                ) : (
                  <button type="button" onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-[14px] border-2 border-line bg-raised p-2.5 text-left transition-colors hover:border-line-strong">
                    <SetCover cover={s.cover} subject={s.subject} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.title}</span>
                      <span className="block truncate text-xs text-text-3">
                        {s.questionCount} questions, {subjectLabel(s.subject)}
                        {shownScope === 'public' && s.ownerName ? `, by ${s.ownerName}` : ''}
                      </span>
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-text-2 tabular">
                Page {page} of {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Host-paced games wait for someone to press Next when "Move on
 * automatically" is off (Class Discussion turns it off and locks it). A
 * student playing an assignment alone has no Next button, so the game
 * would stop after the first question.
 */
function waitsForHost(mode: CatalogEntry, variant: CatalogVariant | null): boolean {
  if (mode.meta.pacing !== 'host') return false;
  const field = mode.settings.find((f) => f.key === 'autoAdvance');
  if (!field) return false;
  const preset = variant?.settings?.autoAdvance;
  return (preset !== undefined ? preset : field.default) === false;
}

/** Modes a student can play alone: one player is enough, it is not still being built or hidden, and it moves on by itself. */
function assignableChoices(modes: CatalogEntry[]): Choice[] {
  return modes
    .filter((m) => m.meta.players.min <= 1 && m.meta.status !== 'planned' && !m.hidden)
    .flatMap((m) => [{ mode: m, variant: null }, ...m.variants.filter((v) => v.meta.status !== 'planned' && !v.hidden).map((v) => ({ mode: m, variant: v }))])
    .filter((c) => !waitsForHost(c.mode, c.variant));
}

function ModePicker({ onPick }: { onPick: (c: Choice) => void }) {
  const modes = useModes();
  const choices = useMemo(() => assignableChoices(modes.data?.modes ?? []), [modes.data]);
  if (modes.isError && !modes.data) return <ErrorNotice message="Game modes could not be loaded." onRetry={() => void modes.refetch()} />;
  if (modes.isPending) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px]" />
        ))}
      </div>
    );
  }
  if (!choices.length) return <EmptyState title="No modes can be assigned right now">Every mode that works with one player is switched off at the moment.</EmptyState>;
  return (
    <ul className="grid max-h-[22rem] grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2">
      {choices.map(({ mode, variant }) => {
        const meta = variant?.meta ?? mode.meta;
        return (
          <li key={meta.id}>
            <button type="button" onClick={() => onPick({ mode, variant })} className="flex h-full w-full overflow-hidden rounded-[14px] border-2 border-line text-left transition-colors hover:border-line-strong">
              <ModeArt thumb={thumbFor(mode.meta, variant?.meta)} className="w-20 shrink-0 self-stretch" />
              <span className="min-w-0 flex-1 bg-raised p-2.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-display font-bold">
                  {meta.title}
                  {meta.status === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{meta.tagline}</span>
                {variant ? <span className="mt-0.5 block text-xs text-text-3">A twist on {mode.meta.title}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A chosen set or mode, folded into one line with a way to change it. */
function Chosen({ art, title, detail, changeLabel, onChange, focusOnMount }: { art: ReactNode; title: string; detail: string; changeLabel: string; onChange: () => void; focusOnMount: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The picker button that had focus has gone; keep keyboard users in the same place.
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-2 border-lantern bg-dusk/15 p-2.5">
      {art}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words">{title}</span>
        <span className="block text-xs break-words text-text-3">{detail}</span>
      </span>
      <Button ref={ref} size="sm" variant="ghost" onClick={onChange} aria-label={changeLabel}>
        Change
      </Button>
    </div>
  );
}

function SectionHeading({ id, children, note, className = 'mb-2' }: { id: string; children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 id={id} className="font-display text-lg font-bold text-text">
        {children}
      </h3>
      {note ? <p className="text-sm text-text-3">{note}</p> : null}
    </div>
  );
}

function AssignmentForm({ classId, editing, onDone }: { classId: string; editing: TeacherAssignment | null; onDone: () => void }) {
  const qc = useQueryClient();
  const modeInfo = useModeInfo();
  const [set, setSet] = useState<SetSummary | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  // Whether a picker was just used, so focus moves to its summary rather than the top of the dialog.
  const [picked, setPicked] = useState<{ set: boolean; mode: boolean }>({ set: false, mode: false });
  const [title, setTitle] = useState(editing?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(Boolean(editing));
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [due, setDue] = useState(editing?.dueAt ? toLocalInput(editing.dueAt) : '');
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const dueIso = due ? fromLocalInput(due) : null;
  const dueInvalid = Boolean(due) && !dueIso;
  const duePassed = dueIso ? new Date(dueIso).getTime() < Date.now() : false;
  const minQuestions = choice?.mode.meta.minQuestions ?? 0;
  const tooSmall = Boolean(set && choice && set.questionCount < minQuestions);
  const problems = {
    set: !editing && !set ? 'Choose a question set.' : null,
    mode: !editing && !choice ? 'Choose a game mode.' : null,
    size: tooSmall && choice && set ? `${choice.variant?.meta.title ?? choice.mode.meta.title} needs at least ${minQuestions} questions, and this set has ${set.questionCount}. Choose a bigger set or another mode.` : null,
    title: title.trim().length < 2 ? 'Give the assignment a title of at least 2 characters.' : null,
    due: dueInvalid ? 'Enter a full date and time, or clear the due date.' : null,
  };
  const show = (key: keyof typeof problems) => (submitted || key === 'size' ? problems[key] : null);

  const pickSet = (s: SetSummary) => {
    setSet(s);
    setPicked((p) => ({ ...p, set: true }));
    if (!titleEdited) setTitle(s.title.slice(0, 80));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(problems).some(Boolean)) return;
    setPending(true);
    setServerFields({});
    setFormError(null);
    try {
      const common = { title: title.trim(), instructions: instructions.trim(), dueAt: dueIso };
      if (editing) {
        await api.patch(`/api/classes/${classId}/assignments/${editing.id}`, common);
        toast.success('Assignment saved');
      } else {
        await api.post(`/api/classes/${classId}/assignments`, { setId: set!.id, modeId: choice!.mode.meta.id, variantId: choice!.variant?.meta.id ?? null, ...common });
        toast.success('Assignment created');
      }
      await qc.invalidateQueries({ queryKey: classKeys.all });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        const { title: t, instructions: i, dueAt: d } = err.fields;
        setServerFields({ ...(t ? { title: t } : {}), ...(i ? { instructions: i } : {}), ...(d ? { due: d } : {}) });
        if (!t && !i && !d) setFormError(err.message);
      } else {
        setFormError('The assignment was not saved. Check your connection and try again.');
      }
    } finally {
      setPending(false);
    }
  };

  const editingMode = editing ? modeInfo(editing.modeId, editing.variantId) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {editing && editingMode ? (
        <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3 text-sm">
          <ModeArt thumb={editingMode.thumb} className="h-12 w-16 shrink-0 overflow-hidden rounded-[8px]" />
          <p className="min-w-0 flex-1 text-text-2">
            <span className="font-semibold break-words text-text">{editing.setTitle}</span>, played as {editingMode.title}. To use a different set or mode, make a new assignment.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="assign-set">
            <SectionHeading id="assign-set">Question set</SectionHeading>
            {set ? (
              <Chosen
                art={<SetCover cover={set.cover} subject={set.subject} size={40} />}
                title={set.title}
                detail={`${set.questionCount} questions, ${subjectLabel(set.subject)}`}
                changeLabel={`Change the question set, ${set.title}`}
                onChange={() => setSet(null)}
                focusOnMount={picked.set}
              />
            ) : (
              <SetPicker onPick={pickSet} />
            )}
            {show('set') ? (
              <p className="mt-2 text-sm font-semibold text-ember" role="alert">
                {problems.set}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="assign-mode">
            <SectionHeading id="assign-mode" note="Only modes that work with one player are listed. Each student plays on their own.">
              Game mode
            </SectionHeading>
            {choice ? (
              <Chosen
                art={<ModeArt thumb={thumbFor(choice.mode.meta, choice.variant?.meta)} className="h-10 w-14 shrink-0 overflow-hidden rounded-[8px]" />}
                title={choice.variant?.meta.title ?? choice.mode.meta.title}
                detail={choice.variant ? `A twist on ${choice.mode.meta.title}` : choice.mode.meta.tagline}
                changeLabel={`Change the game mode, ${choice.variant?.meta.title ?? choice.mode.meta.title}`}
                onChange={() => setChoice(null)}
                focusOnMount={picked.mode}
              />
            ) : (
              <ModePicker
                onPick={(c) => {
                  setChoice(c);
                  setPicked((p) => ({ ...p, mode: true }));
                }}
              />
            )}
            {show('mode') ? (
              <p className="mt-2 text-sm font-semibold text-ember" role="alert">
                {problems.mode}
              </p>
            ) : null}
            {show('size') ? <ErrorNotice title="Not enough questions" message={problems.size!} /> : null}
          </section>
        </>
      )}

      <section aria-labelledby="assign-details" className="flex flex-col gap-4">
        {!editing ? (
          <SectionHeading id="assign-details" className="-mb-1">
            Details
          </SectionHeading>
        ) : (
          <h3 id="assign-details" className="sr-only">
            Details
          </h3>
        )}
        <Field label="Title" hint="Students see this in their class." error={serverFields.title ?? show('title') ?? undefined}>
          {(p) => (
            <Input
              {...p}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              maxLength={80}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Instructions" hint={`Optional. Shown to students with the assignment. ${instructions.length} of 500 characters.`} error={serverFields.instructions}>
          {(p) => <Textarea {...p} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} rows={3} />}
        </Field>
        <Field
          label="Due date"
          hint={duePassed ? 'That time has passed, so every attempt from now on will count as late.' : 'Optional. Students can still play after it; the report marks those attempts as late.'}
          error={serverFields.due ?? show('due') ?? undefined}
        >
          {(p) => (
            <div className="flex flex-wrap gap-2">
              <Input {...p} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto min-w-0 flex-1 sm:max-w-xs" />
              {due ? (
                <Button variant="ghost" onClick={() => setDue('')} aria-label="Clear the due date">
                  Clear
                </Button>
              ) : null}
            </div>
          )}
        </Field>
      </section>

      {formError ? <ErrorNotice title="Not saved" message={formError} /> : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {editing ? 'Save changes' : 'Create assignment'}
        </Button>
      </div>
    </form>
  );
}

export function AssignmentDialog({ classId, open, onOpenChange, editing }: { classId: string; open: boolean; onOpenChange: (open: boolean) => void; editing: TeacherAssignment | null }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit assignment' : 'New assignment'}
      description={editing ? `Changes show for students straight away.` : 'Students play it on their own, any time, as often as they like. Each result goes into your report.'}
      size="lg"
    >
      {/* The form unmounts when the dialog closes, so it always opens fresh. */}
      <AssignmentForm classId={classId} editing={editing} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
