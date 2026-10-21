import { Textarea } from '../../../../ui/primitives.tsx';
import { LIMITS } from '../model.ts';
import { domIds, EditorField, type TypeEditorProps } from '../parts.tsx';

/** Flashcard: the front is the prompt; this is the back. */
export function FlashcardEditor({ q, errors, edit }: TypeEditorProps) {
  return (
    <EditorField id={domIds.field(q.id, 'back')} label="Back" hint="What players should remember. Quiz modes show the front and ask for this." error={errors.back}>
      {(p) => <Textarea {...p} rows={2} maxLength={LIMITS.back} value={q.back} onChange={(e) => edit((d) => ({ ...d, back: e.target.value }))} className="h-auto min-h-[72px]" />}
    </EditorField>
  );
}
