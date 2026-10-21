import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, type BlockerFunction } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronsDownUp, ChevronsUpDown, Eye, History, Presentation, Save, Trash2, Upload } from 'lucide-react';
import { questionSchema, type Question, type QuestionType, type Visibility } from '@ludora/shared';
import { api, ApiError } from '../../../lib/api.ts';
import { plural, timeAgo } from '../../../lib/format.ts';
import type { SetSummary } from '../../../lib/queries.ts';
import { Button, ButtonLink } from '../../../ui/Button.tsx';
import { Badge, Dialog, EmptyState, PageHeader } from '../../../ui/primitives.tsx';
import { AddQuestion } from './AddQuestion.tsx';
import { DetailsPanel } from './DetailsPanel.tsx';
import { downloadText } from './download.ts';
import { clearDraft, draftKey, readDraft, writeDraft, type StoredDraft } from './draftStore.ts';
import { ErrorSummary, type SummaryItem } from './ErrorSummary.tsx';
import { ExportMenu } from './ExportMenu.tsx';
import { exportCsv, exportJson, fileSlug } from './exporters.ts';
import { handoff } from './handoff.ts';
import { ImportDialog, type ImportChoice } from './ImportDialog.tsx';
import { blankQuestion, buildSetCandidate, fromQuestion, isBlankQuestion, LIMITS, newId, toCandidate, type DraftQuestion, type SetDetails } from './model.ts';
import { domIds, focusSoon } from './parts.tsx';
import { QuestionCard } from './QuestionCard.tsx';
import { editorReducer, type EditorState } from './state.ts';
import { NO_PROBLEMS, problemsFromServer, validateSet, type FieldErrors, type Problems } from './validation.ts';

/** GET /api/sets/:id. */
export interface SetResponse {
  set: SetSummary;
  editable: boolean;
  questions: Question[] | null;
  preview: { id: string; type: QuestionType; prompt: string; choices?: string[] }[] | null;
  typeCounts: Record<string, number>;
}

export interface EditorProps {
  userId: string;
  /** Null for a set that has never been saved. */
  setId: string | null;
  initial: EditorState;
  /** The set's updatedAt when the editor opened, to tell whether a stored draft is older than the saved set. */
  baseUpdatedAt: string | null;
  canPublish: boolean;
  savedVisibility: Visibility | null;
  /** Called after a new set's first save, so the page keeps this editor while the address changes. */
  onCreated?: (set: SetSummary) => void;
}

/** Each question's saved form, cached by draft object: unchanged questions keep their object, so a keystroke re-serialises one question, not all 250. */
const candidateJson = new WeakMap<DraftQuestion, string>();
function questionJson(q: DraftQuestion): string {
  let json = candidateJson.get(q);
  if (json === undefined) {
    json = JSON.stringify(toCandidate(q).question);
    candidateJson.set(q, json);
  }
  return json;
}

/** What "unsaved changes" compares: exactly what saving would send. */
function snapshotOf(doc: { details: SetDetails; questions: DraftQuestion[] }): string {
  return `${JSON.stringify(buildSetCandidate(doc.details, []))}\n${doc.questions.map(questionJson).join('\n')}`;
}

function typeCounts(questions: Question[]): Record<string, number> {
  return questions.reduce<Record<string, number>>((acc, q) => ((acc[q.type] = (acc[q.type] ?? 0) + 1), acc), {});
}

function mergeProblems(a: Problems | undefined, b: Problems | null): Problems {
  if (!b) return a ?? NO_PROBLEMS;
  const base = a ?? NO_PROBLEMS;
  const questions: Record<string, FieldErrors> = { ...base.questions };
  for (const [id, errs] of Object.entries(b.questions)) questions[id] = { ...errs, ...questions[id] };
  const details = { ...b.details, ...base.details };
  const general = [...new Set([...base.general, ...b.general])];
  const count = Object.keys(details).length + general.length + Object.values(questions).reduce((n, e) => n + Object.keys(e).length, 0);
  return { details, questions, general, count };
}

function sameErrors(a: FieldErrors, b: FieldErrors): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Keeps each question's error object the same between renders when its errors have not changed, so unchanged cards skip rendering. */
function useStableErrors(map: Record<string, FieldErrors>): Record<string, FieldErrors> {
  const cache = useRef<Record<string, FieldErrors>>({});
  return useMemo(() => {
    const next: Record<string, FieldErrors> = {};
    for (const [id, errs] of Object.entries(map)) {
      const prev = cache.current[id];
      next[id] = prev && sameErrors(prev, errs) ? prev : errs;
    }
    cache.current = next;
    return next;
  }, [map]);
}

/** The field an error is about, so the summary can take the author straight to it. */
function targetFor(q: DraftQuestion, key: string): string {
  const [head, index, part] = key.split('.');
  const i = index === undefined ? 0 : Number(index);
  switch (head) {
    case 'prompt':
    case 'answer':
    case 'tolerance':
    case 'unit':
    case 'back':
    case 'explanation':
    case 'timeLimit':
    case 'points':
    case 'difficulty':
    case 'tags':
      return domIds.field(q.id, head);
    case 'media':
      return domIds.field(q.id, 'media-alt');
    case 'choices': {
      const c = q.choices[i] ?? q.choices[0];
      if (!c) return domIds.field(q.id, 'type');
      return part === 'media' ? domIds.row(q.id, 'choice', c.id, 'alt') : domIds.row(q.id, 'choice', c.id);
    }
    case 'correct': {
      if (q.type === 'truefalse') return domIds.row(q.id, 'truth', 'true');
      const c = q.choices.find((x) => x.text.trim() || x.media) ?? q.choices[0];
      return c ? domIds.row(q.id, 'correct', c.id) : domIds.field(q.id, 'type');
    }
    case 'accepted': {
      const a = q.accepted[i] ?? q.accepted[0];
      return a ? domIds.row(q.id, 'accepted', a.id) : domIds.field(q.id, 'type');
    }
    case 'items': {
      const item = q.items[i] ?? q.items[0];
      return item ? domIds.row(q.id, 'item', item.id) : domIds.field(q.id, 'type');
    }
    case 'pairs': {
      const p = q.pairs[i] ?? q.pairs[0];
      return p ? domIds.row(q.id, 'pair', p.id, part === 'right' ? 'right' : 'left') : domIds.field(q.id, 'type');
    }
    default:
      return domIds.header(q.id);
  }
}

const DETAIL_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  subject: 'Subject',
  gradeBand: 'Age or year group',
  language: 'Language',
  tags: 'Tags',
  visibility: 'Who can see it',
  cover: 'Cover',
};

export function Editor({ userId, setId, initial, baseUpdatedAt, canPublish, savedVisibility, onCreated }: EditorProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, initial);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(initial));
  const [savedVis, setSavedVis] = useState<Visibility | null>(savedVisibility);
  /** The set's updatedAt as of the last load or save, to tell whether a stored draft is older than the saved set. */
  const [base, setBase] = useState<string | null>(baseUpdatedAt);
  const [showErrors, setShowErrors] = useState(false);
  /** Questions that existed at the last save attempt. Ones added since are not marked until the next attempt. */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [serverProblems, setServerProblems] = useState<Problems | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const key = draftKey(userId, setId);
  const [pendingDraft, setPendingDraft] = useState<StoredDraft | null>(() => {
    const stored = readDraft(key);
    if (!stored) return null;
    if (snapshotOf(stored) === snapshotOf(initial)) {
      clearDraft(key);
      return null;
    }
    return stored;
  });
  const summaryRef = useRef<HTMLDivElement>(null);

  const snapshot = useMemo(() => snapshotOf(state), [state]);
  const dirty = snapshot !== savedSnapshot;

  // Callbacks read the latest values through refs, so they can stay stable for the memoised cards.
  const stateRef = useRef(state);
  const dirtyRef = useRef(dirty);
  const savingRef = useRef(false);
  /** Set just before the editor navigates away on purpose (after creating or deleting), so the leave warning stays quiet. */
  const leaving = useRef(false);
  /** Set while the editor moves itself to a new set's own address after its first save. */
  const relocating = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    dirtyRef.current = dirty;
  });

  const validation = useMemo(() => (showErrors ? validateSet(state.details, state.questions) : null), [showErrors, state.details, state.questions]);
  const problems = useMemo(() => {
    const merged = mergeProblems(validation?.problems, serverProblems);
    const questions = Object.fromEntries(Object.entries(merged.questions).filter(([id]) => checked.has(id)));
    return { ...merged, questions };
  }, [validation, serverProblems, checked]);
  const questionErrors = useStableErrors(problems.questions);

  // Server errors describe what was sent; once the author changes something they are out of date.
  const firstSnapshot = useRef(snapshot);
  useEffect(() => {
    if (snapshot === firstSnapshot.current) return;
    firstSnapshot.current = snapshot;
    setServerProblems(null);
    setServerError(null);
  }, [snapshot]);

  /* ------------------------------ Local draft ------------------------------ */

  const draftNow = useCallback((): StoredDraft => ({ savedAt: Date.now(), baseUpdatedAt: base, details: stateRef.current.details, questions: stateRef.current.questions }), [base]);

  useEffect(() => {
    if (leaving.current) return;
    if (!dirty) {
      // Keep an offered draft until the author restores or discards it.
      if (!pendingDraft) clearDraft(key);
      return;
    }
    const t = window.setTimeout(() => writeDraft(key, { savedAt: Date.now(), baseUpdatedAt: base, details: state.details, questions: state.questions }), 600);
    return () => window.clearTimeout(t);
  }, [state.details, state.questions, dirty, pendingDraft, key, base]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      writeDraft(key, draftNow());
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, key, draftNow]);

  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => !leaving.current && !relocating.current && dirtyRef.current && currentLocation.pathname !== nextLocation.pathname, []);
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    const previous = document.title;
    document.title = `${setId ? 'Edit question set' : 'New question set'} | Ludora`;
    return () => {
      document.title = previous;
    };
  }, [setId]);

  /* ------------------------------- Questions ------------------------------- */

  const announce = useCallback((message: string) => setAnnouncement((prev) => (prev === message ? `${message} ` : message)), []);

  const addQuestion = useCallback((type: QuestionType) => {
    const qs = stateRef.current.questions;
    if (qs.length >= LIMITS.questions) return;
    const id = newId('q', new Set(qs.map((q) => q.id)));
    dispatch({ type: 'add', question: blankQuestion(type, id) });
    focusSoon(domIds.field(id, 'prompt'), 'center');
  }, []);

  const onMove = useCallback(
    (id: string, by: -1 | 1) => {
      const qs = stateRef.current.questions;
      const from = qs.findIndex((q) => q.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= qs.length) return;
      dispatch({ type: 'move', id, by });
      announce(`Question moved to position ${to + 1} of ${qs.length}.`);
      // Stay on the button that was pressed; at either end, its partner.
      const atEnd = to === 0 || to === qs.length - 1;
      focusSoon(domIds.field(id, atEnd ? (by < 0 ? 'down' : 'up') : by < 0 ? 'up' : 'down'));
    },
    [announce],
  );

  const onDuplicate = useCallback(
    (id: string) => {
      const qs = stateRef.current.questions;
      if (qs.length >= LIMITS.questions) return;
      const at = qs.findIndex((q) => q.id === id);
      const copyId = newId('q', new Set(qs.map((q) => q.id)));
      dispatch({ type: 'duplicate', id, newId: copyId });
      announce(`Question ${at + 1} duplicated. The copy is question ${at + 2}.`);
      focusSoon(domIds.field(copyId, 'prompt'), 'center');
    },
    [announce],
  );

  const onRemove = useCallback((id: string) => {
    const qs = stateRef.current.questions;
    const at = qs.findIndex((q) => q.id === id);
    const question = qs[at];
    if (!question) return;
    dispatch({ type: 'remove', id });
    toast(`Question ${at + 1} deleted`, {
      duration: 10_000,
      action: { label: 'Undo', onClick: () => dispatch({ type: 'restore', question, at }) },
    });
    const next = qs[at + 1] ?? qs[at - 1];
    focusSoon(next ? domIds.header(next.id) : 'add-mcq');
  }, []);

  const onDetails = useCallback((patch: Partial<SetDetails>) => dispatch({ type: 'details', patch }), []);

  /* --------------------------------- Import -------------------------------- */

  const applyImport = useCallback((choice: ImportChoice) => {
    const before = stateRef.current;
    const taken = new Set(choice.mode === 'add' ? before.questions.map((q) => q.id) : []);
    const drafts = choice.questions.map((q) => {
      const d = fromQuestion(q);
      if (taken.has(d.id)) d.id = newId('q', taken);
      taken.add(d.id);
      return d;
    });
    const details: Partial<SetDetails> | undefined = choice.details
      ? {
          ...(choice.details.title ? { title: choice.details.title } : {}),
          ...(choice.details.description ? { description: choice.details.description } : {}),
          ...(choice.details.subject ? { subject: choice.details.subject } : {}),
          ...(choice.details.gradeBand ? { gradeBand: choice.details.gradeBand } : {}),
          ...(choice.details.language ? { language: choice.details.language } : {}),
          ...(choice.details.tags ? { tags: choice.details.tags.join(', ') } : {}),
          ...(choice.details.cover ? { cover: choice.details.cover } : {}),
        }
      : undefined;
    const action = { type: 'import', questions: drafts, mode: choice.mode, details, open: drafts.length <= 3 } as const;
    // Undo puts back the set as it was before the import, so it is only offered while nothing else has changed.
    const afterImport = snapshotOf(editorReducer(before, action));
    dispatch(action);
    setImportOpen(false);
    const n = plural(drafts.length, 'question');
    const replacedWork = choice.mode === 'replace' && before.questions.some((q) => !isBlankQuestion(q));
    toast.success(replacedWork ? `Replaced with ${n}` : `Added ${n}`, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (snapshotOf(stateRef.current) !== afterImport) {
            toast.message('The set has changed since that import, so it cannot be undone in one step. Delete the questions you do not want instead.');
            return;
          }
          dispatch({ type: 'reset', state: before });
        },
      },
    });
    const first = drafts[0];
    if (first) focusSoon(domIds.header(first.id), 'center');
  }, []);

  /* --------------------------------- Export -------------------------------- */

  const onExport = useCallback((format: 'json' | 'csv') => {
    const { details, questions } = stateRef.current;
    // Each question as it would be saved (trimmed), or as typed when it is not finished yet.
    let broken = 0;
    const list = questions.map((q) => {
      const candidate = toCandidate(q).question;
      const parsed = questionSchema.safeParse(candidate);
      if (parsed.success) return parsed.data;
      broken++;
      return candidate;
    });
    const name = fileSlug(details.title);
    if (format === 'json') downloadText(`${name}.json`, exportJson(details, list), 'application/json');
    else downloadText(`${name}.csv`, exportCsv(list), 'text/csv');
    if (broken) toast.message(`Downloaded. ${plural(broken, 'question')} still ${broken === 1 ? 'needs' : 'need'} fixing and will not import until fixed.`);
    else toast.success(format === 'json' ? 'Downloaded the Ludora file' : 'Downloaded the spreadsheet');
  }, []);

  /* ---------------------------------- Save --------------------------------- */

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const current = stateRef.current;
    const result = validateSet(current.details, current.questions);
    setShowErrors(true);
    setChecked(new Set(current.questions.map((q) => q.id)));
    setServerError(null);
    setServerProblems(null);
    if (!result.ok) {
      dispatch({ type: 'openMany', ids: Object.keys(result.problems.questions) });
      requestAnimationFrame(() => requestAnimationFrame(() => summaryRef.current?.focus()));
      return;
    }
    const sent = snapshotOf(current);
    const body = result.data;
    savingRef.current = true;
    setSaving(true);
    try {
      if (setId) {
        const res = await api.put<{ set: SetSummary }>(`/api/sets/${setId}`, body);
        setSavedSnapshot(sent);
        setSavedVis(res.set.visibility);
        setBase(res.set.updatedAt);
        setSavedAt(new Date());
        setShowErrors(false);
        clearDraft(key);
        setPendingDraft(null);
        qc.setQueryData<SetResponse>(['set', setId], (old) => (old ? { ...old, set: res.set, questions: body.questions, typeCounts: typeCounts(body.questions) } : old));
        void qc.invalidateQueries({ queryKey: ['sets'] });
        toast.success('Changes saved');
      } else {
        const res = await api.post<{ set: SetSummary }>('/api/sets', body);
        clearDraft(key);
        // This editor carries on as the editor of the saved set: anything typed while saving
        // stays, and still counts as unsaved. Only the address changes.
        setSavedSnapshot(sent);
        setSavedVis(res.set.visibility);
        setBase(res.set.updatedAt);
        setSavedAt(new Date());
        setShowErrors(false);
        setPendingDraft(null);
        qc.setQueryData<SetResponse>(['set', res.set.id], { set: res.set, editable: true, questions: body.questions, preview: null, typeCounts: typeCounts(body.questions) });
        void qc.invalidateQueries({ queryKey: ['sets'] });
        toast.success('Set saved');
        onCreated?.(res.set);
        // If the page does mount a fresh editor for the new address, it starts as this one looked.
        handoff.put(res.set.id, { open: Object.fromEntries(stateRef.current.questions.map((q) => [q.id, Boolean(stateRef.current.open[q.id])])) });
        relocating.current = true;
        void Promise.resolve(navigate(`/sets/${res.set.id}/edit`, { replace: true, preventScrollReset: true })).finally(() => {
          relocating.current = false;
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = Object.keys(err.fields).length ? problemsFromServer(err.fields, current.questions) : null;
        if (fields) {
          setServerProblems(fields);
          dispatch({ type: 'openMany', ids: Object.keys(fields.questions) });
          // The server's own wording for field errors is zod's; the list below says it plainly.
          setServerError('Fix the problems below, then save again.');
        } else {
          setServerError(err.status === 0 ? `${err.message} Your changes are still here and kept on this device.` : err.message);
        }
      } else {
        setServerError('Something went wrong while saving. Your changes are still here; try again.');
      }
      requestAnimationFrame(() => requestAnimationFrame(() => summaryRef.current?.focus()));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [key, navigate, qc, setId, onCreated]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const deleteSet = async () => {
    if (!setId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/sets/${setId}`);
      leaving.current = true;
      clearDraft(key);
      toast.success('Set deleted');
      void qc.invalidateQueries({ queryKey: ['sets'] });
      await navigate('/library', { replace: true });
      qc.removeQueries({ queryKey: ['set', setId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The set could not be deleted. Try again.');
      setDeleting(false);
    }
  };

  /* --------------------------------- Drafts -------------------------------- */

  const restoreDraft = () => {
    if (!pendingDraft) return;
    dispatch({ type: 'reset', state: { details: pendingDraft.details, questions: pendingDraft.questions, open: Object.fromEntries(pendingDraft.questions.map((q) => [q.id, pendingDraft.questions.length <= 3])) } });
    setPendingDraft(null);
    toast.success('Unsaved changes restored');
  };
  const discardDraft = () => {
    clearDraft(key);
    setPendingDraft(null);
  };

  /* ------------------------------- Summaries ------------------------------- */

  const summaryItems = useMemo<SummaryItem[]>(() => {
    const items: SummaryItem[] = [];
    for (const [field, message] of Object.entries(problems.details)) {
      items.push({ key: `d-${field}`, label: DETAIL_LABELS[field] ?? 'Set details', message, target: field === 'visibility' ? domIds.detail(`visibility-${state.details.visibility}`) : domIds.detail(field) });
    }
    for (const message of problems.general) items.push({ key: `g-${message}`, label: 'Questions', message });
    state.questions.forEach((q, i) => {
      const errs = problems.questions[q.id];
      if (!errs) return;
      for (const [k, message] of Object.entries(errs)) items.push({ key: `q-${q.id}-${k}`, label: `Question ${i + 1}`, message, target: targetFor(q, k), questionId: q.id });
    });
    return items;
  }, [problems, state.questions, state.details.visibility]);

  const goTo = useCallback((item: SummaryItem) => {
    if (!item.target) return;
    if (item.questionId) dispatch({ type: 'toggle', id: item.questionId, open: true });
    focusSoon(item.target, 'center');
  }, []);

  const count = state.questions.length;
  const allBlank = state.questions.every(isBlankQuestion);
  const full = count >= LIMITS.questions;
  const openCount = state.questions.filter((q) => state.open[q.id]).length;
  const showSummary = (showErrors && summaryItems.length > 0) || serverError !== null;

  const status = saving
    ? 'Saving'
    : !setId
      ? dirty
        ? 'Not saved yet'
        : 'Give the set a title and add questions, then save.'
      : dirty
        ? 'Unsaved changes'
        : savedAt
          ? `Saved at ${savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : 'All changes saved';

  const staleDraft = pendingDraft && base && pendingDraft.baseUpdatedAt && pendingDraft.baseUpdatedAt !== base;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link to={setId ? `/sets/${setId}` : '/library'} className="font-semibold">
            {setId ? 'Back to the set' : 'All question sets'}
          </Link>
        }
        title={setId ? 'Edit question set' : 'New question set'}
        description="Write questions once and play them in any game mode."
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <ExportMenu onExport={onExport} />
            {setId ? (
              <>
                <ButtonLink to={`/sets/${setId}`} icon={<Eye className="size-4" />}>
                  View
                </ButtonLink>
                <ButtonLink to={`/host?set=${setId}`} icon={<Presentation className="size-4" />}>
                  Host
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {pendingDraft ? (
        <section aria-label="Unsaved changes on this device" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] border border-line-strong bg-surface-2 p-4">
          <History className="size-5 shrink-0 text-link" aria-hidden />
          <p className="min-w-0 flex-1 basis-60 text-sm text-text">
            <span className="font-semibold">Changes you made {timeAgo(new Date(pendingDraft.savedAt))} were not saved.</span>{' '}
            {staleDraft ? 'The set has been saved since then, so restoring them replaces the newer version.' : 'Restore them to carry on where you left off.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={restoreDraft}>
              Restore changes
            </Button>
            <Button size="sm" variant="ghost" onClick={discardDraft}>
              Discard them
            </Button>
          </div>
        </section>
      ) : null}

      {showSummary ? <ErrorSummary ref={summaryRef} items={summaryItems} serverError={serverError} onGo={goTo} /> : null}

      <DetailsPanel details={state.details} errors={problems.details} canPublish={canPublish} savedVisibility={savedVis} autoFocusTitle={!setId && !pendingDraft} onChange={onDetails} />

      <section aria-labelledby="questions-heading" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-heading" className="flex items-center gap-2 font-display text-xl font-bold text-text">
            Questions <Badge tone="violet">{count}</Badge>
          </h2>
          {count > 1 ? (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" icon={<ChevronsUpDown className="size-4" />} disabled={openCount === count} onClick={() => dispatch({ type: 'setAllOpen', open: true })}>
                Expand all
              </Button>
              <Button size="sm" variant="ghost" icon={<ChevronsDownUp className="size-4" />} disabled={openCount === 0} onClick={() => dispatch({ type: 'setAllOpen', open: false })}>
                Collapse all
              </Button>
            </div>
          ) : null}
        </div>
        {count === 0 ? (
          <EmptyState title="No questions yet">Add one below, or import questions from typed text, a spreadsheet or a Ludora file.</EmptyState>
        ) : (
          <ol className="flex min-w-0 flex-col gap-3">
            {state.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                total={count}
                open={Boolean(state.open[q.id])}
                errors={questionErrors[q.id]}
                canDuplicate={!full}
                dispatch={dispatch}
                onMove={onMove}
                onDuplicate={onDuplicate}
                onRemove={onRemove}
              />
            ))}
          </ol>
        )}
        <AddQuestion onAdd={addQuestion} full={full} />
      </section>

      {setId ? (
        <section aria-labelledby="delete-set-heading" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line p-4">
          <div className="min-w-0 flex-1 basis-60">
            <h2 id="delete-set-heading" className="font-display text-lg font-bold text-text">
              Delete this set
            </h2>
            <p className="text-sm text-text-2">Removes it for everyone, along with any class assignments that use it.</p>
          </div>
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
            Delete set
          </Button>
        </section>
      ) : null}

      <div className="sticky bottom-20 z-20 flex items-center gap-3 rounded-[18px] border border-line bg-raised/95 p-3 shadow-[0_8px_30px_rgb(0_0_0/0.25)] backdrop-blur lg:bottom-4">
        <p className="min-w-0 flex-1 text-sm text-text-2">
          <span className="hidden sm:inline">
            <span className="font-semibold text-text">{plural(count, 'question')}</span>
            <span aria-hidden> · </span>
          </span>
          <span role="status">{status}</span>
          {showSummary && summaryItems.length ? (
            <>
              <span aria-hidden> · </span>
              <button type="button" onClick={() => summaryRef.current?.focus()} className="font-semibold text-link underline underline-offset-2">
                {summaryItems.length === 1 ? '1 thing to fix' : `${summaryItems.length} things to fix`}
              </button>
            </>
          ) : null}
        </p>
        <Button variant="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => void save()} aria-keyshortcuts="Control+S Meta+S">
          {saving ? (
            'Saving'
          ) : (
            <>
              <span className="sm:hidden">Save</span>
              <span className="hidden sm:inline">{setId ? 'Save changes' : 'Save set'}</span>
            </>
          )}
        </Button>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} currentCount={count} allBlank={allBlank} hasTitle={state.details.title.trim() !== ''} onImport={applyImport} />

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => {
          if (!o && blocker.state === 'blocked') blocker.reset();
        }}
        size="sm"
        title="Leave without saving?"
        description="Your changes stay on this device, and you can restore them when you come back to this set."
        footer={
          <>
            <Button
              onClick={() => {
                writeDraft(key, draftNow());
                leaving.current = true;
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              Leave
            </Button>
            <Button variant="primary" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
              Keep editing
            </Button>
          </>
        }
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        size="sm"
        title="Delete this set?"
        description="It is removed for everyone you shared it with, and class assignments that use it are removed too. Reports of games already played stay. This cannot be undone."
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>Keep it</Button>
            <Button variant="danger" loading={deleting} onClick={() => void deleteSet()}>
              Delete set
            </Button>
          </>
        }
      />
    </div>
  );
}
