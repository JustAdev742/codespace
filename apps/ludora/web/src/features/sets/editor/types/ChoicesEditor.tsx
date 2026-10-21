import { Check, Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../../../ui/Button.tsx';
import { Input } from '../../../../ui/primitives.tsx';
import { LIMITS, LIST_LIMITS, newId } from '../model.ts';
import { domIds, ErrorText, errorIdFor, focusSoon, joinIds, letter, MediaNote, RowMarker, type TypeEditorProps } from '../parts.tsx';

/** Multiple choice (one correct) and select all that apply (one or more correct). */
export function ChoicesEditor({ q, errors, edit }: TypeEditorProps) {
  const multi = q.type === 'multi';
  const { min, max } = multi ? LIST_LIMITS.multi : LIST_LIMITS.mcq;
  const listId = domIds.field(q.id, 'choices');
  const hintId = `${listId}-hint`;
  const listErrId = errors.choices ? errorIdFor(listId) : undefined;
  const correctErrId = errors.correct ? errorIdFor(domIds.field(q.id, 'correct')) : undefined;

  const add = () => {
    const id = newId('c', new Set(q.choices.map((c) => c.id)));
    edit((d) => ({ ...d, choices: [...d.choices, { id, text: '' }] }));
    focusSoon(domIds.row(q.id, 'choice', id));
  };
  const remove = (index: number) => {
    const gone = q.choices[index];
    if (!gone) return;
    edit((d) => ({ ...d, choices: d.choices.filter((c) => c.id !== gone.id), correct: d.correct.filter((id) => id !== gone.id) }));
    const next = q.choices[index + 1] ?? q.choices[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'choice', next.id));
  };
  const setText = (id: string, text: string) => edit((d) => ({ ...d, choices: d.choices.map((c) => (c.id === id ? { ...c, text } : c)) }));
  const setAlt = (id: string, alt: string) => edit((d) => ({ ...d, choices: d.choices.map((c) => (c.id === id && c.media ? { ...c, media: { ...c.media, alt } } : c)) }));
  const mark = (id: string, on: boolean) =>
    edit((d) => ({
      ...d,
      correct: multi ? (on ? d.choices.map((c) => c.id).filter((cid) => cid === id || d.correct.includes(cid)) : d.correct.filter((cid) => cid !== id)) : [id],
    }));

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(hintId, listErrId, correctErrId)}>
      <legend className="text-sm font-semibold text-text">Choices</legend>
      <p id={hintId} className="text-xs text-text-3">
        {multi ? 'Tick every correct choice. Players are told how many to pick.' : 'Select the correct choice.'} Empty choices are left out when you save.
      </p>
      <ol className="flex flex-col gap-2">
        {q.choices.map((c, i) => {
          const inputId = domIds.row(q.id, 'choice', c.id);
          const rowError = errors[`choices.${i}`];
          const rowErrId = rowError ? errorIdFor(inputId) : undefined;
          const checked = q.correct.includes(c.id);
          return (
            <li key={c.id} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <RowMarker>{letter(i)}</RowMarker>
                <label
                  className={`relative grid size-11 shrink-0 cursor-pointer place-items-center border-2 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${multi ? 'rounded-[10px]' : 'rounded-full'} ${checked ? 'border-ink bg-glim text-on-accent' : 'border-line-strong bg-sunken text-transparent hover:border-text-3'}`}
                >
                  <input
                    id={domIds.row(q.id, 'correct', c.id)}
                    type={multi ? 'checkbox' : 'radio'}
                    name={`${q.id}-correct`}
                    checked={checked}
                    onChange={(e) => mark(c.id, e.target.checked)}
                    aria-describedby={correctErrId}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <Check className="size-5" strokeWidth={3} aria-hidden />
                  <span className="sr-only">Choice {letter(i)} is correct</span>
                </label>
                <Input
                  id={inputId}
                  value={c.text}
                  maxLength={LIMITS.choice}
                  aria-label={`Choice ${letter(i)}`}
                  aria-invalid={Boolean(rowError)}
                  aria-describedby={joinIds(rowErrId, listErrId)}
                  placeholder={c.media ? 'Image only' : undefined}
                  onChange={(e) => setText(c.id, e.target.value)}
                  onKeyDown={(e) => {
                    // Enter on the last choice adds the next one, so a list can be typed without the mouse.
                    if (e.key === 'Enter' && i === q.choices.length - 1 && q.choices.length < max) {
                      e.preventDefault();
                      add();
                    }
                  }}
                  className="min-w-0 flex-1"
                />
                <IconButton size="sm" label={`Remove choice ${letter(i)}`} disabled={q.choices.length <= min} onClick={() => remove(i)}>
                  <X className="size-4" />
                </IconButton>
              </div>
              {rowError && rowErrId ? (
                <div className="pl-[5.25rem] sm:pl-[5.5rem]">
                  <ErrorText id={rowErrId}>{rowError}</ErrorText>
                </div>
              ) : null}
              {c.media ? (
                <div className="sm:pl-[5.5rem]">
                  <MediaNote media={c.media} id={domIds.row(q.id, 'choice', c.id, 'alt')} label={`Image description for choice ${letter(i)}`} error={errors[`choices.${i}.media`]} onAltChange={(alt) => setAlt(c.id, alt)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {listErrId ? <ErrorText id={listErrId}>{errors.choices}</ErrorText> : null}
      {correctErrId ? <ErrorText id={correctErrId}>{errors.correct}</ErrorText> : null}
      <div>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.choices.length >= max} onClick={add}>
          {q.choices.length >= max ? `Up to ${max} choices` : 'Add a choice'}
        </Button>
      </div>
    </fieldset>
  );
}
