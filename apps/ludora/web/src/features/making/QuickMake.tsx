import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Pencil, RotateCcw, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { SUBJECT_LABELS, SUBJECTS, type AiDraftStatus, type Question, type Subject } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { plural } from '../../lib/format.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { Badge, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Tabs, TabPanel, Textarea } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { SetButton } from '../host/pickers.tsx';
import { AiDraftDialog } from '../sets/editor/AiDraftDialog.tsx';
import { DRILL_SIGN, mathsDrill, type DrillOp } from '../sets/editor/templates.ts';
import { errorText, usePageTitle } from '../reports/reportUi.tsx';
import { editSuggestion, KIND_LABEL, mainAnswer, suggestFromText, type Suggestion } from './fromText.ts';
import { answerText } from './questionText.ts';
import { makingKeys, type DraftBody } from './data.ts';
import { SuggestedGames } from './SuggestedGames.tsx';

/*
 * /make/quick: from an idea to a game in a minute. Paste notes (or pick a ready-made set, or
 * make maths practice), keep the questions you like, name it, and get the games that suit it.
 * The questions are made in code (fromText.ts) with no AI; where the AI helper is set up, it is
 * offered beside them. Work in progress is saved as a draft on the server (?draft=<id>), so it
 * carries on from any device.
 */

type Item = Suggestion & { kept: boolean };
type Start = 'notes' | 'topic' | 'maths';

const EXAMPLE = `Cells
A cell is the smallest unit of life that can live on its own.
The nucleus controls what happens in the cell.
Mitochondria release energy from food in respiration.
Plant cells have a cell wall made of cellulose.

Stages of mitosis in order:
prophase
metaphase
anaphase
telophase

Animal cell: nucleus, cell membrane, cytoplasm
Plant cell only: cell wall, chloroplast, vacuole`;

function itemsFrom(questions: Question[]): Item[] {
  return questions.map((q) => ({ id: q.id, kind: 'quick', from: '', question: q, kept: true }));
}

/* --------------------------------- one suggestion --------------------------------- */

function SuggestionCard({ item, n, onChange }: { item: Item; n: number; onChange: (next: Item | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(item.question.prompt);
  const answer0 = mainAnswer(item.question);
  const [answer, setAnswer] = useState(answer0 ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const q = item.question;
  const save = () => {
    const r = editSuggestion(q, prompt, answer0 === null ? null : answer);
    if (typeof r === 'string') return setProblem(r);
    setProblem(null);
    setEditing(false);
    onChange({ ...item, question: r, kept: true });
  };
  return (
    <li className={`flex flex-col gap-2 rounded-[var(--radius-m)] border p-3.5 ${item.kept ? 'border-line bg-raised' : 'border-dashed border-line-strong bg-sunken'}`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        {item.from || item.kind !== 'quick' ? <Badge>{KIND_LABEL[item.kind]}</Badge> : null}
        {!item.kept ? <Badge tone="amber">Left out</Badge> : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Field label={q.type === 'blanks' ? `Instruction for question ${n}` : `Question ${n}`} error={problem ?? undefined}>
            {(p) => <Textarea {...p} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />}
          </Field>
          {answer0 !== null ? (
            <Field label={q.type === 'blanks' ? 'Sentence, with the gap in [square brackets]' : 'Answer'}>{(p) => <Input {...p} value={answer} onChange={(e) => setAnswer(e.target.value)} />}</Field>
          ) : (
            <p className="text-sm text-text-2">Change the rest of this question in the set editor once it is saved.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={save}>
              Save the change
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(false);
                setProblem(null);
                setPrompt(q.prompt);
                setAnswer(answer0 ?? '');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p id={`${id}-title`} className="font-semibold break-words">
            <span className="sr-only">Question {n}: </span>
            {q.type === 'blanks' ? q.text.replace(/\[([^\]]*)\]/g, '_____') : q.prompt}
          </p>
          <p className="text-sm break-words text-text-2">
            <span className="font-semibold text-text">Answer:</span> {answerText(q)}
          </p>
          {item.from ? <p className="text-xs break-words text-text-2">From: “{item.from.length > 140 ? `${item.from.slice(0, 139)}…` : item.from}”</p> : null}
          <div className="flex flex-wrap gap-2">
            {item.kept ? (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange({ ...item, kept: false })} aria-label={`Leave out question ${n}`}>
                Leave out
              </Button>
            ) : (
              <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => onChange({ ...item, kept: true })} aria-label={`Keep question ${n}`}>
                Keep
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(true)} aria-label={`Change question ${n}`}>
              Change
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/* --------------------------------- ready-made sets --------------------------------- */

function TopicPicker({ onPicked }: { onPicked: (set: { id: string; title: string }) => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const sets = useQuery({ queryKey: ['sets', { scope: 'official', q, make: true }], queryFn: ({ signal }) => api.get<{ sets: SetSummary[] }>(`/api/sets?scope=official&pageSize=24${q ? `&q=${encodeURIComponent(q)}` : ''}`, signal), placeholderData: (prev) => prev });
  const copy = async (s: SetSummary) => {
    setBusy(s.id);
    try {
      const r = await api.post<{ set: { id: string; title: string } }>(`/api/sets/${s.id}/copy`);
      toast.success(`“${r.set.title}” is now in your sets`);
      onPicked(r.set);
    } catch (err) {
      toast.error(errorText(err, 'The set was not copied. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="relative max-w-md">
        <span className="sr-only">Search the ready-made sets</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a topic: fractions, rivers, French" className="pl-9" />
      </label>
      {sets.isError ? (
        <ErrorNotice message="The ready-made sets could not be loaded." onRetry={() => void sets.refetch()} />
      ) : sets.isPending ? (
        <Skeleton className="h-32" />
      ) : sets.data.sets.length === 0 ? (
        <EmptyState title="No sets match">Try another word, or paste your own notes instead.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy={busy !== null || undefined}>
          {sets.data.sets.map((s) => (
            <li key={s.id}>
              <SetButton set={s} detail={busy === s.id ? ', copying…' : ''} onPick={() => (busy ? undefined : void copy(s))} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-text-2">Picking one copies it into your own sets, so you can change it without changing the original.</p>
    </div>
  );
}

/* ---------------------------------- maths practice ---------------------------------- */

function MathsMaker({ onMade }: { onMade: (qs: Question[]) => void }) {
  const [ops, setOps] = useState<DrillOp[]>(['multiply']);
  const [min, setMin] = useState(2);
  const [max, setMax] = useState(12);
  const [count, setCount] = useState(12);
  const [as, setAs] = useState<'numeric' | 'mcq'>('numeric');
  const [problem, setProblem] = useState<string | null>(null);
  const make = () => {
    if (!ops.length) return setProblem('Choose at least one kind of sum.');
    if (!(min >= 0 && max >= min && max <= 1000)) return setProblem('Choose numbers from 0 to 1,000, the smallest first.');
    const qs = mathsDrill({ ops, min, max, count: Math.max(1, Math.min(50, count)), as });
    if (!qs.length) return setProblem('Those numbers give no sums. Make the range wider.');
    setProblem(null);
    onMade(qs);
  };
  const toggle = (op: DrillOp) => setOps((o) => (o.includes(op) ? o.filter((x) => x !== op) : [...o, op]));
  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 font-semibold">Sums</legend>
        <div className="flex flex-wrap gap-2">
          {(['add', 'subtract', 'multiply', 'divide'] as DrillOp[]).map((op) => (
            <button key={op} type="button" aria-pressed={ops.includes(op)} onClick={() => toggle(op)} className={`h-11 min-w-16 rounded-full px-4 font-display text-xl font-bold ${ops.includes(op) ? 'chip-on' : 'border border-line bg-raised text-text hover:bg-surface-2'}`}>
              <span aria-hidden>{DRILL_SIGN[op]}</span>
              <span className="sr-only">{op === 'add' ? 'Adding' : op === 'subtract' ? 'Taking away' : op === 'multiply' ? 'Times' : 'Dividing'}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid max-w-xl grid-cols-3 gap-3">
        <Field label="Numbers from">{(p) => <Input {...p} type="number" inputMode="numeric" value={min} onChange={(e) => setMin(Number(e.target.value))} />}</Field>
        <Field label="Up to">{(p) => <Input {...p} type="number" inputMode="numeric" value={max} onChange={(e) => setMax(Number(e.target.value))} />}</Field>
        <Field label="Questions">{(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />}</Field>
      </div>
      <ToggleChips<'numeric' | 'mcq'> value={as} onChange={setAs} label="How players answer" options={[{ value: 'numeric', label: 'Type the answer' }, { value: 'mcq', label: 'Pick from four' }]} />
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-rose">
          {problem}
        </p>
      ) : null}
      <div>
        <Button variant="primary" icon={<Sparkles className="size-4" aria-hidden />} onClick={make}>
          Make the sums
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------- page --------------------------------------- */

export default function QuickMake() {
  usePageTitle('Make a set from your notes');
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const draftParam = params.get('draft');
  const start0 = params.get('start');
  const [start, setStart] = useState<Start>(start0 === 'topic' || start0 === 'maths' ? start0 : 'notes');
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject>('general');
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [aiOpen, setAiOpen] = useState(false);
  const restored = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const user = me.data?.user;
  const signedIn = Boolean(user && !user.isGuest);
  const mayDraftAi = Boolean(signedIn && (user?.accountType === 'teacher' || me.data?.permissions.includes('sets.publish_public') || me.data?.permissions.includes('staff.access')));
  const ai = useQuery({ queryKey: ['ai-drafts-status'], queryFn: () => api.get<AiDraftStatus>('/api/ai/drafts/status'), enabled: mayDraftAi, staleTime: 60_000, retry: false });

  // A draft from the Make page: carry on where it stopped.
  const draft = useQuery({ queryKey: makingKeys.draft(draftParam ?? ''), queryFn: () => api.get<{ draft: { id: string; body: DraftBody } }>(`/api/making/drafts/${draftParam}`), enabled: Boolean(draftParam) && signedIn && !restored.current, retry: false });
  useEffect(() => {
    const d = draft.data?.draft;
    if (!d || restored.current) return;
    restored.current = true;
    setText(d.body.text);
    setTitle(d.body.title);
    if (d.body.subject) setSubject(d.body.subject);
    if (d.body.questions.length) setItems(itemsFrom(d.body.questions));
    if (d.body.step === 'done' && d.body.setId) setSaved({ id: d.body.setId, title: d.body.title });
  }, [draft.data]);

  const kept = useMemo(() => (items ?? []).filter((i) => i.kept), [items]);
  const step: DraftBody['step'] = saved ? 'done' : items ? 'choose' : 'paste';

  // Save the draft on the server a moment after each change, once there is something worth keeping.
  const body: DraftBody = { title: title.trim().slice(0, 80), subject, text: text.slice(0, 20_000), questions: kept.slice(0, 250).map((k) => k.question), step, setId: saved?.id ?? null };
  const bodyKey = JSON.stringify(body);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || (draftParam && !restored.current)) return;
    // Once saved as a set the draft has done its job (the set is in Carry on); nothing more to keep.
    if (!items || saved) return;
    if (lastSaved.current === bodyKey) return;
    const t = setTimeout(async () => {
      setDraftState('saving');
      try {
        if (draftId) await api.put(`/api/making/drafts/${draftId}`, JSON.parse(bodyKey));
        else {
          const r = await api.post<{ draft: { id: string } }>('/api/making/drafts', JSON.parse(bodyKey));
          // This page made the draft: what is on screen is newer than anything to restore.
          restored.current = true;
          setDraftId(r.draft.id);
          setParams((p) => {
            const next = new URLSearchParams(p);
            next.set('draft', r.draft.id);
            next.delete('start');
            return next;
          }, { replace: true });
        }
        lastSaved.current = bodyKey;
        setDraftState('saved');
        void qc.invalidateQueries({ queryKey: makingKeys.overview });
      } catch {
        setDraftState('failed');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [bodyKey, signedIn, items, saved, draftId, draftParam, setParams, qc]);

  const focusHeading = () => requestAnimationFrame(() => heading.current?.focus());

  const read = () => {
    const r = suggestFromText(text);
    if (!r.suggestions.length) {
      setUnread(r.unread);
      toast.error('No questions could be made from that. Try one fact a line, or a word and its meaning on each line.');
      return;
    }
    setItems(r.suggestions.map((s) => ({ ...s, kept: true })));
    setUnread(r.unread);
    if (r.title && !title) setTitle(r.title);
    focusHeading();
  };

  const addQuestions = (qs: Question[], kind: Suggestion['kind'] = 'quick') => {
    const base = Date.now().toString(36);
    setItems((cur) => [...(cur ?? []), ...qs.map((q, i) => ({ id: `${q.id}-${base}${i}`, kind, from: '', question: { ...q, id: `${q.id}x${base}${i}`.slice(0, 40) }, kept: true }))]);
    focusHeading();
  };

  const saveSet = async () => {
    if (!title.trim()) {
      setTitleError('Give the set a name.');
      document.getElementById('quick-title')?.focus();
      return;
    }
    if (!kept.length) return toast.error('Keep at least one question.');
    setTitleError(null);
    setSaving(true);
    try {
      const questions = kept.slice(0, 250).map((k, i) => ({ ...k.question, id: `q${i + 1}` }));
      const r = await api.post<{ set: { id: string; title: string } }>('/api/sets', { title: title.trim().slice(0, 80), subject, visibility: 'private', questions });
      setSaved(r.set);
      if (draftId) {
        void api.delete(`/api/making/drafts/${draftId}`).catch(() => {});
        setDraftId(null);
        setDraftState('idle');
        void qc.invalidateQueries({ queryKey: makingKeys.overview });
      }
      toast.success(`Saved “${r.set.title}” with ${plural(questions.length, 'question')}`);
      void qc.invalidateQueries({ queryKey: ['sets'] });
      focusHeading();
    } catch (err) {
      toast.error(errorText(err, 'The set was not saved. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (me.isLoading || (draftParam && draft.isPending && signedIn && !restored.current)) return <Skeleton className="h-60" />;
  if (!signedIn) {
    return (
      <>
        <PageHeader title="Make a set from your notes" />
        <EmptyState title="Sign in to make a set" action={<ButtonLink to="/signin?next=/make/quick" variant="primary">Sign in</ButtonLink>}>
          Your sets and drafts are kept with your account.
        </EmptyState>
      </>
    );
  }
  if (draftParam && draft.isError) {
    return (
      <>
        <PageHeader title="Make a set from your notes" />
        <EmptyState title="That draft is not here" action={<ButtonLink to="/make">Back to Make</ButtonLink>}>
          It may have been thrown away, or it belongs to another account.
        </EmptyState>
      </>
    );
  }

  const draftNote = draftState === 'saving' ? 'Saving your draft…' : draftState === 'saved' ? 'Draft saved. Carry on from the Make page on any device.' : draftState === 'failed' ? 'Your draft could not be saved just now. Your work is still on this page.' : '';

  return (
    <>
      <PageHeader
        eyebrow={<Link to="/make">Make</Link>}
        title={saved ? 'Play it' : items ? 'Keep the questions you like' : 'Make a set from your notes'}
        description={saved ? `“${saved.title}” is saved in your sets. These games suit it best.` : items ? 'Leave out what you do not want and change anything that is not quite right. Nothing is saved as a set until you say so.' : 'Paste what you have. Questions are made from it straight away, in this browser, for you to check.'}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {draftNote}
      </p>
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        {saved ? 'Suggested games' : items ? `${plural(kept.length, 'question')} kept of ${items.length}` : 'What do you have?'}
      </h2>

      {saved ? (
        <Panel className="p-5 sm:p-6" aria-label="Suggested games">
          <SuggestedGames setId={saved.id} title={saved.title} />
          <div className="mt-5 border-t border-line pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                // A fresh start: a new draft is made once there is something in it.
                setSaved(null);
                setItems(null);
                setText('');
                setTitle('');
                setUnread([]);
                setDraftId(null);
                setDraftState('idle');
                lastSaved.current = null;
                restored.current = true;
                navigate('/make/quick');
                focusHeading();
              }}
            >
              Make another set
            </Button>
          </div>
        </Panel>
      ) : items ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Questions">
            {unread.length ? (
              <details className="mb-3 rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm">
                <summary className="cursor-pointer font-semibold">{plural(unread.length, 'line')} could not be made into a question</summary>
                <ul className="mt-2 list-disc pl-5 text-text-2">
                  {unread.slice(0, 20).map((u, i) => (
                    <li key={i} className="break-words">
                      {u}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Try one fact a sentence, “word - meaning”, or “question = answer”.</p>
              </details>
            ) : null}
            <ol className="flex flex-col gap-2.5">
              {items.map((it, i) => (
                <SuggestionCard key={it.id} item={it} n={i + 1} onChange={(next) => setItems((cur) => (cur ?? []).flatMap((x) => (x.id === it.id ? (next ? [next] : []) : [x])))} />
              ))}
            </ol>
          </section>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-label="Save as a set">
            <Panel className="flex flex-col gap-3 p-4">
              <p className="font-display text-2xl font-bold">{plural(kept.length, 'question')} kept</p>
              <Field label="Name of the set" error={titleError ?? undefined} id="quick-title">
                {(p) => <Input {...p} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Year 8 cells" />}
              </Field>
              <Field label="Subject">
                {(p) => (
                  <Select {...p} value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {SUBJECT_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button variant="primary" size="lg" icon={<Check className="size-5" aria-hidden />} loading={saving} onClick={() => void saveSet()} disabled={!kept.length}>
                Save and choose a game
              </Button>
              <p className="text-xs text-text-3">Saved as a private set. Only you can see it until you share it.</p>
              {draftNote ? <p className="text-xs text-text-2">{draftNote}</p> : null}
            </Panel>
            <Panel className="flex flex-col gap-2 p-4">
              <p className="font-semibold">Add more</p>
              <Button size="sm" onClick={() => setItems(null)}>
                Back to your notes
              </Button>
              {ai.data?.available ? (
                <Button size="sm" icon={<Wand2 className="size-4" aria-hidden />} onClick={() => setAiOpen(true)}>
                  Draft more with AI
                </Button>
              ) : null}
            </Panel>
          </aside>
        </div>
      ) : (
        <Tabs
          value={start}
          onValueChange={(v) => setStart(v as Start)}
          label="What to make the set from"
          items={[
            { value: 'notes', label: 'Your notes' },
            { value: 'topic', label: 'A ready-made set' },
            { value: 'maths', label: 'Maths practice' },
          ]}
        >
          <TabPanel value="notes">
            <Panel className="flex flex-col gap-3 p-4 sm:p-5">
              <Field
                label="Notes, a word list or a table"
                hint="One fact a line works best. Lines like “word - meaning”, “Mammals: whale, bat”, a numbered list, or a table copied from a spreadsheet each become a different kind of question."
              >
                {(p) => <Textarea {...p} rows={12} value={text} maxLength={20_000} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />}
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={<Sparkles className="size-4" aria-hidden />} onClick={read} disabled={!text.trim()}>
                  Make questions
                </Button>
                {!text.trim() ? (
                  <Button variant="ghost" onClick={() => setText(EXAMPLE)}>
                    Try an example
                  </Button>
                ) : null}
                {ai.data?.available ? (
                  <Button icon={<Wand2 className="size-4" aria-hidden />} onClick={() => setAiOpen(true)}>
                    Draft with AI instead
                  </Button>
                ) : null}
              </div>
              {unread.length && !items ? (
                <p role="alert" className="text-sm text-text-2">
                  Nothing in that could be made into a question. Try one fact a sentence, “word - meaning”, or “question = answer”.
                </p>
              ) : null}
            </Panel>
          </TabPanel>
          <TabPanel value="topic">
            <Panel className="p-4 sm:p-5">
              <TopicPicker
                onPicked={(s) => {
                  setTitle(s.title);
                  setSaved(s);
                  focusHeading();
                }}
              />
            </Panel>
          </TabPanel>
          <TabPanel value="maths">
            <Panel className="p-4 sm:p-5">
              <MathsMaker
                onMade={(qs) => {
                  if (!title) setTitle('Maths practice');
                  setSubject('math');
                  addQuestions(qs, 'number');
                }}
              />
            </Panel>
          </TabPanel>
        </Tabs>
      )}
      {ai.data?.available ? (
        <AiDraftDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          language="en"
          remaining={ai.data.remainingToday}
          limit={ai.data.limitToday}
          room={250 - (items?.length ?? 0)}
          onAdd={(qs) => {
            addQuestions(qs);
            setAiOpen(false);
          }}
          onSettled={() => void qc.invalidateQueries({ queryKey: ['ai-drafts-status'] })}
        />
      ) : null}
    </>
  );
}
