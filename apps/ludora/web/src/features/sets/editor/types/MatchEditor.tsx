import { Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../../../ui/Button.tsx';
import { Input } from '../../../../ui/primitives.tsx';
import { LIMITS, LIST_LIMITS, newId } from '../model.ts';
import { domIds, ErrorText, errorIdFor, focusSoon, joinIds, RowMarker, type TypeEditorProps } from '../parts.tsx';

/** Match pairs: each left item and its partner on the right. */
export function MatchEditor({ q, errors, edit }: TypeEditorProps) {
  const { min, max } = LIST_LIMITS.match;
  const listId = domIds.field(q.id, 'pairs');
  const hintId = `${listId}-hint`;
  const listErrId = errors.pairs ? errorIdFor(listId) : undefined;

  const add = () => {
    const id = newId('p', new Set(q.pairs.map((p) => p.id)));
    edit((d) => ({ ...d, pairs: [...d.pairs, { id, left: '', right: '' }] }));
    focusSoon(domIds.row(q.id, 'pair', id, 'left'));
  };
  const remove = (index: number) => {
    const gone = q.pairs[index];
    if (!gone) return;
    edit((d) => ({ ...d, pairs: d.pairs.filter((p) => p.id !== gone.id) }));
    const next = q.pairs[index + 1] ?? q.pairs[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'pair', next.id, 'left'));
  };
  const set = (id: string, side: 'left' | 'right', value: string) => edit((d) => ({ ...d, pairs: d.pairs.map((p) => (p.id === id ? { ...p, [side]: value } : p)) }));

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(hintId, listErrId)}>
      <legend className="text-sm font-semibold text-text">Pairs</legend>
      <p id={hintId} className="text-xs text-text-3">
        Players match each item on the left with its partner on the right, which is shuffled. Empty pairs are left out when you save.
      </p>
      <ol className="flex flex-col gap-3 sm:gap-2">
        {q.pairs.map((pair, i) => {
          const leftId = domIds.row(q.id, 'pair', pair.id, 'left');
          const rightId = domIds.row(q.id, 'pair', pair.id, 'right');
          const leftError = errors[`pairs.${i}.left`];
          const rightError = errors[`pairs.${i}.right`];
          return (
            <li key={pair.id} className="flex min-w-0 items-start gap-1.5 sm:gap-2">
              <RowMarker>{i + 1}</RowMarker>
              <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Input
                    id={leftId}
                    value={pair.left}
                    maxLength={LIMITS.item}
                    aria-label={`Pair ${i + 1}, left`}
                    placeholder="Left"
                    aria-invalid={Boolean(leftError)}
                    aria-describedby={joinIds(leftError && errorIdFor(leftId), listErrId)}
                    onChange={(e) => set(pair.id, 'left', e.target.value)}
                  />
                  {leftError ? <ErrorText id={errorIdFor(leftId)}>{leftError}</ErrorText> : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Input
                    id={rightId}
                    value={pair.right}
                    maxLength={LIMITS.item}
                    aria-label={`Pair ${i + 1}, right`}
                    placeholder="Right"
                    aria-invalid={Boolean(rightError)}
                    aria-describedby={joinIds(rightError && errorIdFor(rightId), listErrId)}
                    onChange={(e) => set(pair.id, 'right', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && i === q.pairs.length - 1 && q.pairs.length < max) {
                        e.preventDefault();
                        add();
                      }
                    }}
                  />
                  {rightError ? <ErrorText id={errorIdFor(rightId)}>{rightError}</ErrorText> : null}
                </div>
              </div>
              <IconButton size="sm" label={`Remove pair ${i + 1}`} disabled={q.pairs.length <= min} onClick={() => remove(i)} className="mt-1.5">
                <X className="size-4" />
              </IconButton>
            </li>
          );
        })}
      </ol>
      {listErrId ? <ErrorText id={listErrId}>{errors.pairs}</ErrorText> : null}
      <div>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.pairs.length >= max} onClick={add}>
          {q.pairs.length >= max ? `Up to ${max} pairs` : 'Add a pair'}
        </Button>
      </div>
    </fieldset>
  );
}
