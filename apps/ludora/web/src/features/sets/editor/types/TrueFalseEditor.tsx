import { Check, X } from 'lucide-react';
import { domIds, ErrorText, errorIdFor, type TypeEditorProps } from '../parts.tsx';

export function TrueFalseEditor({ q, errors, edit }: TypeEditorProps) {
  const errId = errors.correct ? errorIdFor(domIds.field(q.id, 'correct')) : undefined;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={errId}>
      <legend className="text-sm font-semibold text-text">The statement is</legend>
      <div className="grid max-w-sm grid-cols-2 gap-2">
        {([true, false] as const).map((value) => {
          const checked = q.truth === value;
          const Icon = value ? Check : X;
          return (
            <label
              key={String(value)}
              className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] border-2 font-semibold transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${checked ? 'border-ink bg-glim text-on-accent' : 'border-line-strong bg-sunken text-text-2 hover:border-text-3'}`}
            >
              <input id={domIds.row(q.id, 'truth', String(value))} type="radio" name={`${q.id}-truth`} checked={checked} onChange={() => edit((d) => ({ ...d, truth: value }))} className="sr-only" />
              <Icon className="size-5" aria-hidden />
              {value ? 'True' : 'False'}
            </label>
          );
        })}
      </div>
      {errId ? <ErrorText id={errId}>{errors.correct}</ErrorText> : null}
    </fieldset>
  );
}
