import { Input } from '../../../../ui/primitives.tsx';
import { LIMITS, parseNumberText } from '../model.ts';
import { domIds, EditorField, type TypeEditorProps } from '../parts.tsx';

const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 });

/** Number answer: the answer, an optional margin either side, an optional unit. */
export function NumericEditor({ q, errors, edit }: TypeEditorProps) {
  const answer = parseNumberText(q.answer);
  const margin = parseNumberText(q.tolerance);
  const unit = q.unit.trim() ? ` ${q.unit.trim()}` : '';
  const marginHint =
    Number.isFinite(answer) && Number.isFinite(margin) && margin > 0
      ? `Answers from ${nf.format(answer - margin)} to ${nf.format(answer + margin)}${unit} count.`
      : 'How far from the answer still counts. Leave it empty to accept only the exact number.';
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-3">
      <EditorField id={domIds.field(q.id, 'answer')} label="Answer" hint="A whole number or a decimal, for example 12 or 3.5." error={errors.answer}>
        {(p) => <Input {...p} inputMode="decimal" autoComplete="off" value={q.answer} onChange={(e) => edit((d) => ({ ...d, answer: e.target.value }))} />}
      </EditorField>
      <EditorField id={domIds.field(q.id, 'tolerance')} label="Allowed margin" optional hint={marginHint} error={errors.tolerance}>
        {(p) => <Input {...p} inputMode="decimal" autoComplete="off" value={q.tolerance} onChange={(e) => edit((d) => ({ ...d, tolerance: e.target.value }))} />}
      </EditorField>
      <EditorField id={domIds.field(q.id, 'unit')} label="Unit" optional hint="Shown next to the answer box, for example cm." error={errors.unit}>
        {(p) => <Input {...p} autoComplete="off" maxLength={LIMITS.unit} value={q.unit} onChange={(e) => edit((d) => ({ ...d, unit: e.target.value }))} />}
      </EditorField>
    </div>
  );
}
