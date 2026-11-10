import { parseBlanks } from '@ludora/shared';
import { Input, Switch, Textarea } from '../../../../ui/primitives.tsx';
import { LIMITS, splitTags } from '../model.ts';
import { domIds, EditorField, type TypeEditorProps } from '../parts.tsx';

/**
 * Fill in the blanks: one sentence with its gaps in [square brackets], other accepted answers
 * after a bar. A live preview shows the sentence as players will see it, gap by gap.
 */
export function BlanksEditor({ q, errors, edit }: TypeEditorProps) {
  const { pieces, gaps } = parseBlanks(q.sentence);
  const extra = splitTags(q.distractors);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <EditorField
        id={domIds.field(q.id, 'sentence')}
        label="Sentence"
        hint="Put each missing word in square brackets, one to three gaps. Add other accepted answers after a bar: The sky is [blue|light blue]."
        error={errors.sentence}
      >
        {(p) => <Textarea {...p} rows={2} maxLength={LIMITS.sentence} value={q.sentence} placeholder="Plants need [sunlight] and [water] to grow." onChange={(e) => {
          const sentence = e.target.value;
          edit((d) => ({ ...d, sentence }));
        }} className="h-auto min-h-[72px]" />}
      </EditorField>
      {gaps.length ? (
        <div className="rounded-[var(--radius-m)] border border-line bg-sunken/40 p-3">
          <p className="text-xs font-semibold text-text-3">Players see</p>
          <p className="mt-1 leading-loose font-semibold break-words text-text">
            {pieces.map((piece, i) => (
              <span key={i}>
                {piece}
                {i < gaps.length ? (
                  <span className="mx-1 inline-flex min-w-[4.5rem] items-center justify-center rounded-[var(--radius-s)] border-2 border-dashed border-line-strong px-1.5 text-sm text-text-3">
                    <span className="sr-only">Gap {i + 1}, answer: </span>
                    {gaps[i]!.accepted.join(' or ') || 'empty'}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-text-3">
            {gaps.length === 1 ? '1 gap.' : `${gaps.length} gaps.`} Modes that cannot show a sentence turn a one-gap sentence into a typed question, or a choice when it has a word bank.
          </p>
        </div>
      ) : null}
      <div className="rounded-[var(--radius-m)] border border-line px-3">
        <Switch checked={q.bank} onCheckedChange={(v) => edit((d) => ({ ...d, bank: v }))} label="Word bank" description="Players pick each missing word from a shuffled bank instead of typing it. The bank holds the right words plus any extra words below." />
      </div>
      {q.bank ? (
        <EditorField id={domIds.field(q.id, 'distractors')} label="Extra words for the bank" optional hint={`Wrong words to mix in, separated by commas. Up to ${LIMITS.bankWords}.${extra.length ? ` ${extra.length} so far.` : ''}`} error={errors.distractors}>
          {(p) => <Input {...p} autoComplete="off" value={q.distractors} placeholder="soil, wind, salt" onChange={(e) => {
            const distractors = e.target.value;
            edit((d) => ({ ...d, distractors }));
          }} />}
        </EditorField>
      ) : (
        <div className="rounded-[var(--radius-m)] border border-line px-3">
          <Switch checked={q.caseSensitive} onCheckedChange={(v) => edit((d) => ({ ...d, caseSensitive: v }))} label="Match capital letters" description="Typed answers always forgive a small typo, but never a wrong number." />
        </div>
      )}
    </div>
  );
}
