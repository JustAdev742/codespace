import { Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../../../ui/Button.tsx';
import { Input, Switch } from '../../../../ui/primitives.tsx';
import { LIMITS, LIST_LIMITS, newId } from '../model.ts';
import { domIds, ErrorText, errorIdFor, focusSoon, joinIds, RowMarker, type TypeEditorProps } from '../parts.tsx';

/** Type the answer: one or more accepted answers, with typo and capital letter rules. */
export function ShortEditor({ q, errors, edit }: TypeEditorProps) {
  const { min, max } = LIST_LIMITS.short;
  const listId = domIds.field(q.id, 'accepted');
  const hintId = `${listId}-hint`;
  const listErrId = errors.accepted ? errorIdFor(listId) : undefined;

  const add = () => {
    const id = newId('a', new Set(q.accepted.map((a) => a.id)));
    edit((d) => ({ ...d, accepted: [...d.accepted, { id, text: '' }] }));
    focusSoon(domIds.row(q.id, 'accepted', id));
  };
  const remove = (index: number) => {
    const gone = q.accepted[index];
    if (!gone) return;
    edit((d) => ({ ...d, accepted: d.accepted.filter((a) => a.id !== gone.id) }));
    const next = q.accepted[index + 1] ?? q.accepted[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'accepted', next.id));
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(hintId, listErrId)}>
        <legend className="text-sm font-semibold text-text">Accepted answers</legend>
        <p id={hintId} className="text-xs text-text-3">
          Any of these counts as correct. Punctuation, accents and a leading “the” or “a” are ignored.
        </p>
        <ol className="flex flex-col gap-2">
          {q.accepted.map((a, i) => {
            const inputId = domIds.row(q.id, 'accepted', a.id);
            const rowError = errors[`accepted.${i}`];
            const rowErrId = rowError ? errorIdFor(inputId) : undefined;
            return (
              <li key={a.id} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <RowMarker>{i + 1}</RowMarker>
                  <Input
                    id={inputId}
                    value={a.text}
                    maxLength={LIMITS.accepted}
                    aria-label={`Accepted answer ${i + 1}`}
                    aria-invalid={Boolean(rowError)}
                    aria-describedby={joinIds(rowErrId, listErrId)}
                    onChange={(e) => {
                      const text = e.target.value;
                      edit((d) => ({ ...d, accepted: d.accepted.map((x) => (x.id === a.id ? { ...x, text } : x)) }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && i === q.accepted.length - 1 && q.accepted.length < max) {
                        e.preventDefault();
                        add();
                      }
                    }}
                    className="min-w-0 flex-1"
                  />
                  <IconButton size="sm" label={`Remove accepted answer ${i + 1}`} disabled={q.accepted.length <= min} onClick={() => remove(i)}>
                    <X className="size-4" />
                  </IconButton>
                </div>
                {rowError && rowErrId ? (
                  <div className="pl-9">
                    <ErrorText id={rowErrId}>{rowError}</ErrorText>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {listErrId ? <ErrorText id={listErrId}>{errors.accepted}</ErrorText> : null}
        <div>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.accepted.length >= max} onClick={add}>
            {q.accepted.length >= max ? `Up to ${max} answers` : 'Add another answer'}
          </Button>
        </div>
      </fieldset>
      <div className="grid gap-x-8 rounded-[var(--radius-m)] border border-line px-3 sm:grid-cols-2">
        <Switch checked={q.fuzzy} onCheckedChange={(v) => edit((d) => ({ ...d, fuzzy: v }))} label="Allow small typos" description="An answer with a letter or two wrong still counts. Numbers must be exact." />
        <Switch checked={q.caseSensitive} onCheckedChange={(v) => edit((d) => ({ ...d, caseSensitive: v }))} label="Match capital letters" description="When on, Paris and paris count as different answers." />
      </div>
    </div>
  );
}
