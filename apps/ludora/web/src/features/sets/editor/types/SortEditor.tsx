import { Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../../../ui/Button.tsx';
import { Input, Select } from '../../../../ui/primitives.tsx';
import { LIMITS, LIST_LIMITS, newId } from '../model.ts';
import { domIds, ErrorText, errorIdFor, focusSoon, joinIds, letter, RowMarker, type TypeEditorProps } from '../parts.tsx';

/** Sort into groups: name two or three groups, then list four to eight items and say where each belongs. */
export function SortEditor({ q, errors, edit }: TypeEditorProps) {
  const groupsId = domIds.field(q.id, 'groups');
  const itemsId = domIds.field(q.id, 'items');
  const groupsErrId = errors.groups ? errorIdFor(groupsId) : undefined;
  const itemsErrId = errors.items ? errorIdFor(itemsId) : undefined;
  const named = q.groups.filter((g) => g.text.trim());

  const addGroup = () => {
    const id = newId('g', new Set(q.groups.map((g) => g.id)));
    edit((d) => ({ ...d, groups: [...d.groups, { id, text: '' }] }));
    focusSoon(domIds.row(q.id, 'group', id));
  };
  const removeGroup = (index: number) => {
    const gone = q.groups[index];
    if (!gone) return;
    edit((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== gone.id), items: d.items.map((i) => (i.group === gone.id ? { ...i, group: '' } : i)) }));
    const next = q.groups[index + 1] ?? q.groups[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'group', next.id));
  };
  const addItem = () => {
    const id = newId('i', new Set(q.items.map((i) => i.id)));
    // A new item starts in the group of the one above it: lists are usually typed a group at a time.
    edit((d) => ({ ...d, items: [...d.items, { id, text: '', group: d.items.at(-1)?.group ?? '' }] }));
    focusSoon(domIds.row(q.id, 'item', id));
  };
  const removeItem = (index: number) => {
    const gone = q.items[index];
    if (!gone) return;
    edit((d) => ({ ...d, items: d.items.filter((i) => i.id !== gone.id) }));
    const next = q.items[index + 1] ?? q.items[index - 1];
    if (next) focusSoon(domIds.row(q.id, 'item', next.id));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(`${groupsId}-hint`, groupsErrId)}>
        <legend className="text-sm font-semibold text-text">Groups</legend>
        <p id={`${groupsId}-hint`} className="text-xs text-text-3">
          Two or three, such as Mammals and Birds.
        </p>
        <ol className="flex flex-col gap-2">
          {q.groups.map((g, i) => {
            const inputId = domIds.row(q.id, 'group', g.id);
            const rowError = errors[`groups.${i}`];
            const rowErrId = rowError ? errorIdFor(inputId) : undefined;
            return (
              <li key={g.id} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <RowMarker>{letter(i)}</RowMarker>
                  <Input
                    id={inputId}
                    value={g.text}
                    maxLength={LIMITS.groupLabel}
                    aria-label={`Group ${letter(i)} name`}
                    aria-invalid={Boolean(rowError)}
                    aria-describedby={joinIds(rowErrId, groupsErrId)}
                    onChange={(e) => {
                      const text = e.target.value;
                      edit((d) => ({ ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, text } : x)) }));
                    }}
                    className="min-w-0 flex-1"
                  />
                  <IconButton size="sm" label={`Remove group ${letter(i)}`} disabled={q.groups.length <= LIST_LIMITS.groups.min} onClick={() => removeGroup(i)}>
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
        {groupsErrId ? <ErrorText id={groupsErrId}>{errors.groups}</ErrorText> : null}
        <div>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.groups.length >= LIST_LIMITS.groups.max} onClick={addGroup}>
            {q.groups.length >= LIST_LIMITS.groups.max ? `Up to ${LIST_LIMITS.groups.max} groups` : 'Add a group'}
          </Button>
        </div>
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={joinIds(`${itemsId}-hint`, itemsErrId)}>
        <legend className="text-sm font-semibold text-text">Items and where they go</legend>
        <p id={`${itemsId}-hint`} className="text-xs text-text-3">
          Four to eight. Players see them shuffled and get part marks for each one they sort right. Empty items are left out when you save.
        </p>
        <ol className="flex flex-col gap-2">
          {q.items.map((item, i) => {
            const inputId = domIds.row(q.id, 'item', item.id);
            const rowError = errors[`items.${i}`];
            const rowErrId = rowError ? errorIdFor(inputId) : undefined;
            return (
              <li key={item.id} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-2">
                  <RowMarker>{i + 1}</RowMarker>
                  <Input
                    id={inputId}
                    value={item.text}
                    maxLength={LIMITS.sortItem}
                    aria-label={`Item ${i + 1}`}
                    aria-invalid={Boolean(rowError)}
                    aria-describedby={joinIds(rowErrId, itemsErrId)}
                    onChange={(e) => {
                      const text = e.target.value;
                      edit((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, text } : x)) }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && i === q.items.length - 1 && q.items.length < LIST_LIMITS.sort.max) {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                    className="min-w-0 flex-1 basis-40"
                  />
                  <Select
                    id={domIds.row(q.id, 'item', item.id, 'group')}
                    aria-label={`Group for item ${i + 1}`}
                    aria-invalid={Boolean(rowError)}
                    value={item.group ?? ''}
                    onChange={(e) => {
                      const group = e.target.value;
                      edit((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, group } : x)) }));
                    }}
                    className="w-auto min-w-[8.5rem] max-sm:flex-1 max-sm:ml-9"
                  >
                    <option value="">Choose a group</option>
                    {named.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.text}
                      </option>
                    ))}
                  </Select>
                  <IconButton size="sm" label={`Remove item ${i + 1}`} disabled={q.items.length <= LIST_LIMITS.sort.min} onClick={() => removeItem(i)}>
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
        {itemsErrId ? <ErrorText id={itemsErrId}>{errors.items}</ErrorText> : null}
        <div>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} disabled={q.items.length >= LIST_LIMITS.sort.max} onClick={addItem}>
            {q.items.length >= LIST_LIMITS.sort.max ? `Up to ${LIST_LIMITS.sort.max} items` : 'Add an item'}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
