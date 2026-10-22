import { useEffect, useId, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { AI_DRAFT_LEVEL_LABELS, AI_DRAFT_LEVELS, AI_DRAFT_TYPES, QUESTION_TYPE_LABELS, type AiDraftLevel, type AiDraftResponse, type AiDraftType, type Question } from '@ludora/shared';
import { api, ApiError } from '../../../lib/api.ts';
import { plural } from '../../../lib/format.ts';
import { Button } from '../../../ui/Button.tsx';
import { Dialog, Field, Input, Select, Textarea } from '../../../ui/primitives.tsx';
import { ERROR_TEXT } from './parts.tsx';

const COUNTS = [5, 10, 15] as const;

interface Form {
  topic: string;
  level: AiDraftLevel;
  count: number;
  types: AiDraftType[];
  notes: string;
}

const START: Form = { topic: '', level: '9-11', count: 10, types: ['mcq', 'truefalse'], notes: '' };

/** The right answer, the way a teacher checks it at a glance. */
function answerOf(q: Question): string {
  switch (q.type) {
    case 'truefalse':
      return `Answer: ${q.correct ? 'True' : 'False'}`;
    case 'short':
      return `Accepted: ${q.accepted.join(', ')}`;
    case 'numeric':
      return `Answer: ${q.answer}${q.unit ? ` ${q.unit}` : ''}${q.tolerance ? ` (give or take ${q.tolerance})` : ''}`;
    default:
      return '';
  }
}

function Draft({ q, picked, onPick }: { q: Question; picked: boolean; onPick: (v: boolean) => void }) {
  const id = useId();
  return (
    <li className={`flex gap-3 rounded-[14px] border p-3 ${picked ? 'border-line-strong bg-surface-2' : 'border-line opacity-70'}`}>
      <input id={id} type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--lantern)]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="font-semibold break-words text-text">
          {q.prompt}
          <span className="sr-only">, {QUESTION_TYPE_LABELS[q.type]}</span>
        </label>
        {q.type === 'mcq' ? (
          <ul className="flex flex-col gap-0.5 text-sm" aria-label="Choices">
            {q.choices.map((c) => (
              <li key={c.id} className={`flex items-start gap-1.5 break-words ${c.id === q.correct ? 'font-semibold text-text' : 'text-text-2'}`}>
                {c.id === q.correct ? <Check className="mt-0.5 size-4 shrink-0 text-glim" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
                {c.text}
                {c.id === q.correct ? <span className="sr-only">(correct)</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-semibold break-words text-text">{answerOf(q)}</p>
        )}
        {q.explanation ? <p className="text-sm break-words text-text-2">{q.explanation}</p> : null}
        <p className="text-xs text-text-3">{QUESTION_TYPE_LABELS[q.type]}</p>
      </div>
    </li>
  );
}

/**
 * Draft questions with AI: describe a topic, get drafts back, pick the ones
 * to keep. Kept drafts join the set like an import, so they are edited and
 * saved like any other question; nothing is saved from here.
 */
export function AiDraftDialog({
  open,
  onOpenChange,
  language,
  remaining,
  limit,
  room,
  onAdd,
  onSettled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The set's language; drafts are written in it. */
  language: string;
  /** Requests left today, and the daily allowance. */
  remaining: number;
  limit: number;
  /** How many more questions the set can hold. */
  room: number;
  onAdd: (questions: Question[]) => void;
  /** After each request, successful or not, so the allowance can be read again. */
  onSettled: () => void;
}) {
  const [form, setForm] = useState<Form>(START);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AiDraftResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const typesId = useId();

  // Drafts not added yet, and what was typed, survive closing the dialog: asking again would use up a request.
  useEffect(() => {
    if (!open) return;
    setProblem(null);
    setFieldErrors({});
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleType = (t: AiDraftType, on: boolean) => set('types', on ? AI_DRAFT_TYPES.filter((x) => x === t || form.types.includes(x)) : form.types.filter((x) => x !== t));

  const draft = async () => {
    setProblem(null);
    setFieldErrors({});
    if (form.topic.trim().length < 3) return setFieldErrors({ topic: 'Say what the questions should be about.' });
    if (!form.types.length) return setFieldErrors({ types: 'Choose at least one kind of question.' });
    setBusy(true);
    try {
      const res = await api.post<AiDraftResponse>('/api/ai/drafts', { topic: form.topic, level: form.level, count: form.count, types: form.types, language, ...(form.notes.trim() ? { notes: form.notes } : {}) });
      setResult(res);
      setPicked(new Set(res.questions.slice(0, Math.max(0, room)).map((q) => q.id)));
    } catch (err) {
      if (err instanceof ApiError) {
        setProblem(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else setProblem('The drafts did not arrive. Check your connection and try again.');
    } finally {
      setBusy(false);
      onSettled();
    }
  };

  const chosen = result?.questions.filter((q) => picked.has(q.id)) ?? [];
  const tooMany = chosen.length > room;
  const pick = (id: string, on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      size="lg"
      title="Draft questions with AI"
      description="Claude drafts questions from your topic. Check each one before you use it: AI can get facts wrong."
      footer={
        result ? (
          <>
            <Button onClick={() => setResult(null)}>Change the request</Button>
            <Button
              variant="primary"
              disabled={!chosen.length || tooMany}
              onClick={() => {
                onAdd(chosen);
                setResult(null);
              }}
            >
              {chosen.length ? `Add ${plural(chosen.length, 'question')}` : 'Choose questions to add'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Sparkles className="size-4" aria-hidden />} loading={busy} disabled={remaining <= 0} onClick={() => void draft()}>
              Draft questions
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-2" aria-live="polite">
            {plural(result.questions.length, 'draft')} ready. Untick any you do not want; you can edit the rest in the set.
            {result.dropped ? ` ${plural(result.dropped, 'draft')} broke Ludora's question rules and ${result.dropped === 1 ? 'was' : 'were'} left out.` : ''}
          </p>
          {tooMany ? (
            <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
              The set has room for {plural(Math.max(0, room), 'more question')}. Untick some drafts first.
            </p>
          ) : null}
          <ul className="flex flex-col gap-2" aria-label="Drafts">
            {result.questions.map((q) => (
              <Draft key={q.id} q={q} picked={picked.has(q.id)} onPick={(on) => pick(q.id, on)} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Topic" hint="For example: the water cycle, or adding fractions with the same denominator." error={fieldErrors.topic}>
            {(p) => <Input {...p} value={form.topic} maxLength={200} onChange={(e) => set('topic', e.target.value)} disabled={busy} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Players" error={fieldErrors.level}>
              {(p) => (
                <Select {...p} value={form.level} onChange={(e) => set('level', e.target.value as AiDraftLevel)} disabled={busy}>
                  {AI_DRAFT_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {AI_DRAFT_LEVEL_LABELS[l]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="How many questions" error={fieldErrors.count}>
              {(p) => (
                <Select {...p} value={form.count} onChange={(e) => set('count', Number(e.target.value))} disabled={busy}>
                  {COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <fieldset className="flex flex-col gap-1.5" aria-describedby={fieldErrors.types ? `${typesId}-err` : undefined}>
            <legend className="mb-1.5 text-sm font-semibold text-text">Kinds of question</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AI_DRAFT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2.5 text-sm text-text">
                  <input type="checkbox" checked={form.types.includes(t)} onChange={(e) => toggleType(t, e.target.checked)} disabled={busy} className="size-4 shrink-0 accent-[var(--lantern)]" />
                  {QUESTION_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
            {fieldErrors.types ? (
              <p id={`${typesId}-err`} className={`text-xs font-semibold ${ERROR_TEXT}`}>
                {fieldErrors.types}
              </p>
            ) : null}
          </fieldset>
          <Field
            label="Notes for Claude (optional)"
            hint="Anything to include or avoid. Your topic and notes are sent to Anthropic to write the drafts, so leave out pupils' names and personal details."
            error={fieldErrors.notes}
          >
            {(p) => <Textarea {...p} value={form.notes} maxLength={500} rows={3} onChange={(e) => set('notes', e.target.value)} disabled={busy} />}
          </Field>
          <p className="text-sm text-text-2" aria-live="polite">
            {busy ? 'Drafting. This can take up to a minute.' : remaining > 0 ? `You can ask for drafts ${plural(remaining, 'more time')} today (${limit} a day).` : `You have used today's ${limit} requests. Try again tomorrow.`}
          </p>
          {problem ? (
            <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
              {problem}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
