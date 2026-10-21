import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../../../ui/Button.tsx';
import { Input } from '../../../../ui/primitives.tsx';
import { LIMITS, LIST_LIMITS, newId } from '../model.ts';
import { domIds, ErrorText, errorIdFor, focusSoon, joinIds, RowMarker, type TypeEditorProps } from '../parts.tsx';

/** Put in order: the items, listed in the correct order. Players see them shuffled. */
export function OrderEditor({ q, errors, edit }: TypeEditorProps) {
  const { min, max } = LIST_LIMITS.order;
  const listId = domIds.field(q.id, 'items');
  const hintId = `${listId}-hint`;
  const listErrId = errors.items ? errorIdFor(listId) : undefined;

  const add = () => {
    const id = newId('i', new Set(q.items.map((i) => i.id)));
    edit((d) => ({ ...d, items: [...d.items, { id, text: '' }] }));
    focusSoon(domIds.row(q.id, 'item', id));
  };
  const remove = (index: number) => {
    const gone = q.items[index];
    if (!gone) return;
    edit((d) => ({ ...d, items: d.items.filter((i) => i.id !== gone.id) }));
    const next = q.items[index + 1] ?? q.items[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'item', next.id));
  };
  const move = (index: number, by: -1 | 1) => {
    const item = q.items[index];
    const to = index + by;
    if (!item || to < 0 || to >= q.items.length) return;
    edit((d) => {
      const items = [...d.items];
      const [moved] = items.splice(index, 1);
      items.splice(to, 0, moved!);
      return { ...d, items };
    });
    // Keep focus on the button that moved, or its partner once the item reaches an end.
    const atEnd = to === 0 || to === q.items.length - 1;
    focusSoon(domIds.row(q.id, 'item', item.id, atEnd ? (by < 0 ? 'down' : 'up') : by < 0 ? 'up' : 'down'));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(hintId, listErrId)}>
      <legend className="text-sm font-semibold text-text">Items in the correct order</legend>
      <p id={hintId} className="text-xs text-text-3">
        Players see them shuffled and put them back in this order. Empty items are left out when you save.
      </p>
      <ol className="flex flex-col gap-2">
        {q.items.map((item, i) => {
          const inputId = domIds.row(q.id, 'item', item.id);
          const rowError = errors[`items.${i}`];
          const rowErrId = rowError ? errorIdFor(inputId) : undefined;
          return (
            <li key={item.id} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                <RowMarker>{i + 1}</RowMarker>
                <Input
                  id={inputId}
                  value={item.text}
                  maxLength={LIMITS.item}
                  aria-label={`Item ${i + 1}`}
                  aria-invalid={Boolean(rowError)}
                  aria-describedby={joinIds(rowErrId, listErrId)}
                  onChange={(e) => {
                    const text = e.target.value;
                    edit((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, text } : x)) }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && i === q.items.length - 1 && q.items.length < max) {
                      e.preventDefault();
                      add();
                    }
                  }}
                  className="min-w-0 flex-1"
                />
                <IconButton id={domIds.row(q.id, 'item', item.id, 'up')} size="sm" label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton id={domIds.row(q.id, 'item', item.id, 'down')} size="sm" label={`Move item ${i + 1} down`} disabled={i === q.items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton size="sm" label={`Remove item ${i + 1}`} disabled={q.items.length <= min} onClick={() => remove(i)}>
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
      {listErrId ? <ErrorText id={listErrId}>{errors.items}</ErrorText> : null}
      <div>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.items.length >= max} onClick={add}>
          {q.items.length >= max ? `Up to ${max} items` : 'Add an item'}
        </Button>
      </div>
    </fieldset>
  );
}
