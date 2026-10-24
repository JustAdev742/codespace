import type { ReactNode } from 'react';
import { ArrowLeftRight, CircleAlert, CircleDot, Hash, ImageIcon, Layers, ListChecks, ListOrdered, ToggleLeft, Type, type LucideIcon } from 'lucide-react';
import type { Media, QuestionType } from '@ludora/shared';
import { Input } from '../../../ui/primitives.tsx';
import { LIMITS, type DraftQuestion } from './model.ts';
import type { FieldErrors } from './validation.ts';

/**
 * Error text that keeps 4.5:1 contrast in both themes: ember mixed towards
 * the text colour (darker by day, lighter at night).
 */
export const ERROR_TEXT = 'text-[color-mix(in_oklab,var(--ember)_68%,var(--text))]';
export const ERROR_BORDER = 'border-[color-mix(in_oklab,var(--ember)_75%,var(--line))]';

/** DOM ids, so error links can find and focus the field they are about. */
export const domIds = {
  card: (q: string) => `q-${q}`,
  header: (q: string) => `q-${q}-header`,
  panel: (q: string) => `q-${q}-panel`,
  field: (q: string, name: string) => `q-${q}-${name}`,
  row: (q: string, kind: string, rowId: string, part?: string) => `q-${q}-${kind}-${rowId}${part ? `-${part}` : ''}`,
  detail: (name: string) => `set-${name}`,
};
export const errorIdFor = (id: string) => `${id}-error`;
export const joinIds = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

/** Focuses an element once React has drawn it, keeping it clear of the sticky header and save bar. */
export function focusSoon(id: string, scroll: 'nearest' | 'center' = 'nearest') {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: scroll });
      el.focus({ preventScroll: true });
    }),
  );
}

export const TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  mcq: CircleDot,
  multi: ListChecks,
  truefalse: ToggleLeft,
  short: Type,
  numeric: Hash,
  order: ListOrdered,
  match: ArrowLeftRight,
  flashcard: Layers,
};

export const TYPE_HINTS: Record<QuestionType, string> = {
  mcq: 'One correct choice',
  multi: 'Several correct choices',
  truefalse: 'A statement that is true or false',
  short: 'Players type a word or phrase',
  numeric: 'Players type a number',
  order: 'Put items in the right order',
  match: 'Match each item to its partner',
  flashcard: 'A front and a back to learn',
};

export function promptLabel(type: QuestionType): string {
  return type === 'flashcard' ? 'Front' : type === 'truefalse' ? 'Statement' : 'Question';
}

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={`flex items-start gap-1.5 text-sm font-semibold ${ERROR_TEXT}`}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export interface FieldProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

/**
 * A labelled field with its hint and error tied to the input. Like Field in
 * ui/primitives, but keeps the hint visible next to an error and uses error
 * text that is readable in the light theme.
 */
export function EditorField({ id, label, hint, error, optional, children, className = '' }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | undefined; optional?: boolean; children: (p: FieldProps) => ReactNode; className?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? errorIdFor(id) : undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
        {optional ? <span className="font-normal text-text-3"> (optional)</span> : null}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': joinIds(hintId, errId) })}
      {hint ? (
        <p id={hintId} className="text-xs text-text-3">
          {hint}
        </p>
      ) : null}
      {error && errId ? <ErrorText id={errId}>{error}</ErrorText> : null}
    </div>
  );
}

/** An image that came with the question or choice. It stays as it is; only its description can be edited. */
export function MediaNote({ media, id, label, error, onAltChange }: { media: Media; id: string; label: string; error?: string | undefined; onAltChange: (alt: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-m)] border border-dashed border-line-strong bg-sunken/40 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-2">
        <ImageIcon className="size-4 shrink-0" aria-hidden />
        Has an image
      </p>
      <EditorField id={id} label={label} hint="Describe the image for players who cannot see it. The image itself stays as it is." error={error}>
        {(p) => <Input {...p} value={media.alt} maxLength={LIMITS.alt} onChange={(e) => onAltChange(e.target.value)} />}
      </EditorField>
    </div>
  );
}

/** What every per-type editor receives. */
export interface TypeEditorProps {
  q: DraftQuestion;
  errors: FieldErrors;
  /** Replaces the question with a changed copy. */
  edit: (change: (q: DraftQuestion) => DraftQuestion) => void;
}

/** A visible row label: A, B, C… for choices, 1, 2, 3… for ordered items. */
export function RowMarker({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-11 w-7 shrink-0 place-items-center font-display text-base font-bold text-text-3 tabular" aria-hidden>
      {children}
    </span>
  );
}

export const letter = (i: number) => String.fromCharCode(65 + i);
