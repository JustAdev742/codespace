import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, RotateCcw, Sparkles, X } from 'lucide-react';
import type { AiModelOption, AiStatus } from '@ludora/shared';
import { ApiError } from '../../lib/api.ts';
import { Button } from '../../ui/Button.tsx';
import { Select } from '../../ui/primitives.tsx';
import { allowanceText, chosenModel, readModelChoice, saveModelChoice, useAiTask, useRunAiTask, type ModelChoice } from './aiData.ts';

/*
 * The AI helper: a button and a panel any making tool can drop in with one
 * line, given a task id and the tool's current fields. The suggestion shows
 * beside what the person has, with Accept, Try again and Discard. Nothing is
 * written into anyone's work until they press Accept. Absent when the server
 * says this person may not use the task.
 */

const ERROR_TEXT = 'text-[color-mix(in_oklab,var(--ember)_68%,var(--text))]';

export interface AiHelperProps<O> {
  /** A registered task id, such as "question.explain". */
  task: string;
  /** The button's words, such as "Write the explanation". */
  label: string;
  /** The panel's heading; the label when left out. */
  title?: string;
  /** The task's fields, read at the moment of asking. */
  input: () => unknown;
  /** Extra choices to make before asking (an age group, a set). With these the panel waits for Suggest. */
  fields?: ReactNode;
  /** True when the task can be asked; a string says what is missing. */
  ready?: true | string;
  /** What the person has now, shown beside the suggestion. Leave out for something new. */
  current?: ReactNode;
  renderSuggestion: (output: O) => ReactNode;
  onAccept: (output: O) => void;
  acceptLabel?: string;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'ghost';
  className?: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | {
      kind: 'done';
      output: unknown;
      model: AiModelOption;
      removed: number;
      dropped: number;
    }
  | { kind: 'failed'; message: string };

export function AiHelper<O>(props: AiHelperProps<O>) {
  const status = useAiTask(props.task);
  if (!status) return null;
  return <Helper {...props} status={status} />;
}

/** The models on offer, by plain name, and whether another may answer when the chosen one is busy. Remembered in this browser. */
export function ModelPicker({ status, choice, onChange, disabled }: { status: AiStatus; choice: ModelChoice; onChange: (c: ModelChoice) => void; disabled: boolean }) {
  const id = useId();
  if (status.models.length < 2) return null;
  const value = chosenModel(status, choice) ?? status.models[0]!.id;
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-xs font-semibold text-text-2">
          Model
        </label>
        <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange({ ...choice, model: e.target.value })} className="h-10 w-full max-w-[18rem] min-w-0 sm:w-64">
          {status.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.provider})
            </option>
          ))}
        </Select>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={choice.fallback} disabled={disabled} onChange={(e) => onChange({ ...choice, fallback: e.target.checked })} className="size-5 shrink-0 accent-[var(--lantern)]" />
        If it is busy, let another model answer
      </label>
    </div>
  );
}

function Helper<O>({ task, label, title, input, fields, ready = true, current, renderSuggestion, onAccept, acceptLabel = 'Accept', size = 'sm', variant = 'secondary', className = '', status }: AiHelperProps<O> & { status: AiStatus }) {
  const run = useRunAiTask();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [choice, setChoice] = useState<ModelChoice>(readModelChoice);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const headingId = useId();
  const asking = phase.kind === 'asking';
  const usedUp = status.allowance.remaining <= 0;

  const ask = async () => {
    if (ready !== true || usedUp) return;
    setPhase({ kind: 'asking' });
    try {
      const res = await run<O>(task, input(), choice);
      setPhase({
        kind: 'done',
        output: res.output,
        model: res.model,
        removed: res.removed,
        dropped: res.dropped,
      });
    } catch (err) {
      setPhase({
        kind: 'failed',
        message: err instanceof ApiError ? err.message : 'The suggestion did not arrive. Check your connection and try again.',
      });
    }
  };

  const close = () => {
    setOpen(false);
    setPhase({ kind: 'idle' });
    requestAnimationFrame(() => button.current?.focus());
  };

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);

  const start = () => {
    setOpen(true);
    // With nothing to choose first, opening asks straight away.
    if (!fields && ready === true && !usedUp) void ask();
  };

  const changeChoice = (c: ModelChoice) => {
    setChoice(c);
    saveModelChoice(c);
  };

  const done = phase.kind === 'done' ? phase : null;
  const asker = status.models.find((m) => m.id === chosenModel(status, choice)) ?? status.models[0];

  return (
    <div className={`min-w-0 ${className}`}>
      <Button ref={button} size={size} variant={variant} icon={<Sparkles className="size-4" aria-hidden />} aria-expanded={open} aria-controls={open ? panelId : undefined} disabled={open && asking} onClick={() => (open ? close() : start())}>
        {label}
      </Button>
      {open ? (
        <section
          id={panelId}
          aria-labelledby={headingId}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !asking) {
              e.stopPropagation();
              close();
            }
          }}
          className="mt-2 flex min-w-0 flex-col gap-3 rounded-[var(--radius-m)] border border-lantern/70 bg-surface-2 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 id={headingId} ref={heading} tabIndex={-1} className="flex items-center gap-2 font-display text-lg leading-tight font-bold text-text outline-none">
              <Sparkles className="size-4 shrink-0 text-lantern" aria-hidden />
              {title ?? label}
            </h3>
            <span className="sr-only">Nothing changes until you press {acceptLabel}.</span>
          </div>
          {fields ? <div className="flex min-w-0 flex-col gap-3">{fields}</div> : null}
          <ModelPicker status={status} choice={choice} onChange={changeChoice} disabled={asking} />

          <div aria-live="polite" className="min-w-0">
            {asking ? <p className="text-sm text-text-2">Asking {asker?.label ?? 'the AI'}. This can take a few seconds.</p> : null}
            {done ? (
              <div className="flex min-w-0 flex-col gap-2">
                <div className={`grid min-w-0 gap-3 ${current !== undefined ? 'sm:grid-cols-2' : ''}`}>
                  {current !== undefined ? (
                    <div className="min-w-0 rounded-[var(--radius-s)] border border-line bg-raised p-2.5">
                      <p className="mb-1 text-xs font-semibold text-text-3">What you have</p>
                      <div className="text-sm break-words text-text-2">{current}</div>
                    </div>
                  ) : null}
                  <div className="min-w-0 rounded-[var(--radius-s)] border border-dashed border-lantern bg-raised p-2.5">
                    <p className="mb-1 text-xs font-semibold text-text-3">Suggestion</p>
                    <div className="text-sm break-words text-text">{renderSuggestion(done.output as O)}</div>
                  </div>
                </div>
                <p className="text-xs text-text-2">
                  Suggested by {done.model.label} ({done.model.provider}). Check it before you use it: AI can get facts wrong.
                  {done.removed ? ` We took out ${done.removed === 1 ? 'an email address or phone number' : `${done.removed} email addresses or phone numbers`} before sending.` : ''}
                  {done.dropped ? ` ${done.dropped === 1 ? 'One part' : `${done.dropped} parts`} broke Ludora's rules and ${done.dropped === 1 ? 'was' : 'were'} left out.` : ''}
                </p>
              </div>
            ) : null}
          </div>
          {phase.kind === 'failed' ? (
            <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
              {phase.message}
            </p>
          ) : null}
          {typeof ready === 'string' && !done ? <p className="text-sm text-text-2">{ready}</p> : null}
          <p className="text-xs text-text-3">{allowanceText(status.allowance)}</p>

          <div className="flex flex-wrap gap-2">
            {done ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Check className="size-4" aria-hidden />}
                onClick={() => {
                  onAccept(done.output as O);
                  close();
                }}
              >
                {acceptLabel}
              </Button>
            ) : null}
            {done || phase.kind === 'failed' || fields ? (
              <Button size="sm" icon={done || phase.kind === 'failed' ? <RotateCcw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} loading={asking} disabled={ready !== true || usedUp} onClick={() => void ask()}>
                {done || phase.kind === 'failed' ? 'Try again' : 'Suggest'}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} disabled={asking} onClick={close}>
              {done ? 'Discard' : 'Close'}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
