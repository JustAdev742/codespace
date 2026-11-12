import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CalendarClock, Copy, GripVertical, MessagesSquare, NotebookPen, Pencil, Play, Plus, Presentation, Printer, Share2, StepForward, Timer, Trash2, TriangleAlert, Trophy, X } from 'lucide-react';
import { LESSON_LIMITS, type LessonBody, type LessonStep } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Switch } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { BackLink, dateTimeText, errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { useClassList } from '../classes/classData.ts';
import { KIND_LABEL, lessonKeys, minutesText, moveItem, newStepId, startsText, toLocalInput, useLesson, type LessonDetail, type StepInfo } from './data.ts';
import { StepDialog } from './StepDialog.tsx';
import { LessonOutlineHelper } from '../ai/AiLessonTools.tsx';

/*
 * /lessons/:id: one lesson. Its title, goals and standings switch; its steps in order (drag a step
 * by its handle, or move it with the arrow buttons or Alt+Up and Alt+Down); a schedule for a class;
 * sharing, printing and running it. Changes save by themselves a moment after they are made.
 */

const KIND_ICON = { game: Play, slide: Presentation, discussion: MessagesSquare } as const;

function newStep(kind: LessonStep['kind']): LessonStep {
  const id = newStepId();
  if (kind === 'game') return { id, kind, title: '', setId: null, modeId: 'classic', variantId: null, settings: {}, common: {}, note: '' };
  if (kind === 'slide') return { id, kind, title: '', lines: [], image: null, note: '' };
  return { id, kind, prompt: '', seconds: 120, note: '' };
}

type SaveState = 'saved' | 'saving' | 'error';

function useAutosave(id: string, initial: LessonBody) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LessonBody>(initial);
  const [state, setState] = useState<SaveState>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef<LessonBody | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = async () => {
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setState('saving');
    try {
      const res = await api.put<LessonDetail>(`/api/lessons/${id}`, body);
      // Only the server's working out (step titles, lengths, problems); the draft the teacher is typing stays theirs.
      qc.setQueryData(lessonKeys.one(id), res);
      void qc.invalidateQueries({ queryKey: lessonKeys.list, exact: true });
      setProblem(null);
      setState(pending.current ? 'saving' : 'saved');
    } catch (err) {
      setProblem(errorText(err, 'Your changes could not be saved. Check your connection.'));
      setState('error');
    }
  };
  const change = (next: LessonBody) => {
    setDraft(next);
    pending.current = next;
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return { draft, change, state, problem, saveNow: flush };
}

function StepRow({
  step,
  info,
  index,
  count,
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDrop,
}: {
  step: LessonStep;
  info: StepInfo | undefined;
  index: number;
  count: number;
  onEdit: () => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const Icon = KIND_ICON[step.kind];
  const [over, setOver] = useState(false);
  const title = info?.title ?? (step.kind === 'slide' ? step.title || 'Untitled slide' : step.kind === 'discussion' ? 'Discussion' : step.title || 'Game');
  const keys = (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onMove(e.key === 'ArrowUp' ? index - 1 : index + 1);
  };
  return (
    <li
      data-step={index}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      onKeyDown={keys}
      className={`flex flex-col gap-3 rounded-[var(--radius-l)] border bg-raised p-3 sm:flex-row sm:items-center ${over ? 'border-lantern' : 'border-line'}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          draggable
          onDragStart={(e: DragEvent) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
            onDragStart();
          }}
          className="mt-1 hidden cursor-grab text-text-3 sm:block"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="size-5" />
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-s)] bg-lantern font-display text-xl font-bold text-on-accent tabular" aria-hidden>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight font-bold break-words">
            <span className="sr-only">Step {index + 1}: </span>
            {title}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-4 text-text-3" aria-hidden /> {KIND_LABEL[step.kind]}
            </span>
            {info?.modeTitle ? <span>{info.modeTitle}</span> : null}
            {info?.setTitle ? <span className="break-words">“{info.setTitle}”{info.questionCount !== null ? `, ${plural(info.questionCount, 'question')}` : ''}</span> : null}
            {info ? <span>{minutesText(info.minutes)}</span> : null}
            {step.note ? (
              <span className="inline-flex items-center gap-1">
                <NotebookPen className="size-4 text-text-3" aria-hidden /> Has your note
              </span>
            ) : null}
          </p>
          {info?.problem ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-lantern-deep" aria-hidden />
              {info.problem}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:shrink-0" role="group" aria-label={`Step ${index + 1}`}>
        <IconButton label={`Move step ${index + 1} up`} size="sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-keyshortcuts="Alt+ArrowUp">
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton label={`Move step ${index + 1} down`} size="sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-keyshortcuts="Alt+ArrowDown">
          <ArrowDown className="size-4" />
        </IconButton>
        <Button size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={onEdit} aria-label={`Edit step ${index + 1}`}>
          Edit
        </Button>
        <IconButton label={`Duplicate step ${index + 1}`} size="sm" onClick={onDuplicate}>
          <Copy className="size-4" />
        </IconButton>
        <IconButton label={`Delete step ${index + 1}`} size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

function Goals({ goals, onChange }: { goals: string[]; onChange: (g: string[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Learning goals</legend>
      <p className="text-sm text-text-2">Shown in the lobby and again at the end, after "Today we".</p>
      {goals.map((g, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input aria-label={`Goal ${i + 1}`} value={g} maxLength={LESSON_LIMITS.goal} placeholder="learned how to…" onChange={(e) => onChange(goals.map((x, j) => (j === i ? e.target.value : x)))} />
          <IconButton label={`Remove goal ${i + 1}`} size="sm" onClick={() => onChange(goals.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      {goals.length < LESSON_LIMITS.goals ? (
        <div>
          <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...goals, ''])}>
            Add a goal
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function Schedule({ detail }: { detail: LessonDetail }) {
  const qc = useQueryClient();
  const classes = useClassList(true);
  const teaching = (classes.data?.teaching ?? []).filter((c) => !c.archived);
  const [classId, setClassId] = useState(detail.lesson.classId ?? '');
  const [at, setAt] = useState(toLocalInput(detail.lesson.startsAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (clear: boolean) => {
    setError(null);
    if (!clear && (!classId || !at)) return setError('Choose a class and a start time.');
    setBusy(true);
    try {
      await api.put(`/api/lessons/${detail.lesson.id}/schedule`, clear ? { classId: null, startsAt: null } : { classId, startsAt: new Date(at).toISOString() });
      if (clear) {
        setClassId('');
        setAt('');
      }
      await qc.invalidateQueries({ queryKey: lessonKeys.one(detail.lesson.id) });
      toast.success(clear ? 'Schedule cleared.' : 'Scheduled. It shows on the class page.');
    } catch (err) {
      setError(errorText(err, 'The schedule could not be saved.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="p-5" aria-labelledby="schedule">
      <h2 id="schedule" className="mb-1 flex items-center gap-2 font-display text-2xl font-bold">
        <CalendarClock className="size-6 text-text-3" aria-hidden /> Schedule
      </h2>
      <p className="mb-3 text-sm text-text-2">
        The class page shows when it starts. Nothing opens by itself: you open the room with Run lesson, students see a Join button then, and you start each game.
      </p>
      {detail.lesson.startsAt && detail.lesson.className ? (
        <p className="mb-3 font-semibold" role="status">
          {detail.lesson.className}: {startsText(detail.lesson.startsAt)}
        </p>
      ) : null}
      {classes.isSuccess && teaching.length === 0 ? (
        <p className="text-sm text-text-2">
          Make a class on the <Link to="/classes">Classes page</Link> to schedule a lesson for it.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Class">
            {(p) => (
              <Select {...p} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Choose a class</option>
                {teaching.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Starts at">{(p) => <Input {...p} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
          <div className="flex gap-2">
            <Button variant="primary" loading={busy} onClick={() => void save(false)}>
              Save schedule
            </Button>
            {detail.lesson.startsAt ? (
              <Button variant="ghost" onClick={() => void save(true)}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

function ShareDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setUsername('');
      setError(null);
      setDone(null);
    }
  }, [open]);
  const share = async () => {
    if (!username.trim()) return setError('Type their username.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/lessons/${id}/share`, { username: username.trim() });
      setDone(username.trim());
      setUsername('');
    } catch (err) {
      setError(errorText(err, 'The lesson could not be shared.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share with a teacher"
      description="They get their own copy to change as they like. Your plan notes and schedule stay with you."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="primary" loading={busy} onClick={() => void share()}>
            Send a copy
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void share();
        }}
      >
        <Field label="Their username" error={error ?? undefined}>
          {(p) => <Input {...p} value={username} autoComplete="off" maxLength={40} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
      </form>
      {done ? (
        <p role="status" className="mt-3 font-semibold">
          Sent a copy to {done}.
        </p>
      ) : null}
    </Dialog>
  );
}

function Runs({ id }: { id: string }) {
  const runs = useQuery({ queryKey: lessonKeys.runs(id), queryFn: () => api.get<{ runs: { id: string; startedAt: string; finishedAt: string | null; index: number; games: number }[] }>(`/api/lessons/${id}/runs`) });
  if (!runs.data?.runs.length) return null;
  return (
    <Panel className="p-5" aria-labelledby="runs">
      <h2 id="runs" className="mb-3 font-display text-2xl font-bold">
        Lesson reports
      </h2>
      <ul className="flex flex-col gap-2">
        {runs.data.runs.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2">
            <span>
              <Link to={`/lessons/runs/${r.id}`} className="font-semibold">
                {dateTimeText(r.startedAt)}
              </Link>
              <span className="text-sm text-text-2">
                {' '}
                · {plural(r.games, 'game')} · {r.finishedAt ? 'Finished' : `Stopped at step ${r.index + 1}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Editor({ detail }: { detail: LessonDetail }) {
  const id = detail.lesson.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { draft, change, state, problem, saveNow } = useAutosave(id, { title: detail.lesson.title, goals: detail.lesson.goals, standings: detail.lesson.standings, steps: detail.lesson.steps });
  usePageTitle(draft.title || 'Lesson');
  const [editing, setEditing] = useState<{ step: LessonStep; index: number | null } | null>(null);
  const [setTitles, setSetTitles] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const dragFrom = useRef<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // The server's working out matches the draft only when the steps are in the same order.
  const infoFor = (s: LessonStep, i: number) => (detail.lesson.steps[i]?.id === s.id ? detail.info[i] : undefined);

  const steps = draft.steps;
  const setSteps = (next: LessonStep[]) => change({ ...draft, steps: next });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    setSteps(moveItem(steps, from, to));
    const s = steps[from]!;
    setAnnounce(`Moved ${infoFor(s, from)?.title ?? 'the step'} to step ${to + 1} of ${steps.length}.`);
    // Keep focus with the step that moved, on the same button.
    const label = (document.activeElement as HTMLElement | null)?.getAttribute('aria-label')?.replace(/step \d+/, `step ${to + 1}`);
    requestAnimationFrame(() => {
      const row = list.current?.querySelector<HTMLElement>(`[data-step="${to}"]`);
      const button = label ? row?.querySelector<HTMLElement>(`[aria-label="${label}"]`) : null;
      (button && !(button as HTMLButtonElement).disabled ? button : row?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    });
  };

  const run = async (carryOn: boolean) => {
    setBusy(carryOn ? 'carry' : 'run');
    try {
      await saveNow();
      const res = await api.post<{ code: string }>(`/api/lessons/${id}/run`, { carryOn });
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast.error(errorText(err, 'The lesson could not be opened.'));
      setBusy(null);
    }
  };
  const duplicate = async () => {
    setBusy('dup');
    try {
      await saveNow();
      const res = await api.post<{ id: string }>(`/api/lessons/${id}/duplicate`, {});
      void qc.invalidateQueries({ queryKey: lessonKeys.list, exact: true });
      toast.success('Duplicated. You are on the copy now.');
      navigate(`/lessons/${res.id}`);
    } catch (err) {
      toast.error(errorText(err, 'The lesson could not be duplicated.'));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    try {
      await api.delete(`/api/lessons/${id}`);
      void qc.invalidateQueries({ queryKey: lessonKeys.list, exact: true });
      toast.success('Lesson deleted.');
      navigate('/lessons');
    } catch (err) {
      toast.error(errorText(err, 'The lesson could not be deleted.'));
    }
  };

  const total = steps.reduce((n, s, i) => n + (infoFor(s, i)?.minutes ?? 0), 0) || detail.totalMinutes;
  const lastRun = detail.lastRun;
  const canCarry = lastRun && !lastRun.finished && (lastRun.games > 0 || lastRun.index > 0);
  return (
    <>
      <BackLink to="/lessons">All lessons</BackLink>
      <PageHeader
        title={<span className="break-words">{draft.title || 'Untitled lesson'}</span>}
        description={`${plural(steps.length, 'step')}. ${minutesText(total)} in all.`}
        actions={
          <>
            {detail.liveCode ? (
              <ButtonLink to={`/room/${detail.liveCode}`} variant="primary" icon={<Play className="size-4" aria-hidden />}>
                Back to the lesson room
              </ButtonLink>
            ) : (
              <>
                {canCarry ? (
                  <Button variant="primary" icon={<StepForward className="size-4" aria-hidden />} loading={busy === 'carry'} onClick={() => void run(true)}>
                    Carry on from step {Math.min(lastRun.index + 1, steps.length)}
                  </Button>
                ) : null}
                <Button variant={canCarry ? 'secondary' : 'primary'} icon={<Play className="size-4" aria-hidden />} loading={busy === 'run'} onClick={() => void run(false)}>
                  {canCarry ? 'Start again' : 'Run lesson'}
                </Button>
              </>
            )}
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-2" role="status">
          {state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'All changes saved'}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lesson tools">
          <ButtonLink size="sm" to={`/lessons/${id}/print`} icon={<Printer className="size-4" aria-hidden />}>
            Print the plan
          </ButtonLink>
          <Button size="sm" icon={<Share2 className="size-4" aria-hidden />} onClick={() => setSharing(true)}>
            Share
          </Button>
          <Button size="sm" icon={<Copy className="size-4" aria-hidden />} loading={busy === 'dup'} onClick={() => void duplicate()}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>
      {problem ? (
        <div className="mb-4">
          <ErrorNotice title="Not saved" message={problem} />
        </div>
      ) : null}
      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-4 p-5" aria-labelledby="details">
          <h2 id="details" className="font-display text-2xl font-bold">
            Details
          </h2>
          <Field label="Lesson title">{(p) => <Input {...p} value={draft.title} maxLength={LESSON_LIMITS.title} onChange={(e) => change({ ...draft, title: e.target.value })} />}</Field>
          <Goals goals={draft.goals} onChange={(goals) => change({ ...draft, goals })} />
          <Switch
            checked={draft.standings}
            onCheckedChange={(standings) => change({ ...draft, standings })}
            label="Lesson standings"
            description="Points add up across the lesson's games, shown between steps and at the end: 10 for each right answer and 30, 20 and 10 for the top three places. Off: each game stands alone."
          />
        </Panel>
        <Panel className="p-5" aria-labelledby="steps">
          <h2 id="steps" className="mb-1 font-display text-2xl font-bold">
            Steps
          </h2>
          <p className="mb-4 text-sm text-text-2">In the order the class meets them. Drag a step by its handle, or use the arrows (or Alt and the up and down keys) to move it.</p>
          {steps.length === 0 ? (
            <EmptyState icon={<Trophy />} title="No steps yet">
              Add a game, an info slide or a discussion below.
            </EmptyState>
          ) : (
            <ol ref={list} className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  info={infoFor(s, i)}
                  index={i}
                  count={steps.length}
                  onEdit={() => setEditing({ step: s, index: i })}
                  onMove={(to) => move(i, to)}
                  onDuplicate={() => {
                    if (steps.length >= LESSON_LIMITS.steps) return void toast.error(`A lesson has up to ${LESSON_LIMITS.steps} steps.`);
                    setSteps([...steps.slice(0, i + 1), { ...s, id: newStepId() }, ...steps.slice(i + 1)]);
                    setAnnounce(`Step ${i + 1} duplicated as step ${i + 2}.`);
                  }}
                  onDelete={() => {
                    setSteps(steps.filter((_, j) => j !== i));
                    setAnnounce(`Step ${i + 1} deleted.`);
                  }}
                  onDragStart={() => (dragFrom.current = i)}
                  onDrop={() => {
                    if (dragFrom.current !== null) move(dragFrom.current, i);
                    dragFrom.current = null;
                  }}
                />
              ))}
            </ol>
          )}
          {steps.length < LESSON_LIMITS.steps ? (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Add a step">
              <Button icon={<Play className="size-4" aria-hidden />} onClick={() => setEditing({ step: newStep('game'), index: null })}>
                Add a game
              </Button>
              <Button icon={<Presentation className="size-4" aria-hidden />} onClick={() => setEditing({ step: newStep('slide'), index: null })}>
                Add an info slide
              </Button>
              <Button icon={<MessagesSquare className="size-4" aria-hidden />} onClick={() => setEditing({ step: newStep('discussion'), index: null })}>
                Add a discussion
              </Button>
              <Button icon={<Timer className="size-4" aria-hidden />} onClick={() => setEditing({ step: { id: newStepId(), kind: 'slide', title: 'How are we doing?', lines: ['Hold up a colour without a word', 'Green: got it. Amber: nearly. Red: stuck.'], image: null, tool: { kind: 'checkin', seconds: 120 }, note: '' }, index: null })}>
                Add a classroom tool
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-2">This lesson has {LESSON_LIMITS.steps} steps, the most a lesson can have.</p>
          )}
          {/* Takes no room at all when AI helpers are off (the helper then draws nothing). */}
          <div className="mt-3 empty:hidden">
            <LessonOutlineHelper
              stepCount={steps.length}
              onAccept={(o) => {
                const added = o.steps.slice(0, LESSON_LIMITS.steps - steps.length);
                // A title or goals the teacher already wrote stay theirs.
                change({ ...draft, title: !draft.title.trim() || draft.title === 'New lesson' ? o.title : draft.title, goals: draft.goals.some((g) => g.trim()) ? draft.goals : o.goals, steps: [...steps, ...added] });
                setAnnounce(`Added ${plural(added.length, 'step')} from the outline.`);
              }}
            />
          </div>
        </Panel>
        <Schedule detail={detail} />
        <Runs id={id} />
      </div>
      <StepDialog
        open={editing !== null}
        step={editing?.step ?? null}
        setTitle={editing?.step.kind === 'game' && editing.step.setId ? (setTitles[editing.step.setId] ?? (editing.index !== null ? (infoFor(editing.step, editing.index)?.setTitle ?? null) : null)) : null}
        onOpenChange={(v) => !v && setEditing(null)}
        onSave={(s, title) => {
          if (s.kind === 'game' && s.setId && title) setSetTitles((t) => ({ ...t, [s.setId!]: title }));
          if (editing?.index === null || editing === null) {
            setSteps([...steps, s]);
            setAnnounce(`Added step ${steps.length + 1}.`);
          } else setSteps(steps.map((x, j) => (j === editing.index ? s : x)));
        }}
      />
      <ShareDialog id={id} open={sharing} onOpenChange={setSharing} />
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        size="sm"
        title="Delete this lesson?"
        description="The lesson, its notes and its lesson reports go for good. The games played in it keep their own reports."
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Keep it</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
              Delete lesson
            </Button>
          </>
        }
      />
      {lastRun?.startedAt ? <p className="mt-6 text-sm text-text-3">Last run {dateTimeText(lastRun.startedAt)}.</p> : null}
    </>
  );
}

export default function LessonEditor() {
  const { id = '' } = useParams();
  const lesson = useLesson(id);
  if (lesson.isPending) return <Skeleton className="h-64" />;
  if (lesson.isError) {
    return (
      <>
        <BackLink to="/lessons">All lessons</BackLink>
        {hasStatus(lesson.error, 404, 403) ? (
          <EmptyState title="Lesson not found" action={<ButtonLink to="/lessons">Your lessons</ButtonLink>}>
            It may have been deleted, or it belongs to someone else.
          </EmptyState>
        ) : (
          <ErrorNotice message="The lesson could not be loaded." onRetry={() => void lesson.refetch()} />
        )}
      </>
    );
  }
  return <Editor key={id} detail={lesson.data} />;
}
